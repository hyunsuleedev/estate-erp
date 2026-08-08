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
 *
 * 실행:
 *   pnpm tsx prisma/seed-demo.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';

const DEMO_TAG = '[DEMO]';
const LEGACY_DEMO_INTAKE_PREFIX = '데모 물건 ';
const REGION_BY_NAME = {
  강동구: { provinceCode: '11', districtCode: '11740' },
  송파구: { provinceCode: '11', districtCode: '11710' },
  고덕동: { provinceCode: '11', districtCode: '11740', wardCode: '1174010200' },
} as const;

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
    // SEED_OFFICE_ID 가 지정되면 해당 사무소를, 아니면 첫 번째 활성 사무소를 대상으로 한다.
    const office = process.env.SEED_OFFICE_ID
      ? await prisma.office.findUnique({
          where: { id: process.env.SEED_OFFICE_ID },
        })
      : await prisma.office.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: 'asc' },
        });
    if (!office) {
      throw new Error(
        process.env.SEED_OFFICE_ID
          ? `SEED_OFFICE_ID=${process.env.SEED_OFFICE_ID} 에 해당하는 Office 가 없습니다.`
          : `활성 Office 가 없습니다. 먼저 사무소 / 사용자를 생성해주세요.`,
      );
    }
    console.log(`대상 사무소: ${office.name}`);

    const users = await prisma.user.findMany({
      where: { officeId: office.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    const owner = users.find((u) => u.role === 'owner') ?? users[0];
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

    console.log('1. 기존 [DEMO] 데이터 정리...');
    await wipe({ prisma, officeId: office.id });

    // 실제 Unit 중 층수 기준 상위 몇 개를 골라 고정 순서로 사용.
    // 동일한 선택을 반복 가능하게 하기 위해 layer 별로 고정 ordering.
    // Property @@unique([officeId, siteId, unitId]) 충돌을 피하기 위해
    // 이 사무소의 기존(비-DEMO) Property 가 없는 Unit 만 고른다.
    // (wipe 이후 조회하므로 직전 실행의 DEMO Property 가 점유했던 Unit 도 회수됨)
    const units = await prisma.unit.findMany({
      where: {
        siteId: site.id,
        floor: { not: null },
        properties: { none: { officeId: office.id } },
      },
      orderBy: [{ floor: 'desc' }, { name: 'asc' }],
      take: 8,
    });
    if (units.length < 8) {
      throw new Error(`빈 Unit 이 8개 필요한데 ${units.length}개 만 있습니다.`);
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

    console.log('2. Contact 14 insert...');
    const contacts = await seedContacts(ctx);

    console.log('3. Property + PropertyContact + Tenant insert...');
    const properties = await seedProperties(ctx, contacts);

    console.log('4. ListingIntake + Listing + PriceHistory insert...');
    const listings = await seedListings(ctx, properties);

    console.log('5. BuyerRequirement insert...');
    const buyerReqs = await seedBuyerRequirements(ctx, contacts);

    console.log('5b. 갈아타기 선행조건 + 고객 원장 시나리오 검증...');
    await seedTradeUpScenario(ctx, contacts[0]);
    await verifyCustomerLedgerScenarios(ctx);

    console.log('6. Match insert...');
    const matches = await seedMatches(ctx, listings, buyerReqs);

    console.log(
      '7. Deal + Contract + DealParticipant + CommissionPayment insert...',
    );
    await seedDeals(ctx, listings, contacts);

    console.log('8. Consultation insert...');
    await seedConsultations(
      ctx,
      contacts,
      properties,
      listings,
      matches,
      buyerReqs,
    );

    console.log('8b. CallRecording insert...');
    await seedCallRecordings(ctx, contacts);

    console.log('9. Task insert...');
    await seedTasks(ctx, contacts, properties, listings);

    console.log('10. CalendarEvent insert...');
    await seedCalendarEvents(ctx, contacts, properties, listings, matches);

    console.log('11. OfficeExpenseTemplate insert...');
    await seedOfficeExpenses(ctx);

    console.log('12. NetworkRoom + 공유매물 + 채팅 + 문의 insert...');
    const network = await seedNetwork(ctx, listings);

    console.log('13. Notification insert...');
    await seedNotifications(ctx, network);

    console.log('\n✅ seed-demo 완료');
  } finally {
    await prisma.$disconnect();
  }
}


// ─────────────────────────────────────────────────────────────
// 정리 — [DEMO] 태그와 DEMO Contact/Property의 참조 관계를 함께 따라가 삭제.
// 과거 migration/backfill이 새로 만든 row에는 태그가 없을 수 있으므로
// 태그만 검사하면 고아 케이스와 Match가 남는다. 참조 관계를 고려해 역순 삭제한다.
// ─────────────────────────────────────────────────────────────
async function wipe({ prisma, officeId }: Pick<Ctx, 'prisma' | 'officeId'>) {
  const demoLike = { contains: DEMO_TAG };

  // Notification (content 에 [DEMO] 태그)
  await prisma.notification.deleteMany({
    where: { officeId, content: demoLike },
  });

  // 공동 중개망 — 우리가 만든 DEMO 방과 그 안의 모든 레코드
  // (NetworkSharedProperty 가 demo Listing 을 FK 로 잡고 있으므로 Listing 보다 먼저)
  const demoRooms = await prisma.networkRoom.findMany({
    where: { createdBy: officeId, description: demoLike },
    select: { id: true },
  });
  const demoRoomIds = demoRooms.map((r) => r.id);
  if (demoRoomIds.length > 0) {
    await prisma.networkMessage.deleteMany({
      where: { roomId: { in: demoRoomIds } },
    });
    const demoShared = await prisma.networkSharedProperty.findMany({
      where: { roomId: { in: demoRoomIds } },
      select: { id: true },
    });
    const demoSharedIds = demoShared.map((s) => s.id);
    if (demoSharedIds.length > 0) {
      await prisma.networkInquiry.deleteMany({
        where: { sharedPropertyId: { in: demoSharedIds } },
      });
      await prisma.networkSharedProperty.deleteMany({
        where: { id: { in: demoSharedIds } },
      });
    }
    await prisma.networkRoomMember.deleteMany({
      where: { roomId: { in: demoRoomIds } },
    });
    await prisma.networkRoom.deleteMany({
      where: { id: { in: demoRoomIds } },
    });
  }

  // CalendarEvent
  await prisma.calendarEvent.deleteMany({
    where: { officeId, title: demoLike },
  });

  // Task (기존 seed-test-office.ts 의 20개는 title 에 DEMO 태그가 없어 안 지워짐)
  await prisma.task.deleteMany({
    where: { officeId, title: demoLike },
  });

  // CallRecording — messages 는 cascade 로 지워지지만, consultation FK 는 먼저 끊어야 함.
  //   (consultation.recordingId → callRecording. consultation 쪽 삭제가 뒤에 오므로 순서 OK)
  const demoRecordings = await prisma.callRecording.findMany({
    where: {
      officeId,
      OR: [{ fileName: demoLike }, { phoneNumber: { startsWith: '010-7777' } }],
    },
    select: { id: true },
  });
  const recordingIds = demoRecordings.map((r) => r.id);
  if (recordingIds.length > 0) {
    // consultation.callRecordingId 가 null 이 아닌 경우 FK 끊기
    await prisma.consultation.updateMany({
      where: { callRecordingId: { in: recordingIds } },
      data: { callRecordingId: null },
    });
    await prisma.callRecordingMessage.deleteMany({
      where: { recordingId: { in: recordingIds } },
    });
    await prisma.callRecording.deleteMany({
      where: { id: { in: recordingIds } },
    });
  }

  // Consultation (demo 태그 있는 것)
  await prisma.consultation.deleteMany({
    where: { officeId, content: demoLike },
  });

  // Consultation 이 참조하는 demo Contact 이 있으면 먼저 FK 를 끊어준다.
  // (seed-test-office 가 만든 consultation 이 demo Contact 을 참조할 수 있음)
  const demoContactIds = (
    await prisma.contact.findMany({
      where: { officeId, memo: demoLike },
      select: { id: true },
    })
  ).map((c) => c.id);
  if (demoContactIds.length > 0) {
    await prisma.consultation.deleteMany({
      where: { contactId: { in: demoContactIds } },
    });
  }

  // 과거 migration/backfill row는 memo가 없을 수 있어 DEMO Contact가 가진
  // BuyerRequirement/Property까지 따라가 정리 대상을 먼저 확정한다.
  const demoBuyerRequirements = await prisma.buyerRequirement.findMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        ...(demoContactIds.length > 0
          ? [
              {
                buyerIntake: {
                  contacts: {
                    some: { contactId: { in: demoContactIds } },
                  },
                },
              },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  const demoBuyerRequirementIds = demoBuyerRequirements.map((item) => item.id);

  const demoPropertyContacts = await prisma.propertyContact.findMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        ...(demoContactIds.length > 0
          ? [{ contactId: { in: demoContactIds } }]
          : []),
      ],
    },
    select: { propertyId: true },
  });
  const propIds = Array.from(
    new Set(demoPropertyContacts.map((item) => item.propertyId)),
  );
  const demoIntakes = await prisma.listingIntake.findMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        { memo: { startsWith: LEGACY_DEMO_INTAKE_PREFIX } },
        ...(propIds.length > 0 ? [{ propertyId: { in: propIds } }] : []),
      ],
    },
    select: { id: true, propertyId: true },
  });
  for (const intake of demoIntakes) propIds.push(intake.propertyId);
  const uniquePropIds = Array.from(new Set(propIds));
  const intakeIds = demoIntakes.map((item) => item.id);
  const demoListings = await prisma.listing.findMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        ...(intakeIds.length > 0 ? [{ intakeId: { in: intakeIds } }] : []),
        ...(uniquePropIds.length > 0
          ? [{ propertyId: { in: uniquePropIds } }]
          : []),
      ],
    },
    select: { id: true },
  });
  const demoListingIds = demoListings.map((item) => item.id);

  // 태그가 없는 연관 상담/업무/일정도 FK 대상 삭제 전에 정리한다.
  const linkedContext = {
    OR: [
      ...(demoContactIds.length > 0
        ? [{ contactId: { in: demoContactIds } }]
        : []),
      ...(demoBuyerRequirementIds.length > 0
        ? [{ buyerReqId: { in: demoBuyerRequirementIds } }]
        : []),
      ...(uniquePropIds.length > 0
        ? [{ propertyId: { in: uniquePropIds } }]
        : []),
      ...(intakeIds.length > 0 ? [{ listingIntakeId: { in: intakeIds } }] : []),
      ...(demoListingIds.length > 0
        ? [{ listingId: { in: demoListingIds } }]
        : []),
    ],
  };
  if (linkedContext.OR.length > 0) {
    await prisma.consultation.deleteMany({
      where: { officeId, ...linkedContext },
    });
    await prisma.task.deleteMany({ where: { officeId, ...linkedContext } });
    await prisma.calendarEvent.deleteMany({
      where: {
        officeId,
        OR: linkedContext.OR.filter(
          (condition) => !('buyerReqId' in condition),
        ),
      },
    });
  }

  // 다른 중개방에 공유된 DEMO Listing도 공유 카드 참조부터 제거한다.
  if (demoListingIds.length > 0) {
    const linkedShared = await prisma.networkSharedProperty.findMany({
      where: { listingId: { in: demoListingIds } },
      select: { id: true },
    });
    const linkedSharedIds = linkedShared.map((item) => item.id);
    if (linkedSharedIds.length > 0) {
      await prisma.networkMessage.deleteMany({
        where: { sharedPropertyId: { in: linkedSharedIds } },
      });
      await prisma.networkInquiry.deleteMany({
        where: { sharedPropertyId: { in: linkedSharedIds } },
      });
      await prisma.networkSharedProperty.deleteMany({
        where: { id: { in: linkedSharedIds } },
      });
    }
  }

  // Match (memo + 연결된 DEMO BuyerRequirement/Listing 기준)
  await prisma.match.deleteMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        ...(demoBuyerRequirementIds.length > 0
          ? [{ buyerReqId: { in: demoBuyerRequirementIds } }]
          : []),
        ...(demoListingIds.length > 0
          ? [{ listingId: { in: demoListingIds } }]
          : []),
      ],
    },
  });

  // OfficeExpenseTemplate (note 기준)
  await prisma.officeExpenseTemplate.deleteMany({
    where: { officeId, note: demoLike },
  });

  // CommissionAdjustment → CommissionDistribution → CommissionPayment → Contract → DealPayment → DealParticipant → Deal
  const demoDeals = await prisma.deal.findMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        ...(demoListingIds.length > 0
          ? [{ listingId: { in: demoListingIds } }]
          : []),
        ...(demoContactIds.length > 0
          ? [
              { buyerContactId: { in: demoContactIds } },
              { sellerContactId: { in: demoContactIds } },
            ]
          : []),
      ],
    },
    select: { id: true },
  });
  const dealIds = demoDeals.map((d) => d.id);
  if (dealIds.length > 0) {
    const demoPayments = await prisma.commissionPayment.findMany({
      where: { dealId: { in: dealIds } },
      select: { id: true },
    });
    const paymentIds = demoPayments.map((p) => p.id);
    if (paymentIds.length > 0) {
      await prisma.commissionAdjustment.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
      await prisma.commissionDistribution.deleteMany({
        where: { paymentId: { in: paymentIds } },
      });
    }
    await prisma.commissionPayment.deleteMany({
      where: { dealId: { in: dealIds } },
    });
    await prisma.dealPayment.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.contract.deleteMany({ where: { dealId: { in: dealIds } } });
    await prisma.dealParticipant.deleteMany({
      where: { dealId: { in: dealIds } },
    });
    await prisma.deal.deleteMany({ where: { id: { in: dealIds } } });
  }

  // PartnerBroker (memo 기준)
  await prisma.partnerBroker.deleteMany({
    where: { officeId, memo: demoLike },
  });

  // BuyerRequirement
  if (demoContactIds.length > 0) {
    // 마이그레이션으로 기존 DEMO intake에 백필된 케이스 연결부터 해제한다.
    await prisma.brokerageCaseDependency.deleteMany({
      where: {
        officeId,
        brokerageCase: {
          participants: { some: { contactId: { in: demoContactIds } } },
        },
      },
    });
  }
  await prisma.buyerRequirement.deleteMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        ...(demoBuyerRequirementIds.length > 0
          ? [{ id: { in: demoBuyerRequirementIds } }]
          : []),
      ],
    },
  });
  if (demoContactIds.length > 0) {
    await prisma.buyerIntake.deleteMany({
      where: {
        officeId,
        contacts: { some: { contactId: { in: demoContactIds } } },
      },
    });
  }

  // PriceHistory (reason 기준)
  await prisma.priceHistory.deleteMany({
    where: { officeId, reason: demoLike },
  });

  // Listing → ListingIntake → Property 순서로 삭제 (FK 체인)
  // 1) memo 태그 또는 DEMO Contact의 intake/property에 매달린 Listing 전부
  if (demoListingIds.length > 0) {
    await prisma.priceHistory.deleteMany({
      where: { listingId: { in: demoListingIds } },
    });
    await prisma.listing.deleteMany({
      where: { id: { in: demoListingIds } },
    });
  }

  // 2) ListingIntake (memo 태그 + 데모 Property 소속)
  await prisma.listingIntake.deleteMany({
    where: {
      officeId,
      OR: [{ id: { in: intakeIds } }, { propertyId: { in: uniquePropIds } }],
    },
  });

  // Buyer/ListingIntake가 모두 제거된 뒤 DEMO 고객 원장 업무철을 정리한다.
  if (demoContactIds.length > 0) {
    await prisma.brokerageCaseParticipant.deleteMany({
      where: { officeId, contactId: { in: demoContactIds } },
    });
  }
  await prisma.brokerageCase.deleteMany({
    where: {
      officeId,
      OR: [
        { memo: demoLike },
        {
          participants: { none: {} },
          buyerIntakes: { none: {} },
          listingIntakes: { none: {} },
        },
      ],
    },
  });

  // 3) Tenant, PropertyContact → Property
  if (uniquePropIds.length > 0) {
    await prisma.tenant.deleteMany({
      where: { propertyId: { in: uniquePropIds } },
    });
    await prisma.propertyContact.deleteMany({
      where: { propertyId: { in: uniquePropIds } },
    });
    await prisma.property.deleteMany({
      where: { id: { in: uniquePropIds } },
    });
  }

  // Contact (맨 마지막: Deal/Contract/Tenant/Consultation 다 지워진 뒤)
  await prisma.contact.deleteMany({
    where: { officeId, memo: demoLike },
  });
}

