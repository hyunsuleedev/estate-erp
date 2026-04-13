import { PrismaClient } from '@prisma/client';

/**
 * 더미 Proposal 시드
 *
 * 목적:
 *   - 받은편지함 UI 의 모든 분기(우선순위, 상태, 출처, trustTier, 근거 유무,
 *     만료 임박, 결정 메모, 실행 실패) 를 한 번에 눈으로 확인하기 위한 샘플 데이터.
 *
 * 재실행 안전:
 *   - `generatedBy` 가 `dummy:seed:*` 로 시작하는 기존 Proposal 은 삭제 후 재삽입.
 *   - 실제 체커/MCP 에서 생성된 Proposal 은 건드리지 않는다.
 *
 * 실행:
 *   pnpm tsx prisma/seed-proposals.ts
 */

const SEED_PREFIX = 'dummy:seed:';

export async function seedProposals(prisma: PrismaClient) {
  console.log('\nProposals 더미 시드...');

  // 대상 사무소 조회 (기본: 가장 먼저 등록된 사무소)
  const office = await prisma.office.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!office) {
    console.log('  사무소가 없어서 건너뜁니다.');
    return;
  }

  // 기존 더미 삭제
  const removed = await prisma.proposal.deleteMany({
    where: {
      officeId: office.id,
      generatedBy: { startsWith: SEED_PREFIX },
    },
  });
  if (removed.count > 0) {
    console.log(`  기존 더미 ${removed.count}건 삭제`);
  }

  // 현실감 있는 단지 이름 뽑기 — 있는 것 없으면 하드코딩 fallback
  const sampleGroup = await prisma.externalListingGroup.findFirst({
    where: { officeId: office.id },
    include: { site: { select: { name: true } } },
  });
  const siteName = sampleGroup?.site.name ?? '래미안고덕';

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
  const hoursLater = (h: number) => new Date(now.getTime() + h * 3_600_000);
  const minutesLater = (m: number) => new Date(now.getTime() + m * 60_000);

  type Draft = Omit<
    Parameters<typeof prisma.proposal.create>[0]['data'],
    'officeId'
  >;

  const drafts: Draft[] = [
    // ────────────────────────────────────────────────────────────
    // 🔴 긴급 (urgent)
    // ────────────────────────────────────────────────────────────

    // 1) 광고 내림 — 법적 리스크, 만료 임박
    {
      type: 'ad_takedown',
      title: `${siteName} 101동 1503호 네이버 광고 내림 필요`,
      description:
        '거래 완료 후 3시간이 지났는데 네이버부동산에 광고가 아직 살아있어요.\n\n' +
        '채널: 네이버부동산 (articleNo 2512345678)\n' +
        '매물: 84A · 25.7평 · 15억 8,000\n' +
        '거래 체결: 3시간 전',
      reasoning:
        '공인중개사법 제18조의2: 거래 완료 매물의 광고는 "즉시" 삭제 의무. ' +
        '최대 500만원 과태료. 모니터링센터가 주기적으로 확인하므로 누락 시 ' +
        '소명 요구가 올 수 있음.',
      status: 'pending',
      priority: 'urgent',
      trustTier: 'approval_required',
      actionType: 'mark_ad_takedown',
      actionPayload: { externalListingId: 'dummy-article-no-2512345678' },
      generatedBy: `${SEED_PREFIX}rule:ad_takedown:v1`,
      dedupeKey: `${SEED_PREFIX}ad_takedown:dummy-1`,
      proposedAt: hoursAgo(3),
      expiresAt: hoursLater(45), // 48시간 만료 중 3h 경과
    },

    // 2) 임대차 갱신 거절 마감 임박 — D-45, urgent
    {
      type: 'lease_rejection_deadline',
      title: '박영희 세입자 갱신 거절 통지 마감 12일 남음',
      description:
        '고덕자이 102동 804호 (박영희 세입자) 임대차 만기가 45일 남았어요.\n\n' +
        '주택임대차보호법상 갱신 거절을 원하시면 만기 2개월 전까지 통지가 필요해요. ' +
        '지금 통지하지 않으면 묵시적 갱신(2년 자동 연장)이 발생합니다.',
      reasoning:
        '주택임대차보호법 제6조의3: 임대인은 임대차기간 만료 6개월 전부터 ' +
        '2개월 전까지 갱신 거절의 뜻을 통지하지 않으면 계약이 갱신된 것으로 봄.',
      status: 'pending',
      priority: 'urgent',
      trustTier: 'approval_required',
      actionType: 'create_task',
      actionPayload: {
        title: '박영희 세입자에게 갱신 거절 통지 연락',
        content:
          '만기 2026-05-28 까지 10일 남음. 서면 통지 권장 (내용증명 또는 카카오톡).',
        category: 'other',
        priority: 'high',
      },
      generatedBy: `${SEED_PREFIX}rule:lease_expiry:v1`,
      dedupeKey: `${SEED_PREFIX}lease:dummy-tenant-1:D60`,
      proposedAt: hoursAgo(6),
      expiresAt: hoursLater(42),
    },

    // 3) 등기부 위험 — inform_only
    {
      type: 'registry_risk_detected',
      title: `${siteName} 201동 2105호 등기부 위험 플래그`,
      description:
        '업로드된 등기부등본에서 주의가 필요한 항목이 감지됐어요.\n\n' +
        '⚠️ 가압류 설정: 2026-03-15, 채권자 ○○캐피탈, 2억 3,000만원\n' +
        '⚠️ 근저당권 과다: 채권최고액 합계 9억 (시세 대비 75%)\n\n' +
        '매매/전세 진행 전 법무사 상담을 권해요. AI는 법적 조언을 할 수 없어요.',
      reasoning:
        'PropertyDocument 파싱 결과: encumbrances=["provisional_seizure"], ' +
        'mortgageTotalRatio=0.75. 전세 보증금 안전 기준(잔여가 80% 이상) 미달 가능성.',
      status: 'pending',
      priority: 'urgent',
      trustTier: 'inform_only',
      actionType: null,
      actionPayload: undefined,
      generatedBy: `${SEED_PREFIX}rule:registry_parser:v1`,
      dedupeKey: `${SEED_PREFIX}registry:dummy-doc-1`,
      proposedAt: hoursAgo(1),
      expiresAt: null,
    },

    // ────────────────────────────────────────────────────────────
    // 🟡 일반 (normal)
    // ────────────────────────────────────────────────────────────

    // 4) 광고노트 신규 매물 (이번 턴의 메인 시나리오)
    {
      type: 'new_external_listings',
      title: `${siteName} 신규 광고 3건 확인 필요`,
      description:
        `지난 24시간 동안 ${siteName}에 새 외부 광고가 3건 등장했어요.\n\n` +
        '샘플:\n' +
        '· 101동 1504호 84A — 16.5억 (네이버부동산)\n' +
        '· 103동 2203호 59B — 12.8억 (다방)\n' +
        '· 105동 806호 84B — 15.9억 (네이버부동산)',
      reasoning:
        `관리 단지(OfficeSite) 내 신규 ExternalListingGroup 3건 ` +
        `(firstSeenAt ≥ ${hoursAgo(24).toISOString()}).`,
      status: 'pending',
      priority: 'normal',
      trustTier: 'approval_required',
      actionType: 'create_task',
      actionPayload: {
        title: `${siteName} 신규 광고 3건 검토`,
        content:
          '광고노트에서 새로 감지된 매물이에요. 시세 변화와 고객 조건 매칭 ' +
          '여부 확인이 필요합니다.\n\n' +
          '· 101동 1504호 84A — 16.5억\n' +
          '· 103동 2203호 59B — 12.8억\n' +
          '· 105동 806호 84B — 15.9억',
        category: 'advertisement',
        priority: 'medium',
      },
      generatedBy: `${SEED_PREFIX}rule:new_external_listings:v1`,
      dedupeKey: `${SEED_PREFIX}new_ext_listings:dummy-site-1:${now.toISOString().slice(0, 10)}`,
      proposedAt: hoursAgo(2),
      expiresAt: hoursLater(46),
    },

    // 5) MCP 제안 — 외부 Claude Desktop 에서 온 것
    {
      type: 'listing_price_change',
      title: '고덕자이 301동 1803호 가격 조정 제안',
      description:
        '사장님 Claude Desktop 세션에서 가격 인하 요청이 들어왔어요.\n\n' +
        '현재: 24.5억\n' +
        '제안: 24.0억 (5,000만원 ↓)\n\n' +
        '원본 요청: "301-1803 가격 5천 내려서 다시 제안해봐"',
      reasoning:
        'MCP 권한 설정: manager 역할은 listing_write 가 propose 로 제한됨. ' +
        '사장님 승인 후 반영됩니다.',
      status: 'pending',
      priority: 'normal',
      trustTier: 'approval_required',
      actionType: 'update_listing_price',
      actionPayload: {
        listingId: 'dummy-listing-301-1803',
        oldPrice: 245000,
        newPrice: 240000,
      },
      generatedBy: `${SEED_PREFIX}mcp:update_listing_price`,
      dedupeKey: `${SEED_PREFIX}mcp:price:dummy-listing-301-1803:240000`,
      proposedAt: minutesLater(-15),
      expiresAt: hoursLater(23),
    },

    // 6) 매칭 제안 — 이벤트 기반 반응 Rule
    {
      type: 'match_suggestion',
      title: '박영희 고객 매칭 가능 — 고덕그라시움 301-1803',
      description:
        '방금 가격이 조정된 고덕그라시움 301-1803이 박영희 고객 조건과 맞아요.\n\n' +
        '고객 조건: 고덕동 매매 25~27억, 방 3개\n' +
        '매물: 84A · 25.7평 · 24.5억 (5,000만원 인하됨)\n' +
        '일치도: 가격 ✓, 지역 ✓, 면적 ✓',
      reasoning:
        'listing.price.changed 이벤트 수신 후 PriceChangeReactorRule 이 ' +
        'BuyerRequirement 조건 매칭 수행. 예산 범위 내로 진입.',
      status: 'pending',
      priority: 'normal',
      trustTier: 'approval_required',
      actionType: 'create_match',
      actionPayload: {
        listingId: 'dummy-listing-301-1803',
        buyerReqId: 'dummy-buyer-req-park',
        stage: 'suggested',
      },
      generatedBy: `${SEED_PREFIX}event:listing.price.changed`,
      dedupeKey: `${SEED_PREFIX}match:dummy-listing-301-1803:dummy-buyer-req-park`,
      proposedAt: minutesLater(-10),
      expiresAt: hoursLater(71),
    },

    // 7) 자동 실행됐던 건 — lease_renewal_prepare (auto tier, 결과 표시)
    {
      type: 'lease_renewal_prepare',
      title: '임대차 갱신 준비 Task 자동 생성 · 3건',
      description:
        '앞으로 180일 이내 만기 예정인 임대차 3건에 대해 "갱신 거절 가능 ' +
        '기간 시작" Task 를 자동으로 생성했어요.\n\n' +
        '· 김철수 세입자 (래미안 203-1504, 만기 2026-10-12)\n' +
        '· 이민정 세입자 (고덕자이 101-806, 만기 2026-09-28)\n' +
        '· 정상훈 세입자 (고덕그라시움 104-2201, 만기 2026-11-05)',
      reasoning:
        'LeaseExpiryRule 주기 실행 (매일 06:00). Task 생성은 되돌리기 ' +
        '쉬우므로 auto tier 설정.',
      status: 'executed',
      priority: 'low',
      trustTier: 'auto',
      actionType: 'create_task',
      actionPayload: { tenants: 3 },
      generatedBy: `${SEED_PREFIX}rule:lease_expiry:v1`,
      dedupeKey: `${SEED_PREFIX}lease_prepare:dummy-batch-1`,
      proposedAt: hoursAgo(8),
      decidedAt: hoursAgo(8),
      decidedBy: null,
      executedAt: hoursAgo(8),
    },

    // ────────────────────────────────────────────────────────────
    // 🔵 참고 (low)
    // ────────────────────────────────────────────────────────────

    // 8) 경쟁사 분석 — inform_only
    {
      type: 'competitor_analysis',
      title: '경쟁 사무소 "○○부동산" 매물 등록 패턴 변화',
      description:
        '강동구 ○○부동산이 지난주 대비 신규 등록 매물이 2배 증가했어요.\n\n' +
        '· 지난주: 4건\n' +
        '· 이번주: 8건\n\n' +
        '주로 고덕그라시움과 고덕자이 중심. 단순 활동 증가일 수도 있고, ' +
        '지역 집중 전략일 수도 있어요.',
      reasoning:
        'ExternalListing.realtor_name 집계. 공개된 광고 정보 기반 분석이며 ' +
        '경쟁사 비공개 정보는 수집하지 않음.',
      status: 'pending',
      priority: 'low',
      trustTier: 'inform_only',
      actionType: null,
      actionPayload: undefined,
      generatedBy: `${SEED_PREFIX}rule:competitor_watch:v1`,
      dedupeKey: `${SEED_PREFIX}competitor:dummy-realtor-1:${now.toISOString().slice(0, 10)}`,
      proposedAt: hoursAgo(12),
      expiresAt: null,
    },

    // 9) 고객 이탈 예측 — 결정 메모와 함께 거부된 상태
    {
      type: 'client_reengagement',
      title: '김수민 고객 이탈 위험 — 28일 무연락',
      description:
        '김수민 고객님이 28일째 연락이 없어요. 최근 매칭 제안 2건을 거절한 ' +
        '이후로 접촉이 끊겼어요.\n\n' +
        '마지막 상담: 3월 14일\n' +
        '조건: 고덕 매매 13~15억, 방 3개',
      reasoning:
        'BuyerRequirement.lastContactDate 기준 28일 경과 + 최근 Match 2건 ' +
        'stage=closed (거절). 이탈 위험 점수 72/100.',
      status: 'rejected',
      priority: 'low',
      trustTier: 'approval_required',
      actionType: 'create_task',
      actionPayload: { title: '김수민 고객 재접촉 시도' },
      generatedBy: `${SEED_PREFIX}rule:churn_predictor:v1`,
      dedupeKey: `${SEED_PREFIX}churn:dummy-contact-kim:2026-04`,
      proposedAt: hoursAgo(20),
      decidedAt: hoursAgo(5),
      decidedBy: null,
      decisionNote: '어제 직접 통화했음. 당분간 쉬시겠다고 하심. 7월에 다시 연락 예정.',
    },

    // 10) 주간 브리핑 (executed, auto tier로 이미 생성됨)
    {
      type: 'weekly_briefing',
      title: '이번 주 강동구 시장 브리핑',
      description:
        '이번 주 강동구 매물 동향 요약이에요.\n\n' +
        '📊 신규 매물: 23건 (전주 +5)\n' +
        '📉 가격 인하: 8건 (평균 -1.8%)\n' +
        '✅ 거래 완료: 4건\n\n' +
        '주요 이슈:\n' +
        '· 고덕그라시움 84A 매물이 급증 (지난주 3 → 이번주 7건)\n' +
        '· 고덕자이 전세 매물 감소 추세\n' +
        '· 우리 활성 고객 중 3명이 고덕그라시움 84A 조건 일치',
      reasoning:
        '매주 월요일 07:00 MarketBriefingRule 실행. ExternalListing + ' +
        'PriceHistory + BuyerRequirement 집계.',
      status: 'executed',
      priority: 'low',
      trustTier: 'auto',
      actionType: null,
      actionPayload: undefined,
      generatedBy: `${SEED_PREFIX}rule:market_briefing:v1`,
      dedupeKey: `${SEED_PREFIX}briefing:dummy-site-1:2026-W15`,
      proposedAt: hoursAgo(30),
      decidedAt: hoursAgo(30),
      executedAt: hoursAgo(30),
    },

    // 11) 실행 실패 샘플
    {
      type: 'new_external_listings',
      title: '고덕자이 신규 광고 5건 확인 필요 — 실행 실패',
      description:
        '어제 고덕자이에 새 외부 광고가 5건 등장해 Task 생성을 시도했지만 ' +
        '할당 대상 직원을 찾지 못했어요.',
      reasoning:
        'AssignmentService: Office owner 없음. 활성 직원 0명. 사무소 설정 확인 필요.',
      status: 'failed',
      priority: 'normal',
      trustTier: 'approval_required',
      actionType: 'create_task',
      actionPayload: {
        title: '고덕자이 신규 광고 5건 검토',
        category: 'advertisement',
      },
      generatedBy: `${SEED_PREFIX}rule:new_external_listings:v1`,
      dedupeKey: `${SEED_PREFIX}new_ext_listings:dummy-site-2:2026-04-10`,
      proposedAt: hoursAgo(15),
      decidedAt: hoursAgo(15),
      executedAt: hoursAgo(15),
      executionError:
        'No active employee found for office. AssignmentService returned null.',
    },
  ];

  let created = 0;
  for (const draft of drafts) {
    await prisma.proposal.create({
      data: { ...draft, officeId: office.id } as any,
    });
    created += 1;
  }

  console.log(`  ${created}건 삽입 완료 (office: ${office.code})`);
}

// 단독 실행 진입점
async function main() {
  const prisma = new PrismaClient();
  try {
    await seedProposals(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// tsx 로 직접 실행됐을 때만 메인 호출
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
