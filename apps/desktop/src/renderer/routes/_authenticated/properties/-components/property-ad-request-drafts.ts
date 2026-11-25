import { formatPrice } from '@estate-erp/shared';
import type {
  AdvertisementChangeRequest,
  CreateAdvertisementChangeRequestDto,
  CreateAdvertisementChangeRequestsBatchDto,
  ListingAdvertisement,
} from '@estate-erp/api-client';
import {
  getAdChannelLabel,
  naverCpChannels,
} from '../../../../lib/advertisement-channels';
import {
  adTradeLabels,
  assertNewAdChannel,
  type AdListing,
} from './property-ad-actions-state';

export type PropertyAdPanelMode = null | 'edit' | 'request';

/** 기존 광고 1건에 대해 표 안에서 작성 중인 변경 요청 초안 */
export type PropertyAdRequestDraft = {
  /** 매매가 또는 보증금 (만원) */
  primary?: number;
  monthlyRent?: number;
  readvertise?: true;
  takedown?: true;
};

export type PropertyAdRequestDrafts = Readonly<Record<string, PropertyAdRequestDraft>>;

/** 아직 광고가 없는 채널에 대해 표 아래에 추가한 신규 게재 요청 초안 */
export type PropertyAdPublishDraft = {
  tempId: string;
  listingId: string;
  channel: string;
  cpAccountId: string | null;
  primary: number | null;
  monthlyRent: number | null;
};

const OPEN_REQUEST_STATUSES = new Set(['requested', 'in_progress', 'executed']);

export const REQUEST_STATUS_LABELS: Record<string, string> = {
  requested: '요청됨',
  in_progress: '처리 중',
  executed: '실행됨',
};

export function isPropertyAdDraftEmpty(draft?: PropertyAdRequestDraft): boolean {
  if (!draft) return true;
  return (
    draft.primary === undefined &&
    draft.monthlyRent === undefined &&
    !draft.readvertise &&
    !draft.takedown
  );
}

export function countPropertyAdDrafts(
  drafts: PropertyAdRequestDrafts,
  publishDrafts: readonly PropertyAdPublishDraft[],
): number {
  const existingCount = Object.values(drafts).filter(
    (draft) => !isPropertyAdDraftEmpty(draft),
  ).length;
  return existingCount + publishDrafts.length;
}

export function currentPropertyAdAmount(
  listing: Pick<AdListing, 'transactionType'>,
  advertisement: Pick<
    ListingAdvertisement,
    'advertisedPrice' | 'advertisedDeposit' | 'advertisedMonthlyRent'
  >,
  field: 'primary' | 'monthlyRent',
): number | null {
  if (field === 'monthlyRent') {
    return advertisement.advertisedMonthlyRent ?? null;
  }
  if (listing.transactionType === 'sale') {
    return advertisement.advertisedPrice ?? null;
  }
  if (listing.transactionType === 'jeonse') {
    return advertisement.advertisedDeposit ?? advertisement.advertisedPrice ?? null;
  }
  return advertisement.advertisedDeposit ?? null;
}

export function setPropertyAdDraftAmount(
  drafts: PropertyAdRequestDrafts,
  listing: Pick<AdListing, 'transactionType'>,
  advertisement: Pick<
    ListingAdvertisement,
    'id' | 'advertisedPrice' | 'advertisedDeposit' | 'advertisedMonthlyRent'
  >,
  field: 'primary' | 'monthlyRent',
  nextValue: number | null,
): PropertyAdRequestDrafts {
  const current = drafts[advertisement.id] ?? {};
  const next: PropertyAdRequestDraft = { ...current };
  const baseValue = currentPropertyAdAmount(listing, advertisement, field);

  if (nextValue === null || nextValue === baseValue) {
    delete next[field];
  } else {
    next[field] = nextValue;
    delete next.takedown;
  }

  const updated = { ...drafts };
  if (isPropertyAdDraftEmpty(next)) {
    delete updated[advertisement.id];
  } else {
    updated[advertisement.id] = next;
  }
  return updated;
}

