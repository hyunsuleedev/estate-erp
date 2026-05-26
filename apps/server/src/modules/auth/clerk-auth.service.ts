import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import type { ClerkClient } from '@clerk/backend';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from './auth.types';

type ClerkUserForProvisioning = Awaited<
  ReturnType<ClerkClient['users']['getUser']>
>;

@Injectable()
export class ClerkAuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 10;
  private clerkClient: ClerkClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async authenticateBearerToken(token: string) {
    const secretKey = this.getSecretKey();
    const payload = (await verifyToken(token, { secretKey })) as {
      sub?: unknown;
    };
    const clerkUserId = this.getSubject(payload);
    const user = await this.findOrLinkUser(clerkUserId);

    if (!user.isActive || !user.office.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      userId: user.id,
      clerkUserId,
      supabaseUserId: user.supabaseId ?? undefined,
      officeId: user.officeId,
      role: user.role as UserRole,
    };
  }

  async authenticateOAuthAccessToken(token: string) {
    const oauthToken = await this.getClient().idPOAuthAccessToken.verify(token);
    if (oauthToken.revoked || oauthToken.expired) {
      throw new UnauthorizedException('Invalid Clerk OAuth access token');
    }

    const user = await this.findOrLinkUser(oauthToken.subject);

    if (!user.isActive || !user.office.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }

    return {
      userId: user.id,
      clerkUserId: oauthToken.subject,
      supabaseUserId: user.supabaseId ?? undefined,
      officeId: user.officeId,
      role: user.role as UserRole,
      scopes: oauthToken.scopes,
      oauthClientId: oauthToken.clientId,
    };
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
        const office = await tx.office.create({
          data: { name: this.getOfficeName(clerkUser, name) },
        });
        const password = await bcrypt.hash(
          this.randomString(32),
          ClerkAuthService.PASSWORD_SALT_ROUNDS,
        );

        return tx.user.create({
          data: {
            clerkId: clerkUserId,
            loginId: await this.generateLoginId(tx, clerkUser, email),
            email,
            password,
            name,
            officeId: office.id,
            role: 'owner',
            mustChangePassword: false,
            passwordChangedAt: new Date(),
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

  private getOfficeName(
    clerkUser: ClerkUserForProvisioning,
    fallbackName: string,
  ) {
    const metadataOfficeName =
      this.getMetadataString(clerkUser.unsafeMetadata, 'officeName') ??
      this.getMetadataString(clerkUser.publicMetadata, 'officeName') ??
      this.getMetadataString(clerkUser.privateMetadata, 'officeName');

    return metadataOfficeName ?? `${fallbackName} 사무소`;
  }

  private getMetadataString(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== 'object' || !(key in metadata)) {
      return null;
    }
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
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
}
