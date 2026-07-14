import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';

const BRIDGE_TOKEN_PREFIX = 'ctib_';
const BRIDGE_TOKEN_BYTE_LENGTH = 32;

/**
 * CTI Bridge 인증 토큰 (사무소당 1개).
 *
 * MCP ApiKeyService의 esk_ 해시 패턴을 따르되, 사용자 단위가 아닌
 * 사무소 단위(CtiBridge)로 바인딩한다. 레거시의 무인증 평문 TCP를 대체 —
 * 브리지는 이 토큰으로 /cti-bridge WSS 네임스페이스에 접속하고,
 * officeId는 토큰에서만 확정한다(클라이언트가 보낸 값은 신뢰하지 않음).
 */
@Injectable()
export class CtiBridgeTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /// 토큰 발급/재발급 (기존 토큰은 즉시 무효화). 원본 토큰은 이 응답에서 1회만 노출.
  async issue(officeId: string, name?: string) {
    const rawKey = `${BRIDGE_TOKEN_PREFIX}${randomBytes(BRIDGE_TOKEN_BYTE_LENGTH).toString('base64url')}`;
    const tokenHash = this.hashKey(rawKey);
    const tokenPrefix = rawKey.slice(0, 12);

    const bridge = await this.prisma.ctiBridge.upsert({
      where: { officeId },
      create: {
        officeId,
        ...(name ? { name } : {}),
        tokenHash,
        tokenPrefix,
      },
      update: {
        ...(name ? { name } : {}),
        tokenHash,
        tokenPrefix,
        isActive: true,
      },
    });

    return { token: rawKey, prefix: tokenPrefix, bridgeId: bridge.id };
  }

  async revoke(officeId: string) {
    await this.prisma.ctiBridge.updateMany({
      where: { officeId },
      data: { isActive: false },
    });
  }

  async getStatus(officeId: string) {
    const bridge = await this.prisma.ctiBridge.findUnique({
      where: { officeId },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        isActive: true,
        lastSeenAt: true,
      },
    });
    return {
      hasToken: !!bridge?.isActive,
      name: bridge?.name ?? null,
      prefix: bridge?.isActive ? bridge.tokenPrefix : null,
      lastSeenAt: bridge?.lastSeenAt ?? null,
    };
  }

  /// WSS 핸드셰이크 검증. 성공 시 officeId 확정.
  async validateAndResolve(
    token: string,
  ): Promise<{ bridgeId: string; officeId: string } | null> {
    if (!token.startsWith(BRIDGE_TOKEN_PREFIX)) return null;

    const bridge = await this.prisma.ctiBridge.findFirst({
      where: {
        tokenPrefix: token.slice(0, 12),
        tokenHash: this.hashKey(token),
        isActive: true,
      },
      select: { id: true, officeId: true },
    });

    if (!bridge) return null;
    return { bridgeId: bridge.id, officeId: bridge.officeId };
  }

  async touchLastSeen(bridgeId: string) {
    await this.prisma.ctiBridge.update({
      where: { id: bridgeId },
      data: { lastSeenAt: new Date() },
    });
  }

  private hashKey(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
