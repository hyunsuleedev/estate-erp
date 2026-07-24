/**
 * migrate-remove-yearly-rent.ts — 폐기된 거래유형 '연세(yearly_rent)' 데이터 정리.
 *
 * 제품 결정: 거래유형은 sale/jeonse/monthly 3종만 지원한다.
 * 변환 규칙: 연세(연간 임대료 일시납) → 월세. 연액 ÷ 12 를 월세로 환산하고
 * 보증금은 유지한다. 변환 이력은 memo 태그로 남긴다.
 *
 * 멱등: 재실행해도 안전 (yearly_rent 행이 없으면 아무것도 하지 않음).
 * 실행: 시드 파이프라인과 동일 방식 —
 *   로컬:  pnpm tsx prisma/migrate-remove-yearly-rent.ts
 *   운영:  ECS run-task (LOCAL_INFRA.md / 시드 파이프라인 가이드 참고)
 */
import { PrismaClient } from '@prisma/client';

const CONVERT_TAG = '[연세→월세 자동 전환]';
const prisma = new PrismaClient();

async function main() {
  await prisma.$transaction(async (tx) => {
    // 1. listings — @@unique [intakeId, transactionType] 충돌 방지.
    //    intake_id 는 NOT NULL 이므로 연결 해제가 불가 — 대신 충돌하는 연세 매물마다
    //    원본 intake 를 복제(클론)해 새 intake 로 옮긴 뒤 변환한다 (데이터 보존).
    //    충돌 = 같은 intake 에 monthly 매물이 이미 존재하는 경우.
    // intake_id 는 NOT NULL 이고, 의뢰(listing_intakes)는 (office_id, property_id)
    // unique 라 복제도 불가 — 도메인 규칙상 같은 의뢰에 월세 조건 2개는 불허이므로,
    // 충돌하는 연세 매물은 기존 monthly 매물로 **병합**한다:
    // 참조(FK)를 생존 매물로 재지정하고, 연세 조건을 memo 로 보존한 뒤 행을 삭제.
    const conflicted = await tx.listing.findMany({
      where: {
        transactionType: 'yearly_rent',
        intake: { listings: { some: { transactionType: 'monthly' } } },
      },
      select: {
        id: true,
        price: true,
        deposit: true,
        memo: true,
        privateMemo: true,
        intake: {
          select: {
            listings: {
              where: { transactionType: 'monthly' },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    let intakeConflicts = 0;
    for (const row of conflicted) {
      const survivorId = row.intake.listings[0]?.id;
      if (!survivorId) continue;

      // RESTRICT FK — 재지정 (unique 없는 테이블은 그대로 이동)
      await tx.match.updateMany({ where: { listingId: row.id }, data: { listingId: survivorId } });
      await tx.priceHistory.updateMany({
        where: { listingId: row.id },
        data: { listingId: survivorId },
      });
      // network_shared_properties 는 [roomId, listingId] unique — 생존 매물이 이미
      // 같은 방에 공유돼 있으면 이동 불가이므로 해당 공유만 제거
      const shares = await tx.networkSharedProperty.findMany({
        where: { listingId: row.id },
        select: { id: true, roomId: true },
      });
      for (const share of shares) {
        const dup = await tx.networkSharedProperty.findFirst({
          where: { roomId: share.roomId, listingId: survivorId },
          select: { id: true },
        });
        if (dup) {
          // 삭제 전 종속 재지정 — 문의는 RESTRICT(안 옮기면 전체 롤백),
          // 메시지 카드 링크는 SET NULL(안 옮기면 연결 유실)
          await tx.networkInquiry.updateMany({
            where: { sharedPropertyId: share.id },
            data: { sharedPropertyId: dup.id },
          });
          await tx.networkMessage.updateMany({
            where: { sharedPropertyId: share.id },
            data: { sharedPropertyId: dup.id },
          });
          await tx.networkSharedProperty.delete({ where: { id: share.id } });
        } else {
          await tx.networkSharedProperty.update({
            where: { id: share.id },
            data: { listingId: survivorId },
          });
        }
      }
      // SET NULL / CASCADE FK — 링크 유실 방지를 위해 명시적으로 재지정
      await tx.deal.updateMany({ where: { listingId: row.id }, data: { listingId: survivorId } });
      await tx.consultation.updateMany({
        where: { listingId: row.id },
        data: { listingId: survivorId },
      });
      await tx.task.updateMany({ where: { listingId: row.id }, data: { listingId: survivorId } });
      await tx.calendarEvent.updateMany({
        where: { listingId: row.id },
        data: { listingId: survivorId },
      });
      await tx.listingAdvertisement.updateMany({
        where: { listingId: row.id },
        data: { listingId: survivorId },
      });

      // 연세 조건(공개 memo + 내부 privateMemo)을 생존 매물로 보존 후 삭제
      const survivor = await tx.listing.findUnique({
        where: { id: survivorId },
        select: { memo: true, privateMemo: true },
      });
      const legacyNote = `[연세 이력 통합: 보증금 ${row.deposit ?? '-'} / 연 ${row.price ?? '-'}만${
        row.memo ? ` — ${row.memo}` : ''
      }]`;
      const legacyPrivate = row.privateMemo ? `[연세 매물 내부메모] ${row.privateMemo}` : null;
      await tx.listing.update({
        where: { id: survivorId },
        data: {
          memo: [survivor?.memo, legacyNote].filter(Boolean).join(' '),
          ...(legacyPrivate
            ? { privateMemo: [survivor?.privateMemo, legacyPrivate].filter(Boolean).join(' ') }
            : {}),
        },
      });
      await tx.listing.delete({ where: { id: row.id } });
      intakeConflicts += 1;
    }

    const listings = await tx.$executeRaw`
      UPDATE listings SET
        monthly_rent = COALESCE(monthly_rent, ROUND(price / 12.0)),
        price = NULL,
        transaction_type = 'monthly',
        memo = TRIM(COALESCE(memo || ' ', '') || ${CONVERT_TAG})
      WHERE transaction_type = 'yearly_rent'`;

    // 2. deals — 합의 조건도 동일 환산
    const deals = await tx.$executeRaw`
      UPDATE deals SET
        agreed_monthly_rent = COALESCE(agreed_monthly_rent, ROUND(agreed_price / 12.0)),
        agreed_price = NULL,
        transaction_type = 'monthly',
        memo = TRIM(COALESCE(memo || ' ', '') || ${CONVERT_TAG})
      WHERE transaction_type = 'yearly_rent'`;

    // 3. contracts — 계약서 스냅샷 (totalPrice 는 NOT NULL 이라 유지, 월세만 환산)
    const contracts = await tx.$executeRaw`
      UPDATE contracts SET
        monthly_rent = COALESCE(monthly_rent, ROUND(total_price / 12.0)),
        transaction_type = 'monthly',
        memo = TRIM(COALESCE(memo || ' ', '') || ${CONVERT_TAG})
      WHERE transaction_type = 'yearly_rent'`;

    // 4. buyer_requirements — 희망 거래유형
    const buyerReqs = await tx.$executeRaw`
      UPDATE buyer_requirements SET transaction_type = 'monthly'
      WHERE transaction_type = 'yearly_rent'`;

    // 5. 템플릿 타게팅 배열에서 yearly_rent 제거.
    //    빈 배열은 "전체 유형 적용" 의미이므로, 연세 전용 템플릿(제거 후 빈 배열)은
    //    전역 적용으로 승격되지 않도록 먼저 비활성화한다.
    let deactivated = 0;
    let removed = 0;
    for (const table of [
      'contract_document_templates',
      'office_print_templates',
      'contract_clause_templates',
    ]) {
      deactivated += await tx.$executeRawUnsafe(`
        UPDATE ${table} SET is_active = false
        WHERE 'yearly_rent' = ANY(transaction_types)
          AND array_length(array_remove(transaction_types, 'yearly_rent'), 1) IS NULL`);
      removed += await tx.$executeRawUnsafe(`
        UPDATE ${table}
        SET transaction_types = array_remove(transaction_types, 'yearly_rent')
        WHERE 'yearly_rent' = ANY(transaction_types)`);
    }

    console.log('✅ yearly_rent 정리 완료');
    console.log(`  listings: 변환 ${listings}건 / 기존 월세로 병합 ${intakeConflicts}건`);
    console.log(`  deals: ${deals}건 / contracts: ${contracts}건 / buyer_requirements: ${buyerReqs}건`);
    console.log(`  템플릿: 배열 정리 ${removed}건 (연세 전용이라 비활성화 ${deactivated}건)`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
