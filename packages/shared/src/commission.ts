// ============================================================
// 법정 중개보수 (2025년 기준 국토교통부 상한)
// ============================================================
//
// 주의: 15억 이상 매매는 "협의 구간" (요율 상한이 법으로 정해지지 않음).
// 여기선 관행상 사용되는 0.7% 를 기본으로 두되, 사용자가 수동 편집 가능.
//
// 기준 금액 (baseAmount):
//   - 매매/교환:      매매가
//   - 전세:           전세 보증금
//   - 월세:           보증금 + 월세 × 100  (단 이 값이 5천만 미만이면 보증금 + 월세 × 70)
//
// 요율은 한쪽 (매도측 또는 매수측) 에 적용됨. 즉 반대편에 동일 요율로 또 청구됨.

export type CommissionTransactionType = 'sale' | 'jeonse' | 'monthly';

/** 거래 유형과 합의 가격으로 요율 계산 기준 금액 (baseAmount) 을 산출한다. */
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
  // 월세 환산
  const deposit = params.agreedDeposit ?? 0;
  const rent = params.agreedMonthlyRent ?? 0;
  const base100 = deposit + rent * 100;
  // 환산가가 5천만 미만이면 곱수를 70 으로 낮춤 (국토부 계산식)
  if (base100 < 5000) return deposit + rent * 70;
  return base100;
}

/**
 * 법정 상한 요율 (%) 과 해당 구간 상한액 (만원) 을 반환한다.
 * 반환된 rate 는 "한쪽에 적용하는" 요율. 합계는 양쪽 × 2 가 아니라 각 청구에 동일 요율 적용.
 */
export function getLegalMaxRate(
  transactionType: CommissionTransactionType,
  baseAmount: number,
): { rate: number; cap: number | null } {
  if (transactionType === 'sale') {
    if (baseAmount < 5000) return { rate: 0.6, cap: 25 };     // 5천만 미만 — 상한 25만
    if (baseAmount < 20000) return { rate: 0.5, cap: 80 };    // 2억 미만 — 상한 80만
    if (baseAmount < 90000) return { rate: 0.4, cap: null };  // 9억 미만
    if (baseAmount < 120000) return { rate: 0.5, cap: null }; // 12억 미만
    if (baseAmount < 150000) return { rate: 0.6, cap: null }; // 15억 미만
    return { rate: 0.7, cap: null };                          // 15억 이상 (협의)
  }
  // jeonse / monthly (임대차)
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
): { rate: number; amount: number } {
  const { rate, cap } = getLegalMaxRate(transactionType, baseAmount);
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
