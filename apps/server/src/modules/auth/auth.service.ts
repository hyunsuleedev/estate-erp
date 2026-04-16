import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { StringValue } from 'ms';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuthenticatedUser,
  AuthTokenPayload,
  UserRole,
} from './auth.types';

type UserWithOffice = Prisma.UserGetPayload<{
  include: { office: true };
}>;

@Injectable()
export class AuthService {
  private static readonly PASSWORD_SALT_ROUNDS = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: {
    loginId?: string;
    email: string;
    password: string;
    name: string;
    officeName: string;
  }) {
    const email = this.normalizeEmail(dto.email);
    const loginId = this.normalizeLoginId(dto.loginId ?? email);

    if (!loginId) {
      throw new BadRequestException('아이디는 필수입니다.');
    }

    if (!email) {
      throw new BadRequestException('이메일은 필수입니다.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { loginId },
    });

    if (existing) {
      throw new ConflictException('이미 사용 중인 아이디입니다.');
    }

    const hashedPassword = await bcrypt.hash(
      dto.password,
      AuthService.PASSWORD_SALT_ROUNDS,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        const office = await tx.office.create({
          data: { name: dto.officeName },
        });

        const user = await tx.user.create({
          data: {
            loginId,
            email,
            password: hashedPassword,
            name: dto.name,
            officeId: office.id,
            role: 'owner',
          },
        });

        const authenticatedUser = this.toAuthenticatedUser({
          ...user,
          office,
        });
        const tokens = this.generateTokens(authenticatedUser);

        await this.storeRefreshTokenHash(user.id, tokens.refreshToken, tx);

        return this.toAuthResponse(authenticatedUser, tokens);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const target = this.getUniqueConstraintTarget(error);

        if (target.includes('login_id') || target.includes('loginId')) {
          throw new ConflictException('이미 사용 중인 아이디입니다.');
        }
      }

      throw error;
    }
  }

  async validateUser(loginId: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { loginId: this.normalizeLoginId(loginId) },
      include: { office: true },
    });

    if (!user) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      throw new UnauthorizedException('아이디 또는 비밀번호가 올바르지 않습니다.');
    }

    this.ensureUserIsActive(user);

    return this.toAuthenticatedUser(user);
  }

  async login(user: AuthenticatedUser) {
    const tokens = this.generateTokens(user);

    await this.storeRefreshTokenHash(user.userId, tokens.refreshToken);

    return this.toAuthResponse(user, tokens);
  }

  async refresh(user: AuthenticatedUser) {
    const tokens = this.generateTokens(user);

    await this.storeRefreshTokenHash(user.userId, tokens.refreshToken);

    return this.toAuthResponse(user, tokens);
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });

    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { office: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    this.ensureUserIsActive(user);

    const authenticatedUser = this.toAuthenticatedUser(user);

    return {
      id: authenticatedUser.userId,
      loginId: authenticatedUser.loginId,
      email: authenticatedUser.email,
      name: authenticatedUser.name,
      role: authenticatedUser.role,
      office: {
        id: authenticatedUser.office.id,
        name: authenticatedUser.office.name,
      },
    };
  }

  async validateRefreshToken(
    payload: AuthTokenPayload,
    refreshToken: string,
  ) {
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('유효한 리프레시 토큰이 아닙니다.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { office: true },
    });

    if (!user) {
      throw new UnauthorizedException('유효한 리프레시 토큰이 아닙니다.');
    }

    this.ensureUserIsActive(user);

    if (
      user.officeId !== payload.officeId ||
      user.role !== payload.role ||
      !user.refreshTokenHash
    ) {
      throw new UnauthorizedException('유효한 리프레시 토큰이 아닙니다.');
    }

    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);

    if (!isValid) {
      throw new UnauthorizedException('유효한 리프레시 토큰이 아닙니다.');
    }

    return this.toAuthenticatedUser(user);
  }

  private generateTokens(
    user: Pick<AuthenticatedUser, 'userId' | 'officeId' | 'role'>,
  ) {
    return {
      accessToken: this.jwtService.sign({
        sub: user.userId,
        officeId: user.officeId,
        role: user.role,
        type: 'access',
      } satisfies AuthTokenPayload),
      refreshToken: this.jwtService.sign(
        {
          sub: user.userId,
          officeId: user.officeId,
          role: user.role,
          type: 'refresh',
        } satisfies AuthTokenPayload,
        {
          secret: this.getRefreshTokenSecret(),
          expiresIn: this.getRefreshTokenExpiresIn(),
        },
      ),
    };
  }

  private getUniqueConstraintTarget(
    error: Prisma.PrismaClientKnownRequestError,
  ): string {
    if (error.code !== 'P2002') {
      return '';
    }

    const target = error.meta?.target;

    if (Array.isArray(target)) {
      return target.join(',');
    }

    return typeof target === 'string' ? target : '';
  }

  private getRefreshTokenSecret() {
    return (
      this.config.get<string>('JWT_REFRESH_SECRET') ??
      this.config.get<string>('JWT_SECRET') ??
      'fallback-secret'
    );
  }

  private getRefreshTokenExpiresIn() {
    return (this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      '7d') as StringValue;
  }

  private async storeRefreshTokenHash(
    userId: string,
    refreshToken: string,
    client: Prisma.TransactionClient | PrismaService = this.prisma,
  ) {
    const refreshTokenHash = await bcrypt.hash(
      refreshToken,
      AuthService.PASSWORD_SALT_ROUNDS,
    );

    await client.user.update({
      where: { id: userId },
      data: { refreshTokenHash },
    });
  }

  private normalizeEmail(email: string) {
    return typeof email === 'string' ? email.trim().toLowerCase() : '';
  }

  private normalizeLoginId(loginId: string) {
    return typeof loginId === 'string' ? loginId.trim().toLowerCase() : '';
  }

  private toAuthenticatedUser(user: UserWithOffice): AuthenticatedUser {
    return {
      userId: user.id,
      officeId: user.officeId,
      loginId: user.loginId,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      office: {
        id: user.office.id,
        name: user.office.name,
        isActive: user.office.isActive,
      },
    };
  }

  private toAuthResponse(
    user: AuthenticatedUser,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    return {
      ...tokens,
      user: {
        id: user.userId,
        loginId: user.loginId,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      office: {
        id: user.office.id,
        name: user.office.name,
      },
    };
  }

  private ensureUserIsActive(user: UserWithOffice) {
    if (!user.isActive || !user.office.isActive) {
      throw new UnauthorizedException('비활성화된 계정입니다.');
    }
  }
}
