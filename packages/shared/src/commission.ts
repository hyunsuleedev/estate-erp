// ============================================================
// 법정 중개보수 (2025년 기준 공인중개사법 시행규칙 상한)
// ============================================================
//
// 주의: 15억 이상 매매(주택)는 "협의 구간" (요율 상한이 법으로 정해지지 않음).
// 여기선 관행상 사용되는 0.7% 를 기본으로 두되, 사용자가 수동 편집 가능.
//
// 물건유형 (propertyKind):
//   - housing:     주택 (아파트/빌라/단독/다가구) — 거래유형·금액 구간별 요율표
//   - officetel:   주거용 오피스텔 (전용 85㎡ 이하, 부엌·화장실 구비)
//                  — 매매·교환 0.5%, 임대차 0.4%. 구간/상한액 없음.
//   - non_housing: 토지·상가·업무용 오피스텔 등 주택 외
//                  — 모든 거래 0.9% 이내 협의 (상한 0.9%).
//
// 기준 금액 (baseAmount):
//   - 매매/교환:      매매가
//   - 전세:           전세 보증금
//   - 월세:           보증금 + 월세 × 100  (단 이 값이 5천만 미만이면 보증금 + 월세 × 70)
//   - 연세:           보증금 + (연세액/12) × 100  (5천만 미만이면 ×70 동일 적용)
//
// 요율은 한쪽 (매도측 또는 매수측) 에 적용됨. 즉 반대편에 동일 요율로 또 청구됨.

export type CommissionTransactionType =
  | 'sale'
  | 'jeonse'
  | 'monthly'
  | 'yearly_rent';

/** 법정 중개보수 물건유형 */
export type CommissionPropertyKind = 'housing' | 'officetel' | 'non_housing';

/**
 * Site.type → 법정 중개보수 물건유형 매핑.
 *
 * 주의: officetel 은 "주거용 오피스텔 (전용 85㎡ 이하, 부엌·화장실 구비)" 요율을
 * 적용한다. Site.type 만으로는 주거용/업무용 구분이 불가능하므로, 업무용 오피스텔은
 * 사용자가 수동으로 non_housing(0.9% 협의) 요율로 편집해야 한다.
 */
export function siteTypeToCommissionKind(
  siteType: string,
): CommissionPropertyKind {
  switch (siteType) {
    case 'officetel':
      return 'officetel';
    case 'commercial':
    case 'land':
      return 'non_housing';
    case 'apartment':
    case 'villa':
    case 'house':
    case 'living_accommodation':
    default:
      return 'housing';
  }
}

/**
 * 거래 유형과 합의 가격으로 요율 계산 기준 금액 (baseAmount) 을 산출한다.
 *
 * yearly_rent(연세) 는 `agreedPrice` 를 연세액(1년치 임대료 총액, 만원)으로 사용한다.
 * (Deal.agreedPrice = "이 거래의 총액" 단일 진실 — 연세 거래에선 연간 임대료)
 */
export function calculateCommissionBase(
  transactionType: CommissionTransactionType,
  params: {
    agreedPrice?: number | null;
    agreedDeposit?: number | null;
    agreedMonthlyRent?: number | null;
  },
): number {
  if (transactionType === 'sale') return params.agreedPrice ?? 0;
  if (transactionType === 'jeonse') return params.agreedPrice ?? 0;

  const deposit = params.agreedDeposit ?? 0;

  // 월 환산 임대료: 월세는 그대로, 연세는 연세액 ÷ 12
  const monthlyEquivalent =
    transactionType === 'yearly_rent'
      ? (params.agreedPrice ?? 0) / 12
      : (params.agreedMonthlyRent ?? 0);

  const base100 = deposit + monthlyEquivalent * 100;
  // 환산가가 5천만 미만이면 곱수를 70 으로 낮춤 (국토부 계산식)
  if (base100 < 5000) return Math.round(deposit + monthlyEquivalent * 70);
  return Math.round(base100);
}

/**
 * 법정 상한 요율 (%) 과 해당 구간 상한액 (만원) 을 반환한다.
 * 반환된 rate 는 "한쪽에 적용하는" 요율. 합계는 양쪽 × 2 가 아니라 각 청구에 동일 요율 적용.
 *
 * @param propertyKind 물건유형 (기본 'housing' — 하위호환)
 */
