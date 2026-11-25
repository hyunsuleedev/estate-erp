import type {
  AdvertisementChangeAction,
  CreateAdvertisementChangeRequestDto,
  CreateAdvertisementChangeRequestsBatchDto,
  CreateListingAdvertisementDto,
  ListingAdvertisement,
  UpdateListingAdvertisementDto,
} from '@estate-erp/api-client';
import { naverCpChannels } from '../../../../lib/advertisement-channels';

export type AdListing = {
  id: string; transactionType: string; price: number | null; deposit: number | null;
  monthlyRent: number | null; activeAdvertisements?: ListingAdvertisement[];
};
export type AdTerms = { advertisedPrice: string; advertisedDeposit: string; advertisedMonthlyRent: string };
export type ManualAdDraft = AdTerms & {
  channel: string; cpAccountId: string; status: 'active' | 'ended'; startedAt: string; endedAt: string; url: string; memo: string;
};
export type AdRequestAction = AdvertisementChangeAction;
export const adRequestLabels: Record<AdRequestAction, string> = {
  publish: '신규 게재', update: '조건 변경', readvertise: '재광고', takedown: '광고 내리기',
};
export type AdRequestTarget = {
  listing: AdListing;
  advertisement?: ListingAdvertisement;
  channel: string;
  cpAccountId?: string | null;
  terms: AdTerms;
  floorExposure?: 'exact' | 'band' | '';
};
export const adTradeLabels: Record<string, string> = { sale: '매매', jeonse: '전세', monthly: '월세' };
const inputMoney = (value: number | null | undefined) => value == null ? '' : String(value);
export const dateInput = (value: string | null | undefined) => value?.slice(0, 10) ?? '';
export function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function initialAdTerms(listing: AdListing, advertisement?: ListingAdvertisement): AdTerms {
  // A missing observed amount must stay missing when editing an existing advertisement.
  if (listing.transactionType === 'sale') {
    return {
      advertisedPrice: inputMoney(advertisement ? advertisement.advertisedPrice : listing.price),
      advertisedDeposit: '',
      advertisedMonthlyRent: '',
    };
  }
  if (listing.transactionType === 'jeonse') {
    return {
      advertisedPrice: '',
      advertisedDeposit: inputMoney(
        advertisement
          ? (advertisement.advertisedDeposit ?? advertisement.advertisedPrice)
          : (listing.price ?? listing.deposit),
      ),
      advertisedMonthlyRent: '',
    };
  }
  return {
    advertisedPrice: '',
    advertisedDeposit: inputMoney(advertisement ? advertisement.advertisedDeposit : listing.deposit),
    advertisedMonthlyRent: inputMoney(advertisement ? advertisement.advertisedMonthlyRent : listing.monthlyRent),
  };
}
export function initialManualAdDraft(listing: AdListing, advertisement?: ListingAdvertisement): ManualAdDraft {
  const channel = ['esiljang', 'budongsanbank', ...naverCpChannels.map(option => option.value)].find(value =>
    !listing.activeAdvertisements?.some(ad => ad.channel === value)) ?? 'esiljang';
  return {
    ...initialAdTerms(listing, advertisement),
    channel: advertisement?.channel ?? channel,
    cpAccountId: advertisement?.cpAccountId ?? '',
    status: advertisement?.status ?? 'active',
    startedAt: advertisement ? dateInput(advertisement.startedAt) : todayInput(),
    endedAt: dateInput(advertisement?.endedAt),
    url: advertisement?.url ?? '',
    memo: advertisement?.memo ?? '',
  };
}
function money(value: string) {
  if (!value.trim()) return null;
  if (!/^\d+$/.test(value.trim()) || !Number.isSafeInteger(Number(value))) {
    throw new Error('금액은 0 이상의 만원 단위 정수로 입력해 주세요.');
  }
  return Number(value);
}
function termsPayload(terms: AdTerms, trade: string) {
  if (trade === 'sale') return { advertisedPrice: money(terms.advertisedPrice) };
  if (trade === 'jeonse') return { advertisedDeposit: money(terms.advertisedDeposit) };
  if (trade === 'monthly') return {
    advertisedDeposit: money(terms.advertisedDeposit), advertisedMonthlyRent: money(terms.advertisedMonthlyRent),
  };
  throw new Error('지원하지 않는 거래 유형입니다.');
}
function isoDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('올바른 날짜를 입력해 주세요.');
  }
  return date.toISOString();
}
export function assertNewAdChannel(listing: AdListing, channel: string, cpAccountId?: string | null) {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(channel)) throw new Error('광고 채널을 선택해 주세요.');
  if (listing.activeAdvertisements?.some(ad =>
    ad.channel === channel && (!cpAccountId || !ad.cpAccountId || ad.cpAccountId === cpAccountId))) {
    throw new Error('이 거래·채널에는 진행 중인 광고가 있습니다. 기존 광고를 선택해 변경해 주세요.');
  }
}
export function buildManualAdPayload(listing: AdListing, draft: ManualAdDraft, existing?: ListingAdvertisement): CreateListingAdvertisementDto | UpdateListingAdvertisementDto {
  const cpAccountId = draft.cpAccountId.trim() || null;
  // 같은 매물·채널·계정은 한 줄이라, 종료 기록으로 넣어도 게재 중인 광고를 종료시킨다 — 상태와 상관없이 막는다
  if (!existing) assertNewAdChannel(listing, draft.channel, cpAccountId);
  if (existing?.status === 'ended' && draft.status === 'active') throw new Error('종료된 광고는 새 광고로 등록해 주세요.');
  const url = draft.url.trim();
  if (url) {
    try { if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error(); }
    catch { throw new Error('원문 주소는 http:// 또는 https://로 입력해 주세요.'); }
  }
  const startedAt = isoDate(draft.startedAt);
  const endedAt = draft.status === 'ended' ? isoDate(draft.endedAt) : null;
  if (draft.status === 'ended' && !endedAt) throw new Error('광고 종료일을 입력해 주세요.');
  if (startedAt && endedAt && endedAt < startedAt) throw new Error('종료일은 등록일보다 빠를 수 없습니다.');
  const values: UpdateListingAdvertisementDto = {
    ...termsPayload(draft, listing.transactionType), status: draft.status, startedAt, endedAt,
    url: url || null, memo: draft.memo.trim() || null,
    ...(cpAccountId !== undefined ? { cpAccountId } : {}),
  };
  if (!existing) {
    return {
      ...termsPayload(draft, listing.transactionType),
      status: draft.status,
      startedAt,
      endedAt,
      url: url || null,
      memo: draft.memo.trim() || null,
      listingId: listing.id,
      channel: draft.channel,
      ...(cpAccountId ? { cpAccountId } : {}),
    };
  }
  // Only changed fields are sent: retain CP identifiers and timestamp precision.
  const patch: UpdateListingAdvertisementDto = {};
  for (const [key, value] of Object.entries(values)) {
    const field = key as keyof UpdateListingAdvertisementDto;
    const before = existing[field as keyof ListingAdvertisement];
    const unchanged = field === 'startedAt' || field === 'endedAt'
      ? dateInput(before as string | null) === dateInput(value as string | null)
      : (before ?? null) === (value ?? null);
    if (!unchanged) Object.assign(patch, { [field]: value });
  }
  if (!Object.keys(patch).length) throw new Error('변경한 내용이 없습니다.');
  return patch;
}

