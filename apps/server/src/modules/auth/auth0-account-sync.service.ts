import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  Auth0ManagementError,
  Auth0ManagementService,
} from './auth0-management.service';

/**
 * 우리 DB에서 이미 끊은 계정을 Auth0에도 반영하는 뒤처리.
 *
 * 접근을 끊는 기준은 우리 DB다(User.isActive, User.tokensValidAfter). 그래서
 * 비활성화는 Auth0가 응답하지 않아도 DB만으로 즉시 적용된다. 이 서비스는 그 뒤에
 * Auth0 계정 차단과 refresh token 폐기를 맞춰 놓는다. 실패하면 간격을 늘려 가며
 * 정해진 횟수만 다시 시도하고, 끝까지 실패하면 오류 로그를 남긴다.
 *
 * 다시 시도는 이 서버 프로세스 안의 타이머다(서버에 쓰고 있는 작업 큐가 없다).
 * 서버가 재시작하면 남은 시도는 사라진다. 그래도 그 사용자의 요청은 DB 기준으로
 * 계속 거절된다.
 */

export type AccountLockoutReason = 'deactivated' | 'password-reset';

/** 첫 시도가 실패한 뒤 다시 시도할 간격. */
export const LOCKOUT_RETRY_DELAYS_MS = [5_000, 30_000, 120_000, 600_000];

@Injectable()
export class Auth0AccountSyncService implements OnModuleDestroy {
  private readonly logger = new Logger(Auth0AccountSyncService.name);
  private readonly pending = new Map<string, { cancel: () => void }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly management: Auth0ManagementService,
  ) {}

  /**
   * 그 사용자의 Auth0 쪽 접근을 끊는다. 첫 시도를 바로 하고 그 결과를 돌려준다:
   * true면 끝났고, false면 실패해서 뒤에서 다시 시도하는 중이다. 던지지 않는다.
   *
   * - `deactivated`: Auth0 계정을 차단하고 refresh token을 폐기한다. 시도할 때마다
   *   DB를 다시 읽어서, 그사이 다시 활성화됐으면 아무것도 하지 않는다.
   * - `password-reset`: refresh token을 폐기한다.
   */
  lockOut(userId: string, reason: AccountLockoutReason): Promise<boolean> {
    this.cancel(userId);
    return this.attempt(userId, reason, 0);
  }

  /** 예약된 다시 시도를 취소한다(다시 활성화할 때). */
  cancel(userId: string): void {
    this.pending.get(userId)?.cancel();
    this.pending.delete(userId);
  }

  onModuleDestroy(): void {
    for (const entry of this.pending.values()) entry.cancel();
    this.pending.clear();
  }

  /** 테스트에서 바꿔 끼운다. 취소 함수를 돌려준다. */
  protected schedule(run: () => void, delayMs: number): () => void {
    const timer = setTimeout(run, delayMs);
    timer.unref?.();
    return () => clearTimeout(timer);
  }

  private async attempt(
    userId: string,
    reason: AccountLockoutReason,
    attempt: number,
  ): Promise<boolean> {
    try {
      await this.syncOnce(userId, reason);
      if (attempt > 0) {
        this.logger.log(
          `Auth0 접근 차단을 다시 시도해 반영했습니다 (user ${userId}, ${reason}).`,
        );
      }
      return true;
    } catch (error) {
      const detail =
        error instanceof Auth0ManagementError
          ? `${error.reason}${error.status ? ` ${error.status}` : ''}`
          : error instanceof Error
            ? error.message
            : 'unknown';
      const delayMs = LOCKOUT_RETRY_DELAYS_MS[attempt];
      if (delayMs === undefined) {
        this.logger.error(
          `Auth0 접근 차단을 끝내 반영하지 못했습니다 (user ${userId}, ${reason}, ${detail}). ` +
            'DB 기준으로는 이미 끊겨 있습니다. Auth0에서 계정 차단·refresh token 폐기를 직접 확인해야 합니다.',
        );
        return false;
      }
      this.logger.warn(
        `Auth0 접근 차단 실패 (user ${userId}, ${reason}, ${detail}). ${Math.round(delayMs / 1000)}초 뒤 다시 시도합니다.`,
      );
      const cancel = this.schedule(() => {
        this.pending.delete(userId);
        void this.attempt(userId, reason, attempt + 1);
      }, delayMs);
      this.pending.set(userId, { cancel });
      return false;
    }
  }

  private async syncOnce(
    userId: string,
    reason: AccountLockoutReason,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { auth0Id: true, isActive: true },
    });
    if (!user?.auth0Id) return;

    if (reason === 'deactivated') {
      // 그사이 다시 활성화됐다. 활성화 쪽이 Auth0 차단을 풀었으니 건드리지 않는다.
      if (user.isActive) return;
      try {
        await this.management.setBlocked(user.auth0Id, true);
      } catch (error) {
        // 로그인 계정이 이미 없으면 막을 것도, 폐기할 토큰도 없다.
        if (
          error instanceof Auth0ManagementError &&
          error.reason === 'not-found'
        ) {
          return;
        }
        throw error;
      }
      // 차단 요청을 기다리는 사이 다시 활성화됐을 수 있다. 활성화가 먼저 차단을 풀고
      // 이 요청이 뒤늦게 다시 막았다면 되돌린다.
      const latest = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { isActive: true },
      });
      if (latest?.isActive) {
        await this.management.setBlocked(user.auth0Id, false);
        return;
      }
    }
    await this.management.revokeRefreshTokens(user.auth0Id);
  }
}
