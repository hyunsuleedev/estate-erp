import { PrismaClient, Prisma } from '@prisma/client';

/**
 * EntityDraft 더미 시드
 *
 * 업무함(/inbox) UI 의 모든 분기를 한 화면에서 확인하기 위한 샘플:
 *   - decisionMode: confirm (계약서, 수수료 조정) / approval (광고 내림)
 *   - executor: server (내부 처리) / agent (OpenClaw 대기)
 *   - priority: urgent / normal / low
 *   - 일부 pending, 일부 resolved 상태
 *
 * 재실행 안전: generatedBy 가 'dummy:seed:draft' 로 시작하는 것만 삭제 후 재삽입.
 */

const SEED_PREFIX = 'dummy:seed:draft';

export async function seedEntityDrafts(prisma: PrismaClient) {
  console.log('\nEntityDraft 더미 시드...');

  const office = await prisma.office.findFirst({
    orderBy: { createdAt: 'asc' },
  });
  if (!office) {
    console.log('  사무소가 없어서 건너뜁니다.');
    return;
  }

  const removed = await prisma.entityDraft.deleteMany({
    where: {
      officeId: office.id,
      generatedBy: { startsWith: SEED_PREFIX },
    },
  });
  if (removed.count > 0) {
    console.log(`  기존 더미 ${removed.count}건 삭제`);
  }

  // 샘플 Deal / Payment 하나 참조
  const deal = await prisma.deal.findFirst({
    where: { officeId: office.id, isCancelled: false },
    orderBy: { createdAt: 'desc' },
    include: {
      commissionPayments: {
        where: { status: { in: ['pending', 'partial'] } },
        take: 1,
      },
    },
  });
  const samplePaymentId = deal?.commissionPayments?.[0]?.id ?? null;

  const sampleListing = await prisma.listing.findFirst({
    where: { officeId: office.id },
    orderBy: { createdAt: 'desc' },
  });

  const sampleContact = await prisma.contact.findFirst({
    where: { officeId: office.id },
    orderBy: { createdAt: 'desc' },
  });

  const now = new Date();
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

  type DraftSeed = Omit<
    Prisma.EntityDraftUncheckedCreateInput,
    'officeId'
  >;

  const drafts: DraftSeed[] = [
    // ──────────────────────────────────────────────────────────
    // 🔴 Urgent — confirm 타입 (AI가 완성한 계약서)
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'contract',
      operation: 'create',
      entityId: null,
      proposedChanges: {
        // 거래 참조
        dealId: deal?.id ?? '00000000-0000-0000-0000-000000000000',
        transactionType: deal?.transactionType ?? 'sale',

        // 당사자 FK
        buyerContactId:
          deal?.buyerContactId ??
          sampleContact?.id ??
          '00000000-0000-0000-0000-000000000000',
        sellerContactId:
          deal?.sellerContactId ??
          sampleContact?.id ??
          '00000000-0000-0000-0000-000000000000',

        // 금액 스케줄 (만원 단위) — Contract 스키마 필드명
        totalPrice: 158000,
        statedDeposit: 15800,
        statedInterimPayment: 63200,
        statedInterimDate: new Date(
          now.getTime() + 10 * 86_400_000,
        ).toISOString(),
        statedBalance: 79000,
        statedBalanceDate: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        contractDate: now.toISOString(),

        // 부동산 표시 (렌더링 전용 메타 — 실제 Contract 컬럼 아닐 수 있음)
        _document: {
          propertyAddress: '서울특별시 강동구 고덕동 123-45 고덕그라시움 101동 3403호',
          buildingStructure: '철근콘크리트',
          buildingUse: '공동주택 (아파트)',
          landShareNumerator: 36,
          landShareDenominator: 125000,
          landAreaM2: 47.85,
          exclusiveAreaM2: 84.56,

          // 근저당 현황
          encumbrance: {
            maxDebtAmount: 80000,  // 만원. 8억
            creditor: '국민은행',
          },

          // 당사자 상세 (실제 Contact FK 가 있지만 렌더링 스냅샷)
          sellerName: '정부자',
          sellerAddress: '서울특별시 송파구 잠실동 987 잠실아파트 205동 1502호',
          sellerRrn: '650412-1******',
          sellerPhone: '010-2222-3333',

          buyerName: '배투자',
          buyerAddress: '서울특별시 강남구 역삼동 456',
          buyerRrn: '780315-2******',
          buyerPhone: '010-4444-5555',

          // 인도일
          handoverDate: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        },

        specialTerms:
          '1. 현 시설 상태에서의 계약임.\n' +
          '2. 매수자가 소유권이전등기를 마치기 전까지 부동산에 관한 권리에 변동이 있을 경우 계약은 무효로 한다.\n' +
          '3. 등기부등본상 채권최고액 금 80,000만원 근저당설정상태이며 매도인은 잔금일에 전액 상환 말소등기한다.\n' +
          '4. 임차인 존속 조건으로 승계한다. (현 세입자 임대차 계약기간 2027-03-31까지)\n' +
          '5. 시설물(에어컨 3대, 빌트인 냉장고 1대, 가스오븐레인지) 포함 거래.\n' +
          '6. 잔금일 기준 관리비/공과금 일할 정산.\n' +
          '7. 본 특약사항에 기재되지 않은 사항은 민법상 계약에 관한 규정과 부동산매매 일반관례에 따른다.\n' +
          '8. 계약금과 잔금은 다음의 계좌로 입금한다. [국민은행 123-45-6789 예금주: 정부자]',
      },
      category: 'contract_draft',
      title: '고덕그라시움 101동 3403호 계약서 초안 완성',
      summary:
        'AI가 모든 필드를 채웠습니다. 검토 후 확인하면 계약서가 저장됩니다.',
      reasoning: 'Deal.stage=contracted 진입으로 자동 생성',
      priority: 'urgent',
      decisionMode: 'confirm',
      executor: 'server',
      status: 'pending',
      generatedBy: `${SEED_PREFIX}:contract_draft`,
      dedupeKey: `${SEED_PREFIX}:contract:deal-${deal?.id}`,
      dealId: deal?.id ?? null,
      createdAt: hoursAgo(2),
    },

    // ──────────────────────────────────────────────────────────
    // 🔴 Urgent — approval 타입 (광고 내림)
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'listing',
      operation: 'update',
      entityId: sampleListing?.id ?? null,
      proposedChanges: {
        isHidden: true,
        checkStatus: 'hold',
      },
      category: 'ad_takedown',
      title: '네이버 광고 30일 이상 미갱신',
      summary: '광고노트 방치 감지 — 광고를 내려야 합니다.',
      reasoning:
        '공인중개사법 제18조의2: 거래 완료/철회 매물의 광고는 즉시 삭제 의무.',
      priority: 'urgent',
      decisionMode: 'approval',
      executor: 'server',
      status: 'pending',
      generatedBy: `${SEED_PREFIX}:ad_takedown`,
      dedupeKey: `${SEED_PREFIX}:ad_takedown:listing-${sampleListing?.id}`,
      listingId: sampleListing?.id ?? null,
      createdAt: hoursAgo(5),
    },

    // ──────────────────────────────────────────────────────────
    // 🟡 Normal — confirm (수수료 조정)
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'commission_payment',
      operation: 'update',
      entityId: samplePaymentId,
      proposedChanges: {
        expectedAmount: 550, // 기존 금액에서 100 할인
        note: '[AI 제안] 매수인 네고 — 100만 할인',
      },
      category: 'commission_adjustment',
      title: '매수측 수수료 100만 할인',
      summary: '매수인이 가격 협상 시 할인 요청. 담당자 동의로 AI가 작성.',
      reasoning:
        '최근 통화 기록에서 "수수료 조정 가능 여부" 대화 감지. 협상 일상 범위.',
      priority: 'normal',
      decisionMode: 'confirm',
      executor: 'server',
      status: 'pending',
      generatedBy: `${SEED_PREFIX}:commission_adjust`,
      dedupeKey: `${SEED_PREFIX}:adjust:payment-${samplePaymentId}`,
      paymentId: samplePaymentId,
      dealId: deal?.id ?? null,
      createdAt: hoursAgo(1),
    },

    // ──────────────────────────────────────────────────────────
    // 🟡 Normal — approval (OpenClaw 에 맡길 네이버 광고 게재)
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'action',
      operation: 'action',
      entityId: null,
      proposedChanges: {
        tool: 'post_naver_ad',
        args: {
          listingId: sampleListing?.id,
          title: '고덕그라시움 101동 · 전세 10억 · 즉시 입주',
          body:
            '남향 · 학군 양호 · 리모델링 완료 · 즉시 입주 가능.\n' +
            '관리비 투명, 세입자 이력 깨끗합니다.',
          maskDongHo: true,
        },
      },
      category: 'post_naver_ad',
      title: '네이버 광고 게재 — 고덕그라시움 101동 1503',
      summary: 'AI가 문구 작성 완료. 승인하면 OpenClaw 가 실제 게재.',
      reasoning: '매물 등록 후 3일 경과, 관리 단지 주력 매물.',
      priority: 'normal',
      decisionMode: 'approval',
      executor: 'agent',
      status: 'pending',
      generatedBy: `${SEED_PREFIX}:post_naver_ad`,
      dedupeKey: `${SEED_PREFIX}:naver_ad:listing-${sampleListing?.id}`,
      listingId: sampleListing?.id ?? null,
      createdAt: hoursAgo(3),
    },

    // ──────────────────────────────────────────────────────────
    // 🟢 Low — confirm (태스크 자동 생성)
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'task',
      operation: 'create',
      entityId: null,
      proposedChanges: {
        title: '잔금일 D-3 안내 전화',
        content: '집주인과 매수인 양측에 잔금일 3일 전 확인 전화',
        source: 'ai',
        isDone: false,
        contactId: sampleContact?.id ?? null,
      },
      category: 'followup_task',
      title: '잔금일 D-3 안내 태스크',
      summary: '담당자에게 배정할 일정 태스크 — 확인하면 생성됩니다.',
      reasoning: '5월 2일 잔금일 예정.',
      priority: 'low',
      decisionMode: 'confirm',
      executor: 'server',
      status: 'pending',
      generatedBy: `${SEED_PREFIX}:followup_task`,
      dedupeKey: `${SEED_PREFIX}:task:deal-${deal?.id}`,
      dealId: deal?.id ?? null,
      createdAt: hoursAgo(8),
    },

    // ──────────────────────────────────────────────────────────
    // 🔵 Normal — bulk update (네이버 광고 재게재)
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'listing',
      operation: 'update_bulk',
      entityId: null,
      proposedChanges: {
        items: [
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '고덕그라시움 101-1503',
            subtitle: '25.8억 · 매매 · 84A',
            // 실제 업데이트할 필드 (시드 목적이라 최소)
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '래미안고덕 103-1204',
            subtitle: '15.9억 · 매매 · 84B',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '고덕아르테온 404-1502',
            subtitle: '28.5억 · 매매 · 107A',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: false,
            listingId: sampleListing?.id ?? null,
            displayLabel: '암사프라자 301호',
            subtitle: '상가',
            warning: '계약 진행중 — 재게재 부적절',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '고덕센트럴자이 B-302',
            subtitle: '18.9억 · 전세',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '강동밀레니얼 오피스텔 1108',
            subtitle: '3억 · 전세 · 원룸',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '명일한양 3차 601',
            subtitle: '10억 · 전세 · 33평',
            warning: '집주인 3일 전 통화 — 재확인 권장',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '고덕그라시움 205-802',
            subtitle: '22억 · 매매 · 84A',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '래미안고덕 108-1301',
            subtitle: '16억 · 매매 · 59A',
            updatedAt: new Date().toISOString(),
          },
          {
            enabled: true,
            listingId: sampleListing?.id ?? null,
            displayLabel: '고덕아이파크 2-2203',
            subtitle: '19.5억 · 매매 · 74C',
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      category: 'naver_ad_repost',
      title: '네이버 광고 7일 만료 · 재게재 10건',
      summary:
        '네이버 부동산 정책으로 7일마다 광고 재게재 필수. 체크 해제로 개별 제외 가능.',
      reasoning: '광고 게재일 기준 7일 경과 매물 일괄 감지.',
      priority: 'normal',
      decisionMode: 'approval',
      executor: 'server',
      status: 'pending',
      generatedBy: `${SEED_PREFIX}:naver_ad_repost`,
      dedupeKey: `${SEED_PREFIX}:naver_repost:bulk`,
      createdAt: hoursAgo(4),
    },

    // ──────────────────────────────────────────────────────────
    // ⏳ 승인됨 — Agent 실행 대기 중
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'action',
      operation: 'action',
      entityId: null,
      proposedChanges: {
        tool: 'send_kakao_alim',
        args: {
          to: '010-1234-5678',
          template: '잔금일 안내',
          body: '잔금일 3일 전 안내드립니다. 2026-05-02 오전 10시',
        },
      },
      category: 'send_kakao',
      title: '고객 안내 카카오 알림톡 발송',
      summary:
        '사장님 승인 완료 — OpenClaw 다음 heartbeat(최대 30분) 에 발송됩니다.',
      reasoning: '잔금일 D-3 자동 트리거',
      priority: 'normal',
      decisionMode: 'approval',
      executor: 'agent',
      status: 'approved',
      decidedAt: hoursAgo(1),
      generatedBy: `${SEED_PREFIX}:send_kakao`,
      dedupeKey: `${SEED_PREFIX}:kakao:balance_reminder`,
      createdAt: hoursAgo(2),
    },

    // ──────────────────────────────────────────────────────────
    // 🟣 AI 재작성 대기 (processing) — 코멘트 달려서 재처리 큐 진입
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'contract',
      operation: 'create',
      entityId: null,
      proposedChanges: {
        dealId: deal?.id ?? '00000000-0000-0000-0000-000000000000',
        transactionType: 'jeonse',
        buyerContactId:
          deal?.buyerContactId ??
          sampleContact?.id ??
          '00000000-0000-0000-0000-000000000000',
        sellerContactId:
          deal?.sellerContactId ??
          sampleContact?.id ??
          '00000000-0000-0000-0000-000000000000',
        totalPrice: 100000,
        statedDeposit: 100000,
        statedBalance: 0,
        contractDate: now.toISOString(),
        statedBalanceDate: new Date(
          now.getTime() + 45 * 86_400_000,
        ).toISOString(),
        specialTerms:
          '1. 현 시설 상태에서의 계약임.\n' +
          '2. 전세 보증금 10억.\n' +
          '3. 임대 기간 2년.',
      },
      category: 'contract_draft',
      title: '래미안고덕 103동 1204 전세 계약서 초안',
      summary:
        '사장님 코멘트 반영해서 AI 가 재작성 중. OpenClaw heartbeat 에 맞춰 다시 업무함으로 올라옵니다.',
      reasoning: 'Deal.stage=contracted 진입으로 자동 생성',
      priority: 'normal',
      decisionMode: 'confirm',
      executor: 'server',
      status: 'processing',
      generatedBy: `${SEED_PREFIX}:contract_draft_v2`,
      dedupeKey: `${SEED_PREFIX}:contract_processing:deal-${deal?.id}`,
      dealId: deal?.id ?? null,
      createdAt: hoursAgo(3),
    },

    // ──────────────────────────────────────────────────────────
    // ✅ 처리됨 — 감사 이력
    // ──────────────────────────────────────────────────────────
    {
      entityType: 'listing',
      operation: 'update',
      entityId: sampleListing?.id ?? null,
      proposedChanges: { checkStatus: 'verified' },
      category: 'check_status_update',
      title: '매물 확인 상태 → verified',
      summary: '집주인 통화 후 상태 확정.',
      priority: 'normal',
      decisionMode: 'confirm',
      executor: 'server',
      status: 'executed',
      executedAt: hoursAgo(24),
      decidedAt: hoursAgo(25),
      generatedBy: `${SEED_PREFIX}:check_status`,
      dedupeKey: `${SEED_PREFIX}:verify:listing-past-${sampleListing?.id}`,
      listingId: sampleListing?.id ?? null,
      createdAt: hoursAgo(27),
    },
  ];

  let inserted = 0;
  for (const d of drafts) {
    try {
      const created = await prisma.entityDraft.create({
        data: { officeId: office.id, ...d },
      });

      // processing 상태 데모: 미반영 코멘트 하나 달기
      if (d.status === 'processing') {
        const ownerUser = await prisma.user.findFirst({
          where: { officeId: office.id },
          orderBy: { createdAt: 'asc' },
        });
        if (ownerUser) {
          await prisma.entityDraftComment.create({
            data: {
              draftId: created.id,
              officeId: office.id,
              authorId: ownerUser.id,
              body:
                '특약에 "관리비/공과금 일할 정산" 조항 추가하고, ' +
                '잔금일을 6월 1일로 변경해줘.',
            },
          });
        }
      }

      inserted += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  drafts insert error: ${msg}`);
    }
  }
  console.log(`  ${inserted} 건 더미 삽입 완료`);
}

// 단독 실행 지원
if (require.main === module) {
  const prisma = new PrismaClient();
  seedEntityDrafts(prisma)
    .then(() => {
      console.log('\n✅ seed-entity-drafts 완료');
      return prisma.$disconnect();
    })
    .catch((e) => {
      console.error('❌ seed-entity-drafts 실패:', e);
      return prisma.$disconnect().then(() => process.exit(1));
    });
}
