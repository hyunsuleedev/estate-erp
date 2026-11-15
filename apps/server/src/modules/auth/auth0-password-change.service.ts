import { timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { Auth0AccountSyncService } from './auth0-account-sync.service';

/**
 * 비밀번호가 Auth0에서 바뀌었을 때(사장님이 메일의 재설정 링크로 바꾼 경우) 그
 * 계정의 기존 로그인을 모두 끊는다. 직원 재설정(EmployeesService.resetPassword)과
 * 같은 세 가지를 한다: 변경 이전에 로그인한 세션의 접근 토큰을 tokensValidAfter로
 * 즉시 거절하고, 실시간 연결을 끊고, refresh token을 폐기한다.
 *
 * 이 알림이 오지 못해도(서버가 잠깐 내려가 있었거나 로컬 개발) 예전 세션이 계속
 * 살아남지는 않는다. Auth0의 post-login Action(session-claims.js)이 비밀번호 변경
 * 이전에 로그인한 세션의 토큰 갱신을 거절하므로, 접근 토큰 수명(15분) 안에 끊긴다.
 * 이 알림은 그 시간을 기다리지 않고 바로 끊기 위한 것이다.
 *
 * 부르는 쪽은 Auth0의 post-change-password Action이다
 * (apps/server/auth0/actions/password-changed.js). 공유 비밀값으로 확인한다.
 */
@Injectable()
export class Auth0PasswordChangeService {
  private readonly logger = new Logger(Auth0PasswordChangeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly accountSync: Auth0AccountSyncService,
    private readonly realtime: RealtimeService,
  ) {}

  /** 비밀값이 설정돼 있고 받은 값과 같을 때만 true. 설정이 없으면 아무 요청도 받지 않는다. */
  isAuthorized(presented: string | undefined): boolean {
    const expected = this.config.get<string>('AUTH0_EVENT_SECRET')?.trim();
    if (!expected || !presented) return false;
    const a = Buffer.from(presented);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * 기준 시각(tokensValidAfter)을 비밀번호가 바뀐 시각으로 올리고, 실시간 연결을
   * 끊고, refresh token을 폐기한다.
   *
   * 기준 시각은 알림을 받은 지금이 아니라 Auth0가 알려 준 변경 시각이다. 접근 토큰에는
   * 세션의 로그인 시각이 들어 있어(SESSION_AUTH_TIME_CLAIM), 변경 이전에 로그인한
   * 세션은 그 뒤 토큰을 새로 받아도 거절되고, 새 비밀번호로 로그인한 세션은 알림이
   * 늦게 와도 끊기지 않는다. 같은 알림이 다시 와도 결과가 같으므로 건너뛰는 경우가
   * 없다(앞선 시도에서 폐기가 실패했어도 다시 시도된다).
   *
   * @param auth0UserId 비밀번호가 바뀐 Auth0 user_id
   * @param changedAt Auth0가 알려 준 변경 시각. 없거나 미래면 지금으로 본다.
   * @returns 'locked-out': 모두 끝냄. 'revoke-pending': 기준 시각은 올렸지만 refresh
   *   token 폐기가 아직 안 됐다(뒤에서 다시 시도 중이고, 부른 쪽도 다시 불러야 한다).
   */
  async handlePasswordChanged(
    auth0UserId: string,
    changedAt: Date | null,
    now: Date = new Date(),
  ): Promise<'locked-out' | 'revoke-pending' | 'unknown-user'> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id: auth0UserId },
      select: { id: true },
    });
    if (!user) return 'unknown-user';

    const effective =
      changedAt && changedAt.getTime() <= now.getTime() ? changedAt : now;
    // 기준 시각은 뒤로만 간다. 읽은 값과 비교해 쓰면, 그사이 다른 알림이나 직원
    // 재설정·비활성화가 찍은 더 늦은 시각을 덮어써 끊긴 토큰이 되살아난다. 그래서
    // 비교와 쓰기를 DB의 한 문장으로 한다(더 이른 시각으로는 바뀌지 않는다).
    await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ tokensValidAfter: null }, { tokensValidAfter: { lt: effective } }],
      },
      data: { tokensValidAfter: effective },
    });
    await this.realtime.disconnectUser(user.id).catch((error: unknown) => {
      this.logger.warn(
        `사용자(${user.id})의 실시간 연결을 끊지 못했습니다: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    // 실패하면 Auth0AccountSyncService가 뒤에서 다시 시도한다.
    const revoked = await this.accountSync.lockOut(user.id, 'password-reset');
    return revoked ? 'locked-out' : 'revoke-pending';
  }
}