export function buildAdChangeRequestsBatch({
  title, notes, action, targets, assignedToId, dueDate,
}: {
  title?: string;
  notes: string;
  action: AdRequestAction;
  targets: AdRequestTarget[];
  assignedToId?: string | null;
  dueDate?: string | null;
}): CreateAdvertisementChangeRequestsBatchDto {
  if (!targets.length) throw new Error('요청할 광고를 선택해 주세요.');
  const items: CreateAdvertisementChangeRequestDto[] = targets.map(({ listing, advertisement: ad, channel, cpAccountId, terms, floorExposure }) => {
    const accountId = cpAccountId ?? ad?.cpAccountId ?? null;
    if (action === 'publish') assertNewAdChannel(listing, channel, accountId);
    else if (!ad) throw new Error('기존 광고를 선택해 주세요.');

    const targetValue: Record<string, unknown> = {};
    if (action !== 'takedown') {
      const amounts = termsPayload(terms, listing.transactionType);
      const requireAmounts = action === 'publish' || action === 'update';
      if (requireAmounts && (
        Object.values(amounts).some(value => value == null)
        || (listing.transactionType === 'sale' && !amounts.advertisedPrice)
        || (listing.transactionType === 'jeonse' && !amounts.advertisedDeposit)
        || (listing.transactionType === 'monthly' && !amounts.advertisedMonthlyRent)
      )) {
        throw new Error('요청할 가격을 입력해 주세요. 월세 보증금은 0원도 가능합니다.');
      }
      if (listing.transactionType === 'sale' && amounts.advertisedPrice != null) {
        targetValue.price = amounts.advertisedPrice;
      } else if (listing.transactionType === 'jeonse' && amounts.advertisedDeposit != null) {
        targetValue.deposit = amounts.advertisedDeposit;
      } else if (listing.transactionType === 'monthly') {
        if (amounts.advertisedDeposit != null) targetValue.deposit = amounts.advertisedDeposit;
        if (amounts.advertisedMonthlyRent != null) targetValue.monthlyRent = amounts.advertisedMonthlyRent;
      }
      if (floorExposure === 'exact' || floorExposure === 'band') {
        targetValue.floorExposure = floorExposure;
      }
      if (action === 'update' && Object.keys(targetValue).length === 0) {
        throw new Error('변경할 가격이나 층수 노출 조건을 입력해 주세요.');
      }
    }

    return {
      action,
      advertisementId: ad?.id ?? null,
      listingId: listing.id,
      channel,
      ...(accountId ? { cpAccountId: accountId } : {}),
      targetValue,
    };
  });

  return {
    items,
    ...(title?.trim() ? { title: title.trim() } : {}),
    memo: notes.trim() || null,
    assignedToId: assignedToId || null,
    dueDate: dueDate || null,
  };
}
