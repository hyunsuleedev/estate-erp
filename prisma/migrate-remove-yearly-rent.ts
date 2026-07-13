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
      await tx.proposal.updateMany({
        where: { listingId: row.id },
        data: { listingId: survivorId },
      });
      await tx.listingAdvertisement.updateMany({
        where: { listingId: row.id },
        data: { listingId: survivorId },
      });
      // AI 검토 초안(EntityDraft) 처리 — listingId 는 카드 컨텍스트 링크, entityId 가 실제 실행 대상.
      // 삭제될 매물을 실행 대상으로 하는 활성 초안은 전제(연세 매물)가 사라지므로 만료 처리한다.
      // 생존 매물로 재지정하면 연세 조건 기준으로 계산된 proposedChanges 가 월세 매물에
      // 오적용될 수 있어 재지정하지 않는다. (실행 완료/거부된 이력은 감사 보존을 위해 유지)
      // - 활성 상태 전체 커버: pending / processing(수정 요청 후 재제출 대기) / approved,
      //   그리고 executing 중 락이 소멸한 것(worker 사망)까지. 기존 결정 메모(승인 사유 등)는
      //   덮어쓰지 않고 뒤에 이어붙여 감사 기록을 보존한다.
      // 만료 + 재시도 소진을 **단일 UPDATE** 로 처리한다 — 두 문장으로 나누면 그 사이에
      // lease 회수(재큐잉)가 먼저 락을 잡아 executing→approved 로 빠져나간 행이
      // 뒤 문장의 WHERE(status='executing')에 걸리지 않는 경합 창이 생긴다.
      // 단일 문장에서는 행 락을 한 번만 잡고 SET 의 CASE 가 (락 획득 후 재평가된)
      // 같은 행 버전을 기준으로 동작하므로 어떤 인터리빙에도 틈이 없다:
      // - 활성 락 executing → 상태 유지(worker 미중단) + max_attempts=attempts 로 재시도 소진
      //   → 이후 lease 회수/재시도 게이트(attempts >= max_attempts)가 failed 로 종결
      // - 그 외 활성 상태(pending/processing/approved/락 소멸 executing) → expired
      //   (기존 결정 메모는 보존하고 마이그레이션 사유를 이어붙임)
      await tx.$executeRaw`
        UPDATE entity_drafts SET
          max_attempts = attempts,
          status = CASE
            WHEN status = 'executing' AND lock_expires_at IS NOT NULL AND lock_expires_at >= now()
              THEN status
            ELSE 'expired'
          END,
          decision_note = CASE
            WHEN status = 'executing' AND lock_expires_at IS NOT NULL AND lock_expires_at >= now()
              THEN decision_note
            ELSE TRIM(COALESCE(decision_note || E'\n', '')
              || '[연세 거래유형 폐기 마이그레이션] 대상 매물이 기존 월세 매물로 병합되어 자동 만료')
          END,
          claimed_at = CASE
            WHEN status = 'executing' AND lock_expires_at IS NOT NULL AND lock_expires_at >= now()
              THEN claimed_at ELSE NULL
          END,
          claimed_by = CASE
            WHEN status = 'executing' AND lock_expires_at IS NOT NULL AND lock_expires_at >= now()
              THEN claimed_by ELSE NULL
          END,
          lock_expires_at = CASE
            WHEN status = 'executing' AND lock_expires_at IS NOT NULL AND lock_expires_at >= now()
              THEN lock_expires_at ELSE NULL
          END
        WHERE entity_type = 'listing'
          AND entity_id = ${row.id}::uuid
          AND status IN ('pending', 'processing', 'approved', 'executing')`;
      const stillExecutingRows = await tx.entityDraft.count({
        where: { entityType: 'listing', entityId: row.id, status: 'executing' },
      });
      if (stillExecutingRows > 0) {
        console.warn(
          `  ⚠ 병합 매물 ${row.id} 을 실행 중인 초안 ${stillExecutingRows}건 — 재시도를 소진시켰으며 현재 실행이 끝나면 failed 로 종결됩니다.`,
        );
      }
      // 카드 컨텍스트 링크는 생존 매물로 재지정 (업무함에서 도메인 점프가 살아있도록)
      await tx.entityDraft.updateMany({
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
