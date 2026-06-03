import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from './auth.types';

type ClerkUserForProvisioning = Awaited<
  ReturnType<ClerkClient['users']['getUser']>
>;

type AuthenticatedBearerUser = {
  userId: string;
  clerkUserId: string;
  officeId: string;
  role: UserRole;
};

export type BearerAuthTimings = {
  cacheHit?: boolean;
  verifyTokenMs?: number;
  userLookupMs?: number;
};

const BEARER_AUTH_CACHE_TTL_MS = 30_000;
const BEARER_AUTH_CACHE_EXPIRY_SKEW_MS = 5_000;

@Injectable()
export class ClerkAuthService {
  private clerkClient: ClerkClient | null = null;
  private readonly bearerAuthCache = new Map<
    string,
    { expiresAt: number; user: AuthenticatedBearerUser }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticateBearerToken(token: string, timings?: BearerAuthTimings) {
    const cached = this.getCachedBearerAuth(token);
    if (cached) {
      if (timings) timings.cacheHit = true;
      return cached;
    }

    const secretKey = this.getSecretKey();
    const verifyStartedAt = Date.now();
    const payload = (await verifyToken(token, { secretKey })) as {
      sub?: unknown;
      exp?: unknown;
    };
    if (timings) timings.verifyTokenMs = Date.now() - verifyStartedAt;
    const clerkUserId = this.getSubject(payload);

    const userLookupStartedAt = Date.now();
    const user = await this.findOrLinkUser(clerkUserId);
    if (timings) timings.userLookupMs = Date.now() - userLookupStartedAt;

    if (!user.isActive || user.office?.isActive === false) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    const authenticatedUser = {
      userId: user.id,
      clerkUserId,
      officeId: user.officeId ?? '',
      role: user.role as UserRole,
    };
    this.cacheBearerAuth(token, authenticatedUser, payload.exp);

    return authenticatedUser;
  }

  async authenticateOAuthAccessToken(token: string) {
    const oauthToken = await this.getClient().idPOAuthAccessToken.verify(token);
    if (oauthToken.revoked || oauthToken.expired) {
      throw new UnauthorizedException('Invalid Clerk OAuth access token');
    }

    const user = await this.findOrLinkUser(oauthToken.subject);

    if (!user.isActive || user.office?.isActive === false) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      userId: user.id,
      clerkUserId: oauthToken.subject,
      officeId: user.officeId ?? '',
      role: user.role as UserRole,
      scopes: oauthToken.scopes,
      oauthClientId: oauthToken.clientId,
    };
  }

  async createUser(params: {
    loginId: string;
    password: string;
    email?: string | null;
    name: string;
    officeId: string;
    role: string;
  }) {
    const email = params.email?.trim().toLowerCase();

    return this.getClient().users.createUser({
      username: params.loginId,
      password: params.password,
      ...(email ? { emailAddress: [email] } : {}),
      firstName: params.name,
      skipLegalChecks: true,
      privateMetadata: {
        officeId: params.officeId,
        role: params.role,
        loginId: params.loginId,
      },
      publicMetadata: {
        role: params.role,
      },
    });
  }

  async updateUserPassword(clerkUserId: string, password: string) {
    return this.getClient().users.updateUser(clerkUserId, {
      password,
      signOutOfOtherSessions: true,
    });
  }

  async deleteUser(clerkUserId: string) {
    return this.getClient().users.deleteUser(clerkUserId);
  }

  private async findOrLinkUser(clerkUserId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { clerkId: clerkUserId },
      include: { office: { select: { isActive: true } } },
    });
    if (existing) return existing;

    const clerkUser = await this.getClient().users.getUser(clerkUserId);
    const emails = clerkUser.emailAddresses
      .map((email) => email.emailAddress?.toLowerCase())
      .filter((email): email is string => Boolean(email));
    return this.provisionOwnerUser(clerkUserId, clerkUser, emails[0] ?? null);
  }

  private async provisionOwnerUser(
    clerkUserId: string,
    clerkUser: ClerkUserForProvisioning,
    email: string | null,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { clerkId: clerkUserId },
          include: { office: { select: { isActive: true } } },
        });
        if (existing) return existing;

        const name = this.getDisplayName(clerkUser);
        return tx.user.create({
          data: {
            clerkId: clerkUserId,
            loginId: await this.generateLoginId(tx, clerkUser, email),
            email,
            name,
            role: 'owner',
            lastLoginAt: new Date(),
          },
          include: { office: { select: { isActive: true } } },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const existing = await this.prisma.user.findUnique({
          where: { clerkId: clerkUserId },
          include: { office: { select: { isActive: true } } },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async generateLoginId(
    tx: Prisma.TransactionClient,
    clerkUser: ClerkUserForProvisioning,
    email: string | null,
  ) {
    const base = this.normalizeLoginId(
      clerkUser.username ??
        (email ? email.split('@')[0] : null) ??
        clerkUser.id.replace(/^user_/, ''),
    );

    for (let index = 0; index < 20; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await tx.user.findUnique({
        where: { loginId: candidate },
        select: { id: true },
      });
      if (!existing) return candidate;
    }

    return `${base}-${this.randomString(6).toLowerCase()}`;
  }

  private getDisplayName(clerkUser: ClerkUserForProvisioning) {
    const fullName = [clerkUser.firstName, clerkUser.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    return fullName || clerkUser.username || '새 사용자';
  }

  private normalizeLoginId(value: string) {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return normalized || `user-${this.randomString(8).toLowerCase()}`;
  }

  private randomString(length: number) {
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    return Array.from({ length }, () =>
      chars.charAt(Math.floor(Math.random() * chars.length)),
    ).join('');
  }

  private getClient() {
    if (!this.clerkClient) {
      this.clerkClient = createClerkClient({
        secretKey: this.getSecretKey(),
      });
    }
    return this.clerkClient;
  }

  private getSecretKey() {
    const secretKey = this.config.get<string>('CLERK_SECRET_KEY');
    if (!secretKey) {
      throw new UnauthorizedException('CLERK_SECRET_KEY is not configured');
    }
    return secretKey;
  }

  private getSubject(payload: { sub?: unknown }) {
    if (typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('Invalid Clerk JWT: missing sub');
    }
    return payload.sub;
  }

  private getCachedBearerAuth(token: string) {
    const cached = this.bearerAuthCache.get(token);
    if (!cached) return null;

    if (cached.expiresAt <= Date.now()) {
      this.bearerAuthCache.delete(token);
      return null;
    }

    return cached.user;
  }

  private cacheBearerAuth(
    token: string,
    user: AuthenticatedBearerUser,
    tokenExpiresAtSeconds: unknown,
  ) {
    const now = Date.now();
    const tokenExpiresAt =
      typeof tokenExpiresAtSeconds === 'number'
        ? tokenExpiresAtSeconds * 1000 - BEARER_AUTH_CACHE_EXPIRY_SKEW_MS
        : Number.POSITIVE_INFINITY;
    const expiresAt = Math.min(now + BEARER_AUTH_CACHE_TTL_MS, tokenExpiresAt);

    if (expiresAt > now) {
      this.bearerAuthCache.set(token, { expiresAt, user });
    }
  }
}
