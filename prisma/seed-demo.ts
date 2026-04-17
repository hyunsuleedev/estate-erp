/**
 * seed-demo.ts — 각 페이지에 보여줄 더미 데이터 일괄 삽입.
 *
 * 대상: 테스트 사무소 GD7291 (강동 부동산), 단지: 고덕그라시움.
 *
 * 원칙:
 *   - 모든 레코드의 memo 에 '[DEMO]' 태그를 남겨 재실행 시 깨끗이 재생성.
 *   - 기존 Site / Dong / Unit (공공 데이터) 는 절대 건드리지 않는다.
 *   - Task/Consultation/CalendarEvent 등 memo 필드가 없는 테이블은 title 또는
 *     content 에 '[DEMO]' 태그를 박는다.
 *   - Proposal seed (seed-proposals.ts), Rule seed (RuleEngineService) 는 별도 실행.
 *
 * 실행:
 *   pnpm tsx prisma/seed-demo.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';

const DEMO_TAG = '[DEMO]';

interface Ctx {
  prisma: PrismaClient;
  officeId: string;
  siteId: string;
  ownerUserId: string;
  managerUserId: string;
  agentUserId: string;
  unitIds: string[]; // 선택된 8개 Unit
}

async function main() {
  const prisma = new PrismaClient();
  try {
    // 첫 번째 활성 사무소를 대상으로 한다. 여러 사무소가 있어도 안전한 선택.
    const office = await prisma.office.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!office) {
      throw new Error(
        `활성 Office 가 없습니다. 먼저 사무소 / 사용자를 생성해주세요.`,
      );
    }
    console.log(`대상 사무소: ${office.name} (${office.code})`);

    const users = await prisma.user.findMany({
      where: { officeId: office.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const owner =
      users.find((u) => u.role === 'owner') ?? users[0];
    const manager =
      users.find((u) => u.role === 'manager') ??
      users.find((u) => u.role === 'agent') ??
      owner;
    const agent =
      users.find((u) => u.role === 'agent' && u.id !== manager.id) ??
      users.find((u) => u.role === 'agent') ??
      manager;
    if (!owner) {
      throw new Error('사무소에 사용자가 필요합니다.');
    }

    const site = await prisma.site.findFirst({
      where: { name: '고덕그라시움' },
    });
    if (!site) {
      throw new Error('고덕그라시움 Site 가 없습니다.');
    }

    // 실제 Unit 중 층수 기준 상위 몇 개를 골라 고정 순서로 사용.
    // 동일한 선택을 반복 가능하게 하기 위해 layer 별로 고정 ordering.
    const units = await prisma.unit.findMany({
      where: { siteId: site.id, floor: { not: null } },
      orderBy: [{ floor: 'desc' }, { name: 'asc' }],
      take: 8,
    });
    if (units.length < 8) {
      throw new Error(
        `Unit 이 8개 필요한데 ${units.length}개 만 있습니다.`,
      );
    }

    const ctx: Ctx = {
      prisma,
      officeId: office.id,
      siteId: site.id,
      ownerUserId: owner.id,
      managerUserId: manager.id,
      agentUserId: agent.id,
      unitIds: units.map((u) => u.id),
    };

    console.log('1. 기존 [DEMO] 데이터 정리...');
    await wipe(ctx);

    console.log('2. Contact 12 insert...');
    const contacts = await seedContacts(ctx);

    console.log('3. Property + PropertyContact + Tenant insert...');
    const properties = await seedProperties(ctx, contacts);

    console.log('4. Listing + PriceHistory insert...');
    const listings = await seedListings(ctx, properties);

    console.log('5. BuyerRequirement insert...');
    const buyerReqs = await seedBuyerRequirements(ctx, contacts);

    console.log('6. Match insert...');
    const matches = await seedMatches(ctx, listings, buyerReqs);

    console.log('7. Deal + Contract + DealParticipant + CommissionPayment insert...');
    await seedDeals(ctx, listings, contacts);

    console.log('8. Consultation insert...');
    await seedConsultations(ctx, contacts, properties, listings, matches, buyerReqs);

    console.log('9. Task insert...');
    await seedTasks(ctx, contacts, properties, listings);

    console.log('10. CalendarEvent insert...');
    await seedCalendarEvents(ctx, contacts, properties, listings, matches);

    console.log('11. OfficeExpenseTemplate insert...');
    await seedOfficeExpenses(ctx);

    console.log('\n✅ seed-demo 완료');
  } finally {
    await prisma.$disconnect();
  }
}

// ─────────────────────────────────────────────────────────────
// 정리 — memo/title/content 에 [DEMO] 태그가 있는 것만 삭제
// 참조 관계를 고려해 역순으로 삭제
// ─────────────────────────────────────────────────────────────
async function wipe({ prisma, officeId }: Ctx) {
  const demoLike = { contains: DEMO_TAG };

  // CalendarEvent
  await prisma.calendarEvent.deleteMany({
    where: { officeId, title: demoLike },
  });

  // Task (기존 seed-test-office.ts 의 20개는 title 에 DEMO 태그가 없어 안 지워짐)
  await prisma.task.deleteMany({
    where: { officeId, title: demoLike },
  });

  // Consultation
  await prisma.consultation.deleteMany({
    where: { officeId, content: demoLike },
  });

  // Match (memo 기준)
  await prisma.match.deleteMany({
    where: { officeId, memo: demoLike },
  });

  // OfficeExpenseTemplate (note 기준)
  await prisma.officeExpenseTemplate.deleteMany({
    where: { officeId, note: demoLike },
  });

  // CommissionPayment → Contract → DealParticipant → Deal
  const demoDeals = await prisma.deal.findMany({
    where: { officeId, memo: demoLike },
    select: { id: true },
  });
  const dealIds = demoDeals.map((d) => d.id);
  if (dealIds.length > 0) {
    await prisma.commissionPayment.deleteMany({
      where: { dealId: { in: dealIds } },
    });
    await prisma.contract.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.dealParticipant.deleteMany({
      where: { dealId: { in: dealIds } },
    });
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  }

  // BuyerRequirement
  await prisma.buyerRequirement.deleteMany({
    where: { officeId, memo: demoLike },
  });

  // PriceHistory (reason 기준)
  await prisma.priceHistory.deleteMany({
    where: { officeId, reason: demoLike },
  });

  // Listing
  await prisma.listing.deleteMany({
    where: { officeId, memo: demoLike },
  });

  // Tenant, PropertyContact → Property
  const demoProps = await prisma.property.findMany({
    where: { officeId, memo: demoLike },
    select: { id: true },
  });
  const propIds = demoProps.map((p) => p.id);
  if (propIds.length > 0) {
    await prisma.tenant.deleteMany({ where: { propertyId: { in: propIds } } });
    await prisma.propertyContact.deleteMany({
      where: { propertyId: { in: propIds } },
    });
    await prisma.property.deleteMany({ where: { id: { in: propIds } } });
  }

  // Contact (맨 마지막: Deal/Contract/Tenant/Consultation 다 지워진 뒤)
  await prisma.contact.deleteMany({
    where: { officeId, memo: demoLike },
  });
}

// ─────────────────────────────────────────────────────────────
// Contact — 12명
// 0-3: 소유주, 4-7: 구매고객, 8-9: 세입자, 10-11: 전문가(법무사/세무사)
// ─────────────────────────────────────────────────────────────
async function seedContacts(ctx: Ctx) {
  const defs = [
    { name: '김소유', phone: '01020010001', tags: ['소유주', 'VIP'] },
    { name: '이영희', phone: '01020010002', tags: ['소유주'] },
    { name: '박재물', phone: '01020010003', tags: ['소유주'] },
    { name: '정부자', phone: '01020010004', tags: ['소유주', '다주택'] },
    { name: '한구매', phone: '01030010001', tags: ['구매고객', '신혼'] },
    { name: '최살래', phone: '01030010002', tags: ['구매고객', 'VIP'] },
    { name: '배투자', phone: '01030010003', tags: ['구매고객', '투자'] },
    { name: '강학군', phone: '01030010004', tags: ['구매고객', '학군'] },
    { name: '윤세입', phone: '01040010001', tags: ['세입자'] },
    { name: '임전세', phone: '01040010002', tags: ['세입자'] },
    { name: '홍법무', phone: '01050010001', tags: ['법무사'] },
    { name: '조세무', phone: '01050010002', tags: ['세무사'] },
  ];

  const created = [];
  for (const def of defs) {
    const c = await ctx.prisma.contact.create({
      data: {
        officeId: ctx.officeId,
        name: def.name,
        phone: def.phone,
        email: `${def.phone.replace(/-/g, '')}@demo.test`,
        tags: def.tags,
        memo: `${DEMO_TAG} ${def.name} 더미`,
      },
    });
    created.push(c);
  }
  return created;
}

// ─────────────────────────────────────────────────────────────
// Property — 6 개 (기존 Unit 재사용)
// 각 Property 에 owner PropertyContact 붙이고, 2개는 Tenant 도 붙임.
// ─────────────────────────────────────────────────────────────
async function seedProperties(
  ctx: Ctx,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
) {
  const owners = contacts.slice(0, 4);
  const tenants = contacts.slice(8, 10);
  // 6개 Property 에 owner 를 라운드로빈으로 배치.
  const propertyDefs = [0, 1, 2, 3, 4, 5].map((i) => ({
    unitIdx: i,
    ownerIdx: i % owners.length,
    memo: `${DEMO_TAG} Property #${i + 1}`,
  }));

  const created = [];
  for (const def of propertyDefs) {
    const property = await ctx.prisma.property.create({
      data: {
        officeId: ctx.officeId,
        siteId: ctx.siteId,
        unitId: ctx.unitIds[def.unitIdx],
        memo: def.memo,
      },
    });
    await ctx.prisma.propertyContact.create({
      data: {
        officeId: ctx.officeId,
        contactId: owners[def.ownerIdx].id,
        propertyId: property.id,
        role: 'owner',
        shareRatio: new Prisma.Decimal(100),
        isPrimary: true,
        status: 'active',
        memo: `${DEMO_TAG} owner link`,
      },
    });
    created.push(property);
  }

  // 임대중인 Property 2개 (인덱스 4, 5) → Tenant 붙이기
  const now = new Date();
  const addMonths = (d: Date, n: number) => {
    const copy = new Date(d);
    copy.setMonth(copy.getMonth() + n);
    return copy;
  };
  await ctx.prisma.tenant.create({
    data: {
      officeId: ctx.officeId,
      propertyId: created[4].id,
      contactId: tenants[0].id,
      deposit: 50000, // 5억
      monthlyRent: 0,
      contractStart: addMonths(now, -18),
      contractEnd: addMonths(now, 2), // 곧 만기 (D-60 테스트)
      status: 'residing',
      memo: `${DEMO_TAG} 전세 거주중`,
    },
  });
  await ctx.prisma.tenant.create({
    data: {
      officeId: ctx.officeId,
      propertyId: created[5].id,
      contactId: tenants[1].id,
      deposit: 10000, // 1억
      monthlyRent: 120, // 120만원
      contractStart: addMonths(now, -6),
      contractEnd: addMonths(now, 18),
      status: 'residing',
      memo: `${DEMO_TAG} 월세 거주중`,
    },
  });

  return created;
}

// ─────────────────────────────────────────────────────────────
// Listing — 8 개 (매매 5 / 전세 2 / 월세 1)
// 같은 Property 에 여러 Listing 가능 (매매 + 전세 동시)
// ─────────────────────────────────────────────────────────────
async function seedListings(
  ctx: Ctx,
  properties: Awaited<ReturnType<typeof seedProperties>>,
) {
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  const defs: Array<{
    propertyIdx: number;
    transactionType: 'sale' | 'jeonse' | 'monthly';
    price?: number;
    deposit?: number;
    monthlyRent?: number;
    checkStatus: string;
    memo: string;
    priceHistory?: { priceBefore: number; priceAfter: number; reason: string };
  }> = [
    {
      propertyIdx: 0,
      transactionType: 'sale',
      price: 268000, // 26.8억
      checkStatus: 'verified',
      memo: `${DEMO_TAG} 급매 · 로얄층 남향 · 즉시입주`,
      priceHistory: {
        priceBefore: 275000,
        priceAfter: 268000,
        reason: `${DEMO_TAG} 집주인 요청 가격 조정`,
      },
    },
    {
      propertyIdx: 1,
      transactionType: 'sale',
      price: 242000,
      checkStatus: 'verified',
      memo: `${DEMO_TAG} 깔끔 · 올수리 · 남동향`,
    },
    {
      propertyIdx: 2,
      transactionType: 'sale',
      price: 319000,
      checkStatus: 'unverified',
      memo: `${DEMO_TAG} 고층 · 한강뷰 · 펜트하우스`,
    },
    {
      propertyIdx: 3,
      transactionType: 'sale',
      price: 198000,
      checkStatus: 'in_contract',
      memo: `${DEMO_TAG} 계약 진행중`,
    },
    {
      propertyIdx: 0, // 매매와 동시 등록된 전세
      transactionType: 'jeonse',
      price: 130000,
      checkStatus: 'verified',
      memo: `${DEMO_TAG} 매매/전세 동시 등록`,
    },
    {
      propertyIdx: 4,
      transactionType: 'jeonse',
      price: 95000,
      checkStatus: 'verified',
      memo: `${DEMO_TAG} 깨끗 · 즉시입주 가능`,
      priceHistory: {
        priceBefore: 100000,
        priceAfter: 95000,
        reason: `${DEMO_TAG} 시세 반영`,
      },
    },
    {
      propertyIdx: 5,
      transactionType: 'monthly',
      deposit: 5000,
      monthlyRent: 180,
      checkStatus: 'verified',
      memo: `${DEMO_TAG} 단기 가능 · 반려동물 허용`,
    },
    {
      propertyIdx: 2,
      transactionType: 'sale',
      price: 315000,
      checkStatus: 'hold',
      memo: `${DEMO_TAG} 보류 · 집주인 여행중`,
    },
  ];

  const created = [];
  for (const def of defs) {
    const listing = await ctx.prisma.listing.create({
      data: {
        officeId: ctx.officeId,
        propertyId: properties[def.propertyIdx].id,
        transactionType: def.transactionType,
        price: def.price ?? null,
        deposit: def.deposit ?? null,
        monthlyRent: def.monthlyRent ?? null,
        checkStatus: def.checkStatus,
        checkStatusChangedAt: daysAgo(Math.floor(Math.random() * 10) + 1),
        memo: def.memo,
      },
    });
    if (def.priceHistory) {
      await ctx.prisma.priceHistory.create({
        data: {
          officeId: ctx.officeId,
          listingId: listing.id,
          changedBy: ctx.managerUserId,
          priceBefore: def.priceHistory.priceBefore,
          priceAfter: def.priceHistory.priceAfter,
          reason: def.priceHistory.reason,
          createdAt: daysAgo(5),
        },
      });
    }
    created.push(listing);
  }
  return created;
}

// ─────────────────────────────────────────────────────────────
// BuyerRequirement — 5 개 (구매고객 4명 + 1명은 중복 조건)
// ─────────────────────────────────────────────────────────────
async function seedBuyerRequirements(
  ctx: Ctx,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
) {
  const buyers = contacts.slice(4, 8);
  const now = new Date();
  const daysFromNow = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  const defs = [
    {
      contact: buyers[0],
      status: 'active',
      urgency: 'urgent',
      transactionType: 'sale',
      priceMin: 240000,
      priceMax: 270000,
      siteTypes: ['apartment'],
      regions: ['강동구', '고덕동'],
      mustConditions: ['남향', '초품아'],
      preferConditions: ['로얄층', '리모델링'],
      assignedToId: ctx.agentUserId,
      nextContactDate: daysFromNow(2),
      memo: `${DEMO_TAG} 급하게 찾는 신혼부부`,
    },
    {
      contact: buyers[1],
      status: 'active',
      urgency: 'normal',
      transactionType: 'sale',
      priceMin: 300000,
      priceMax: 340000,
      siteTypes: ['apartment'],
      regions: ['강동구'],
      mustConditions: ['고층', '한강뷰'],
      preferConditions: ['대단지', '펜트하우스'],
      assignedToId: ctx.managerUserId,
      nextContactDate: daysFromNow(7),
      memo: `${DEMO_TAG} VIP 고객`,
    },
    {
      contact: buyers[2],
      status: 'active',
      urgency: 'flexible',
      transactionType: 'sale',
      priceMin: 180000,
      priceMax: 220000,
      siteTypes: ['apartment'],
      regions: ['강동구', '송파구'],
      mustConditions: [],
      preferConditions: ['수익률'],
      assignedToId: ctx.agentUserId,
      memo: `${DEMO_TAG} 투자용 / 전세 끼고 매매`,
    },
    {
      contact: buyers[3],
      status: 'active',
      urgency: 'normal',
      transactionType: 'sale',
      priceMin: 230000,
      priceMax: 260000,
      siteTypes: ['apartment'],
      regions: ['강동구', '고덕동'],
      mustConditions: ['초등학교', '학원가'],
      preferConditions: ['중층', '남향'],
      assignedToId: ctx.managerUserId,
      nextContactDate: daysFromNow(3),
      memo: `${DEMO_TAG} 학군 중심`,
    },
    {
      contact: buyers[0],
      status: 'matched',
      urgency: 'normal',
      transactionType: 'jeonse',
      priceMin: 90000,
      priceMax: 130000,
      siteTypes: ['apartment'],
      regions: ['강동구'],
      mustConditions: ['즉시입주'],
      preferConditions: [],
      assignedToId: ctx.agentUserId,
      memo: `${DEMO_TAG} 전세 희망 병행`,
    },
  ];

  const created = [];
  for (const def of defs) {
    const br = await ctx.prisma.buyerRequirement.create({
      data: {
        officeId: ctx.officeId,
        contactId: def.contact.id,
        status: def.status,
        urgency: def.urgency,
        transactionType: def.transactionType,
        siteTypes: def.siteTypes,
        regions: def.regions,
        priceMin: def.priceMin,
        priceMax: def.priceMax,
        mustConditions: def.mustConditions,
        preferConditions: def.preferConditions,
        assignedToId: def.assignedToId,
        lastContactDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        nextContactDate: def.nextContactDate,
        memo: def.memo,
      },
    });
    created.push(br);
  }
  return created;
}

// ─────────────────────────────────────────────────────────────
// Match — 6 개 (각 단계 분산)
// ─────────────────────────────────────────────────────────────
async function seedMatches(
  ctx: Ctx,
  listings: Awaited<ReturnType<typeof seedListings>>,
  buyerReqs: Awaited<ReturnType<typeof seedBuyerRequirements>>,
) {
  const stages = [
    'suggested',
    'buyerContacted',
    'viewing',
    'ownerContacted',
    'negotiating',
    'dealCreated',
  ];

  const defs = [
    { listingIdx: 0, buyerIdx: 0, stage: stages[4] }, // 급매 26.8억 × 신혼 → 협상중
    { listingIdx: 1, buyerIdx: 3, stage: stages[2] }, // 24.2억 × 학군 → 임장
    { listingIdx: 2, buyerIdx: 1, stage: stages[1] }, // 31.9억 × VIP → 1차 연락
    { listingIdx: 3, buyerIdx: 2, stage: stages[5] }, // 19.8억 × 투자 → 거래 생성
    { listingIdx: 5, buyerIdx: 0, stage: stages[3] }, // 전세 × 신혼 → 집주인 연락
    { listingIdx: 0, buyerIdx: 3, stage: stages[0] }, // 급매 × 학군 → 제안만
  ];

  const created = [];
  for (const def of defs) {
    const m = await ctx.prisma.match.create({
      data: {
        officeId: ctx.officeId,
        listingId: listings[def.listingIdx].id,
        buyerReqId: buyerReqs[def.buyerIdx].id,
        stage: def.stage,
        memo: `${DEMO_TAG} ${def.stage} 단계`,
      },
    });
    created.push(m);
  }
  return created;
}

// ─────────────────────────────────────────────────────────────
// Deal — 3 개 (selection / contract / completed)
// Contract 는 contract/completed 단계에만 생성
// DealParticipant 는 모든 Deal 에 listing_agent + manager 형태로
// ─────────────────────────────────────────────────────────────
async function seedDeals(
  ctx: Ctx,
  listings: Awaited<ReturnType<typeof seedListings>>,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
) {
  const owners = contacts.slice(0, 4);
  const buyers = contacts.slice(4, 8);
  const now = new Date();
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };
  const daysFromNow = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  // Deal 1: selection 단계 (계약 전 고민 중)
  const deal1 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[0].id,
      stage: 'selection',
      price: 268000,
      buyerContactId: buyers[0].id,
      sellerContactId: owners[0].id,
      commissionSellerRate: new Prisma.Decimal(0.4),
      commissionSellerAmount: 1072,
      commissionBuyerRate: new Prisma.Decimal(0.4),
      commissionBuyerAmount: 1072,
      commissionTotal: 2144,
      vat: 214,
      memo: `${DEMO_TAG} 선정 단계`,
    },
  });
  await ctx.prisma.dealParticipant.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal1.id,
        userId: ctx.agentUserId,
        role: 'listing_agent',
        side: 'seller',
        commissionRate: new Prisma.Decimal(50),
        commissionAmount: 536,
      },
      {
        officeId: ctx.officeId,
        dealId: deal1.id,
        userId: ctx.managerUserId,
        role: 'manager',
        side: 'both',
        commissionRate: new Prisma.Decimal(10),
        commissionAmount: 214,
      },
    ],
  });

  // Deal 2: contract 단계 — Contract 동반 생성
  const deal2 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[3].id,
      stage: 'contract',
      price: 198000,
      buyerContactId: buyers[2].id,
      sellerContactId: owners[3].id,
      commissionSellerRate: new Prisma.Decimal(0.5),
      commissionSellerAmount: 990,
      commissionBuyerRate: new Prisma.Decimal(0.5),
      commissionBuyerAmount: 990,
      commissionTotal: 1980,
      vat: 198,
      memo: `${DEMO_TAG} 계약 진행중`,
    },
  });
  await ctx.prisma.contract.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal2.id,
      transactionType: 'sale',
      buyerContactId: buyers[2].id,
      sellerContactId: owners[3].id,
      totalPrice: 198000,
      status: 'depositPaid',
      contractDate: daysAgo(5),
      contractDeposit: 19800,
      contractDepositDate: daysAgo(5),
      contractDepositPaid: true,
      middlePayment: 79200,
      middlePaymentDate: daysFromNow(30),
      finalPayment: 99000,
      finalPaymentDate: daysFromNow(60),
      moveInDate: daysFromNow(62),
      specialTerms: `${DEMO_TAG} 전세 승계 · 에어컨 4대 포함`,
      attachments: [],
      memo: `${DEMO_TAG} 계약금 완료`,
    },
  });
  await ctx.prisma.dealParticipant.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        userId: ctx.managerUserId,
        role: 'dual_agent',
        side: 'both',
        commissionRate: new Prisma.Decimal(70),
        commissionAmount: 1386,
      },
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        userId: ctx.ownerUserId,
        role: 'manager',
        side: 'both',
        commissionRate: new Prisma.Decimal(10),
        commissionAmount: 198,
      },
    ],
  });

  // Deal 3: completed — Contract registered
  const deal3 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[1].id,
      stage: 'completed',
      price: 242000,
      buyerContactId: buyers[3].id,
      sellerContactId: owners[1].id,
      commissionSellerRate: new Prisma.Decimal(0.4),
      commissionSellerAmount: 968,
      commissionBuyerRate: new Prisma.Decimal(0.4),
      commissionBuyerAmount: 968,
      commissionTotal: 1936,
      vat: 193,
      isJointBrokerage: true,
      partnerBrokerName: '고덕공인중개',
      partnerBrokerPhone: '02-555-1234',
      partnerCommission: 968,
      memo: `${DEMO_TAG} 공동중개 완료`,
    },
  });
  await ctx.prisma.contract.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal3.id,
      transactionType: 'sale',
      buyerContactId: buyers[3].id,
      sellerContactId: owners[1].id,
      totalPrice: 242000,
      status: 'registered',
      contractDate: daysAgo(45),
      contractDeposit: 24200,
      contractDepositDate: daysAgo(45),
      contractDepositPaid: true,
      middlePayment: 96800,
      middlePaymentDate: daysAgo(15),
      middlePaymentPaid: true,
      finalPayment: 121000,
      finalPaymentDate: daysAgo(2),
      finalPaymentPaid: true,
      moveInDate: daysAgo(2),
      specialTerms: `${DEMO_TAG} 잔금일 이사 · 관리비 정산`,
      attachments: [],
      memo: `${DEMO_TAG} 등기 완료`,
    },
  });
  await ctx.prisma.dealParticipant.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        userId: ctx.agentUserId,
        role: 'listing_agent',
        side: 'seller',
        commissionRate: new Prisma.Decimal(50),
        commissionAmount: 484,
        settlementStatus: 'settled',
        settlementDate: daysAgo(1),
      },
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        userId: ctx.managerUserId,
        role: 'manager',
        side: 'both',
        commissionRate: new Prisma.Decimal(10),
        commissionAmount: 96,
        settlementStatus: 'settled',
        settlementDate: daysAgo(1),
      },
    ],
  });

  // ── CommissionPayment 생성 ──────────────────────────────────

  // Deal 1 (selection): 수금 예정만 → pending
  await ctx.prisma.commissionPayment.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal1.id,
        side: 'seller',
        payerContactId: owners[0].id,
        expectedAmount: 1072,
        dueDate: daysFromNow(60),
        status: 'pending',
        note: `${DEMO_TAG}`,
      },
      {
        officeId: ctx.officeId,
        dealId: deal1.id,
        side: 'buyer',
        payerContactId: buyers[0].id,
        expectedAmount: 1072,
        dueDate: daysFromNow(60),
        status: 'pending',
        note: `${DEMO_TAG}`,
      },
    ],
  });

  // Deal 2 (contract): seller 수금 완료, buyer 는 대기
  await ctx.prisma.commissionPayment.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        side: 'seller',
        payerContactId: owners[3].id,
        expectedAmount: 990,
        actualAmount: 990,
        dueDate: daysFromNow(30),
        paidAt: daysAgo(2),
        status: 'collected',
        method: 'transfer',
        taxInvoiceStatus: 'issued',
        taxInvoiceNo: '2026-04-00042',
        taxInvoiceDate: daysAgo(2),
        note: `${DEMO_TAG}`,
      },
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        side: 'buyer',
        payerContactId: buyers[2].id,
        expectedAmount: 990,
        dueDate: daysFromNow(30),
        status: 'pending',
        note: `${DEMO_TAG}`,
      },
    ],
  });

  // Deal 3 (completed): 양측 모두 수금 완료, buyer 는 할인 적용
  await ctx.prisma.commissionPayment.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        side: 'seller',
        payerContactId: owners[1].id,
        expectedAmount: 968,
        actualAmount: 968,
        dueDate: daysAgo(2),
        paidAt: daysAgo(2),
        status: 'collected',
        method: 'transfer',
        taxInvoiceStatus: 'issued',
        taxInvoiceNo: '2026-04-00038',
        taxInvoiceDate: daysAgo(1),
        note: `${DEMO_TAG}`,
      },
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        side: 'buyer',
        payerContactId: buyers[3].id,
        expectedAmount: 968,
        actualAmount: 920,
        dueDate: daysAgo(2),
        paidAt: daysAgo(1),
        status: 'partial',
        method: 'cash',
        taxInvoiceStatus: 'none',
        note: `${DEMO_TAG} 48만원 할인 적용`,
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// OfficeExpenseTemplate — 고정비 5개
// ─────────────────────────────────────────────────────────────
async function seedOfficeExpenses(ctx: Ctx) {
  const defs = [
    { title: '사무실 임대료', category: 'rent', amount: 150, dayOfMonth: 25, taxDeductible: true },
    { title: '네이버 부동산 광고', category: 'ad', amount: 200, dayOfMonth: 1, taxDeductible: true },
    { title: '직방 광고', category: 'ad', amount: 50, dayOfMonth: 1, taxDeductible: true },
    { title: '전화/인터넷', category: 'telecom', amount: 15, dayOfMonth: 20, taxDeductible: true },
    { title: '공인중개사 협회비', category: 'association', amount: 30, frequency: 'yearly' as const, taxDeductible: false },
  ];

  for (const def of defs) {
    await ctx.prisma.officeExpenseTemplate.create({
      data: {
        officeId: ctx.officeId,
        title: def.title,
        category: def.category,
        amount: def.amount,
        frequency: def.frequency ?? 'monthly',
        dayOfMonth: def.dayOfMonth ?? null,
        taxDeductible: def.taxDeductible,
        isActive: true,
        note: `${DEMO_TAG}`,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Consultation — 8 개
// type: phone / visit / online 섞어서, context FK 연결
// ─────────────────────────────────────────────────────────────
async function seedConsultations(
  ctx: Ctx,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  properties: Awaited<ReturnType<typeof seedProperties>>,
  listings: Awaited<ReturnType<typeof seedListings>>,
  matches: Awaited<ReturnType<typeof seedMatches>>,
  buyerReqs: Awaited<ReturnType<typeof seedBuyerRequirements>>,
) {
  const owners = contacts.slice(0, 4);
  const buyers = contacts.slice(4, 8);
  const now = new Date();
  const hoursAgo = (n: number) =>
    new Date(now.getTime() - n * 60 * 60 * 1000);

  const defs = [
    {
      contact: owners[0],
      createdBy: ctx.agentUserId,
      type: 'phone',
      content: `${DEMO_TAG} 집주인 전화 — 급매 가격 조정 수락. 26.8억으로 인하.`,
      propertyId: properties[0].id,
      listingId: listings[0].id,
      createdAt: hoursAgo(6),
    },
    {
      contact: buyers[0],
      createdBy: ctx.agentUserId,
      type: 'visit',
      content: `${DEMO_TAG} 내방 상담 — 고덕그라시움 급매 물건 소개. 남향 강조.`,
      buyerReqId: buyerReqs[0].id,
      createdAt: hoursAgo(5),
    },
    {
      contact: buyers[3],
      createdBy: ctx.managerUserId,
      type: 'phone',
      content: `${DEMO_TAG} 임장 일정 조율 — 토요일 오후 2시 확정.`,
      listingId: listings[1].id,
      matchId: matches[1].id,
      createdAt: hoursAgo(24),
    },
    {
      contact: owners[3],
      createdBy: ctx.managerUserId,
      type: 'online',
      content: `${DEMO_TAG} 카톡 — 계약금 입금 확인. 19.8억 매매.`,
      propertyId: properties[3].id,
      listingId: listings[3].id,
      createdAt: hoursAgo(48),
    },
    {
      contact: buyers[1],
      createdBy: ctx.managerUserId,
      type: 'visit',
      content: `${DEMO_TAG} 내방 — 31.9억 펜트하우스 상담. 한강뷰 강조.`,
      listingId: listings[2].id,
      matchId: matches[2].id,
      createdAt: hoursAgo(72),
    },
    {
      contact: buyers[2],
      createdBy: ctx.agentUserId,
      type: 'phone',
      content: `${DEMO_TAG} 투자 상담 — 전세 끼고 매매 가능한 물건 브리핑.`,
      buyerReqId: buyerReqs[2].id,
      createdAt: hoursAgo(96),
    },
    {
      contact: owners[0],
      createdBy: ctx.agentUserId,
      type: 'phone',
      content: `${DEMO_TAG} 세입자 만기 관련 상담 — 재계약 여부 확인 필요.`,
      propertyId: properties[4].id,
      createdAt: hoursAgo(120),
    },
    {
      contact: buyers[0],
      createdBy: ctx.agentUserId,
      type: 'online',
      content: `${DEMO_TAG} 카톡 — 전세 물건 추가 요청. 즉시입주 필수.`,
      buyerReqId: buyerReqs[4].id,
      createdAt: hoursAgo(144),
    },
  ];

  for (const def of defs) {
    await ctx.prisma.consultation.create({
      data: {
        officeId: ctx.officeId,
        contactId: def.contact.id,
        createdById: def.createdBy,
        type: def.type,
        content: def.content,
        propertyId: def.propertyId ?? null,
        listingId: def.listingId ?? null,
        matchId: def.matchId ?? null,
        buyerReqId: def.buyerReqId ?? null,
        createdAt: def.createdAt,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Task — 10 개 (기존 20개는 건드리지 않음)
// ─────────────────────────────────────────────────────────────
async function seedTasks(
  ctx: Ctx,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  properties: Awaited<ReturnType<typeof seedProperties>>,
  listings: Awaited<ReturnType<typeof seedListings>>,
) {
  const now = new Date();
  const daysFromNow = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  const defs = [
    {
      title: `${DEMO_TAG} 급매 26.8억 등기부 확인`,
      category: 'verify',
      priority: 'urgent',
      dueDate: daysFromNow(1),
      assignedToId: ctx.agentUserId,
      propertyId: properties[0].id,
      listingId: listings[0].id,
    },
    {
      title: `${DEMO_TAG} 한구매 고객 매물 3건 추천 카톡`,
      category: 'buyer',
      priority: 'urgent',
      dueDate: daysFromNow(0),
      assignedToId: ctx.agentUserId,
      contactId: contacts[4].id,
    },
    {
      title: `${DEMO_TAG} 강학군 고객 토요일 임장 준비`,
      category: 'viewing',
      priority: 'high',
      dueDate: daysFromNow(2),
      assignedToId: ctx.managerUserId,
      contactId: contacts[7].id,
      listingId: listings[1].id,
    },
    {
      title: `${DEMO_TAG} 박재물 매물 사진 재촬영`,
      category: 'property',
      priority: 'medium',
      dueDate: daysFromNow(3),
      assignedToId: ctx.agentUserId,
      propertyId: properties[2].id,
    },
    {
      title: `${DEMO_TAG} 정부자 계약 중도금 일정 확인`,
      category: 'contract',
      priority: 'high',
      dueDate: daysFromNow(5),
      assignedToId: ctx.managerUserId,
      contactId: contacts[3].id,
    },
    {
      title: `${DEMO_TAG} 이영희 잔금 정산 완료 확인`,
      category: 'contract',
      priority: 'medium',
      dueDate: daysFromNow(-1),
      status: 'completed',
      assignedToId: ctx.agentUserId,
      contactId: contacts[1].id,
    },
    {
      title: `${DEMO_TAG} 월세 계약 특약 초안 작성`,
      category: 'document',
      priority: 'medium',
      dueDate: daysFromNow(4),
      assignedToId: ctx.agentUserId,
      listingId: listings[6].id,
    },
    {
      title: `${DEMO_TAG} 최살래 고객 VIP 재연락`,
      category: 'call',
      priority: 'high',
      dueDate: daysFromNow(1),
      assignedToId: ctx.managerUserId,
      contactId: contacts[5].id,
    },
    {
      title: `${DEMO_TAG} 윤세입 세입자 퇴거 일정 조율`,
      category: 'consultation',
      priority: 'medium',
      dueDate: daysFromNow(7),
      assignedToId: ctx.agentUserId,
      contactId: contacts[8].id,
      propertyId: properties[4].id,
    },
    {
      title: `${DEMO_TAG} 고덕그라시움 광고 재등록`,
      category: 'advertisement',
      priority: 'low',
      dueDate: daysFromNow(10),
      assignedToId: ctx.agentUserId,
      propertyId: properties[2].id,
      listingId: listings[2].id,
    },
  ];

  for (const def of defs) {
    await ctx.prisma.task.create({
      data: {
        officeId: ctx.officeId,
        title: def.title,
        source: 'manual',
        status: def.status ?? 'pending',
        priority: def.priority,
        category: def.category,
        dueDate: def.dueDate,
        assignedToId: def.assignedToId,
        contactId: (def as any).contactId ?? null,
        propertyId: (def as any).propertyId ?? null,
        listingId: (def as any).listingId ?? null,
      },
    });
  }
}

// ─────────────────────────────────────────────────────────────
// CalendarEvent — 10 개 (viewing / contract / meeting / task / general)
// ─────────────────────────────────────────────────────────────
async function seedCalendarEvents(
  ctx: Ctx,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
  properties: Awaited<ReturnType<typeof seedProperties>>,
  listings: Awaited<ReturnType<typeof seedListings>>,
  matches: Awaited<ReturnType<typeof seedMatches>>,
) {
  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const plus = (d: Date, hours: number) =>
    new Date(d.getTime() + hours * 60 * 60 * 1000);

  const defs: Array<{
    title: string;
    type: string;
    start: Date;
    end?: Date;
    userId: string;
    color?: string;
    contactId?: string;
    propertyId?: string;
    listingId?: string;
    matchId?: string;
    description?: string;
    allDay?: boolean;
  }> = [
    {
      title: `${DEMO_TAG} 고덕그라시움 급매 임장`,
      type: 'viewing',
      start: at(1, 14),
      end: at(1, 15),
      userId: ctx.agentUserId,
      contactId: contacts[4].id,
      propertyId: properties[0].id,
      listingId: listings[0].id,
      matchId: matches[0].id,
      color: '#3b82f6',
      description: '남향 강조, 로얄층',
    },
    {
      title: `${DEMO_TAG} 강학군 고객 토요일 임장`,
      type: 'viewing',
      start: at(2, 14),
      end: at(2, 16),
      userId: ctx.managerUserId,
      contactId: contacts[7].id,
      listingId: listings[1].id,
      matchId: matches[1].id,
      color: '#3b82f6',
    },
    {
      title: `${DEMO_TAG} 19.8억 계약서 작성`,
      type: 'contract',
      start: at(3, 11),
      end: at(3, 13),
      userId: ctx.managerUserId,
      contactId: contacts[6].id,
      propertyId: properties[3].id,
      listingId: listings[3].id,
      color: '#ef4444',
      description: '계약금 영수증 준비',
    },
    {
      title: `${DEMO_TAG} 홍법무 법무 상담`,
      type: 'meeting',
      start: at(4, 10),
      end: at(4, 11),
      userId: ctx.ownerUserId,
      contactId: contacts[10].id,
      color: '#a855f7',
    },
    {
      title: `${DEMO_TAG} 펜트하우스 VIP 브리핑`,
      type: 'meeting',
      start: at(5, 15),
      end: at(5, 16),
      userId: ctx.managerUserId,
      contactId: contacts[5].id,
      listingId: listings[2].id,
      color: '#a855f7',
    },
    {
      title: `${DEMO_TAG} 팀 주간 회의`,
      type: 'meeting',
      start: at(1, 9, 30),
      end: at(1, 10, 30),
      userId: ctx.ownerUserId,
      color: '#64748b',
      description: '목표 점검 및 파이프라인 리뷰',
    },
    {
      title: `${DEMO_TAG} 조세무 세무 상담`,
      type: 'meeting',
      start: at(6, 16),
      end: at(6, 17),
      userId: ctx.ownerUserId,
      contactId: contacts[11].id,
      color: '#a855f7',
    },
    {
      title: `${DEMO_TAG} 중도금 납부일`,
      type: 'task',
      start: at(30, 0),
      userId: ctx.managerUserId,
      listingId: listings[3].id,
      allDay: true,
      color: '#f59e0b',
    },
    {
      title: `${DEMO_TAG} 잔금일`,
      type: 'task',
      start: at(60, 0),
      userId: ctx.managerUserId,
      listingId: listings[3].id,
      allDay: true,
      color: '#f59e0b',
    },
    {
      title: `${DEMO_TAG} 배투자 고객 재상담`,
      type: 'general',
      start: at(7, 13),
      end: at(7, 14),
      userId: ctx.agentUserId,
      contactId: contacts[6].id,
      color: '#10b981',
    },
  ];

  for (const def of defs) {
    await ctx.prisma.calendarEvent.create({
      data: {
        officeId: ctx.officeId,
        userId: def.userId,
        title: def.title,
        description: def.description ?? null,
        type: def.type,
        allDay: def.allDay ?? false,
        start: def.start,
        end: def.end ?? null,
        color: def.color ?? null,
        contactId: def.contactId ?? null,
        propertyId: def.propertyId ?? null,
        listingId: def.listingId ?? null,
        matchId: def.matchId ?? null,
      },
    });
  }
}

main().catch((e) => {
  console.error('❌ seed-demo 실패:', e);
  process.exit(1);
});