// ─────────────────────────────────────────────────────────────
// Contact — 14명
// 0-3, 12-13: 소유주, 4-7: 구매고객, 8-9: 세입자,
// 10-11: 전문가(법무사/세무사)
// ─────────────────────────────────────────────────────────────
async function seedContacts(ctx: Ctx) {
  const defs = [
    {
      name: '김민준',
      phone: '01020010001',
      tags: ['매도고객', '매수고객', '갈아타기'],
    },
    { name: '이서현', phone: '01020010002', tags: ['매도고객'] },
    { name: '박성호', phone: '01020010003', tags: ['매도고객'] },
    { name: '정유진', phone: '01020010004', tags: ['매도고객'] },
    { name: '한지우', phone: '01030010001', tags: ['매수고객', '신혼'] },
    { name: '최도윤', phone: '01030010002', tags: ['매수고객', 'VIP'] },
    { name: '배현우', phone: '01030010003', tags: ['매수고객', '투자'] },
    { name: '강수연', phone: '01030010004', tags: ['매수고객', '학군'] },
    { name: '윤미경', phone: '01040010001', tags: ['세입자'] },
    { name: '임재호', phone: '01040010002', tags: ['세입자'] },
    { name: '홍승민', phone: '01050010001', tags: ['법무사'] },
    { name: '조은경', phone: '01050010002', tags: ['세무사'] },
    { name: '오은정', phone: '01020010005', tags: ['매도고객'] },
    { name: '문지훈', phone: '01020010006', tags: ['매도고객'] },
  ];

  const created = [];
  for (const def of defs) {
    const normalized = def.phone.replace(/[\s\-()]/g, '');
    const c = await ctx.prisma.contact.create({
      data: {
        officeId: ctx.officeId,
        name: def.name,
        email: `${normalized}@demo.test`,
        tags: def.tags,
        memo: `${DEMO_TAG} ${def.name} 더미`,
        phones: {
          create: {
            officeId: ctx.officeId,
            phone: normalized,
            label: 'mobile',
            isPrimary: true,
          },
        },
      },
    });
    // CallRecording 등에서 사용할 수 있게 대표번호를 함께 들고 다닌다.
    created.push({ ...c, phone: normalized });
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
  // 원장에 한 고객의 서로 무관한 아파트가 여러 채 묶이지 않도록
  // 데모 Property마다 서로 다른 소유자를 배정한다.
  const owners = [
    contacts[0],
    contacts[1],
    contacts[2],
    contacts[3],
    contacts[12],
    contacts[13],
  ];
  const tenants = contacts.slice(8, 10);
  // 6개 Property 에 owner 를 1:1로 배치.
  // memo 는 PropertyContact 에만 남기고, cleanup 도 PropertyContact.memo 태그로 한다.
  const propertyDefs = owners.map((_, i) => ({
    unitIdx: i,
    ownerIdx: i,
    label: `Property #${i + 1}`,
  }));

  const created = [];
  for (const def of propertyDefs) {
    const property = await ctx.prisma.property.create({
      data: {
        officeId: ctx.officeId,
        siteId: ctx.siteId,
        unitId: ctx.unitIds[def.unitIdx],
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
        memo: `${DEMO_TAG} owner link · ${def.label}`,
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
// ListingIntake + Listing — 의뢰(intake) 7 건 / 매물 8 개
// (매매 5 / 전세 2 / 월세 1)
// 같은 intake 에 transactionType 중복 불가 (@@unique [intakeId, transactionType])
// → 같은 Property 의 매매 2건(P2/P2B)은 별도 의뢰로 분리.
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
  const daysFromNow = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + n);
    return d;
  };

  // ── ListingIntake (Property 단위 의뢰 접수) ─────────────────
  const intakeDefs: Array<{
    key: string;
    propertyIdx: number;
    lifecycleStatus: 'open' | 'hold' | 'closed';
    closedReason?: 'superseded' | 'other';
    receivedDaysAgo: number;
    verifiedDaysAgo?: number;
    occupancyStatus?: string;
    viewingMemo?: string;
    rightsMemo?: string;
    fieldMemo?: string;
    nextConfirmInDays?: number;
    memo: string;
  }> = [
    {
      key: 'P0',
      propertyIdx: 0,
      lifecycleStatus: 'open',
      receivedDaysAgo: 14,
      verifiedDaysAgo: 12,
      occupancyStatus: 'owner_occupied',
      viewingMemo: '집주인 거주중 — 방문 전날 전화 필수, 평일 18시 이후 가능',
      rightsMemo: '근저당 5억 (KB국민) — 잔금 시 말소 조건',
      fieldMemo: '올수리 상태 양호, 남향 한강 조망 일부',
      nextConfirmInDays: 7,
      memo: `${DEMO_TAG} 매매+전세 동시 의뢰`,
    },
    {
      key: 'P1',
      propertyIdx: 1,
      lifecycleStatus: 'open',
      receivedDaysAgo: 20,
      verifiedDaysAgo: 18,
      occupancyStatus: 'vacant',
      viewingMemo: '공실 — 도어락 비번 공유받음, 자유 방문 가능',
      fieldMemo: '올수리 완료, 즉시입주 가능',
      nextConfirmInDays: 14,
      memo: `${DEMO_TAG} 매매 의뢰 (공실)`,
    },
    {
      key: 'P2',
      propertyIdx: 2,
      lifecycleStatus: 'open',
      receivedDaysAgo: 3,
      occupancyStatus: 'tenant',
      viewingMemo: '세입자 거주 — 방문 조율 까다로움, 주말만 가능',
      nextConfirmInDays: 3,
      memo: `${DEMO_TAG} 펜트하우스 매매 의뢰 (미확인)`,
    },
    {
      // DB 부분 unique 인덱스: 같은 Property 에 non-closed(open/hold)
      // intake 는 1개만 허용 → 이전 의뢰는 closed 로 종료 처리.
      key: 'P2B',
      propertyIdx: 2,
      lifecycleStatus: 'closed',
      closedReason: 'superseded',
      receivedDaysAgo: 40,
      verifiedDaysAgo: 38,
      occupancyStatus: 'tenant',
      fieldMemo: '집주인 해외여행 — 6월 말 귀국 후 재개 예정',
      memo: `${DEMO_TAG} 종료된 이전 매매 의뢰 (재의뢰로 대체)`,
    },
    {
      key: 'P3',
      propertyIdx: 3,
      lifecycleStatus: 'open',
      receivedDaysAgo: 30,
      verifiedDaysAgo: 28,
      occupancyStatus: 'vacant',
      rightsMemo: '전세보증금 9.5억 승계 조건',
      memo: `${DEMO_TAG} 계약 진행중 의뢰`,
    },
    {
      key: 'P4',
      propertyIdx: 4,
      lifecycleStatus: 'open',
      receivedDaysAgo: 10,
      verifiedDaysAgo: 9,
      occupancyStatus: 'tenant',
      viewingMemo: '세입자 만기 2개월 전 — 퇴거 협의 완료',
      nextConfirmInDays: 7,
      memo: `${DEMO_TAG} 전세 재임대 의뢰`,
    },
    {
      key: 'P5',
      propertyIdx: 5,
      lifecycleStatus: 'open',
      receivedDaysAgo: 8,
      verifiedDaysAgo: 7,
      occupancyStatus: 'tenant',
      viewingMemo: '월세 세입자 거주중 — 1주일 전 통보 필요',
      fieldMemo: '반려동물 가능, 단기 임대 협의 가능',
      nextConfirmInDays: 10,
      memo: `${DEMO_TAG} 월세 의뢰`,
    },
  ];

  const intakes = new Map<string, { id: string }>();
  for (const def of intakeDefs) {
    const owner = await ctx.prisma.propertyContact.findFirstOrThrow({
      where: {
        officeId: ctx.officeId,
        propertyId: properties[def.propertyIdx].id,
        status: 'active',
        role: { in: ['owner', 'co_owner'] },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: { contactId: true },
    });
    const resolvedCase = await seedBrokerageCase(
      ctx,
      owner.contactId,
      'seller',
      'listing',
    );
    const intake = await ctx.prisma.listingIntake.create({
      data: {
        officeId: ctx.officeId,
        ...resolvedCase,
        propertyId: properties[def.propertyIdx].id,
        lifecycleStatus: def.lifecycleStatus,
        lifecycleChangedAt: daysAgo(def.receivedDaysAgo),
        lifecycleChangedBy: 'user',
        closedReason: def.closedReason ?? null,
        receivedAt: daysAgo(def.receivedDaysAgo),
        lastCheckedAt:
          def.verifiedDaysAgo != null ? daysAgo(def.verifiedDaysAgo) : null,
        lastVerifiedAt:
          def.verifiedDaysAgo != null ? daysAgo(def.verifiedDaysAgo) : null,
        lastCheckResult: def.verifiedDaysAgo != null ? 'alive' : null,
        occupancyStatus: def.occupancyStatus ?? null,
        viewingMemo: def.viewingMemo ?? null,
        rightsMemo: def.rightsMemo ?? null,
        fieldMemo: def.fieldMemo ?? null,
        nextConfirmAt:
          def.nextConfirmInDays != null
            ? daysFromNow(def.nextConfirmInDays)
            : null,
        memo: def.memo,
      },
    });
    intakes.set(def.key, intake);
  }

  // ── Listing ────────────────────────────────────────────────
  const defs: Array<{
    propertyIdx: number;
    intakeKey: string;
    transactionType: 'sale' | 'jeonse' | 'monthly';
    price?: number;
    deposit?: number;
    monthlyRent?: number;
    maintenanceFee?: number;
    maintenanceFeeIncludes?: string[];
    loanAmount?: number;
    privateMemo?: string;
    moveInAvailableType?: string;
    isPaused?: boolean;
    memo: string;
    priceHistory?: { priceBefore: number; priceAfter: number; reason: string };
  }> = [
    {
      propertyIdx: 0,
      intakeKey: 'P0',
      transactionType: 'sale',
      price: 268000, // 26.8억
      maintenanceFee: 25,
      maintenanceFeeIncludes: ['cleaning', 'parking'],
      loanAmount: 50000, // 융자 5억 (잔금 시 말소)
      privateMemo: `${DEMO_TAG} 내부메모 — 집주인 깐깐함, 가격 얘기 먼저 꺼내지 말 것`,
      moveInAvailableType: 'immediate',
      memo: `${DEMO_TAG} 급매 · 로얄층 남향 · 즉시입주`,
      priceHistory: {
        priceBefore: 275000,
        priceAfter: 268000,
        reason: `${DEMO_TAG} 집주인 요청 가격 조정`,
      },
    },
    {
      propertyIdx: 1,
      intakeKey: 'P1',
      transactionType: 'sale',
      price: 242000,
      maintenanceFee: 22,
      maintenanceFeeIncludes: ['cleaning'],
      moveInAvailableType: 'immediate',
      memo: `${DEMO_TAG} 깔끔 · 올수리 · 남동향`,
    },
    {
      propertyIdx: 2,
      intakeKey: 'P2',
      transactionType: 'sale',
      price: 319000,
      privateMemo: `${DEMO_TAG} 내부메모 — 호가 높음, 1억까지 조정 여지 있음`,
      memo: `${DEMO_TAG} 고층 · 한강뷰 · 펜트하우스`,
    },
    {
      propertyIdx: 3,
      intakeKey: 'P3',
      transactionType: 'sale',
      price: 198000,
      loanAmount: 0,
      memo: `${DEMO_TAG} 계약 진행중`,
    },
    {
      propertyIdx: 0, // 매매와 동시 등록된 전세 (같은 의뢰 P0)
      intakeKey: 'P0',
      transactionType: 'jeonse',
      price: 130000,
      maintenanceFee: 25,
      maintenanceFeeIncludes: ['water', 'internet'],
      memo: `${DEMO_TAG} 매매/전세 동시 등록`,
    },
    {
      propertyIdx: 4,
      intakeKey: 'P4',
      transactionType: 'jeonse',
      price: 95000,
      maintenanceFee: 18,
      maintenanceFeeIncludes: ['water'],
      moveInAvailableType: 'immediate',
      memo: `${DEMO_TAG} 깨끗 · 즉시입주 가능`,
      priceHistory: {
        priceBefore: 100000,
        priceAfter: 95000,
        reason: `${DEMO_TAG} 시세 반영`,
      },
    },
    {
      propertyIdx: 5,
      intakeKey: 'P5',
      transactionType: 'monthly',
      deposit: 5000,
      monthlyRent: 180,
      maintenanceFee: 12,
      maintenanceFeeIncludes: ['water', 'internet', 'tv'],
      memo: `${DEMO_TAG} 단기 가능 · 반려동물 허용`,
    },
    {
      propertyIdx: 2,
      intakeKey: 'P2B',
      transactionType: 'sale',
      price: 315000,
      isPaused: true,
      memo: `${DEMO_TAG} 보류 · 집주인 여행중`,
    },
  ];

  const created = [];
  for (const def of defs) {
    const intake = intakes.get(def.intakeKey);
    if (!intake) throw new Error(`Unknown intake key: ${def.intakeKey}`);
    const listing = await ctx.prisma.listing.create({
      data: {
        officeId: ctx.officeId,
        propertyId: properties[def.propertyIdx].id,
        intakeId: intake.id,
        transactionType: def.transactionType,
        price: def.price ?? null,
        deposit: def.deposit ?? null,
        monthlyRent: def.monthlyRent ?? null,
        maintenanceFee: def.maintenanceFee ?? null,
        maintenanceFeeIncludes: def.maintenanceFeeIncludes ?? [],
        loanAmount: def.loanAmount ?? null,
        privateMemo: def.privateMemo ?? null,
        moveInAvailableType: def.moveInAvailableType ?? null,
        isPaused: def.isPaused ?? false,
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
// BuyerRequirement — 5개
// 순수 매수 4명은 각 1개 조건만, 기존 소유주 1명은 매도 후 갈아타기 조건 1개.
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

  const defs: Array<{
    contact: (typeof contacts)[number];
    status: 'active' | 'hold';
    urgency: 'urgent' | 'normal' | 'flexible';
    transactionType: 'sale' | 'jeonse' | 'monthly';
    priceMin: number | null;
    priceMax: number | null;
    depositMin?: number | null;
    depositMax?: number | null;
    monthlyRentMin?: number | null;
    monthlyRentMax?: number | null;
    areaMin: number | null;
    areaMax: number | null;
    siteTypes: string[];
    regions: string[];
    assignedToId: string;
    nextContactDate?: Date;
    memo: string;
  }> = [
    {
      contact: buyers[0],
      status: 'active',
      urgency: 'urgent',
      transactionType: 'sale',
      priceMin: 240000,
      priceMax: 270000,
      areaMin: 99.17,
      areaMax: 112.4,
      siteTypes: ['apartment'],
      regions: ['강동구', '고덕동'],
      assignedToId: ctx.agentUserId,
      nextContactDate: daysFromNow(2),
      memo: `${DEMO_TAG} 급하게 찾는 신혼부부\n남향·초품아 필수, 로얄층·리모델링 선호`,
    },
    {
      contact: buyers[1],
      status: 'active',
      urgency: 'normal',
      transactionType: 'sale',
      priceMin: 300000,
      priceMax: 340000,
      areaMin: 132.23,
      areaMax: 165.29,
      siteTypes: ['apartment'],
      regions: ['강동구'],
      assignedToId: ctx.managerUserId,
      nextContactDate: daysFromNow(7),
      memo: `${DEMO_TAG} VIP 고객\n고층·한강뷰 필수, 대단지·펜트하우스 선호`,
    },
    {
      contact: buyers[2],
      status: 'active',
      urgency: 'flexible',
      transactionType: 'sale',
      priceMin: 180000,
      priceMax: 220000,
      areaMin: 82.65,
      areaMax: 112.4,
      siteTypes: ['apartment'],
      regions: ['강동구', '송파구'],
      assignedToId: ctx.agentUserId,
      memo: `${DEMO_TAG} 투자용 / 전세 끼고 매매\n수익률 우선`,
    },
    {
      contact: buyers[3],
      status: 'active',
      urgency: 'normal',
      transactionType: 'sale',
      priceMin: 230000,
      priceMax: 260000,
      areaMin: 82.65,
      areaMax: 112.4,
      siteTypes: ['apartment'],
      regions: ['강동구', '고덕동'],
      assignedToId: ctx.managerUserId,
      nextContactDate: daysFromNow(3),
      memo: `${DEMO_TAG} 학군 중심\n초등학교·학원가 필수, 중층·남향 선호`,
    },
    {
      // 현재 집 한 채를 매도하고 더 넓은 집 한 채를 사는 갈아타기 고객.
      contact: contacts[0],
      status: 'active',
      urgency: 'urgent',
      transactionType: 'sale',
      priceMin: 280000,
      priceMax: 330000,
      areaMin: 112.4,
      areaMax: 132.23,
      siteTypes: ['apartment'],
      regions: ['강동구', '송파구'],
      assignedToId: ctx.managerUserId,
      nextContactDate: daysFromNow(5),
      memo: `${DEMO_TAG} 실거주 주택 1채 매도 후 40평대로 갈아타기\n매도 잔금과 매수 잔금 일정 연동 필수`,
    },
  ];

  const intakeByContactId = new Map<
    string,
    Awaited<ReturnType<typeof ctx.prisma.buyerIntake.create>>
  >();
  const nextPriorityByIntakeId = new Map<string, number>();
  const created = [];
  for (const def of defs) {
    let intake = intakeByContactId.get(def.contact.id);
    if (!intake) {
      const resolvedCase = await seedBrokerageCase(
        ctx,
        def.contact.id,
        'buyer',
        'buyer',
      );
      intake = await ctx.prisma.buyerIntake.create({
        data: {
          officeId: ctx.officeId,
          ...resolvedCase,
          lifecycleStatus: 'open',
          receivedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          memo: `${DEMO_TAG} ${def.contact.name} 구매 의뢰`,
          contacts: {
            create: {
              role: 'buyer',
              isPrimary: true,
              office: { connect: { id: ctx.officeId } },
              contact: {
                connect: {
                  officeId_id: {
                    officeId: ctx.officeId,
                    id: def.contact.id,
                  },
                },
              },
            },
          },
        },
      });
      intakeByContactId.set(def.contact.id, intake);
      nextPriorityByIntakeId.set(intake.id, 1);
    }
    const priorityRank = nextPriorityByIntakeId.get(intake.id) ?? 1;
    const preferredRegions = toPreferredRegions(def.regions);
    const br = await ctx.prisma.buyerRequirement.create({
      data: {
        officeId: ctx.officeId,
        buyerIntakeId: intake.id,
        priorityRank,
        status: def.status,
        urgency: def.urgency,
        transactionType: def.transactionType,
        siteTypes: def.siteTypes,
        priceMin: def.priceMin,
        priceMax: def.priceMax,
        depositMin: def.depositMin,
        depositMax: def.depositMax,
        monthlyRentMin: def.monthlyRentMin,
        monthlyRentMax: def.monthlyRentMax,
        areaMin: def.areaMin,
        areaMax: def.areaMax,
        assignedToId: def.assignedToId,
        lastContactDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        nextContactDate: def.nextContactDate,
        memo: def.memo,
        preferredRegions: { create: preferredRegions },
      },
    });
    nextPriorityByIntakeId.set(intake.id, priorityRank + 1);
    created.push(br);
  }
  return created;
}

// 기존 집 매도대금이 새 집 매수의 선행조건인 현실적인 갈아타기 케이스.
// 같은 ListingIntake 안의 매매/전세 Listing은 처분 방식의 대안으로 유지한다.
async function seedTradeUpScenario(
  ctx: Ctx,
  contact: Awaited<ReturnType<typeof seedContacts>>[number],
) {
  const brokerageCase = await ctx.prisma.brokerageCase.findFirstOrThrow({
    where: {
      officeId: ctx.officeId,
      archivedAt: null,
      memo: { contains: DEMO_TAG },
      participants: { some: { contactId: contact.id, isPrincipal: true } },
    },
    select: {
      id: true,
      listingIntakes: {
        where: { lifecycleStatus: { in: ['open', 'hold'] } },
        select: { id: true },
      },
      buyerIntakes: {
        where: { lifecycleStatus: { in: ['open', 'hold'] } },
        select: { id: true },
      },
    },
  });

  if (
    brokerageCase.listingIntakes.length !== 1 ||
    brokerageCase.buyerIntakes.length !== 1
  ) {
    throw new Error(
      `${contact.name} 갈아타기 케이스는 활성 매도 주택과 매수 의뢰가 각각 1개여야 합니다.`,
    );
  }

  const fromListingIntakeId = brokerageCase.listingIntakes[0].id;
  const toBuyerIntakeId = brokerageCase.buyerIntakes[0].id;
  const requiredBy = new Date();
  requiredBy.setDate(requiredBy.getDate() + 75);

  await ctx.prisma.brokerageCase.update({
    where: { id: brokerageCase.id },
    data: {
      title: `${contact.name} 실거주 갈아타기`,
      memo: `${DEMO_TAG} 기존 주택 1채 처분과 상급 평형 1채 매수를 연결한 갈아타기 업무철`,
    },
  });
  await ctx.prisma.brokerageCaseDependency.create({
    data: {
      officeId: ctx.officeId,
      brokerageCaseId: brokerageCase.id,
      fromListingIntakeId,
      toBuyerIntakeId,
      type: 'sale_proceeds',
      isRequired: true,
      expectedAmount: 218000, // 26.8억 매도가 - 말소할 대출 5억
      requiredBy,
      status: 'planned',
      memo: `${DEMO_TAG} 매도 잔금 수령 후 같은 주에 매수 잔금 지급`,
    },
  });
}

// 데모 데이터가 다시 비현실적인 다주택 동시 진행 형태로 퇴행하지 않게
// seed 실행 자체에서 고객 원장 시나리오를 검증한다.
async function verifyCustomerLedgerScenarios(ctx: Ctx) {
  const cases = await ctx.prisma.brokerageCase.findMany({
    where: {
      officeId: ctx.officeId,
      archivedAt: null,
      memo: { contains: DEMO_TAG },
    },
    select: {
      participants: {
        where: { isPrincipal: true },
        select: { contact: { select: { name: true } } },
      },
      buyerIntakes: {
        where: { lifecycleStatus: { in: ['open', 'hold'] } },
        select: {
          requirements: {
            where: { status: { in: ['active', 'hold'] } },
            select: { id: true },
          },
        },
      },
      listingIntakes: {
        where: { lifecycleStatus: { in: ['open', 'hold'] } },
        select: {
          propertyId: true,
          listings: {
            where: { isPaused: false },
            select: { id: true },
          },
        },
      },
      dependencies: {
        where: { status: { not: 'cancelled' } },
        select: { id: true },
      },
    },
  });

  const violations = cases.flatMap((item) => {
    const customer = item.participants[0]?.contact.name ?? '이름 없는 고객';
    const demandCount = item.buyerIntakes.reduce(
      (sum, intake) => sum + intake.requirements.length,
      0,
    );
    const propertyCount = new Set(
      item.listingIntakes.map((intake) => intake.propertyId),
    ).size;
    return demandCount > 1 || propertyCount > 1
      ? [`${customer}(매수 ${demandCount}, 매도주택 ${propertyCount})`]
      : [];
  });
  if (violations.length > 0) {
    throw new Error(
      `비현실적인 고객 원장 데모 케이스: ${violations.join(', ')}`,
    );
  }

  const hasTradeUpCase = cases.some(
    (item) =>
      item.buyerIntakes.length === 1 &&
      item.listingIntakes.length === 1 &&
      item.dependencies.length > 0,
  );
  const hasAlternativeListings = cases.some((item) =>
    item.listingIntakes.some((intake) => intake.listings.length > 1),
  );
  if (!hasTradeUpCase || !hasAlternativeListings) {
    throw new Error(
      '고객 원장 데모에는 갈아타기 1건과 동일 intake의 복수 listing이 필요합니다.',
    );
  }

  console.log(
    `   고객 원장 ${cases.length}건 검증 완료 (갈아타기 1건, 고객당 활성 주택/매수요건 최대 1건)`,
  );
}

async function seedBrokerageCase(
  ctx: Ctx,
  contactId: string,
  role: 'buyer' | 'seller',
  intakeKind: 'buyer' | 'listing',
) {
  let brokerageCase = await ctx.prisma.brokerageCase.findFirst({
    where: {
      officeId: ctx.officeId,
      archivedAt: null,
      memo: { contains: DEMO_TAG },
      participants: { some: { contactId, isPrincipal: true } },
    },
    include: { participants: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!brokerageCase) {
    brokerageCase = await ctx.prisma.brokerageCase.create({
      data: {
        officeId: ctx.officeId,
        memo: `${DEMO_TAG} 고객 원장 업무철`,
        participants: {
          create: {
            roles: [role],
            isPrincipal: true,
            isCommunicationPrimary: true,
            office: { connect: { id: ctx.officeId } },
            contact: {
              connect: {
                officeId_id: { officeId: ctx.officeId, id: contactId },
              },
            },
          },
        },
      },
      include: { participants: true },
    });
  } else {
    const participant = brokerageCase.participants.find(
      (item) => item.contactId === contactId,
    );
    if (participant && !participant.roles.includes(role)) {
      await ctx.prisma.brokerageCaseParticipant.update({
        where: { id: participant.id },
        data: { roles: [...participant.roles, role] },
      });
    }
  }

  const aggregate =
    intakeKind === 'buyer'
      ? await ctx.prisma.buyerIntake.aggregate({
          where: { officeId: ctx.officeId, brokerageCaseId: brokerageCase.id },
          _max: { casePriorityRank: true },
        })
      : await ctx.prisma.listingIntake.aggregate({
          where: { officeId: ctx.officeId, brokerageCaseId: brokerageCase.id },
          _max: { casePriorityRank: true },
        });
  return {
    brokerageCaseId: brokerageCase.id,
    casePriorityRank: (aggregate._max.casePriorityRank ?? 0) + 1,
  };
}

function toPreferredRegions(names: string[]) {
  return names.map((name) => {
    const region = REGION_BY_NAME[name as keyof typeof REGION_BY_NAME];
    if (!region) throw new Error(`Unknown demo region: ${name}`);
    return { ...region };
  });
}

// ─────────────────────────────────────────────────────────────
// Match — 7개 (각 단계 분산 + 갈아타기 매수 후보 1개)
// ─────────────────────────────────────────────────────────────
async function seedMatches(
  ctx: Ctx,
  listings: Awaited<ReturnType<typeof seedListings>>,
  buyerReqs: Awaited<ReturnType<typeof seedBuyerRequirements>>,
) {
  const stages = [
    'suggested',
    'buyerInterested',
    'viewingConfirmed',
    'viewing',
    'negotiating',
    'dealCreated',
  ];

  const defs = [
    { listingIdx: 0, buyerIdx: 0, stage: stages[4] }, // 급매 26.8억 × 신혼 → 협상중
    { listingIdx: 1, buyerIdx: 3, stage: stages[3] }, // 24.2억 × 학군 → 임장
    { listingIdx: 2, buyerIdx: 1, stage: stages[1] }, // 31.9억 × VIP → 고객 관심
    { listingIdx: 3, buyerIdx: 2, stage: stages[5] }, // 19.8억 × 투자 → 거래 생성
    { listingIdx: 5, buyerIdx: 0, stage: stages[2] }, // 전세 × 신혼 → 임장 가능 확인
    { listingIdx: 0, buyerIdx: 3, stage: stages[0] }, // 급매 × 학군 → 내부 후보
    { listingIdx: 2, buyerIdx: 4, stage: stages[1] }, // 펜트하우스 × 갈아타기 → 고객 관심
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
// Deal — 3 개 (preparing / contracted / completed)
// Contract 는 contracted/completed 단계에만 생성
// DealPayment 는 stage 에 맞게 각 거래의 대금 흐름 표현
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

  // PartnerBroker: Deal 3 에서 쓸 공동중개 상대 사무소 (미리 생성)
  const partnerGodeok = await ctx.prisma.partnerBroker.create({
    data: {
      officeId: ctx.officeId,
      name: '고덕공인중개',
      phone: '02-555-1234',
      memo: `${DEMO_TAG} 공동중개 파트너`,
    },
  });

  // Deal 1: preparing 단계 (최종 조건·계약 일정 준비 중)
  const deal1 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[0].id,
      stage: 'preparing',
      transactionType: 'sale',
      agreedPrice: 268000,
      buyerContactId: buyers[0].id,
      sellerContactId: owners[0].id,
      memo: `${DEMO_TAG} 계약 준비 단계`,
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

  // Deal 2: contracted 단계 — Contract 동반 생성, 계약금 입금 완료
  const deal2 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[3].id,
      stage: 'contracted',
      stageChangedAt: daysAgo(5),
      transactionType: 'sale',
      agreedPrice: 198000,
      buyerContactId: buyers[2].id,
      sellerContactId: owners[3].id,
      specialTerms: `${DEMO_TAG} 전세 승계 · 에어컨 4대 포함`,
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
      statedDeposit: 19800,
      statedInterimPayment: 79200,
      statedInterimDate: daysFromNow(30),
      statedBalance: 99000,
      statedBalanceDate: daysFromNow(60),
      moveInDate: daysFromNow(62),
      specialTerms: `${DEMO_TAG} 전세 승계 · 에어컨 4대 포함`,
      attachments: [],
      memo: `${DEMO_TAG} 계약금 완료`,
    },
  });
  // Deal 2 DealPayment: 계약금 완료, 중도금/잔금 예정
  await ctx.prisma.dealPayment.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        kind: 'contract',
        scheduledAmount: 19800,
        scheduledDate: daysAgo(5),
        paidAmount: 19800,
        paidAt: daysAgo(5),
        status: 'paid',
        method: 'transfer',
        memo: `${DEMO_TAG} 계약금 입금 완료`,
      },
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        kind: 'interim',
        scheduledAmount: 79200,
        scheduledDate: daysFromNow(30),
        status: 'pending',
      },
      {
        officeId: ctx.officeId,
        dealId: deal2.id,
        kind: 'balance',
        scheduledAmount: 99000,
        scheduledDate: daysFromNow(60),
        status: 'pending',
      },
    ],
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

  // Deal 3: completed — Contract registered (공동중개)
  const deal3 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[1].id,
      stage: 'completed',
      stageChangedAt: daysAgo(2),
      transactionType: 'sale',
      agreedPrice: 242000,
      buyerContactId: buyers[3].id,
      sellerContactId: owners[1].id,
      specialTerms: `${DEMO_TAG} 잔금일 이사 · 관리비 정산`,
      // 공동중개: 매도측 우리가 담당 (seller 청구 968). 매수측 청구(968)는
      // 파트너 사무소 DB 에 있으며 우리 DB 엔 row 없음.
      // 수수료 집계는 CommissionPayment + CommissionDistribution 으로 계산.
      isJointBrokerage: true,
      ourSide: 'seller',
      partnerBrokerId: partnerGodeok.id,
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
      statedDeposit: 24200,
      statedInterimPayment: 96800,
      statedInterimDate: daysAgo(15),
      statedBalance: 121000,
      statedBalanceDate: daysAgo(2),
      moveInDate: daysAgo(2),
      specialTerms: `${DEMO_TAG} 잔금일 이사 · 관리비 정산`,
      attachments: [],
      memo: `${DEMO_TAG} 등기 완료`,
    },
  });
  // Deal 3 DealPayment: 모든 입금 완료
  await ctx.prisma.dealPayment.createMany({
    data: [
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        kind: 'contract',
        scheduledAmount: 24200,
        scheduledDate: daysAgo(45),
        paidAmount: 24200,
        paidAt: daysAgo(45),
        status: 'paid',
        method: 'transfer',
      },
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        kind: 'interim',
        scheduledAmount: 96800,
        scheduledDate: daysAgo(15),
        paidAmount: 96800,
        paidAt: daysAgo(15),
        status: 'paid',
        method: 'transfer',
      },
      {
        officeId: ctx.officeId,
        dealId: deal3.id,
        kind: 'balance',
        scheduledAmount: 121000,
        scheduledDate: daysAgo(2),
        paidAmount: 121000,
        paidAt: daysAgo(2),
        status: 'paid',
        method: 'transfer',
      },
    ],
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
  // 각 청구마다 CommissionDistribution 동반 생성 (단독중개: our_office 100%)

  // Deal 1 (preparing): 수금 예정만 → pending · 단독중개
  const d1seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal1.id,
      code: 'P-2604-01',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[0].id,
      baseAmount: 268000,
      rate: new Prisma.Decimal(0.4),
      expectedAmount: 1072,
      dueDate: daysFromNow(60),
      status: 'pending',
      note: `${DEMO_TAG}`,
    },
  });
  const d1buyer = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal1.id,
      code: 'P-2604-02',
      clientSide: 'buyer',
      collectedByOffice: 'us',
      payerContactId: buyers[0].id,
      baseAmount: 268000,
      rate: new Prisma.Decimal(0.4),
      expectedAmount: 1072,
      dueDate: daysFromNow(60),
      status: 'pending',
      note: `${DEMO_TAG}`,
    },
  });
  await ctx.prisma.commissionDistribution.createMany({
    data: [
      {
        officeId: ctx.officeId,
        paymentId: d1seller.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 1072,
      },
      {
        officeId: ctx.officeId,
        paymentId: d1buyer.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 1072,
      },
    ],
  });

  // Deal 2 (contracted): seller 수금 완료, buyer 는 대기 · 단독중개
  const d2seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal2.id,
      code: 'P-2604-03',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[3].id,
      baseAmount: 198000,
      rate: new Prisma.Decimal(0.5),
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
  });
  const d2buyer = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal2.id,
      code: 'P-2604-04',
      clientSide: 'buyer',
      collectedByOffice: 'us',
      payerContactId: buyers[2].id,
      baseAmount: 198000,
      rate: new Prisma.Decimal(0.5),
      expectedAmount: 990,
      dueDate: daysFromNow(30),
      status: 'pending',
      note: `${DEMO_TAG}`,
    },
  });
  await ctx.prisma.commissionDistribution.createMany({
    data: [
      {
        officeId: ctx.officeId,
        paymentId: d2seller.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 990,
        status: 'settled',
        settledAt: daysAgo(2),
      },
      {
        officeId: ctx.officeId,
        paymentId: d2buyer.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 990,
      },
    ],
  });

  // Deal 3 (completed): 공동중개 side-split — 우리 매도측 968 수금, buyer 측은
  // 파트너 고덕공인중개가 수금 → 우리 DB 엔 seller 청구 1건만 존재.
  const d3seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal3.id,
      code: 'P-2604-05',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[1].id,
      baseAmount: 242000,
      rate: new Prisma.Decimal(0.4),
      expectedAmount: 968,
      actualAmount: 968,
      dueDate: daysAgo(2),
      paidAt: daysAgo(2),
      status: 'collected',
      method: 'transfer',
      taxInvoiceStatus: 'issued',
      taxInvoiceNo: '2026-04-00038',
      taxInvoiceDate: daysAgo(1),
      note: `${DEMO_TAG} 공동중개 매도측`,
    },
  });
  await ctx.prisma.commissionDistribution.create({
    data: {
      officeId: ctx.officeId,
      paymentId: d3seller.id,
      recipientType: 'our_office',
      shareRatio: new Prisma.Decimal(100),
      shareAmount: 968,
      status: 'settled',
      settledAt: daysAgo(1),
    },
  });

  // ───────────────────────────────────────────────────────────
  // 추가 더미: 다양한 상태 표현을 위해 Deal 4개 + CommissionPayment 8개
  // ───────────────────────────────────────────────────────────

  // Deal 4: settling 단계, 매도측 일부수금 + 잔여 독촉 예정
  const deal4 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[4].id,
      stage: 'settling',
      stageChangedAt: daysAgo(10),
      transactionType: 'jeonse',
      agreedPrice: 88000, // 8.8억 전세
      buyerContactId: buyers[1].id,
      sellerContactId: owners[2].id,
      specialTerms: `${DEMO_TAG} 세입자 승계`,
      memo: `${DEMO_TAG} 잔금일 임박, 일부수금 진행중`,
    },
  });
  const d4seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal4.id,
      code: 'P-2604-06',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[2].id,
      baseAmount: 88000,
      rate: new Prisma.Decimal(0.4),
      expectedAmount: 352,
      actualAmount: 200,
      dueDate: daysAgo(4),
      paidAt: daysAgo(4),
      agreedRemainingDate: daysFromNow(10),
      status: 'partial',
      method: 'transfer',
      note: `${DEMO_TAG} 1차 200만 수금, 잔여 152만 ${daysFromNow(10).toISOString().slice(5, 10)} 지급 약정`,
    },
  });
  const d4buyer = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal4.id,
      code: 'P-2604-07',
      clientSide: 'buyer',
      collectedByOffice: 'us',
      payerContactId: buyers[1].id,
      baseAmount: 88000,
      rate: new Prisma.Decimal(0.4),
      expectedAmount: 352,
      dueDate: daysAgo(1),
      status: 'overdue',
      note: `${DEMO_TAG} 매수인 연체`,
    },
  });
  await ctx.prisma.commissionDistribution.createMany({
    data: [
      {
        officeId: ctx.officeId,
        paymentId: d4seller.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 352,
      },
      {
        officeId: ctx.officeId,
        paymentId: d4buyer.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 352,
      },
    ],
  });

  // Deal 5: preparing 단계 — 수수료는 draft(계약 준비 단계 선생성). 원장에서 숨김.
  const deal5 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[2].id,
      stage: 'preparing',
      stageChangedAt: daysAgo(3),
      transactionType: 'sale',
      agreedPrice: 175000, // 17.5억
      buyerContactId: buyers[0].id,
      sellerContactId: owners[1].id,
      memo: `${DEMO_TAG} 최종 조건 확인중 17.5억 — 수수료 미확정`,
    },
  });
  const d5seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal5.id,
      code: 'P-2604-08',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[1].id,
      baseAmount: 175000,
      rate: new Prisma.Decimal(0.6),
      expectedAmount: 1050,
      status: 'draft',
      note: `${DEMO_TAG} 계약 준비 단계 선생성`,
    },
  });
  const d5buyer = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal5.id,
      code: 'P-2604-09',
      clientSide: 'buyer',
      collectedByOffice: 'us',
      payerContactId: buyers[0].id,
      baseAmount: 175000,
      rate: new Prisma.Decimal(0.6),
      expectedAmount: 1050,
      status: 'draft',
      note: `${DEMO_TAG} 계약 준비 단계 선생성`,
    },
  });
  await ctx.prisma.commissionDistribution.createMany({
    data: [
      {
        officeId: ctx.officeId,
        paymentId: d5seller.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 1050,
      },
      {
        officeId: ctx.officeId,
        paymentId: d5buyer.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: 1050,
      },
    ],
  });

  // Deal 6: 공동중개 월세 (우리 매도측, 파트너 매수측) · 완료
  const deal6 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[5].id,
      stage: 'completed',
      stageChangedAt: daysAgo(8),
      transactionType: 'monthly',
      agreedDeposit: 3000,
      agreedMonthlyRent: 120,
      buyerContactId: buyers[2].id,
      sellerContactId: owners[3].id,
      isJointBrokerage: true,
      ourSide: 'seller',
      partnerBrokerId: partnerGodeok.id,
      memo: `${DEMO_TAG} 공동중개 월세 성사`,
    },
  });
  const d6seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal6.id,
      code: 'P-2604-10',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[3].id,
      baseAmount: 15000, // 3000 + 120*100 = 15000
      rate: new Prisma.Decimal(0.4),
      expectedAmount: 60,
      actualAmount: 60,
      dueDate: daysAgo(8),
      paidAt: daysAgo(8),
      status: 'collected',
      method: 'transfer',
      taxInvoiceStatus: 'issued',
      taxInvoiceNo: '2026-04-00051',
      taxInvoiceDate: daysAgo(7),
      note: `${DEMO_TAG} 공동중개 매도측 수금 완료`,
    },
  });
  await ctx.prisma.commissionDistribution.create({
    data: {
      officeId: ctx.officeId,
      paymentId: d6seller.id,
      recipientType: 'our_office',
      shareRatio: new Prisma.Decimal(100),
      shareAmount: 60,
      status: 'settled',
      settledAt: daysAgo(7),
    },
  });

  // Deal 7: contracted, pool-split 50:50 공동중개 (양쪽 다 우리가 수금, 반반 분배)
  const deal7 = await ctx.prisma.deal.create({
    data: {
      officeId: ctx.officeId,
      listingId: listings[6].id,
      stage: 'contracted',
      stageChangedAt: daysAgo(6),
      transactionType: 'sale',
      agreedPrice: 132000,
      buyerContactId: buyers[3].id,
      sellerContactId: owners[0].id,
      isJointBrokerage: true,
      ourSide: 'both',
      partnerBrokerId: partnerGodeok.id,
      memo: `${DEMO_TAG} 공동중개 pool-split 50:50`,
    },
  });
  const d7seller = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal7.id,
      code: 'P-2604-11',
      clientSide: 'seller',
      collectedByOffice: 'us',
      payerContactId: owners[0].id,
      baseAmount: 132000,
      rate: new Prisma.Decimal(0.5),
      expectedAmount: 660,
      actualAmount: 660,
      dueDate: daysAgo(6),
      paidAt: daysAgo(6),
      status: 'collected',
      method: 'transfer',
      taxInvoiceStatus: 'issued',
      taxInvoiceNo: '2026-04-00063',
      taxInvoiceDate: daysAgo(5),
      note: `${DEMO_TAG} pool-split, 파트너에 330만 송금 필요`,
    },
  });
  const d7buyer = await ctx.prisma.commissionPayment.create({
    data: {
      officeId: ctx.officeId,
      dealId: deal7.id,
      code: 'P-2604-12',
      clientSide: 'buyer',
      collectedByOffice: 'us',
      payerContactId: buyers[3].id,
      baseAmount: 132000,
      rate: new Prisma.Decimal(0.5),
      expectedAmount: 660,
      dueDate: daysFromNow(14),
      status: 'pending',
      note: `${DEMO_TAG}`,
    },
  });
  await ctx.prisma.commissionDistribution.createMany({
    data: [
      // seller 청구: 우리 50% / 파트너 50%
      {
        officeId: ctx.officeId,
        paymentId: d7seller.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(50),
        shareAmount: 330,
        status: 'settled',
        settledAt: daysAgo(5),
      },
      {
        officeId: ctx.officeId,
        paymentId: d7seller.id,
        recipientType: 'partner_broker',
        partnerBrokerId: partnerGodeok.id,
        shareRatio: new Prisma.Decimal(50),
        shareAmount: 330,
        status: 'pending', // 아직 파트너에게 송금 안 함
      },
      // buyer 청구: 동일 분배
      {
        officeId: ctx.officeId,
        paymentId: d7buyer.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(50),
        shareAmount: 330,
      },
      {
        officeId: ctx.officeId,
        paymentId: d7buyer.id,
        recipientType: 'partner_broker',
        partnerBrokerId: partnerGodeok.id,
        shareRatio: new Prisma.Decimal(50),
        shareAmount: 330,
      },
    ],
  });

  // ───────────────────────────────────────────────────────────
  // CommissionAdjustment 승인 대기 2건 (배너 표시용)
  // ───────────────────────────────────────────────────────────

  await ctx.prisma.commissionAdjustment.createMany({
    data: [
      {
        officeId: ctx.officeId,
        paymentId: d4buyer.id, // 연체된 매수측
        code: 'ADJ-001',
        type: 'discount',
        amount: -100,
        reason: `${DEMO_TAG} 매수인 협의 — 100만 할인 요청`,
        status: 'requested',
        requestedById: ctx.agentUserId,
      },
      {
        officeId: ctx.officeId,
        paymentId: d4buyer.id,
        code: 'ADJ-002',
        type: 'bad_debt',
        amount: -352,
        reason: `${DEMO_TAG} 매수인 연락두절 — 대손 처리 검토`,
        status: 'requested',
        requestedById: ctx.managerUserId,
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────
// OfficeExpenseTemplate — 고정비 5개
// ─────────────────────────────────────────────────────────────
async function seedOfficeExpenses(ctx: Ctx) {
  const defs = [
    {
      title: '사무실 임대료',
      category: 'rent',
      amount: 150,
      dayOfMonth: 25,
      taxDeductible: true,
    },
    {
      title: '네이버 부동산 광고',
      category: 'ad',
      amount: 200,
      dayOfMonth: 1,
      taxDeductible: true,
    },
    {
      title: '직방 광고',
      category: 'ad',
      amount: 50,
      dayOfMonth: 1,
      taxDeductible: true,
    },
    {
      title: '전화/인터넷',
      category: 'telecom',
      amount: 15,
      dayOfMonth: 20,
      taxDeductible: true,
    },
    {
      title: '공인중개사 협회비',
      category: 'association',
      amount: 30,
      frequency: 'yearly' as const,
      taxDeductible: false,
    },
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
  const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

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
      contact: contacts[12],
      createdBy: ctx.agentUserId,
      type: 'phone',
      content: `${DEMO_TAG} 세입자 만기 관련 상담 — 재계약 여부 확인 필요.`,
      propertyId: properties[4].id,
      createdAt: hoursAgo(120),
    },
    {
      contact: owners[0],
      createdBy: ctx.managerUserId,
      type: 'visit',
      content: `${DEMO_TAG} 갈아타기 상담 — 현재 집 매도 잔금과 새 집 잔금을 같은 주로 맞추기로 함.`,
      buyerReqId: buyerReqs[4].id,
      createdAt: hoursAgo(144),
    },
  ];

  for (const def of defs) {
    const buyerRequirement = def.buyerReqId
      ? buyerReqs.find((item) => item.id === def.buyerReqId)
      : null;
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
        buyerIntakeId: buyerRequirement?.buyerIntakeId ?? null,
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
      title: `${DEMO_TAG} 한지우 고객 매물 3건 추천 카톡`,
      category: 'buyer',
      priority: 'urgent',
      dueDate: daysFromNow(0),
      assignedToId: ctx.agentUserId,
      contactId: contacts[4].id,
    },
    {
      title: `${DEMO_TAG} 강수연 고객 토요일 임장 준비`,
      category: 'viewing',
      priority: 'high',
      dueDate: daysFromNow(2),
      assignedToId: ctx.managerUserId,
      contactId: contacts[7].id,
      listingId: listings[1].id,
    },
    {
      title: `${DEMO_TAG} 박성호 매물 사진 재촬영`,
      category: 'property',
      priority: 'medium',
      dueDate: daysFromNow(3),
      assignedToId: ctx.agentUserId,
      propertyId: properties[2].id,
    },
    {
      title: `${DEMO_TAG} 정유진 계약 중도금 일정 확인`,
      category: 'contract',
      priority: 'high',
      dueDate: daysFromNow(5),
      assignedToId: ctx.managerUserId,
      contactId: contacts[3].id,
    },
    {
      title: `${DEMO_TAG} 이서현 잔금 정산 완료 확인`,
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
      title: `${DEMO_TAG} 최도윤 고객 VIP 재연락`,
      category: 'call',
      priority: 'high',
      dueDate: daysFromNow(1),
      assignedToId: ctx.managerUserId,
      contactId: contacts[5].id,
    },
    {
      title: `${DEMO_TAG} 윤미경 세입자 퇴거 일정 조율`,
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
      title: `${DEMO_TAG} 강수연 고객 토요일 임장`,
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
      title: `${DEMO_TAG} 홍승민 법무 상담`,
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
      title: `${DEMO_TAG} 조은경 세무 상담`,
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
      title: `${DEMO_TAG} 배현우 고객 재상담`,
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

// ─────────────────────────────────────────────────────────────
// CallRecording — 모바일 앱에서 업로드된 통화 기록 데모 데이터
// 수신/발신 다양한 상태(completed / processing / none / failed) + STT 메시지
// 전화번호는 DEMO 구분용으로 010-7777-XXXX 패턴을 사용해 wipe 에서 매칭
// ─────────────────────────────────────────────────────────────
async function seedCallRecordings(
  ctx: Ctx,
  contacts: Awaited<ReturnType<typeof seedContacts>>,
) {
  const owners = contacts.slice(0, 4);
  const buyers = contacts.slice(4, 8);

  const now = new Date();
  const minutesAgo = (n: number) => new Date(now.getTime() - n * 60 * 1000);
  const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);
  const daysAgoFn = (n: number) =>
    new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  type MessageDef = {
    speaker: number;
    label: string;
    text: string;
    startSec: number;
    endSec: number;
  };

  type CallDef = {
    contact: (typeof contacts)[number] | null;
    user: string;
    direction: 'inbound' | 'outbound';
    phoneNumber: string;
    durationSec: number;
    sttStatus: 'completed' | 'processing' | 'none' | 'failed';
    calledAt: Date;
    fileName?: string;
    analysis?: {
      summary: string;
      customerNeed?: string;
      nextActions?: string[];
    } | null;
    messages?: MessageDef[];
  };

  const defs: CallDef[] = [
    // 1) 오늘 수신 — 완료, AI 요약 + 대화
    {
      contact: buyers[0],
      user: ctx.agentUserId,
      direction: 'inbound',
      phoneNumber: buyers[0].phone ?? '010-7777-0001',
      durationSec: 248,
      sttStatus: 'completed',
      calledAt: hoursAgo(3),
      fileName: '[DEMO] 고덕그라시움_문의_250420.m4a',
      analysis: {
        summary:
          '고덕그라시움 30평대 매매 문의. 20억 이하 희망, 즉시 입주 가능 필수.',
        customerNeed:
          '강동구 내 학군 좋은 30평대. 자녀 초등학교 진학 시점(2027년 3월) 전까지 입주 완료 원함.',
        nextActions: [
          '고덕그라시움 33평 매물 3건 브리핑',
          '토요일 오후 임장 일정 조율',
          '유사 단지(래미안솔베뉴) 물건 추가 확인',
        ],
      },
      messages: [
        {
          speaker: 0,
          label: '나',
          text: '네 김영공인중개사사무소입니다.',
          startSec: 0,
          endSec: 2,
        },
        {
          speaker: 1,
          label: '고객',
          text: '안녕하세요, 고덕그라시움 매물 문의드리려고요.',
          startSec: 3,
          endSec: 7,
        },
        {
          speaker: 0,
          label: '나',
          text: '네 어떤 평형 찾으세요?',
          startSec: 8,
          endSec: 10,
        },
        {
          speaker: 1,
          label: '고객',
          text: '33평대로 20억 이하면 좋겠어요. 즉시 입주 가능해야 하고요.',
          startSec: 11,
          endSec: 17,
        },
        {
          speaker: 0,
          label: '나',
          text: '현재 33평 매물 3건 있습니다. 가격대 18.5억부터 19.8억까지.',
          startSec: 18,
          endSec: 25,
        },
        {
          speaker: 1,
          label: '고객',
          text: '토요일에 임장 가능할까요?',
          startSec: 26,
          endSec: 29,
        },
      ],
    },
    // 2) 어제 발신 — 완료, AI 요약
    {
      contact: owners[3],
      user: ctx.managerUserId,
      direction: 'outbound',
      phoneNumber: owners[3].phone ?? '010-7777-0002',
      durationSec: 163,
      sttStatus: 'completed',
      calledAt: hoursAgo(26),
      fileName: '[DEMO] 집주인_잔금일_조율.m4a',
      analysis: {
        summary: '잔금일 5월 2일로 확정. 매수자 측 자금 일정 맞춰 협상 성공.',
        nextActions: ['계약서 잔금일 수정', '법무사에 등기 일정 공유'],
      },
      messages: [
        {
          speaker: 0,
          label: '나',
          text: '안녕하세요 사장님, 잔금일 관련 전화드렸어요.',
          startSec: 0,
          endSec: 4,
        },
        {
          speaker: 1,
          label: '고객',
          text: '네, 5월 초순으로 하자 얘기 있었죠.',
          startSec: 5,
          endSec: 10,
        },
        {
          speaker: 0,
          label: '나',
          text: '매수 측에서 5월 2일 금요일 선호합니다. 가능하실까요?',
          startSec: 11,
          endSec: 17,
        },
        {
          speaker: 1,
          label: '고객',
          text: '그날로 하시죠. 오전에 법무사 예약 잡아주세요.',
          startSec: 18,
          endSec: 23,
        },
      ],
    },
    // 3) 이번 주 수신 — 부재중 (5초 미만)
    {
      contact: null,
      user: ctx.agentUserId,
      direction: 'inbound',
      phoneNumber: '010-7777-4040',
      durationSec: 2,
      sttStatus: 'none',
      calledAt: daysAgoFn(2),
      analysis: null,
      messages: [],
    },
    // 4) 이번 주 발신 — 완료, 상가 문의
    {
      contact: buyers[2],
      user: ctx.agentUserId,
      direction: 'outbound',
      phoneNumber: buyers[2].phone ?? '010-7777-0003',
      durationSec: 412,
      sttStatus: 'completed',
      calledAt: daysAgoFn(3),
      fileName: '[DEMO] 투자자_상가_브리핑.m4a',
      analysis: {
        summary:
          '명일역 푸르지오 2층 상가 브리핑. 수익률 5.2% 어필, 방문 의사 확정.',
        customerNeed: '월세 수익형 부동산. 5% 이상 수익률 + 역세권 1급지 선호.',
        nextActions: [
          '임차인 계약 만기일 정확한 날짜 조회',
          '인근 상권 공실률 데이터 준비',
        ],
      },
      messages: [
        {
          speaker: 0,
          label: '나',
          text: '안녕하세요, 지난번 문의주신 상가 관련해서 전화드렸습니다.',
          startSec: 0,
          endSec: 5,
        },
        {
          speaker: 1,
          label: '고객',
          text: '네, 명일역 근처 물건이죠?',
          startSec: 6,
          endSec: 9,
        },
        {
          speaker: 0,
          label: '나',
          text: '맞습니다. 월세 250에 보증금 5천, 연 수익률 계산해보니 5.2% 나와요.',
          startSec: 10,
          endSec: 18,
        },
        {
          speaker: 1,
          label: '고객',
          text: '임차인 계약 기간은요?',
          startSec: 19,
          endSec: 22,
        },
        {
          speaker: 0,
          label: '나',
          text: '내년 2월까지 있습니다. 한번 보러 가시죠. 언제 편하세요?',
          startSec: 23,
          endSec: 30,
        },
      ],
    },
    // 5) 방금 전 수신 — 처리 중
    {
      contact: owners[1],
      user: ctx.agentUserId,
      direction: 'inbound',
      phoneNumber: owners[1].phone ?? '010-7777-0004',
      durationSec: 87,
      sttStatus: 'processing',
      calledAt: minutesAgo(15),
      fileName: '[DEMO] 임대료_인상_문의.m4a',
      analysis: null,
      messages: [],
    },
    // 6) 이번 주 수신 — STT 실패
    {
      contact: buyers[1],
      user: ctx.managerUserId,
      direction: 'inbound',
      phoneNumber: buyers[1].phone ?? '010-7777-0005',
      durationSec: 34,
      sttStatus: 'failed',
      calledAt: daysAgoFn(1),
      fileName: '[DEMO] 잡음_많은_녹음.m4a',
      analysis: null,
      messages: [],
    },
    // 7) 이번 주 발신 — 완료, 짧은 확인 통화
    {
      contact: owners[0],
      user: ctx.agentUserId,
      direction: 'outbound',
      phoneNumber: owners[0].phone ?? '010-7777-0006',
      durationSec: 52,
      sttStatus: 'completed',
      calledAt: daysAgoFn(4),
      fileName: '[DEMO] 세입자_확인.m4a',
      analysis: {
        summary: '래미안고덕 세입자 재계약 의사 확인. 수락.',
        nextActions: ['재계약서 초안 준비', '보증금 인상분 조율'],
      },
      messages: [
        {
          speaker: 0,
          label: '나',
          text: '세입자분 재계약 의사 있다고 하네요.',
          startSec: 0,
          endSec: 4,
        },
        {
          speaker: 1,
          label: '고객',
          text: '다행이네요. 보증금은 그대로 할까요?',
          startSec: 5,
          endSec: 10,
        },
        {
          speaker: 0,
          label: '나',
          text: '5% 정도 인상 제안드려볼게요.',
          startSec: 11,
          endSec: 15,
        },
      ],
    },
    // 8) 저번 주 수신 — 이번 주 필터에선 제외됨 (이번 달 탭에선 보임)
    {
      contact: null,
      user: ctx.agentUserId,
      direction: 'inbound',
      phoneNumber: '010-7777-9090',
      durationSec: 18,
      sttStatus: 'none',
      calledAt: daysAgoFn(10),
      analysis: null,
      messages: [],
    },
  ];

  for (const def of defs) {
    const recording = await ctx.prisma.callRecording.create({
      data: {
        officeId: ctx.officeId,
        contactId: def.contact?.id ?? null,
        userId: def.user,
        direction: def.direction,
        phoneNumber: def.phoneNumber,
        durationSec: def.durationSec,
        fileName: def.fileName ?? null,
        fileSize: def.fileName ? 200_000 + def.durationSec * 8_000 : null,
        sttStatus: def.sttStatus,
        analysis: def.analysis ?? Prisma.JsonNull,
        analysisStatus: def.analysis ? 'completed' : 'none',
        calledAt: def.calledAt,
      },
    });

    if (def.messages && def.messages.length > 0) {
      await ctx.prisma.callRecordingMessage.createMany({
        data: def.messages.map((m, idx) => ({
          recordingId: recording.id,
          speaker: m.speaker,
          speakerLabel: m.label,
          text: m.text,
          startMs: m.startSec * 1000,
          endMs: m.endSec * 1000,
          seq: idx,
        })),
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// NetworkRoom — 공동 중개망 데모
// 첫 사무소가 만든 공개방 + (있다면) 두 번째 사무소 멤버 참여
// 데모 Listing 2개 공유 (마스킹 다양화) + 채팅 + pending 문의 1건
// memo 컬럼이 없는 모델은 description/content/message 에 [DEMO] 태그.
// ─────────────────────────────────────────────────────────────
async function seedNetwork(
  ctx: Ctx,
  listings: Awaited<ReturnType<typeof seedListings>>,
) {
  const now = new Date();
  const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

  // 두 번째 활성 사무소 (없으면 단독 방으로 생성)
  const partnerOffice = await ctx.prisma.office.findFirst({
    where: { isActive: true, id: { not: ctx.officeId } },
    orderBy: { createdAt: 'asc' },
  });
  const partnerUser = partnerOffice
    ? await ctx.prisma.user.findFirst({
        where: { officeId: partnerOffice.id, isActive: true },
        orderBy: { createdAt: 'asc' },
      })
    : null;

  const room = await ctx.prisma.networkRoom.create({
    data: {
      name: '강동 공동중개',
      description: `${DEMO_TAG} 강동구 공동중개 매물 공유방`,
      type: 'public',
      createdBy: ctx.officeId,
      region: '강동구',
      isActive: true,
    },
  });

  await ctx.prisma.networkRoomMember.create({
    data: {
      roomId: room.id,
      officeId: ctx.officeId,
      role: 'admin',
      status: 'approved',
      joinedAt: hoursAgo(72),
    },
  });
  if (partnerOffice) {
    await ctx.prisma.networkRoomMember.create({
      data: {
        roomId: room.id,
        officeId: partnerOffice.id,
        role: 'member',
        status: 'approved',
        joinedAt: hoursAgo(48),
      },
    });
  }

  // 공유 매물 1: 급매 매매 — 가격 공개, 동/호수 비공개
  const shared1 = await ctx.prisma.networkSharedProperty.create({
    data: {
      roomId: room.id,
      listingId: listings[0].id,
      officeId: ctx.officeId,
      sharedBy: ctx.agentUserId,
      showSiteName: true,
      showDong: false,
      showUnit: false,
      showPrice: true,
      showArea: true,
      showFloor: true,
      showMemo: false,
      contactName: '이중개',
      contactPhone: '010-7777-1111',
      description: `${DEMO_TAG} 급매 — 26.8억, 로얄층 남향. 공동중개 환영`,
      isActive: true,
      createdAt: hoursAgo(30),
    },
  });

  // 공유 매물 2: 전세 — 동까지 공개, 가격 비공개 (문의 유도)
  const shared2 = await ctx.prisma.networkSharedProperty.create({
    data: {
      roomId: room.id,
      listingId: listings[5].id,
      officeId: ctx.officeId,
      sharedBy: ctx.managerUserId,
      showSiteName: true,
      showDong: true,
      showUnit: false,
      showPrice: false,
      showArea: true,
      showFloor: false,
      showMemo: true,
      contactName: '김팀장',
      contactPhone: '010-7777-2222',
      description: `${DEMO_TAG} 전세 즉시입주 — 가격은 문의 주세요`,
      isActive: true,
      createdAt: hoursAgo(20),
    },
  });

  // 채팅 메시지
  const messageDefs: Array<{
    officeId: string;
    userId: string;
    content: string;
    sharedPropertyId?: string;
    at: Date;
  }> = [
    {
      officeId: ctx.officeId,
      userId: ctx.ownerUserId,
      content: `${DEMO_TAG} 강동 공동중개방 오픈했습니다. 좋은 물건 많이 공유해주세요!`,
      at: hoursAgo(71),
    },
    {
      officeId: ctx.officeId,
      userId: ctx.agentUserId,
      content: `${DEMO_TAG} 고덕그라시움 급매 공유합니다. 26.8억 로얄층입니다.`,
      sharedPropertyId: shared1.id,
      at: hoursAgo(29),
    },
    {
      officeId: ctx.officeId,
      userId: ctx.managerUserId,
      content: `${DEMO_TAG} 전세 물건도 하나 올립니다. 즉시입주 가능해요.`,
      sharedPropertyId: shared2.id,
      at: hoursAgo(19),
    },
  ];
  if (partnerOffice && partnerUser) {
    messageDefs.push({
      officeId: partnerOffice.id,
      userId: partnerUser.id,
      content: `${DEMO_TAG} 급매 물건 매수 대기 고객 있습니다. 문의 넣었어요~`,
      at: hoursAgo(5),
    });
  }
  for (const def of messageDefs) {
    await ctx.prisma.networkMessage.create({
      data: {
        roomId: room.id,
        officeId: def.officeId,
        userId: def.userId,
        content: def.content,
        sharedPropertyId: def.sharedPropertyId ?? null,
        createdAt: def.at,
      },
    });
  }

  // 문의 1건 (pending) — 두 번째 사무소 → 급매 공유 매물
  let inquiryId: string | null = null;
  if (partnerOffice && partnerUser) {
    const inquiry = await ctx.prisma.networkInquiry.create({
      data: {
        sharedPropertyId: shared1.id,
        fromOfficeId: partnerOffice.id,
        fromUserId: partnerUser.id,
        status: 'pending',
        message: `${DEMO_TAG} 매수 의향 고객 있습니다. 동/호수 및 방문 가능 일정 공유 부탁드립니다.`,
        createdAt: hoursAgo(4),
      },
    });
    inquiryId = inquiry.id;
  }

  return { roomId: room.id, inquiryId };
}

// ─────────────────────────────────────────────────────────────
// Notification — 첫 사무소 owner 에게 3건
// content 에 [DEMO] 태그 (wipe 식별용)
// ─────────────────────────────────────────────────────────────
async function seedNotifications(
  ctx: Ctx,
  network: Awaited<ReturnType<typeof seedNetwork>>,
) {
  const now = new Date();
  const hoursAgo = (n: number) => new Date(now.getTime() - n * 60 * 60 * 1000);

  const defs = [
    {
      type: 'network_inquiry',
      title: '공유 매물에 새 문의가 도착했습니다',
      content: `${DEMO_TAG} 강동 공동중개방 — 급매 매물에 매수 문의 1건 (pending)`,
      linkType: network.inquiryId ? 'network_inquiry' : null,
      linkId: network.inquiryId,
      isRead: false,
      createdAt: hoursAgo(4),
    },
    {
      type: 'task_assigned',
      title: '새 업무가 배정되었습니다',
      content: `${DEMO_TAG} 급매 26.8억 등기부 확인 — 마감 내일`,
      linkType: null,
      linkId: null,
      isRead: false,
      createdAt: hoursAgo(8),
    },
    {
      type: 'verification_due',
      title: '매물 확인 주기가 도래했습니다',
      content: `${DEMO_TAG} 고덕그라시움 펜트하우스 — 마지막 확인 후 3일 경과`,
      linkType: null,
      linkId: null,
      isRead: true,
      createdAt: hoursAgo(26),
    },
  ];

  for (const def of defs) {
    await ctx.prisma.notification.create({
      data: {
        officeId: ctx.officeId,
        userId: ctx.ownerUserId,
        type: def.type,
        title: def.title,
        content: def.content,
        linkType: def.linkType,
        linkId: def.linkId,
        isRead: def.isRead,
        readAt: def.isRead ? hoursAgo(20) : null,
        createdAt: def.createdAt,
      },
    });
  }
}

main().catch((e) => {
  console.error('❌ seed-demo 실패:', e);
  process.exit(1);
});