export function togglePropertyAdDraftFlag(
  drafts: PropertyAdRequestDrafts,
  advertisementId: string,
  flag: 'readvertise' | 'takedown',
): PropertyAdRequestDrafts {
  const current = drafts[advertisementId] ?? {};
  const wasActive = Boolean(current[flag]);
  const next: PropertyAdRequestDraft = { ...current };

  if (wasActive) {
    delete next[flag];
  } else if (flag === 'takedown') {
    delete next.primary;
    delete next.monthlyRent;
    delete next.readvertise;
    next.takedown = true;
  } else {
    delete next.takedown;
    next.readvertise = true;
  }

  const updated = { ...drafts };
  if (isPropertyAdDraftEmpty(next)) {
    delete updated[advertisementId];
  } else {
    updated[advertisementId] = next;
  }
  return updated;
}

export function getOpenPropertyAdRequest(
  advertisement: Pick<ListingAdvertisement, 'changeRequests'>,
): AdvertisementChangeRequest | null {
  const list = advertisement.changeRequests ?? [];
  return (
    list.find((request) => OPEN_REQUEST_STATUSES.has(request.status)) ?? null
  );
}

function finiteNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

export function requestedAmountForPropertyAd(
  listing: Pick<AdListing, 'transactionType'>,
  advertisement: Pick<ListingAdvertisement, 'changeRequests'>,
  draft: PropertyAdRequestDraft | undefined,
  field: 'primary' | 'monthlyRent',
): { kind: 'draft' | 'pending'; value: number; status?: string } | null {
  const draftValue = draft?.[field];
  if (draftValue !== undefined) {
    return { kind: 'draft', value: draftValue };
  }
  const pending = getOpenPropertyAdRequest(advertisement);
  if (!pending || pending.action === 'takedown') return null;
  const target = pending.targetValue ?? {};
  if (field === 'monthlyRent') {
    const rent = finiteNumberOrNull(target.monthlyRent);
    return rent !== null
      ? { kind: 'pending', value: rent, status: pending.status }
      : null;
  }
  const primary =
    listing.transactionType === 'sale'
      ? finiteNumberOrNull(target.price)
      : finiteNumberOrNull(target.deposit ?? target.price);
  return primary !== null
    ? { kind: 'pending', value: primary, status: pending.status }
    : null;
}

export function requestedActionForPropertyAd(
  advertisement: Pick<ListingAdvertisement, 'changeRequests'>,
  draft: PropertyAdRequestDraft | undefined,
): {
  kind: 'draft' | 'pending';
  action: 'readvertise' | 'takedown';
  status?: string;
} | null {
  if (draft?.takedown) return { kind: 'draft', action: 'takedown' };
  if (draft?.readvertise) return { kind: 'draft', action: 'readvertise' };
  const pending = getOpenPropertyAdRequest(advertisement);
  if (!pending) return null;
  if (pending.action === 'readvertise' || pending.action === 'takedown') {
    return {
      kind: 'pending',
      action: pending.action,
      status: pending.status,
    };
  }
  return null;
}

export function defaultPublishAmounts(
  listing: Pick<AdListing, 'transactionType' | 'price' | 'deposit' | 'monthlyRent'>,
): { primary: number | null; monthlyRent: number | null } {
  if (listing.transactionType === 'sale') {
    return { primary: listing.price ?? null, monthlyRent: null };
  }
  if (listing.transactionType === 'jeonse') {
    return {
      primary: listing.price ?? listing.deposit ?? null,
      monthlyRent: null,
    };
  }
  return {
    primary: listing.deposit ?? null,
    monthlyRent: listing.monthlyRent ?? null,
  };
}

let publishSequence = 0;

