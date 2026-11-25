import { Prisma } from '@prisma/client';

/**
 * 사무소가 만드는 비공개 단지(Site)를 한 곳에서 만든다.
 *
 * 단지를 만드는 길이 둘이다 — 관리단지 화면의 직접 등록(`POST /office-sites/private-sites`)과
 * `POST /sites`. 예전에는 앞의 길만 동 구분 없는 동을 만들어, 뒤의 길로 만든 단독·다가구에는
 * 호를 등록할 수 없었다(2026-11-22 검토). 두 길 모두 이 함수를 쓴다.
 */

/**
 * 단일 동 건물은 placeholder Dong으로 Site → Dong → Unit 체인을 통일한다.
 * 토지는 Dong이 없고, 아파트는 동수를 모르면 사용자가 동을 직접 추가한다.
 * 단독·다가구도 placeholder Dong을 둔다: 건물 전체 매물은 여전히 Site → Property로 들어가지만,
 * 다가구의 201호처럼 호실을 나눌 때 매물 등록 화면에서 바로 호실을 만들 수 있어야 한다
 * (Dong이 없으면 "관리단지에서 건물을 먼저 등록하세요"로 막힌다).
 */
export function needsPlaceholderDong(
  type: string,
  totalDongs: number | null | undefined,
): boolean {
  if (type === 'land') return false;
  if (totalDongs !== undefined && totalDongs !== null) return totalDongs === 1;
  return type !== 'apartment';
}

/** 사무소가 정하는 칸만. 소유 사무소·공개 여부는 여기서 고정하므로 받지 않는다 */
export type PrivateSiteData = Omit<
  Prisma.SiteUncheckedCreateInput,
  'id' | 'officeId' | 'isPublic' | 'isLocked' | 'createdAt' | 'updatedAt'
>;

export async function createPrivateSiteRecord(
  tx: Prisma.TransactionClient,
  officeId: string,
  data: PrivateSiteData,
) {
  const site = await tx.site.create({
    data: {
      ...data,
      // 요청 값이 덮지 못하게 펼친 뒤에 둔다. 사무소가 만드는 단지는 언제나 비공개다
      officeId,
      isPublic: false,
      isLocked: false,
    },
  });

  if (needsPlaceholderDong(data.type, data.totalDongs)) {
    await tx.dong.create({
      data: { officeId, siteId: site.id, name: '-', isPlaceholder: true },
    });
  }

  return site;
}
