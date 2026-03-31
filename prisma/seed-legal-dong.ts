/**
 * 법정동코드 전체 마스터 데이터 seed
 *
 * 데이터 소스: 행정안전부 법정동코드 (code.go.kr)
 * 파일: prisma/data/legal_dong_code.txt (EUC-KR → UTF-8 변환 후)
 *
 * 구조:
 *   Province (시도, 2자리): XX00000000 → 16개
 *   District (시군구, 5자리): XXXXX00000 → 268개
 *   Ward (읍면동리, 10자리): XXXXXXXXXX → ~20,276개
 *
 * 실행: npx tsx prisma/seed-legal-dong.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface LegalDongEntry {
  code: string;
  name: string;
  isActive: boolean;
}

function parseLegalDongFile(filePath: string): LegalDongEntry[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  // 헤더 스킵 (법정동코드\t법정동명\t폐지여부)
  return lines
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => {
      const [code, name, status] = line.split('\t');
      return {
        code: code.trim(),
        name: name.trim(),
        isActive: status.trim() === '존재',
      };
    });
}

async function main() {
  const dataPath = path.resolve(
    __dirname,
    'data/legal_dong_code.txt',
  );

  if (!fs.existsSync(dataPath)) {
    console.error(`파일을 찾을 수 없습니다: ${dataPath}`);
    console.error(
      '먼저 code.go.kr에서 법정동코드 전체자료를 다운로드하세요.',
    );
    process.exit(1);
  }

  console.log(`Loading: ${dataPath}`);
  const entries = parseLegalDongFile(dataPath);
  console.log(`총 ${entries.length}개 항목 로드`);

  // 존재하는 항목만 필터
  const activeEntries = entries.filter((e) => e.isActive);
  console.log(`존재(활성): ${activeEntries.length}개`);

  // ============================================================
  // 1. Province (시도) — 코드 형태: XX00000000
  // ============================================================
  const provinces = activeEntries.filter(
    (e) => e.code.substring(2) === '00000000',
  );

  // 세종특별자치시는 Province 레벨 항목이 없고 District(3611000000)부터 시작
  // Province "36"을 수동 추가
  const hasProvince36 = provinces.some(
    (p) => p.code.substring(0, 2) === '36',
  );
  if (!hasProvince36) {
    provinces.push({
      code: '3600000000',
      name: '세종특별자치시',
      isActive: true,
    });
  }

  console.log(`\n1. Province (시도): ${provinces.length}개`);

  for (const p of provinces) {
    const code = p.code.substring(0, 2); // "11"
    await prisma.province.upsert({
      where: { code },
      update: { name: p.name },
      create: { code, name: p.name },
    });
  }
  console.log('   완료');

  // ============================================================
  // 2. District (시군구) — 코드 형태: XXXXX00000 (앞5자리 중 뒤3자리 != 000)
  // ============================================================
  const districts = activeEntries.filter(
    (e) =>
      e.code.substring(5) === '00000' &&
      e.code.substring(2, 5) !== '000',
  );
  console.log(`\n2. District (시군구): ${districts.length}개`);

  // batch로 처리
  const districtBatch = districts.map((d) => {
    const code = d.code.substring(0, 5); // "11740"
    const provinceCode = d.code.substring(0, 2); // "11"
    // 법정동명에서 시군구명만 추출: "서울특별시 강동구" → "강동구"
    const nameParts = d.name.split(' ');
    const name = nameParts.slice(1).join(' '); // "강동구" 또는 "성남시 분당구"
    return { code, provinceCode, name };
  });

  // upsert 하나씩 (createMany는 upsert 미지원)
  for (const d of districtBatch) {
    await prisma.district.upsert({
      where: { code: d.code },
      update: { name: d.name },
      create: d,
    });
  }
  console.log('   완료');

  // ============================================================
  // 3. Ward (읍면동리) — 코드 형태: 뒤5자리 != 00000
  // ============================================================
  const wards = activeEntries.filter(
    (e) => e.code.substring(5) !== '00000',
  );
  console.log(`\n3. Ward (읍면동리): ${wards.length}개`);

  const batchSize = 500;
  let processed = 0;

  for (let i = 0; i < wards.length; i += batchSize) {
    const batch = wards.slice(i, i + batchSize);

    const createData = batch.map((w) => {
      const districtCode = w.code.substring(0, 5);
      // 법정동명에서 읍면동리명만 추출
      // "서울특별시 강동구 고덕동" → "고덕동"
      // "경기도 성남시 분당구 야탑동" → "야탑동"
      // "부산광역시 기장군 기장읍 동부리" → "기장읍 동부리"
      const nameParts = w.name.split(' ');
      // District가 "시군구" 또는 "시 구" 형태
      // District name에서 공백 개수 + 1(시도) = 스킵할 파트 수
      // 간단하게: districtCode로 district 찾아서 그 이름 길이만큼 스킵
      const districtEntry = districtBatch.find(
        (d) => d.code === districtCode,
      );
      const districtNamePartCount = districtEntry
        ? districtEntry.name.split(' ').length
        : 1;
      // 시도(1) + 시군구(districtNamePartCount) 이후 나머지가 ward명
      const wardNameParts = nameParts.slice(1 + districtNamePartCount);
      const name = wardNameParts.join(' ');

      return {
        code: w.code,
        districtCode,
        name: name || nameParts[nameParts.length - 1], // fallback
      };
    });

    await prisma.ward.createMany({
      data: createData,
      skipDuplicates: true,
    });

    processed += batch.length;
    process.stdout.write(
      `   ${processed}/${wards.length} 처리 중...\r`,
    );
  }

  console.log(`   ${processed}개 완료                `);

  // ============================================================
  // 결과 요약
  // ============================================================
  const [pCount, dCount, wCount] = await Promise.all([
    prisma.province.count(),
    prisma.district.count(),
    prisma.ward.count(),
  ]);

  console.log('\n=== 법정동 마스터 seed 완료 ===');
  console.log(`  Province (시도): ${pCount}개`);
  console.log(`  District (시군구): ${dCount}개`);
  console.log(`  Ward (읍면동리): ${wCount}개`);
  console.log(`  합계: ${pCount + dCount + wCount}개`);
}

main()
  .catch((e) => {
    console.error('Seed 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
