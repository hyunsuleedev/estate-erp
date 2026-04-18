import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { ProposalDraft, Rule, RuleContext } from '../rule.types';

/**
 * NewExternalListingsRule
 *
 * 광고노트(ExternalListing / ExternalListingGroup) 에 어제 이후
 * 새로 등장한 호실 그룹을 감지하여, 단지(Site) 단위로 묶어
 * "신규 광고 N건 확인 필요" Task 제안을 생성한다.
 *
 * 왜 Group 기준인가:
 *   같은 호실에 여러 채널(네이버/다방/직방)에 동시 올라오면 ExternalListing 은 여러 건이지만
 *   ExternalListingGroup 은 1개. 사장님이 "같은 호실이 3개 채널에 올라왔으니 3개 확인"
 *   이 아니라 "호실 1개가 새로 나왔으니 확인" 으로 인지하는 것이 실무에 맞다.
 *
 * 왜 Site 단위 묶음인가:
 *   단지마다 Task 를 하나씩 생성하는 것이 사장님 입장에서 소화 가능한 단위.
 *   "래미안고덕 단지에 어제 신규 3건" 이라는 식.
 *   단지 전체가 관심 대상이 아니면 사장님이 거부하면 되고, 그 이력이 학습 데이터가 된다.
 *
 * Phase 1 제약:
 *   - 사무소가 관리 단지(OfficeSite) 로 등록한 단지만 감지 대상.
 *     관리 대상이 아니면 신규가 떠도 의미 없다.
 *   - 지난 24시간 firstSeenAt 기준 (Group.firstSeenAt)
 *   - dedupeKey: `new_ext_listings:{siteId}:{YYYY-MM-DD}` — 하루 한 번만
 *
 * Phase 2 이후:
 *   - LLM 이 신규 매물의 가격/조건을 우리 BuyerRequirement 와 대조해
 *     "박영희 고객한테 딱" 같은 맥락을 Task 설명에 자동 첨부
 *   - 임계값 기반 Rule 로 전환 (N건 이상일 때만 제안) — Rule.config 사용
 */
@Injectable()
export class NewExternalListingsRule implements Rule {
  private readonly logger = new Logger(NewExternalListingsRule.name);

  readonly name = 'new_external_listings';
  readonly version = 'v1';
  readonly displayName = '광고노트 신규 매물 감지';
  readonly description =
    '관리 단지에 어제 이후 새로 등장한 외부 광고 매물을 감지하여 Task 생성 제안.';

  // 현재는 법 기반이 아니라 "일일 관찰 루틴"에 가까움.
  // 그러나 임계값(몇 건 이상일 때만?) 같은 파라미터를 사장님이 조정할 여지가 있어서
  // Phase 2 에 isSystem=false 로 전환 가능하다. Phase 1 은 기본 system 으로 seed.
  readonly isSystem = true;
  readonly defaultActive = true;

  readonly triggerType = 'schedule' as const;
  // 매일 아침 07:30. LeaseExpiryRule(06:00) 이후로 간격 둠.
  readonly schedule = '0 30 7 * * *';

  readonly defaultConfig = {
    /** 관측 창 (시간). 이 시간 안에 firstSeenAt 이 잡힌 Group 을 신규로 본다. */
    lookbackHours: 24,
    /** Site 당 최소 신규 건수. 0 이면 1건도 알림. */
    minNewPerSite: 1,
  };

  constructor(private readonly prisma: PrismaService) {}

  async evaluate(ctx: RuleContext): Promise<ProposalDraft[]> {
    const config = { ...this.defaultConfig, ...(ctx.ruleConfig ?? {}) };
    const lookbackHours = Number(config.lookbackHours) || 24;
    const minNewPerSite = Number(config.minNewPerSite) || 1;

    const since = new Date(ctx.now.getTime() - lookbackHours * 3_600_000);
    const today = ctx.now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC 기준)

    // 1. 이 사무소가 관리하는 Site 목록
    const officeSites = await this.prisma.officeSite.findMany({
      where: { officeId: ctx.officeId },
      select: { siteId: true },
    });
    if (officeSites.length === 0) {
      this.logger.debug(
        `NewExternalListingsRule: office ${ctx.officeId} has no OfficeSite, skipping`,
      );
      return [];
    }
    const siteIds = officeSites.map((os) => os.siteId);

