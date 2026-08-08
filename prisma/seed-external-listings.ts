/**
 * External Listing 더미 seed (광고노트 UI 테스트용)
 *
 * 고덕그라시움 + 테스트 사무소를 전제로 외부 매물 30건을 생성한다.
 * 거래유형 3가지, 일부 호수는 텍스트로 확인, 일부는 미확인, 같은 호실에
 * 경쟁 매물 여러 개가 걸린 케이스도 포함.
 *
 * 실행: pnpm exec tsx prisma/seed-external-listings.ts
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_OFFICE_LICENSE_NO = '11740-2026-0001';
const SITE_NAME = '고덕그라시움';

type Txn = 'sale' | 'jeonse' | 'monthly';

interface DummyItem {
  dongName: string;
  ho: string;
  floor: number;
  areaName: string;
  exclusiveAreaM2: number;
  transactionType: Txn;
  price?: number;
  deposit?: number;
  monthlyRent?: number;
  // 같은 호실에 여러 매물이 있는 경우 그룹핑 키 (네이버 representativeArticleNo 대응)
  groupKey: string;
  // 여러 매물 중 대표인지
  isRepresentative: boolean;
  floorInfo: string; // "35/35" 등
  realtorName: string;
  realtorPhone: string;
  ranking: number;
  seango?: boolean;
  epju?: boolean;
  verificationTypeCode?: string;
  articleFeatureDesc?: string;
  // 사용자가 호수 텍스트를 확인했는지
  isVerified: boolean;
}

const DUMMY_ITEMS: DummyItem[] = [
  // === 매매 (sale) 15건 ===
  // 1. 101동 3501호 - 확정, 단독 매물
  {
    dongName: '101동',
    ho: '3501',
    floor: 35,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 218000,
    groupKey: 'g-sale-101-3501',
    isRepresentative: true,
    floorInfo: '35/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 1,
    seango: true,
    verificationTypeCode: 'OWNER',
    articleFeatureDesc: '로얄층 남향, 급매',
    isVerified: true,
  },
  // 2. 101동 3401호 - 확정, 경쟁 매물 3건 중 대표
  {
    dongName: '101동',
    ho: '3401',
    floor: 34,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 215000,
    groupKey: 'g-sale-101-3401',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '고덕명품부동산',
    realtorPhone: '02-1000-1002',
    ranking: 1,
    seango: true,
    verificationTypeCode: 'OWNER',
    articleFeatureDesc: '즉시 입주 가능',
    isVerified: true,
  },
  // 3. 101동 3401호 - 경쟁 매물 2
  {
    dongName: '101동',
    ho: '3401',
    floor: 34,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 217000,
    groupKey: 'g-sale-101-3401',
    isRepresentative: false,
    floorInfo: '중/35',
    realtorName: '강동제일부동산',
    realtorPhone: '02-1000-1003',
    ranking: 2,
    verificationTypeCode: 'NDOC1',
    articleFeatureDesc: '풀옵션',
    isVerified: true,
  },
  // 4. 101동 3401호 - 경쟁 매물 3
  {
    dongName: '101동',
    ho: '3401',
    floor: 34,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 219000,
    groupKey: 'g-sale-101-3401',
    isRepresentative: false,
    floorInfo: '중/35',
    realtorName: '구리부동산중개',
    realtorPhone: '031-2000-1001',
    ranking: 3,
    epju: true,
    isVerified: true,
  },
  // 5. 102동 ? - 미매칭
  {
    dongName: '102동',
    ho: '',
    floor: 0,
    areaName: '59B',
    exclusiveAreaM2: 59.95,
    transactionType: 'sale',
    price: 138000,
    groupKey: 'g-sale-102-unknown-1',
    isRepresentative: true,
    floorInfo: '저/35',
    realtorName: '고덕신부동산',
    realtorPhone: '02-1000-1010',
    ranking: 5,
    articleFeatureDesc: '저층 세일',
    isVerified: false,
  },
  // 6. 103동 1505호 - 확정
  {
    dongName: '103동',
    ho: '1505',
    floor: 15,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 210000,
    groupKey: 'g-sale-103-1505',
    isRepresentative: true,
    floorInfo: '15/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 2,
    verificationTypeCode: 'OWNER',
    isVerified: true,
  },
  // 7. 104동 ? - 미매칭, 고층
  {
    dongName: '104동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 225000,
    groupKey: 'g-sale-104-unknown-1',
    isRepresentative: true,
    floorInfo: '고/35',
    realtorName: '프리미엄부동산',
    realtorPhone: '02-1000-1020',
    ranking: 1,
    seango: true,
    articleFeatureDesc: '한강뷰',
    isVerified: false,
  },
  // 8. 105동 ? - 미매칭, 115m²
  {
    dongName: '105동',
    ho: '',
    floor: 0,
    areaName: '115A',
    exclusiveAreaM2: 115.55,
    transactionType: 'sale',
    price: 295000,
    groupKey: 'g-sale-105-unknown-1',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '명동부동산',
    realtorPhone: '02-1000-1030',
    ranking: 1,
    verificationTypeCode: 'OWNER',
    isVerified: false,
  },
  // 9. 106동 ? - 미매칭, 경쟁 2건
  {
    dongName: '106동',
    ho: '',
    floor: 0,
    areaName: '84B',
    exclusiveAreaM2: 84.52,
    transactionType: 'sale',
    price: 212000,
    groupKey: 'g-sale-106-unknown-1',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '고덕중개',
    realtorPhone: '02-1000-1040',
    ranking: 3,
    isVerified: false,
  },
  {
    dongName: '106동',
    ho: '',
    floor: 0,
    areaName: '84B',
    exclusiveAreaM2: 84.52,
    transactionType: 'sale',
    price: 213500,
    groupKey: 'g-sale-106-unknown-1',
    isRepresentative: false,
    floorInfo: '중/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 4,
    isVerified: false,
  },
  // 11. 107동 2510호 - 확정
  {
    dongName: '107동',
    ho: '2510',
    floor: 25,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 216000,
    groupKey: 'g-sale-107-2510',
    isRepresentative: true,
    floorInfo: '25/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 2,
    epju: true,
    verificationTypeCode: 'OWNER',
    isVerified: true,
  },
  // 12. 108동 ? - 미매칭
  {
    dongName: '108동',
    ho: '',
    floor: 0,
    areaName: '59A',
    exclusiveAreaM2: 59.99,
    transactionType: 'sale',
    price: 135000,
    groupKey: 'g-sale-108-unknown-1',
    isRepresentative: true,
    floorInfo: '저/35',
    realtorName: '고덕신부동산',
    realtorPhone: '02-1000-1010',
    ranking: 8,
    isVerified: false,
  },
  // 13-15. 109동 ? - 미매칭, 경쟁 3건 (sameAddrCnt=3)
  {
    dongName: '109동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 220000,
    groupKey: 'g-sale-109-unknown-1',
    isRepresentative: true,
    floorInfo: '고/35',
    realtorName: '강남부동산',
    realtorPhone: '02-1000-1050',
    ranking: 1,
    seango: true,
    articleFeatureDesc: '조망 우수',
    isVerified: false,
  },
  {
    dongName: '109동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 221500,
    groupKey: 'g-sale-109-unknown-1',
    isRepresentative: false,
    floorInfo: '고/35',
    realtorName: '고덕중개',
    realtorPhone: '02-1000-1040',
    ranking: 2,
    isVerified: false,
  },
  {
    dongName: '109동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'sale',
    price: 222000,
    groupKey: 'g-sale-109-unknown-1',
    isRepresentative: false,
    floorInfo: '고/35',
    realtorName: '프리미엄부동산',
    realtorPhone: '02-1000-1020',
    ranking: 3,
    isVerified: false,
  },

  // === 전세 (jeonse) 10건 ===
  // 16. 101동 2204호 - 확정
  {
    dongName: '101동',
    ho: '2204',
    floor: 22,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'jeonse',
    deposit: 95000,
    groupKey: 'g-jeonse-101-2204',
    isRepresentative: true,
    floorInfo: '22/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 1,
    verificationTypeCode: 'OWNER',
    articleFeatureDesc: '즉시 입주',
    isVerified: true,
  },
  // 17. 102동 ? - 미매칭
  {
    dongName: '102동',
    ho: '',
    floor: 0,
    areaName: '59A',
    exclusiveAreaM2: 59.99,
    transactionType: 'jeonse',
    deposit: 55000,
    groupKey: 'g-jeonse-102-unknown-1',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '고덕신부동산',
    realtorPhone: '02-1000-1010',
    ranking: 2,
    isVerified: false,
  },
  // 18. 103동 ? - 미매칭 대형
  {
    dongName: '103동',
    ho: '',
    floor: 0,
    areaName: '115A',
    exclusiveAreaM2: 115.55,
    transactionType: 'jeonse',
    deposit: 135000,
    groupKey: 'g-jeonse-103-unknown-1',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '프리미엄부동산',
    realtorPhone: '02-1000-1020',
    ranking: 1,
    seango: true,
    verificationTypeCode: 'OWNER',
    isVerified: false,
  },
  // 19-20. 104동 1201호 - 확정, 경쟁 2건
  {
    dongName: '104동',
    ho: '1201',
    floor: 12,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'jeonse',
    deposit: 92000,
    groupKey: 'g-jeonse-104-1201',
    isRepresentative: true,
    floorInfo: '12/35',
    realtorName: '고덕중개',
    realtorPhone: '02-1000-1040',
    ranking: 1,
    isVerified: true,
  },
  {
    dongName: '104동',
    ho: '1201',
    floor: 12,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'jeonse',
    deposit: 93500,
    groupKey: 'g-jeonse-104-1201',
    isRepresentative: false,
    floorInfo: '12/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 2,
    isVerified: true,
  },
  // 21. 105동 ? - 미매칭
  {
    dongName: '105동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'jeonse',
    deposit: 88000,
    groupKey: 'g-jeonse-105-unknown-1',
    isRepresentative: true,
    floorInfo: '저/35',
    realtorName: '고덕신부동산',
    realtorPhone: '02-1000-1010',
    ranking: 5,
    articleFeatureDesc: '저층 반려동물 가능',
    isVerified: false,
  },
  // 22. 106동 ? - 미매칭
  {
    dongName: '106동',
    ho: '',
    floor: 0,
    areaName: '59B',
    exclusiveAreaM2: 59.95,
    transactionType: 'jeonse',
    deposit: 52000,
    groupKey: 'g-jeonse-106-unknown-1',
    isRepresentative: true,
    floorInfo: '저/35',
    realtorName: '강동제일부동산',
    realtorPhone: '02-1000-1003',
    ranking: 4,
    isVerified: false,
  },
  // 23. 107동 2801호 - 확정
  {
    dongName: '107동',
    ho: '2801',
    floor: 28,
    areaName: '84B',
    exclusiveAreaM2: 84.52,
    transactionType: 'jeonse',
    deposit: 98000,
    groupKey: 'g-jeonse-107-2801',
    isRepresentative: true,
    floorInfo: '28/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 1,
    seango: true,
    verificationTypeCode: 'OWNER',
    isVerified: true,
  },
  // 24. 108동 ? - 미매칭
  {
    dongName: '108동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'jeonse',
    deposit: 90000,
    groupKey: 'g-jeonse-108-unknown-1',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '고덕중개',
    realtorPhone: '02-1000-1040',
    ranking: 6,
    isVerified: false,
  },
  // 25. 109동 ? - 미매칭
  {
    dongName: '109동',
    ho: '',
    floor: 0,
    areaName: '115A',
    exclusiveAreaM2: 115.55,
    transactionType: 'jeonse',
    deposit: 142000,
    groupKey: 'g-jeonse-109-unknown-1',
    isRepresentative: true,
    floorInfo: '고/35',
    realtorName: '명동부동산',
    realtorPhone: '02-1000-1030',
    ranking: 2,
    epju: true,
    isVerified: false,
  },

  // === 월세 (monthly) 5건 ===
  // 26. 101동 ? - 미매칭
  {
    dongName: '101동',
    ho: '',
    floor: 0,
    areaName: '59A',
    exclusiveAreaM2: 59.99,
    transactionType: 'monthly',
    deposit: 20000,
    monthlyRent: 150,
    groupKey: 'g-monthly-101-unknown-1',
    isRepresentative: true,
    floorInfo: '중/35',
    realtorName: '고덕신부동산',
    realtorPhone: '02-1000-1010',
    ranking: 1,
    isVerified: false,
  },
  // 27. 102동 1802호 - 확정
  {
    dongName: '102동',
    ho: '1802',
    floor: 18,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'monthly',
    deposit: 30000,
    monthlyRent: 200,
    groupKey: 'g-monthly-102-1802',
    isRepresentative: true,
    floorInfo: '18/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 1,
    seango: true,
    verificationTypeCode: 'OWNER',
    isVerified: true,
  },
  // 28-29. 103동 ? - 미매칭, 경쟁 2건
  {
    dongName: '103동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'monthly',
    deposit: 50000,
    monthlyRent: 150,
    groupKey: 'g-monthly-103-unknown-1',
    isRepresentative: true,
    floorInfo: '고/35',
    realtorName: '프리미엄부동산',
    realtorPhone: '02-1000-1020',
    ranking: 2,
    articleFeatureDesc: '반전세',
    isVerified: false,
  },
  {
    dongName: '103동',
    ho: '',
    floor: 0,
    areaName: '84A',
    exclusiveAreaM2: 84.97,
    transactionType: 'monthly',
    deposit: 10000,
    monthlyRent: 220,
    groupKey: 'g-monthly-103-unknown-1',
    isRepresentative: false,
    floorInfo: '고/35',
    realtorName: '강동부동산',
    realtorPhone: '02-1000-1001',
    ranking: 3,
    isVerified: false,
  },
  // 30. 104동 2303호 - 확정
  {
    dongName: '104동',
    ho: '2303',
    floor: 23,
    areaName: '84B',
    exclusiveAreaM2: 84.52,
    transactionType: 'monthly',
    deposit: 40000,
    monthlyRent: 180,
    groupKey: 'g-monthly-104-2303',
    isRepresentative: true,
    floorInfo: '23/35',
    realtorName: '고덕중개',
    realtorPhone: '02-1000-1040',
    ranking: 1,
    epju: true,
    isVerified: true,
  },
];

async function main() {
  // 1. Office 조회
  const office = process.env.SEED_OFFICE_ID
    ? await prisma.office.findUnique({
        where: { id: process.env.SEED_OFFICE_ID },
      })
    : await prisma.office.findFirst({
        where: { licenseNo: TEST_OFFICE_LICENSE_NO },
      });
  if (!office) {
    throw new Error(
      '테스트 Office를 찾을 수 없습니다. seed-test-office를 먼저 실행하세요.',
    );
  }

  // 2. Site 조회
  const site = await prisma.site.findFirst({
    where: { name: SITE_NAME, isPublic: true },
  });
  if (!site) {
    throw new Error(`Site ${SITE_NAME} not found. seed-gracium을 먼저 실행하세요.`);
  }

  console.log(`Office: ${office.name}`);
  console.log(`Site:   ${site.name}`);

  // 3. 기존 더미 정리 (멱등 실행)
  const deletedListings = await prisma.externalListing.deleteMany({
    where: { officeId: office.id },
  });
  const deletedGroups = await prisma.externalListingGroup.deleteMany({
    where: { officeId: office.id },
  });
  console.log(
    `기존 정리: listings ${deletedListings.count}건 / groups ${deletedGroups.count}건`,
  );

  // 4. groupKey별로 묶어서 Group 생성 → Listings upsert
  const groupedItems = new Map<string, DummyItem[]>();
  for (const item of DUMMY_ITEMS) {
    const list = groupedItems.get(item.groupKey) ?? [];
    list.push(item);
    groupedItems.set(item.groupKey, list);
  }

  let groupCount = 0;
  let listingCount = 0;
  let articleSeq = 2340000000;

  const now = new Date();

  for (const [groupKey, items] of groupedItems) {
    const rep = items.find((x) => x.isRepresentative) ?? items[0];

    const status = rep.isVerified ? 'verified' : 'unmatched';

    const group = await prisma.externalListingGroup.create({
      data: {
        officeId: office.id,
        siteId: site.id,
        buildingName: rep.dongName,
        ho: rep.isVerified ? rep.ho : null,
        areaName: rep.areaName,
        exclusiveAreaM2: new Prisma.Decimal(rep.exclusiveAreaM2),
        transactionType: rep.transactionType,
        memo: rep.isVerified ? `${rep.dongName} ${rep.ho}호 확인 완료` : null,
        status,
        firstSeenAt: now,
        lastSeenAt: now,
      },
    });
    groupCount++;

    // 같은 그룹의 매물들 중 대표 articleNo 하나를 정하고 나머지는
    // representativeArticleNo로 묶는다 (네이버 sameAddr 구조)
    const repArticleNo = String(articleSeq++);
    const articleNos: string[] = [];

    for (const item of items) {
      const articleNo =
        item === rep ? repArticleNo : String(articleSeq++);
      articleNos.push(articleNo);

      const created = await prisma.externalListing.create({
        data: {
          officeId: office.id,
          groupId: group.id,
          source: 'naver',
          articleNo,
          sourceUrl: `https://m.land.naver.com/article/info/${articleNo}`,
          cpName: '네이버부동산',
          cpid: 'bizmk',
          cpPcArticleUrl: `https://land.naver.com/article/${articleNo}`,
          representativeArticleNo: repArticleNo,
          sameAddrCnt: items.length,
          sameAddrDirectCnt: 0,
          transactionType: item.transactionType,
          price: item.price ?? null,
          deposit: item.deposit ?? null,
          monthlyRent: item.monthlyRent ?? null,
          articleName: `${site.name} ${item.dongName}`,
          articleFeatureDesc: item.articleFeatureDesc ?? null,
          articleConfirmYmd: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
          floorInfo: item.floorInfo,
          exclusiveAreaM2: new Prisma.Decimal(item.exclusiveAreaM2),
          direction: 'SS',
          verificationTypeCode: item.verificationTypeCode ?? null,
          realtorName: item.realtorName,
          representativeTelNo: item.realtorPhone,
          ranking: item.ranking,
          seango: item.seango ?? false,
          epju: item.epju ?? false,
          firstSeenAt: now,
          lastSeenAt: now,
          isActive: true,
        },
      });
      listingCount++;

      // 대표 매물을 Group.mainExternalListingId로 지정
      if (item === rep) {
        await prisma.externalListingGroup.update({
          where: { id: group.id },
          data: { mainExternalListingId: created.id },
        });
      }
    }

    console.log(
      `  ${groupKey}: group ${group.status} / ${items.length}건 (${articleNos.join(', ')})`,
    );
  }

  console.log(`\n=== 더미 External Listing seed 완료 ===`);
  console.log(`  Groups: ${groupCount}건`);
  console.log(`  Listings: ${listingCount}건`);
}

main()
  .catch((e) => {
    console.error('Seed 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
