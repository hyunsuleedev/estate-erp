import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * 거래 조건(Listing) 하나를 트랜잭션 안에서 지운다. 조건 하나를 지울 때(ListingsService.remove)와
 * 의뢰를 통째로 지울 때(ListingIntakesService.remove)가 같은 규칙을 쓴다.
 *
 * 매칭·거래·공동중개망 공유가 걸린 조건은 지우지 않는다 — 그 기록이 가리킬 곳을 잃기 때문이다.
 * 가격 이력은 함께 지운다(가격 이력은 조건 없이 남을 수 없다).
 */
export async function deleteListingInTransaction(
  tx: Prisma.TransactionClient,
  officeId: string,
  id: string,
) {
  // 줄을 잠그고 그 뒤에 검사한다. 검사와 삭제 사이에 거래·매칭이 생기면 FK(SET NULL)로
  // 매물 연결이 조용히 끊기기 때문이다. 잠근 동안 다른 요청의 거래 만들기는 기다렸다가 실패한다.
  await tx.$executeRaw`SELECT id FROM listings WHERE id = ${id}::uuid AND office_id = ${officeId}::uuid FOR UPDATE`;
  const found = await tx.listing.findFirst({
    where: { id, officeId },
    select: {
      id: true,
      propertyId: true,
      intakeId: true,
      intake: { select: { projectId: true } },
      _count: {
        select: { matches: true, deals: true, networkSharedProperties: true },
      },
    },
  });

  if (!found) {
    throw new NotFoundException('거래 조건을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.');
  }
  if (found._count.deals > 0) {
    throw new ConflictException(
      '거래가 연결된 거래 조건은 지울 수 없습니다. 매물을 종료로 바꿔 주세요.',
    );
  }
  if (found._count.matches > 0) {
    throw new ConflictException(
      '매칭된 손님이 있는 거래 조건은 지울 수 없습니다. 매칭을 먼저 정리하거나 매물을 종료로 바꿔 주세요.',
    );
  }
  if (found._count.networkSharedProperties > 0) {
    throw new ConflictException(
      '공동중개망에 공유한 거래 조건은 지울 수 없습니다. 공유를 먼저 내려 주세요.',
    );
  }

  await tx.priceHistory.deleteMany({ where: { officeId, listingId: id } });
  const removed = await tx.listing.delete({ where: { id } });
  return { found, removed };
}
