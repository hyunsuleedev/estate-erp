import type { ListingAdvertisement, UpdateListingAdvertisementDto } from '@estate-erp/api-client';
import { isNaverCpChannel } from '../../../../lib/advertisement-channels';

export type AdEditableField = 'advertisedPrice' | 'advertisedDeposit' | 'advertisedMonthlyRent' | 'memo' | 'url' | 'startedAt' | 'status' | 'channel';

export function canChangeAdChannel(ad: ListingAdvertisement) {
  return ad.source === 'manual' && !ad.externalAdId && !ad.naverArticleNo && !ad.naverUrl && !ad.lastSyncedAt;
}

/** Patch only the edited advertisement field; never copy parent listing terms or CP metadata. */
export function buildAdvertisementCellPatch(
  ad: ListingAdvertisement, field: AdEditableField, value: unknown,
): UpdateListingAdvertisementDto {
  if (field === 'channel') {
    if (value === ad.channel) return {};
    if (!isNaverCpChannel(value)) throw new Error('광고 채널을 선택해 주세요.');
    if (!canChangeAdChannel(ad)) throw new Error('외부 광고와 연결된 채널은 변경할 수 없습니다.');
    return { channel: value };
  }
  if (field === 'status') {
    if (value !== 'active' && value !== 'ended') throw new Error('광고 상태를 확인해 주세요.');
    if (value === ad.status) return {};
    if (ad.status === 'ended') throw new Error('종료된 광고는 새 광고로 등록해 주세요.');
    return { status: value, endedAt: new Date().toISOString() };
  }
  let next: string | number | null;
  if (field.startsWith('advertised')) {
    next = value == null || value === '' ? null : Number(value);
    if (next !== null && (!Number.isSafeInteger(next) || Number(next) < 0)) {
      throw new Error('금액은 0 이상의 만원 단위 정수로 입력해 주세요.');
    }
  } else if (field === 'startedAt') {
    const date = String(value ?? '').trim();
    if (date === (ad.startedAt?.slice(0, 10) ?? '')) return {};
    const parsed = new Date(`${date}T00:00:00.000Z`);
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)) {
      throw new Error('올바른 날짜를 입력해 주세요.');
    }
    next = date ? parsed.toISOString() : null;
    if (next && ad.endedAt && next > ad.endedAt) throw new Error('등록일은 종료일보다 늦을 수 없습니다.');
  } else {
    next = String(value ?? '').trim() || null;
    if (field === 'url' && next) {
      try { if (!['http:', 'https:'].includes(new URL(next).protocol)) throw new Error(); }
      catch { throw new Error('원문 주소는 http:// 또는 https://로 입력해 주세요.'); }
    }
  }
  return next === ad[field] ? {} : { [field]: next };
}