    // 2. 이 단지들 중에서 since 이후 firstSeenAt 인 Group 을 site 단위로 집계
    const newGroups = await this.prisma.externalListingGroup.findMany({
      where: {
        officeId: ctx.officeId,
        siteId: { in: siteIds },
        firstSeenAt: { gte: since },
      },
      include: {
        site: { select: { id: true, name: true } },
        listings: {
          where: { isActive: true },
          select: {
            id: true,
            transactionType: true,
            price: true,
            deposit: true,
            monthlyRent: true,
            articleName: true,
            cpName: true,
          },
          take: 5, // 설명용 샘플
        },
      },
      orderBy: { firstSeenAt: 'desc' },
    });

    if (newGroups.length === 0) {
      this.logger.debug(
        `NewExternalListingsRule: no new groups in last ${lookbackHours}h for office ${ctx.officeId}`,
      );
      return [];
    }

    // 3. Site 별로 그룹
    const bySite = new Map<
      string,
      {
        siteName: string;
        groups: typeof newGroups;
      }
    >();
    for (const g of newGroups) {
      const key = g.siteId;
      const existing = bySite.get(key);
      if (existing) {
        existing.groups.push(g);
      } else {
        bySite.set(key, {
          siteName: g.site.name,
          groups: [g],
        });
      }
    }

    // 4. Site 당 Proposal 1개
    const drafts: ProposalDraft[] = [];
    for (const [siteId, bucket] of bySite.entries()) {
      if (bucket.groups.length < minNewPerSite) continue;

      const count = bucket.groups.length;
      const samples = bucket.groups
        .slice(0, 3)
        .map((g) => this.describeGroup(g))
        .join('\n');

      drafts.push({
        type: 'new_external_listings',
        title: `${bucket.siteName} 신규 광고 ${count}건 확인 필요`,
        description:
          `지난 ${lookbackHours}시간 동안 ${bucket.siteName}에 새 외부 광고가 ${count}건 등장했어요.\n\n` +
          `샘플:\n${samples}` +
          (count > 3 ? `\n…외 ${count - 3}건` : ''),
        reasoning:
          `관리 단지(OfficeSite) 내 신규 ExternalListingGroup ${count}건 (firstSeenAt ≥ ${since.toISOString()}).`,
        priority: count >= 5 ? 'normal' : 'low',
        trustTier: ctx.trustTierFor('new_external_listings', 'approval_required'),
        actions: [
          {
            tool: 'create_task',
            args: {
              title: `${bucket.siteName} 신규 광고 ${count}건 검토`,
              content:
                `광고노트에서 새로 감지된 매물이에요. 시세 변화와 고객 조건 매칭 여부 확인이 필요합니다.\n\n${samples}`,
              category: 'advertisement',
              priority: count >= 5 ? 'high' : 'medium',
              assignmentHint: `관리 단지 ${bucket.siteName} 의 담당 직원`,
            },
          },
        ],
        expiresInHours: 48,
        dedupeKey: `new_ext_listings:${siteId}:${today}`,
      });
    }

    this.logger.log(
      `NewExternalListingsRule office=${ctx.officeId}: ${drafts.length} site proposals from ${newGroups.length} new groups`,
    );
    return drafts;
  }

  private describeGroup(group: {
    buildingName: string | null;
    inferredHo: string | null;
    areaName: string | null;
    listings: Array<{
      transactionType: string;
      price: number | null;
      deposit: number | null;
      monthlyRent: number | null;
      cpName: string | null;
      articleName: string | null;
    }>;
  }): string {
    const dong = group.buildingName ?? '?';
    const ho = group.inferredHo ?? '?';
    const area = group.areaName ?? '';
    const first = group.listings[0];
    if (!first) return `· ${dong} ${ho} ${area}`;

    const priceStr = this.formatPrice(first);
    const cp = first.cpName ?? '외부';
    return `· ${dong} ${ho} ${area} — ${priceStr} (${cp})`;
  }

  private formatPrice(l: {
    transactionType: string;
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
  }): string {
    if (l.transactionType === 'sale') {
      return l.price ? `${this.toEok(l.price)}` : '가격 미상';
    }
    if (l.transactionType === 'jeonse') {
      return l.price ? `전세 ${this.toEok(l.price)}` : '전세 가격 미상';
    }
    if (l.transactionType === 'monthly') {
      const dep = l.deposit ? this.toEok(l.deposit) : '?';
      const rent = l.monthlyRent ?? '?';
      return `월세 ${dep}/${rent}`;
    }
    return '거래유형 미상';
  }

  /**
   * 만원 단위 → "N.N억" 형태 한국식 표기.
   * 1억 미만은 만원 단위로 표시.
   */
  private toEok(manWon: number): string {
    if (manWon >= 10000) {
      const eok = manWon / 10000;
      return `${eok.toFixed(eok % 1 === 0 ? 0 : 1)}억`;
    }
    return `${manWon}만`;
  }
}