export function getLegalMaxRate(
  transactionType: CommissionTransactionType,
  baseAmount: number,
  propertyKind: CommissionPropertyKind = 'housing',
): { rate: number; cap: number | null } {
  // 주택 외 (토지·상가·업무용 오피스텔 등): 모든 거래 0.9% 이내 협의
  if (propertyKind === 'non_housing') {
    return { rate: 0.9, cap: null };
  }

  // 주거용 오피스텔: 매매·교환 0.5%, 임대차 0.4%. 구간/상한액 없음.
  if (propertyKind === 'officetel') {
    if (transactionType === 'sale') return { rate: 0.5, cap: null };
    return { rate: 0.4, cap: null };
  }

  // 주택 (housing)
  if (transactionType === 'sale') {
    if (baseAmount < 5000) return { rate: 0.6, cap: 25 };     // 5천만 미만 — 상한 25만
    if (baseAmount < 20000) return { rate: 0.5, cap: 80 };    // 2억 미만 — 상한 80만
    if (baseAmount < 90000) return { rate: 0.4, cap: null };  // 9억 미만
    if (baseAmount < 120000) return { rate: 0.5, cap: null }; // 12억 미만
    if (baseAmount < 150000) return { rate: 0.6, cap: null }; // 15억 미만
    return { rate: 0.7, cap: null };                          // 15억 이상 (협의)
  }
  // jeonse / monthly / yearly_rent (임대차)
  if (baseAmount < 5000) return { rate: 0.5, cap: 20 };
  if (baseAmount < 10000) return { rate: 0.4, cap: 30 };
  if (baseAmount < 60000) return { rate: 0.3, cap: null };
  if (baseAmount < 120000) return { rate: 0.4, cap: null };
  return { rate: 0.6, cap: null };
}

/** 한쪽(seller 또는 buyer) 에 청구할 금액 = min(base × rate, cap). 만원 단위. */
export function calculateCommissionAmount(
  transactionType: CommissionTransactionType,
  baseAmount: number,
  propertyKind: CommissionPropertyKind = 'housing',
): { rate: number; amount: number } {
  const { rate, cap } = getLegalMaxRate(
    transactionType,
    baseAmount,
    propertyKind,
  );
  const raw = Math.round((baseAmount * rate) / 100);
  const amount = cap !== null ? Math.min(raw, cap) : raw;
  return { rate, amount };
}

/**
 * 수수료 요약 계산 유틸 (Deal 단위)
 *
 * Deal 본체엔 캐시 필드를 두지 않고 CommissionPayment + CommissionDistribution
 * 을 매번 집계해서 요약을 만든다. 서버는 조회 응답 DTO 에 붙여서 내려주고,
 * 클라이언트는 필요 시 목록 화면에서 로컬 재계산도 가능.
 *
 * 원칙:
 * - billed      = sum(expectedAmount)                      모든 청구의 확정 청구액 합
 * - ourShare    = sum(our_office distribution.shareAmount) 우리 사무소 몫
 * - partnerShare = sum(partner distribution.shareAmount)   파트너들 몫
 * - collected   = 우리 몫 중 실제 수금된 금액 — actualAmount × (our_office shareRatio / 100)
 *
 * collected 는 partial 인 경우에도 actualAmount 기반으로 비율 적용해야 정확.
 */

export type DistributionSummaryInput = {
  recipientType: 'our_office' | 'partner_broker' | string;
  shareRatio: number | string;
  shareAmount: number;
};

export type PaymentSummaryInput = {
  expectedAmount: number;
  actualAmount: number | null;
  status: string; // pending / partial / collected / overdue / waived / cancelled
  distributions?: DistributionSummaryInput[];
};

export interface DealCommissionSummary {
  billed: number;
  ourShare: number;
  partnerShare: number;
  collected: number;
}

const toNumber = (value: number | string): number =>
  typeof value === 'string' ? Number(value) : value;

export function computeDealCommissionSummary(
  payments: PaymentSummaryInput[],
): DealCommissionSummary {
  let billed = 0;
  let ourShare = 0;
  let partnerShare = 0;
  let collected = 0;

  for (const p of payments) {
    // waived/cancelled 는 요약 대상에서 제외
    if (p.status === 'waived' || p.status === 'cancelled') continue;

    billed += p.expectedAmount;

    const dists = p.distributions ?? [];

    // ourShare / partnerShare 는 확정 청구액 기준 (shareAmount 는 이미 캐시됨)
    for (const d of dists) {
      if (d.recipientType === 'our_office') ourShare += d.shareAmount;
      else partnerShare += d.shareAmount;
    }

    // collected 는 actualAmount × (our_office 비율) 로 계산
    // distribution 이 아직 없거나 우리 몫이 없는 청구는 0
    if (p.actualAmount != null && dists.length > 0) {
      const ourRatio = dists
        .filter((d) => d.recipientType === 'our_office')
        .reduce((s, d) => s + toNumber(d.shareRatio), 0);
      collected += Math.round((p.actualAmount * ourRatio) / 100);
    }
  }

  return { billed, ourShare, partnerShare, collected };
}
