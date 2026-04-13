import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProposalDraft, Rule, RuleContext } from '../rule.types';

/**
 * AdTakedownRule
 *
 * 법 기반 규칙. 공인중개사법 제18조의2:
 * 거래 완료된 매물의 광고는 "즉시" 삭제 의무. 위반 시 최대 500만원 과태료.
 *
 * 판정 로직 (Phase 1):
 *   우리 Listing 중 checkStatus IN ('in_contract', 'done')
 *   AND checkStatusChangedAt < NOW() - 2시간
 *   AND ExternalListing 중 같은 officeId + 같은 Unit에 is_active = true 인 것이 존재
 *
 *   매칭 키: external_listing_groups.unitId = listings.property → unit
 *
 * Phase 1 제약:
 *   - ListingAdChannel 테이블은 아직 없음 → ExternalListing 쪽으로만 감지
 *   - 사무소가 네이버 등에 올린 광고가 ExternalListing으로 upsert 돼 있다고 가정
 *     (electron-estate 크롤러가 이미 돌고 있음)
 *
 * 실행 스텁:
 *   - 이번 턴은 evaluate() 껍데기만. 다음 턴에 실제 SQL 구현.
 */
@Injectable()
export class AdTakedownRule implements Rule {
  private readonly logger = new Logger(AdTakedownRule.name);

  readonly name = 'ad_takedown';
  readonly version = 'v1';
  readonly displayName = '광고 내림 감지';
  readonly description =
    '거래 완료 매물의 외부 광고가 아직 살아있는지 감지한다. 공인중개사법 제18조의2 과태료 방지.';

  readonly isSystem = true;
  readonly defaultActive = true;

  readonly triggerType = 'schedule' as const;
  readonly schedule = '0 */30 * * * *'; // 30분마다

  readonly defaultConfig = {};

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    // TODO(Phase 1 다음 단계): 실제 쿼리 구현
    //
    // const GRACE_HOURS = 2;
    // const violations = await this.prisma.$queryRaw<...>`
    //   SELECT l.id, l.property_id, p.unit_id, ...
    //   FROM listings l
    //   JOIN properties p ON p.id = l.property_id
    //   JOIN external_listing_groups g ON g.unit_id = p.unit_id
    //                                 AND g.office_id = l.office_id
    //   JOIN external_listings e ON e.group_id = g.id
    //                             AND e.is_active = true
    //                             AND e.office_id = l.office_id
    //   WHERE l.office_id = ${ctx.officeId}
    //     AND l.check_status IN ('in_contract', 'done')
    //     AND l.check_status_changed_at < NOW() - interval '${GRACE_HOURS} hours'
    // `;
    //
    // return violations.map((v) => ({
    //   type: 'ad_takedown',
    //   title: `${v.siteName} ${v.unitName} ${v.cpName} 광고 내림 필요`,
    //   description: `거래 진입 후 경과. 광고 즉시 삭제 의무.`,
    //   reasoning: '공인중개사법 제18조의2: 거래 완료 매물은 즉시 광고 삭제 의무. 과태료 최대 500만원.',
    //   priority: v.hoursElapsed > 24 ? 'urgent' : 'normal',
    //   trustTier: ctx.trustTierFor('ad_takedown', 'approval_required'),
    //   actionType: 'mark_ad_takedown',
    //   actionPayload: { externalListingId: v.externalId },
    //   listingId: v.listingId,
    //   propertyId: v.propertyId,
    //   expiresInHours: 48,
    //   dedupeKey: `ad_takedown:${v.externalId}`,
    // }));

    this.logger.debug(`AdTakedownRule stub for office=${ctx.officeId}`);
    return [];
  }
}
