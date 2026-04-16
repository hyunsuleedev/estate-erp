import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const API_KEY_PREFIX = 'esk_';
const API_KEY_BYTE_LENGTH = 32;

@Injectable()
export class ApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async generate(userId: string, officeId: string) {
    const existing = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { apiKeyHash: true },
    });
    if (existing?.apiKeyHash) {
      throw new BadRequestException(
        '이미 API 키가 존재합니다. 기존 키를 폐기한 후 다시 생성하세요.',
      );
    }

    const rawBytes = randomBytes(API_KEY_BYTE_LENGTH);
    const rawKey = `${API_KEY_PREFIX}${rawBytes.toString('base64url')}`;
    const hash = this.hashKey(rawKey);
    const prefix = rawKey.slice(0, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { apiKeyHash: hash, apiKeyPrefix: prefix },
    });

    return { key: rawKey, prefix };
  }

  async revoke(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { apiKeyHash: null, apiKeyPrefix: null },
    });
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { apiKeyPrefix: true, apiKeyHash: true },
    });
    return {
      hasKey: !!user?.apiKeyHash,
      prefix: user?.apiKeyPrefix ?? null,
    };
  }

  async validateAndResolve(
    bearerToken: string,
  ): Promise<{ userId: string; officeId: string; role: string } | null> {
    if (!bearerToken.startsWith(API_KEY_PREFIX)) {
      return null;
    }

    const hash = this.hashKey(bearerToken);
    const prefix = bearerToken.slice(0, 12);

    const user = await this.prisma.user.findFirst({
      where: {
        apiKeyPrefix: prefix,
        apiKeyHash: hash,
        isActive: true,
      },
      select: { id: true, officeId: true, role: true },
    });

    if (!user) return null;

    return { userId: user.id, officeId: user.officeId, role: user.role };
  }

  private hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
