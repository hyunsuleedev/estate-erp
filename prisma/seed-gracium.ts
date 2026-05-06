/**
 * 고덕그라시움 데이터 import 스크립트
 *
 * 1. 법정동 마스터 seed (서울 > 강동구 > 고덕동)
 * 2. Site (고덕그라시움 단지)
 * 3. SiteUnitType (22개 평형)
 * 4. Dong (53개 동)
 * 5. Unit (~5,150개 호실)
 *
 * 실행: npx tsx prisma/seed-gracium.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface NaverPyeong {
  pyeongNo: number;
  supplyAreaDouble: number;
  supplyArea: string;
  pyeongName: string;
  pyeongName2: string;
  exclusiveArea: string;
  exclusivePyeong: string;
  grandPlanUrl?: string;
}

interface NaverDongOverview {
  dongNo: string;
  bildName: string;
  highFloor: number;
  lowFloor: number;
  sortNo: string;
}

interface NaverHo {
  hoNo?: string;
  hoName?: string;
  hoFloor: number;
  pyeongNo?: string;
  pyeongContent?: string;
  supplyArea?: string;
  totalArea?: string;
  pyeongClassString?: string;
  lineNo: string;
  pilotiYn: string;
  existHo: string;
  pyeongName?: string;
  pyeongNameDecimal?: string;
}

interface NaverFloor {
  floor: number;
  pyeongHoList: NaverHo[];
}

interface NaverDongDetail {
  dongName: string;
  pyeongtype: {
    dongNo: string;
    hoListOnFloor: NaverFloor[];
  };
}

interface NaverComplex {
  complexNo: string;
  complexName: string;
  overview: {
    complexTypeName: string;
    totalHouseHoldCount: number;
    totalDongCount: number;
    useApproveYmd: string;
    latitude: number;
    longitude: number;
    pyeongs: NaverPyeong[];
    dongs: NaverDongOverview[];
  };
  dongs: Record<string, NaverDongDetail>;
  complexDetail: {
    complex: {
      cortarNo: string;
      cortarAddress: string;
      roadAddress?: string;
    };
    areaList: NaverPyeong[];
  };
}

async function main() {
  const jsonPath = path.resolve(
    process.argv[2] ||
      path.join(
        process.env.HOME || '~',
        'Documents/naver-read/gracium_all.json',
      ),
  );
  console.log(`Loading: ${jsonPath}`);
  const data: NaverComplex = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

  const cortarNo = data.complexDetail.complex.cortarNo; // "1174010200"
  const wardCode = cortarNo; // "1174010200"

  // 법정동 마스터 존재 확인
  const ward = await prisma.ward.findUnique({ where: { code: wardCode } });
  if (!ward) {
    console.error(`Ward ${wardCode} 가 존재하지 않습니다. 먼저 seed-legal-dong.ts를 실행하세요.`);
    process.exit(1);
  }
  console.log(`1. 법정동 확인: ${data.complexDetail.complex.cortarAddress} (${wardCode})`);

  // ============================================================
  // 2. Site (고덕그라시움)
  // ============================================================
  console.log('2. Site 생성...');

  const builtYear = data.overview.useApproveYmd
    ? parseInt(data.overview.useApproveYmd.slice(0, 4))
    : null;

  // 네이버 단지코드로 기존 site 확인
  const existingSite = await prisma.site.findFirst({
    where: { naverComplexCode: data.complexNo },
  });

  const site = existingSite || await prisma.site.create({
    data: {
      officeId: null,
      isPublic: true,
      isLocked: true,
      type: 'apartment',
      name: data.complexName,
      wardCode: wardCode,
      lat: data.overview.latitude,
      lng: data.overview.longitude,
      roadAddress: data.complexDetail.complex.roadAddress ?? null,
      jibunAddress: data.complexDetail.complex.cortarAddress ?? null,
      naverComplexCode: data.complexNo,
      builtYear: builtYear,
      totalUnits: data.overview.totalHouseHoldCount,
      totalDongs: data.overview.totalDongCount,
    },
  });

  console.log(`   Site: ${site.name} (id: ${site.id})${existingSite ? ' (기존)' : ''}`);

  // ============================================================
  // 3. SiteUnitType (평형 카탈로그)
  // ============================================================
  console.log('3. SiteUnitType 생성...');

  const pyeongs = data.overview.pyeongs;
  const pyeongNoToTypeId: Record<string, string> = {};

  for (const p of pyeongs) {
    // pyeongName에서 nameType 추출: "82A" → "A", "172" → null
    const nameMatch = p.pyeongName.match(/^(\d+)([A-Z])?$/);
    const nameType = nameMatch?.[2] || null;

    const sut = await prisma.siteUnitType.upsert({
      where: {
        siteId_name: { siteId: site.id, name: p.pyeongName },
      },
      update: {},
      create: {
        officeId: null,
        siteId: site.id,
        name: p.pyeongName,
        nameType: nameType,
        exclusiveAreaM2: parseFloat(p.exclusiveArea),
        supplyAreaM2: p.supplyAreaDouble,
        naverPyeongNo: String(p.pyeongNo),
        floorPlanUrls: p.grandPlanUrl ? [p.grandPlanUrl] : undefined,
      },
    });

    pyeongNoToTypeId[String(p.pyeongNo)] = sut.id;
  }

  console.log(`   ${pyeongs.length}개 평형 생성 완료`);

  // ============================================================
  // 4. Dong (동)
  // ============================================================
  console.log('4. Dong 생성...');

  const dongNameToId: Record<string, string> = {};

  for (const dongOverview of data.overview.dongs) {
    const dong = await prisma.dong.create({
      data: {
        officeId: null,
        siteId: site.id,
        name: `${dongOverview.bildName}동`,
      },
    });
    dongNameToId[dongOverview.bildName] = dong.id;
  }

  console.log(`   ${data.overview.dongs.length}개 동 생성 완료`);

  // ============================================================
  // 5. Unit (호실)
  // ============================================================
  console.log('5. Unit 생성...');

  let unitCount = 0;
  const batchSize = 500;
  let unitBatch: Array<{
    officeId: string | null;
    siteId: string;
    dongId: string;
    siteUnitTypeId: string | null;
    name: string;
    floor: number | null;
    lineNo: number | null;
    isPiloti: boolean;
    cellType: string;
  }> = [];

  for (const [dongName, dongDetail] of Object.entries(data.dongs)) {
    const dongId = dongNameToId[dongName];
    if (!dongId) {
      console.warn(`   Warning: Dong "${dongName}" not found, skipping`);
      continue;
    }

    const floors = dongDetail.pyeongtype?.hoListOnFloor || [];

    for (const floorData of floors) {
      for (const ho of floorData.pyeongHoList) {
        if (ho.existHo !== 'Y') continue;

        const siteUnitTypeId = ho.pyeongNo
          ? pyeongNoToTypeId[ho.pyeongNo] || null
          : null;

        unitBatch.push({
          officeId: null,
          siteId: site.id,
          dongId: dongId,
          siteUnitTypeId: siteUnitTypeId,
          name: ho.hoName || `${floorData.floor}${ho.lineNo.padStart(2, '0')}`,
          floor: ho.hoFloor,
          lineNo: parseInt(ho.lineNo),
          isPiloti: ho.pilotiYn === 'Y',
          cellType: ho.pilotiYn === 'Y' ? 'piloti' : 'unit',
        });

        if (unitBatch.length >= batchSize) {
          await prisma.unit.createMany({ data: unitBatch });
          unitCount += unitBatch.length;
          unitBatch = [];
          process.stdout.write(`   ${unitCount}개 처리 중...\r`);
        }
      }
    }
  }

  // 남은 배치 처리
  if (unitBatch.length > 0) {
    await prisma.unit.createMany({ data: unitBatch });
    unitCount += unitBatch.length;
  }

  console.log(`   ${unitCount}개 호실 생성 완료`);

  // ============================================================
  // 결과 요약
  // ============================================================
  console.log('\n=== Import 완료 ===');
  console.log(`Site: ${site.name} (${site.id})`);
  console.log(`  네이버 단지코드: ${data.complexNo}`);
  console.log(`  법정동: 서울특별시 강동구 고덕동 (${wardCode})`);
  console.log(`  준공년도: ${builtYear}`);
  console.log(`  평형: ${pyeongs.length}개`);
  console.log(`  동: ${Object.keys(dongNameToId).length}개`);
  console.log(`  호실: ${unitCount}개`);
}

main()
  .catch((e) => {
    console.error('Import 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
