import type { CreateListingAdvertisementDto, CreateTaskDto, ListingAdvertisement, UpdateListingAdvertisementDto } from '@estate-erp/api-client';
import { naverCpChannels } from '../../../../lib/advertisement-channels';

export type AdListing = {
  id: string; transactionType: string; price: number | null; deposit: number | null;
  monthlyRent: number | null; activeAdvertisements?: ListingAdvertisement[];
};
export type AdTerms = { advertisedPrice: string; advertisedDeposit: string; advertisedMonthlyRent: string };
export type ManualAdDraft = AdTerms & {
  channel: string; status: 'active' | 'ended'; startedAt: string; endedAt: string; url: string; memo: string;
};
export type AdRequestAction = 'create' | 'update' | 'republish' | 'end';
export const adRequestLabels: Record<AdRequestAction, string> = {
  create: '광고 등록', update: '광고 조건 변경', republish: '재광고', end: '광고 종료',
};
export type AdRequestTarget = {
  listing: AdListing; advertisement?: ListingAdvertisement; channel: string; terms: AdTerms;
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
  return {
    advertisedPrice: inputMoney(advertisement ? advertisement.advertisedPrice : listing.price),
    advertisedDeposit: inputMoney(advertisement ? advertisement.advertisedDeposit : listing.deposit),
    advertisedMonthlyRent: inputMoney(advertisement ? advertisement.advertisedMonthlyRent : listing.monthlyRent),
  };
}
export function initialManualAdDraft(listing: AdListing, advertisement?: ListingAdvertisement): ManualAdDraft {
  const channel = ['esiljang', 'budongsanbank', ...naverCpChannels.map(option => option.value)].find(value =>
    !listing.activeAdvertisements?.some(ad => ad.channel === value)) ?? 'esiljang';
  return {
    ...initialAdTerms(listing, advertisement), channel: advertisement?.channel ?? channel,
    status: advertisement?.status ?? 'active', startedAt: advertisement ? dateInput(advertisement.startedAt) : todayInput(),
    endedAt: dateInput(advertisement?.endedAt), url: advertisement?.url ?? '', memo: advertisement?.memo ?? '',
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
export function assertNewAdChannel(listing: AdListing, channel: string) {
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(channel)) throw new Error('광고 채널을 선택해 주세요.');
  if (listing.activeAdvertisements?.some(ad => ad.channel === channel)) {
    throw new Error('이 거래·채널에는 진행 중인 광고가 있습니다. 기존 광고를 선택해 변경해 주세요.');
  }
}
export function buildManualAdPayload(listing: AdListing, draft: ManualAdDraft, existing?: ListingAdvertisement): CreateListingAdvertisementDto | UpdateListingAdvertisementDto {
  if (!existing && draft.status === 'active') assertNewAdChannel(listing, draft.channel);
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
  };
  if (!existing) return { ...values, listingId: listing.id, channel: draft.channel, source: 'manual' };
  // Only changed fields are sent: retain CP provenance, identifiers and timestamp precision.
  const patch: UpdateListingAdvertisementDto = {};
  for (const [key, value] of Object.entries(values)) {
    const field = key as keyof UpdateListingAdvertisementDto;
    const before = existing[field as keyof ListingAdvertisement];
    const unchanged = field === 'startedAt' || field === 'endedAt'
      ? dateInput(before as string | null) === dateInput(value as string | null)
      : before === value;
    if (!unchanged) Object.assign(patch, { [field]: value });
  }
  if (!Object.keys(patch).length) throw new Error('변경한 내용이 없습니다.');
  return patch;
}
export function buildAdRequestTask({ title, notes, action, targets, location, propertyId, intakeId }: {
  title: string; notes: string; action: AdRequestAction; targets: AdRequestTarget[];
  location: string; propertyId: string; intakeId: string;
}): CreateTaskDto {
  if (!title.trim()) throw new Error('업무 제목을 입력해 주세요.');
  if (!targets.length) throw new Error('요청할 광고를 선택해 주세요.');
  const lines = targets.map(({ listing, advertisement: ad, channel, terms }) => {
    if (action === 'create') assertNewAdChannel(listing, channel);
    else if (!ad) throw new Error('기존 광고를 선택해 주세요.');
    const identifiers = [ad && `listingAdvertisementId=${ad.id}`, `listingId=${listing.id}`, `channel=${channel}`,
      ad?.externalAdId && `externalAdId=${ad.externalAdId}`, ad?.naverArticleNo && `naverArticleNo=${ad.naverArticleNo}`].filter(Boolean);
    let termsLine = '';
    if (action !== 'end') {
      const amounts = termsPayload(terms, listing.transactionType);
      if (Object.values(amounts).some(value => value == null)
        || (listing.transactionType === 'sale' && !amounts.advertisedPrice)
        || (listing.transactionType === 'jeonse' && !amounts.advertisedDeposit)
        || (listing.transactionType === 'monthly' && !amounts.advertisedMonthlyRent)) {
        throw new Error('요청할 가격을 입력해 주세요. 월세 보증금은 0원도 가능합니다.');
      }
      termsLine = listing.transactionType === 'monthly'
        ? `보증금=${amounts.advertisedDeposit}만원, 월세=${amounts.advertisedMonthlyRent}만원`
        : listing.transactionType === 'sale' ? `매매가=${amounts.advertisedPrice}만원` : `전세가=${amounts.advertisedDeposit}만원`;
    }
    return `- ${location} ${adTradeLabels[listing.transactionType] ?? listing.transactionType} (${identifiers.join(', ')})\n  요청작업: ${adRequestLabels[action]}${termsLine ? `\n  요청조건: ${termsLine}, 재광고=${action === 'republish' ? '요청' : '요청 안 함'}` : ''}`;
  });
  const listingIds = new Set(targets.map(target => target.listing.id));
  return {
    title: title.trim(), content: [notes.trim(), `요청: ${adRequestLabels[action]}`, '', '대상 광고', ...lines].filter((line, index) => index !== 0 || line).join('\n'),
    category: 'advertisement', source: 'manual', status: 'pending', priority: 'medium',
    propertyId, listingIntakeId: intakeId, listingId: listingIds.size === 1 ? targets[0].listing.id : undefined,
  };
}