export function createInitialPublishDraft(
  listings: readonly AdListing[],
  existingPublishDrafts: readonly PropertyAdPublishDraft[],
): PropertyAdPublishDraft {
  const listing = listings[0];
  const candidateChannels = [
    'esiljang',
    'budongsanbank',
    ...naverCpChannels.map((item) => item.value),
  ];
  const usedChannels = new Set([
    ...(listing?.activeAdvertisements?.map((ad) => ad.channel) ?? []),
    ...existingPublishDrafts
      .filter((draft) => draft.listingId === listing?.id)
      .map((draft) => draft.channel),
  ]);
  const channel =
    candidateChannels.find((value) => !usedChannels.has(value)) ?? 'esiljang';
  const amounts = listing
    ? defaultPublishAmounts(listing)
    : { primary: null, monthlyRent: null };
  publishSequence += 1;

  return {
    tempId: `pub-${publishSequence}-${Math.random().toString(36).slice(2, 7)}`,
    listingId: listing?.id ?? '',
    channel,
    cpAccountId: null,
    primary: amounts.primary,
    monthlyRent: amounts.monthlyRent,
  };
}

export function formatRequestPrice(manwon: number | null | undefined): string {
  if (manwon == null || !Number.isFinite(manwon)) return '—';
  return manwon === 0 ? '0원' : formatPrice(manwon);
}

export function summarizePropertyAdDraft(
  listing: Pick<AdListing, 'transactionType'>,
  advertisement: Pick<
    ListingAdvertisement,
    | 'channel'
    | 'advertisedPrice'
    | 'advertisedDeposit'
    | 'advertisedMonthlyRent'
  >,
  draft: PropertyAdRequestDraft,
): string {
  const trade = adTradeLabels[listing.transactionType] ?? listing.transactionType;
  const channel = getAdChannelLabel(advertisement.channel);
  const prefix = `${trade} · ${channel}`;

  if (draft.takedown) {
    return `${prefix}: 광고 내리기`;
  }

  const parts: string[] = [];
  if (draft.primary !== undefined) {
    const label =
      listing.transactionType === 'sale'
        ? '매매가'
        : listing.transactionType === 'jeonse'
          ? '전세가'
          : '보증금';
    const before = currentPropertyAdAmount(listing, advertisement, 'primary');
    parts.push(`${label} ${formatRequestPrice(before)} → ${formatRequestPrice(draft.primary)}`);
  }
  if (draft.monthlyRent !== undefined) {
    const before = currentPropertyAdAmount(
      listing,
      advertisement,
      'monthlyRent',
    );
    parts.push(
      `월세 ${formatRequestPrice(before)} → ${formatRequestPrice(draft.monthlyRent)}`,
    );
  }
  if (draft.readvertise) {
    parts.push('재광고');
  }
  return parts.length ? `${prefix}: ${parts.join(', ')}` : prefix;
}

export function summarizePublishDraft(
  listing: Pick<AdListing, 'transactionType'> | undefined,
  draft: PropertyAdPublishDraft,
): string {
  const trade = listing
    ? adTradeLabels[listing.transactionType] ?? listing.transactionType
    : '매물';
  const channel = getAdChannelLabel(draft.channel);
  if (!listing) return `${trade} · ${channel}: 신규 게재`;
  if (listing.transactionType === 'monthly') {
    return `${trade} · ${channel}: 신규 게재 ${formatRequestPrice(draft.primary)} / ${formatRequestPrice(draft.monthlyRent)}`;
  }
  return `${trade} · ${channel}: 신규 게재 ${formatRequestPrice(draft.primary)}`;
}

