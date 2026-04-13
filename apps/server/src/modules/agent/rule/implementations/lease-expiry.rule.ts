import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProposalDraft, Rule, RuleContext } from '../rule.types';

/**
 * LeaseExpiryRule
 *
 * 법 기반 규칙. 주택임대차보호법:
 * 집주인이 갱신 거절하려면 만기 6개월~2개월 전 통지 필수.
 * 놓치면 묵시적 갱신(2년 자동 연장). 전월세 상한 5% 룰.
 *
 * 단계별 알림:
 *   D-180 ~ D-90:  "갱신 가능 기간 시작" (low priority)
 *   D-90  ~ D-60:  "세입자 갱신요구권 발동" (normal)
 *   D-60  ~ D-30:  "갱신 거절 통지 마감 임박" (urgent)
 *   D-30  ~ D-0:   "재계약/퇴거 준비" (normal)
 *
 * dedupeKey 로 같은 세입자의 같은 단계는 한 번만 생성.
 *
 * 실행 스텁:
 *   - 이번 턴은 evaluate() 껍데기만. 다음 턴에 쿼리 구현.
 */
@Injectable()
export class LeaseExpiryRule implements Rule {
  private readonly logger = new Logger(LeaseExpiryRule.name);

  readonly name = 'lease_expiry';
  readonly version = 'v1';
  readonly displayName = '임대차 만기 알림';
  readonly description =
    '주택임대차보호법 상 갱신 거절 통지 기한(6~2개월 전)을 놓치지 않도록 단계별 알림.';

  readonly isSystem = true;
  readonly defaultActive = true;

  readonly triggerType = 'schedule' as const;
  readonly schedule = '0 0 6 * * *'; // 매일 06:00

  readonly defaultConfig = {};

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    // TODO(Phase 1 다음 단계): Tenant.contract_end 기반 단계별 판정 구현
    //
    // const tenants = await this.prisma.tenant.findMany({
    //   where: {
    //     officeId: ctx.officeId,
    //     status: 'residing',
    //     contractEnd: {
    //       not: null,
    //       gte: ctx.now,
    //       lte: addDays(ctx.now, 180),
    //     },
    //   },
    //   include: { contact: true, property: { include: { site: true, unit: true } } },
    // });
    //
    // const drafts: ProposalDraft[] = [];
    // for (const t of tenants) {
    //   const daysLeft = differenceInDays(t.contractEnd!, ctx.now);
    //   const stage = daysLeft > 90 ? 'D180' : daysLeft > 60 ? 'D90' : daysLeft > 30 ? 'D60' : 'D30';
    //   // ... stage별 priority / title / task payload 구성
    //   drafts.push({ ..., dedupeKey: `lease:${t.id}:${stage}` });
    // }
    // return drafts;

    this.logger.debug(`LeaseExpiryRule stub for office=${ctx.officeId}`);
    return [];
  }
}
