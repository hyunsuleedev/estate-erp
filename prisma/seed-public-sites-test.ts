/**
 * 공용 단지 테스트 시드
 *
 * 목적:
 *   - 운영 RDS에 공용 Site(officeId=null, isPublic=true) 한 건을 idempotent 하게 등록한다.
 *   - MCP `search_central_sites` 가 외부 클라이언트(Claude Desktop/Claude.ai)에서 보이는지 확인.
 *   - 전체 단지 카탈로그(SiteUnitType / Dong / Unit) import는 별도 작업.
 *
 * 전제:
 *   - prisma/seed-legal-dong.ts 가 먼저 실행되어 Ward 1174010100 (강동구 고덕동) 존재
 *
 * 실행:
 *   pnpm --filter @estate-erp/server exec tsx ../../prisma/seed-public-sites-test.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PublicSiteSeed {
  name: string;
  wardCode: string;
  type: string;
  naverComplexCode?: string;
  kaptComplexCode?: string;
  roadAddress?: string;
  jibunAddress?: string;
  lat?: number;
  lng?: number;
  builtYear?: number;
  totalUnits?: number;
  totalDongs?: number;
}

const PUBLIC_SITES: PublicSiteSeed[] = [
  {
    name: '고덕그라시움',
    wardCode: '1174010200',
    type: 'apartment',
    naverComplexCode: '109208',
    roadAddress: '서울특별시 강동구 고덕로 333',
    jibunAddress: '서울특별시 강동구 고덕동 산215-3',
    lat: 37.55474,
    lng: 127.16107,
    builtYear: 2019,
    totalUnits: 4932,
    totalDongs: 53,
  },
];

async function main() {
  console.log('=== 공용 단지 테스트 시드 ===');

  for (const seed of PUBLIC_SITES) {
    const ward = await prisma.ward.findUnique({
      where: { code: seed.wardCode },
    });
    if (!ward) {
      console.error(
        `Ward ${seed.wardCode} 가 없습니다. seed-legal-dong.ts 를 먼저 실행하세요.`,
      );
      process.exit(1);
    }

    const existing = seed.naverComplexCode
      ? await prisma.site.findFirst({
          where: { naverComplexCode: seed.naverComplexCode, isPublic: true },
        })
      : await prisma.site.findFirst({
          where: { name: seed.name, wardCode: seed.wardCode, isPublic: true },
        });

    if (existing) {
      console.log(`  - ${seed.name}: 이미 등록됨 (${existing.id})`);
      continue;
    }

    const site = await prisma.site.create({
      data: {
        officeId: null,
        isPublic: true,
        isLocked: true,
        type: seed.type,
        name: seed.name,
        wardCode: seed.wardCode,
        naverComplexCode: seed.naverComplexCode,
        kaptComplexCode: seed.kaptComplexCode,
        roadAddress: seed.roadAddress,
        jibunAddress: seed.jibunAddress,
        lat: seed.lat,
        lng: seed.lng,
        builtYear: seed.builtYear,
        totalUnits: seed.totalUnits,
        totalDongs: seed.totalDongs,
      },
    });

    console.log(`  + ${seed.name}: 생성 (${site.id})`);
  }

  const publicCount = await prisma.site.count({
    where: { isPublic: true, officeId: null },
  });
  console.log(`\n현재 공용 Site 총 ${publicCount}개`);
}

main()
  .catch((e) => {
    console.error('Seed 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