export function buildInlineAdChangeRequestsBatch({
  listings,
  drafts,
  publishDrafts,
  title,
  assignedToId,
  dueDate,
  memo,
}: {
  listings: readonly AdListing[];
  drafts: PropertyAdRequestDrafts;
  publishDrafts: readonly PropertyAdPublishDraft[];
  title?: string;
  assignedToId?: string | null;
  dueDate?: string | null;
  memo?: string | null;
}): CreateAdvertisementChangeRequestsBatchDto {
  const items: CreateAdvertisementChangeRequestDto[] = [];

  for (const listing of listings) {
    for (const advertisement of listing.activeAdvertisements ?? []) {
      const draft = drafts[advertisement.id];
      if (!draft || isPropertyAdDraftEmpty(draft)) continue;
      if (getOpenPropertyAdRequest(advertisement)) {
        throw new Error('이미 처리 중인 변경 요청이 있는 광고가 포함되어 있습니다.');
      }

      const base = {
        advertisementId: advertisement.id,
        listingId: listing.id,
        channel: advertisement.channel,
        ...(advertisement.cpAccountId
          ? { cpAccountId: advertisement.cpAccountId }
          : {}),
      };

      if (draft.takedown) {
        items.push({ ...base, action: 'takedown', targetValue: {} });
        continue;
      }

      const targetValue: Record<string, unknown> = {};
      if (draft.primary !== undefined) {
        if (!Number.isSafeInteger(draft.primary) || draft.primary < 0) {
          throw new Error('금액은 0 이상의 만원 단위 정수로 입력해 주세요.');
        }
        if (listing.transactionType === 'sale') {
          targetValue.price = draft.primary;
        } else {
          targetValue.deposit = draft.primary;
        }
      }
      if (draft.monthlyRent !== undefined) {
        if (!Number.isSafeInteger(draft.monthlyRent) || draft.monthlyRent < 0) {
          throw new Error('금액은 0 이상의 만원 단위 정수로 입력해 주세요.');
        }
        targetValue.monthlyRent = draft.monthlyRent;
      }

      if (draft.readvertise) {
        items.push({ ...base, action: 'readvertise', targetValue });
        continue;
      }

      if (!Object.keys(targetValue).length) continue;
      items.push({ ...base, action: 'update', targetValue });
    }
  }

  for (let index = 0; index < publishDrafts.length; index += 1) {
    const draft = publishDrafts[index];
    const listing = listings.find((item) => item.id === draft.listingId);
    if (!listing) throw new Error('신규 게재할 거래 조건을 찾을 수 없습니다.');

    assertNewAdChannel(listing, draft.channel, draft.cpAccountId);
    const hasDuplicatePublish = publishDrafts.slice(0, index).some(
      (earlier) =>
        earlier.listingId === draft.listingId &&
        earlier.channel === draft.channel &&
        (!earlier.cpAccountId ||
          !draft.cpAccountId ||
          earlier.cpAccountId === draft.cpAccountId),
    );
    if (hasDuplicatePublish) {
      throw new Error(
        '이 거래·채널에는 진행 중인 광고가 있습니다. 기존 광고를 선택해 변경해 주세요.',
      );
    }

    const targetValue: Record<string, unknown> = {};
    if (listing.transactionType === 'sale') {
      if (
        draft.primary == null ||
        !Number.isSafeInteger(draft.primary) ||
        draft.primary <= 0
      ) {
        throw new Error('요청할 가격을 입력해 주세요. 월세 보증금은 0원도 가능합니다.');
      }
      targetValue.price = draft.primary;
    } else if (listing.transactionType === 'jeonse') {
      if (
        draft.primary == null ||
        !Number.isSafeInteger(draft.primary) ||
        draft.primary <= 0
      ) {
        throw new Error('요청할 가격을 입력해 주세요. 월세 보증금은 0원도 가능합니다.');
      }
      targetValue.deposit = draft.primary;
    } else if (listing.transactionType === 'monthly') {
      if (
        draft.primary == null ||
        !Number.isSafeInteger(draft.primary) ||
        draft.primary < 0 ||
        draft.monthlyRent == null ||
        !Number.isSafeInteger(draft.monthlyRent) ||
        draft.monthlyRent <= 0
      ) {
        throw new Error('요청할 가격을 입력해 주세요. 월세 보증금은 0원도 가능합니다.');
      }
      targetValue.deposit = draft.primary;
      targetValue.monthlyRent = draft.monthlyRent;
    } else {
      throw new Error('지원하지 않는 거래 유형입니다.');
    }

    items.push({
      action: 'publish',
      advertisementId: null,
      listingId: listing.id,
      channel: draft.channel,
      ...(draft.cpAccountId ? { cpAccountId: draft.cpAccountId } : {}),
      targetValue,
    });
  }

  if (!items.length) {
    throw new Error('변경하거나 새로 요청할 내용을 입력해 주세요.');
  }

  return {
    items,
    ...(title?.trim() ? { title: title.trim() } : {}),
    memo: memo?.trim() || null,
    assignedToId: assignedToId || null,
    dueDate: dueDate || null,
  };
}
