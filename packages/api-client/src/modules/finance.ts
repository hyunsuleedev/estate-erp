import type { RequestFn } from '../client.js';

export type CommissionPaymentStatus =
  | 'draft'
  | 'pending'
  | 'partial'
  | 'collected'
  | 'overdue'
  | 'waived'
  | 'cancelled';

export type CommissionClientSide = 'seller' | 'buyer';
export type CommissionCollectedBy = 'us' | 'partner';

export type TaxInvoiceStatus = 'none' | 'issued' | 'sent';
/**
 * 수금 원장이 쓰는 발행 기록 상태. TaxInvoiceStatus 에 현금영수증(cash_receipt)을 더했다.
 * none: 기록 없음 / issued·sent: 세금계산서 / cash_receipt: 현금영수증.
 * CommissionPayment.taxInvoiceStatus 에도 cash_receipt 가 올 수 있다(그 타입은 다른 화면 때문에 그대로 둔다).
 */
export type TaxDocStatus = TaxInvoiceStatus | 'cash_receipt';

export interface DistributionInput {
  recipientType: 'our_office' | 'partner_broker';
  partnerBrokerId?: string | null;
  shareRatio: number;
}

export interface CommissionDistribution {
  id: string;
  officeId: string;
  paymentId: string;
  recipientType: 'our_office' | 'partner_broker';
  partnerBrokerId: string | null;
  shareRatio: number;
  shareAmount: number;
  status: 'pending' | 'settled';
  settledAt: string | null;
  settlementMemo: string | null;
  partnerBroker?: { id: string; name: string } | null;
}

export interface CommissionAdjustment {
  id: string;
  officeId: string;
  paymentId: string;
  code: string | null;
  type: 'discount' | 'waive' | 'bad_debt';
  amount: number;
  reason: string;
  status: 'requested' | 'approved' | 'rejected';
  requestedById: string;
  requestedAt: string;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
}

export interface CommissionPayment {
  id: string;
  officeId: string;
  dealId: string;
  code: string | null;
  clientSide: CommissionClientSide;
  collectedByOffice: CommissionCollectedBy;
  payerContactId: string | null;
  baseAmount: number | null;
  rate: number | null;
  expectedAmount: number;
  actualAmount: number | null;
  dueDate: string | null;
  paidAt: string | null;
  agreedRemainingDate: string | null;
  status: CommissionPaymentStatus;
  method: string | null;
  taxInvoiceStatus: TaxInvoiceStatus;
  taxInvoiceNo: string | null;
  taxInvoiceDate: string | null;
  note: string | null;
  payerContact?: { id: string; name: string; phone: string | null };
  distributions?: CommissionDistribution[];
  adjustments?: CommissionAdjustment[];
}

export interface PartnerBrokerContact {
  id: string;
  officeId: string;
  partnerBrokerId: string;
  name: string;
  phone: string;
  normalizedPhone: string;
  role: string | null;
  isPrimary: boolean;
  memo: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerBroker {
  id: string;
  officeId: string;
  name: string;
  phone: string | null;
  ceoName: string | null;
  ceoPhone: string | null;
  licenseNo: string | null;
  email: string | null;
  address: string | null;
  memo: string | null;
  linkedOfficeId: string | null;
  dealCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  contacts?: PartnerBrokerContact[];
}

export interface CreatePartnerBrokerContactDto {
  name: string;
  phone: string;
  role?: string;
  isPrimary?: boolean;
  memo?: string;
}

export type UpdatePartnerBrokerContactDto = Partial<CreatePartnerBrokerContactDto>;

export interface CreatePartnerBrokerDto {
  name: string;
  phone?: string;
  ceoName?: string;
  ceoPhone?: string;
  licenseNo?: string;
  email?: string;
  address?: string;
  memo?: string;
  linkedOfficeId?: string;
}

export type UpdatePartnerBrokerDto = Partial<CreatePartnerBrokerDto> & {
  isActive?: boolean;
};

export interface PipelineDealPayment {
  id: string;
  side: string;
  expectedAmount: number;
  actualAmount: number | null;
  dueDate: string | null;
  paidAt: string | null;
  status: string;
  taxInvoiceStatus: string;
}

export interface PipelineDealParticipant {
  id: string;
  userName: string;
  role: string;
  side: string;
  commissionAmount: number | null;
  settlementStatus: string;
}

export interface PipelineDeal {
  id: string;
  stage: string;
  isCancelled: boolean;
  agreedPrice: number | null;
  siteName: string | null;
  dongName: string | null;
  unitName: string | null;
  transactionType: string;
  commissionTotal: number | null;
  buyerContactName: string | null;
  sellerContactName: string | null;
  /// 잔금 예정일 (DealPayment kind='balance' 의 scheduledDate)
  balanceDueDate: string | null;
  payments: PipelineDealPayment[];
  participants: PipelineDealParticipant[];
}

export interface PipelineBucket {
  count: number;
  amount: number;
}

export interface MonthlyTrend {
  month: string;
  /** 우리 통장에 들어온 돈 (만원, 부가세 별도) */
  collected: number;
  /** 그 수금 가운데 공동중개 상대에게 넘겨줄 몫 (만원). 보냈는지와 상관없이 우리 돈이 아니다. */
  partnerShare?: number;
}

// ============================================================
// 수금 원장 (Ledger)
// ============================================================

export interface LedgerPaymentDistribution {
  id: string;
  recipientType: 'our_office' | 'partner_broker' | string;
  partnerBrokerId: string | null;
  partnerBrokerName: string | null;
  shareRatio: number;
  shareAmount: number;
  status: string;
  /** 공동중개 상대와 이 몫을 주고받았다고 기록한 날 */
  settledAt: string | null;
  settlementMemo: string | null;
}

export interface LedgerReceipt {
  id: string;
  /** receipt: 들어온 돈 / refund: 돌려준 돈(금액 음수) */
  kind: 'receipt' | 'refund' | string;
  receivedAt: string;
  /** 원, 부가세 포함 */
  amountWon: number;
  /** 원, 부가세 뺀 금액 */
  supplyWon: number;
}

export interface LedgerCollection {
  id: string;
  /** receipt: 입금 / refund: 돌려줌(음수) / partner_share: 공동중개 상대가 받은 돈에서 받은 우리 몫 */
  kind: 'receipt' | 'refund' | 'partner_share';
  at: string;
  /** 원, 부가세 뺀 금액 */
  won: number;
}

export interface LedgerPayment {
  id: string;
  code: string | null;
  clientSide: 'seller' | 'buyer' | string;
  collectedByOffice: 'us' | 'partner' | string;
  baseAmount: number | null;
  rate: number | null;
  expectedAmount: number;
  actualAmount: number | null;
  dueDate: string | null;
  paidAt: string | null;
  agreedRemainingDate: string | null;
  status: CommissionPaymentStatus;
  method: string | null;
  note: string | null;
  taxInvoiceStatus: TaxDocStatus;
  taxInvoiceNo: string | null;
  taxInvoiceDate: string | null;
  /** 입금 기록 합계 (원, 부가세 포함, 돌려준 돈은 뺌) */
  receivedAmountWon: number;
  /** 위 금액에서 부가세를 뺀 값 (원). 청구액(만원 × 10,000)과 비교하는 기준. */
  receivedSupplyWon: number;
  /** 입금 기록 (취소한 것은 뺌, 오래된 것부터). 상대가 수금한 청구면 상대 통장에 들어온 돈이다. */
  receipts: LedgerReceipt[];
  /**
   * 우리 통장에 들어온 돈: 우리가 수금한 청구의 입금 기록 + 상대가 수금한 청구에서 받은 우리 몫('받음 기록').
   * 캐시플로우 수금·원장 수금 합계·캘린더 입금이 모두 이것으로 센다 (서버 loadOurCollections).
   */
  collections?: LedgerCollection[];
  /** 위 합계 (원, 부가세 뺀 금액). 원장 응답에는 늘 있다(다른 화면이 청구를 이 모양으로 만들 때를 위해 선택). */
  ourCollectedWon?: number;
  distributions: LedgerPaymentDistribution[];
  pendingAdjustments: number;
}

export interface LedgerDeal {
  id: string;
  transactionType: string;
  stage: string;
  stageChangedAt: string;
  isCancelled: boolean;
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
  balanceDueDate: string | null;
  siteName: string | null;
  dongName: string | null;
  unitName: string | null;
  /** "고덕그라시움 102동 2203호" (서버가 formatPlaceLabel 로 만든다) */
  placeLabel?: string | null;
  /** "102동 2203호" — 단지가 문맥에 있을 때 */
  placeShort?: string | null;
  buyerContactName: string | null;
  sellerContactName: string | null;
  partnerBroker: { id: string; name: string } | null;
  summary: {
    billed: number;
    ourShare: number;
    partnerShare: number;
    collected: number;
  };
  participants: Array<{ id: string; userName: string; role: string }>;
}

export interface LedgerDealGroup {
  deal: LedgerDeal;
  payments: LedgerPayment[];
}

export type LedgerPreset = 'upcoming' | 'this-month' | 'month' | 'all';

export interface LedgerView {
  /** 사무소에 확정된 청구가 하나라도 있는지 (기간과 상관없이). 빈 화면 안내를 나눈다. */
  hasAnyPayment: boolean;
  preset: LedgerPreset;
  period: string;
  periodLabel: string;
  summary: {
    paymentCount: number;
    billedTotal: number;
    average: number;
    collectedTotal: number;
    collectedCount: number;
    overdueCount: number;
    partialCount: number;
  };
  adjustmentsPending: Array<{
    id: string;
    code: string | null;
    type: string;
    /** 만원, 깎는 금액이라 음수 */
    amount: number;
    paymentId: string;
    paymentCode: string | null;
    dealId: string;
    reason: string;
    requestedByName: string | null;
    requestedAt: string;
  }>;
  groups: LedgerDealGroup[];
}

export interface CashflowSummary {
  collected: number;
  pending: number;
  overdue: number;
  expected: number;
  /** 그 달 수금 가운데 공동중개 상대에게 넘겨줄 몫 (만원) */
  partnerShare?: number;
  taxInvoicePending: number;
  pipeline: {
    preparing: PipelineBucket;
    contract: PipelineBucket;
    balanceWaiting: PipelineBucket;
    collected: PipelineBucket;
    overdue: PipelineBucket;
  };
  deals: PipelineDeal[];
  monthlyTrend: MonthlyTrend[];
}

/* ───────── 입금 기록과 직원 정산 (금액은 원 단위) ───────── */

export interface CommissionReceipt {
  id: string;
  paymentId: string;
  /** receipt: 들어온 돈(양수) / refund: 돌려준 돈(음수) */
  kind: 'receipt' | 'refund';
  receivedAt: string;
  /** 실제로 오간 금액 (원, 부가세 포함) */
  amountWon: number;
  /** 부가세를 뺀 금액 (원) */
  supplyWon: number;
  method: string | null;
  memo: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  /** 들어간 확정 정산. 없으면 아직 정산 전. */
  settlementId: string | null;
  createdAt: string;
}

export type SettlementTiming = 'closed' | 'received';
export type EmploymentType = 'freelancer' | 'employee';

export interface SettlementDetailItem {
  receiptId: string;
  /** partner_share: 공동중개 상대가 수금한 청구에서 받은 우리 몫 (금액은 부가세 별도로 본 값) */
  source?: 'partner_share';
  dealId: string;
  dealTitle: string;
  kind: 'receipt' | 'refund';
  receivedAt: string;
  amountWon: number;
  supplyWon: number;
  /** 이 청구에서 우리 사무소가 갖는 비율 (%) */
  ourRatio: number;
  /** 이 거래에서 이 직원이 맡은 비중 (%) */
  sharePercent: number;
  /** 직원 몫 (%) */
  ratio: number;
  shareWon: number;
}

export interface SettlementLine {
  /** 확정한 정산에만 있다 */
  lineId: string | null;
  userId: string;
  name: string;
  employmentType: EmploymentType;
  withholdTax: boolean;
  /** 직원 몫을 곱하기 전 금액 */
  targetWon: number;
  shareWon: number;
  /** 프리랜서의 기본급. 근로자는 0 (급여에서 나간다). */
  baseWon: number;
  /** 돌려준 돈 때문에 빼는 몫 (0 이하) */
  adjustWon: number;
  /** 지난 정산에서 넘어온 뺄 돈 */
  carryInWon: number;
  withholdingWon: number;
  /** 프리랜서: 이체할 금액 / 근로자: 세금 떼기 전 성과급 */
  netWon: number;
  /** 다음 달로 넘기는 뺄 돈 */
  carryOutWon: number;
  detail: SettlementDetailItem[];
  paidAt: string | null;
}

export interface SettlementWaitingItem {
  receiptId: string;
  /** partner_share: 공동중개 받은 몫 (금액은 부가세 별도로 본 값) */
  source?: 'partner_share';
  dealId: string;
  dealTitle: string;
  receivedAt: string;
  amountWon: number;
  /** balance: 잔금을 기다림 / participants: 담당 배분이 없음 / ratio: 직원 몫이 정해지지 않음 / cancelled: 취소한 거래 */
  reason: 'balance' | 'participants' | 'ratio' | 'cancelled';
}

export interface SettlementView {
  month: string;
  status: 'draft' | 'confirmed';
  timing: SettlementTiming;
  confirmedAt: string | null;
  lines: SettlementLine[];
  waiting: SettlementWaitingItem[];
  /** 취소한 거래의 입금 — 정산에 넣지 않음 (받은 날·취소한 날 가운데 늦은 날이 이 달인 것) */
  cancelledReceipts?: SettlementWaitingItem[];
  /** 확정할 수 없는 이유. 확정할 수 있으면 null. */
  blockedReason: string | null;
  canUnconfirm: boolean;
  /** 가장 최근에 확정한 달. 그 뒤에 들어갈 수 있게 된 입금은 이 다음 달 정산에 들어간다. */
  latestConfirmedMonth: string | null;
}


export interface MySettlementLine extends Omit<SettlementLine, 'userId' | 'name' | 'lineId'> {
  lineId: string;
  month: string;
  confirmedAt: string;
}

/** 확정 전 정산의 내 줄 (금액은 원) */
export type MySettlementPreviewLine = Omit<SettlementLine, 'userId' | 'name' | 'lineId' | 'paidAt'>;

export interface DealParticipantShare {
  userId: string;
  name: string;
  /** 이 거래에서 맡은 비중 (%). 한 거래의 합은 100. */
  sharePercent: number;
  /** 이 거래에서만 쓰는 직원 몫 (%). 없으면 직원의 기본 몫. */
  ratio: number | null;
  defaultRatio: number | null;
}

export function createFinanceApi(request: RequestFn) {
  return {
    /** 직원 정산. 조회·확정·지급은 대표만, mine 은 누구나 자기 것만. */
    settlements: {
      get: (month: string) => request<SettlementView>(`/finance/settlements/${month}`),
      confirm: (month: string) =>
        request<SettlementView>(`/finance/settlements/${month}/confirm`, { method: 'POST', body: {} }),
      unconfirm: (month: string) =>
        request<SettlementView>(`/finance/settlements/${month}/unconfirm`, { method: 'POST', body: {} }),
      markPaid: (lineId: string, paidAt?: string) =>
        request<SettlementView>(`/finance/settlements/lines/${lineId}/pay`, {
          method: 'POST',
          body: { paidAt },
        }),
      unmarkPaid: (lineId: string) =>
        request<SettlementView>(`/finance/settlements/lines/${lineId}/unpay`, { method: 'POST', body: {} }),
      mine: () => request<MySettlementLine[]>('/finance/settlements/mine'),
      /** 아직 확정하지 않은 다음 정산의 내 몫 (정산 화면과 같은 계산, 바뀔 수 있음). 내 줄이 없으면 line 은 null. */
      minePreview: () =>
        request<{ month: string; line: MySettlementPreviewLine | null }>('/finance/settlements/mine/preview'),
      getSettings: () => request<{ timing: SettlementTiming }>('/finance/settlements/settings'),
      updateSettings: (data: { timing: SettlementTiming }) =>
        request<{ timing: SettlementTiming }>('/finance/settlements/settings', {
          method: 'PATCH',
          body: data,
        }),
      getParticipants: (dealId: string) =>
        request<DealParticipantShare[]>(`/finance/settlements/deals/${dealId}/participants`),
      setParticipants: (
        dealId: string,
        items: Array<{ userId: string; sharePercent: number; ratio?: number | null }>,
      ) =>
        request<DealParticipantShare[]>(`/finance/settlements/deals/${dealId}/participants`, {
          method: 'PUT',
          body: { items },
        }),
    },

    commissionPayments: {
      list: (filter?: { status?: string }) =>
        request<CommissionPayment[]>('/finance/commission-payments', {
          params: filter as Record<string, string | undefined>,
        }),

      listByDeal: (dealId: string) =>
        request<CommissionPayment[]>(
          `/finance/commission-payments/deal/${dealId}`,
        ),

      collect: (
        id: string,
        data: {
          actualAmount: number;
          method: string;
          paidAt?: string;
          note?: string;
        },
      ) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/collect`,
          { method: 'POST', body: data },
        ),

      /** 이 청구의 입금 기록 (취소한 줄 포함) */
      listReceipts: (id: string) =>
        request<CommissionReceipt[]>(`/finance/commission-payments/${id}/receipts`),

      /**
       * 입금 한 건을 통장에 들어온 금액 그대로(원) 기록한다.
       * vat: included(기본, 부가세 포함해 받음) | none(부가세 없이 받음)
       */
      addReceipt: (
        id: string,
        data: {
          amountWon: number;
          receivedAt?: string;
          method?: string;
          memo?: string;
          vat?: 'included' | 'none';
        },
      ) =>
        request<CommissionPayment>(`/finance/commission-payments/${id}/receipts`, {
          method: 'POST',
          body: data,
        }),

      /** 돌려준 돈을 기록한다. 이미 정산한 돈이면 다음 정산에서 직원 몫이 빠진다. */
      refund: (id: string, data: { amountWon: number; refundedAt?: string; memo?: string }) =>
        request<CommissionPayment>(`/finance/commission-payments/${id}/refund`, {
          method: 'POST',
          body: data,
        }),

      /** 잘못 넣은 입금 기록을 취소한다. 정산에 들어간 줄은 취소할 수 없다. */
      voidReceipt: (receiptId: string, reason?: string) =>
        request<CommissionPayment>(
          `/finance/commission-payments/receipts/${receiptId}/void`,
          { method: 'POST', body: { reason } },
        ),

      waive: (id: string, note?: string) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/waive`,
          { method: 'POST', body: { note } },
        ),

      confirmDraft: (id: string, data?: { dueDate?: string }) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/confirm`,
          { method: 'POST', body: data ?? {} },
        ),

      /** 현금영수증·세금계산서를 발행했다고 기록한다 (kind 기본값은 세금계산서) */
      issueTaxInvoice: (
        id: string,
        data: {
          taxInvoiceNo: string;
          taxInvoiceDate?: string;
          kind?: 'tax_invoice' | 'cash_receipt';
        },
      ) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/tax-invoice`,
          { method: 'POST', body: data },
        ),

      /** 잘못 적은 현금영수증·세금계산서 기록을 지운다 */
      clearTaxInvoice: (id: string) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/tax-invoice/clear`,
          { method: 'POST', body: {} },
        ),

      /** 공동중개 상대와 이 몫을 주고받았다고 기록한다 (다 받은 청구만) */
      settleDistribution: (
        distributionId: string,
        data: { settledAt?: string; memo?: string } = {},
      ) =>
        request<CommissionDistribution>(
          `/finance/commission-payments/distributions/${distributionId}/settle`,
          { method: 'POST', body: data },
        ),

      unsettleDistribution: (distributionId: string) =>
        request<CommissionDistribution>(
          `/finance/commission-payments/distributions/${distributionId}/unsettle`,
          { method: 'POST', body: {} },
        ),

      replaceDistributions: (
        id: string,
        items: DistributionInput[],
      ) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/distributions`,
          { method: 'PATCH', body: { items } },
        ),

      applyDistributionsToDeal: (
        dealId: string,
        items: DistributionInput[],
      ) =>
        request<{
          updated: string[];
          skipped: Array<{ id: string; reason: string }>;
        }>(
          `/finance/commission-payments/deal/${dealId}/distributions`,
          { method: 'PATCH', body: { items } },
        ),
    },

    cashflow: {
      summary: (year?: number, month?: number) =>
        request<CashflowSummary>('/finance/cashflow', {
          params: {
            ...(year ? { year: String(year) } : {}),
            ...(month ? { month: String(month) } : {}),
          },
        }),
    },

    ledger: {
      get: (opts?: { preset?: LedgerPreset; year?: number; month?: number }) =>
        request<LedgerView>('/finance/ledger', {
          params: {
            ...(opts?.preset ? { preset: opts.preset } : {}),
            ...(opts?.year ? { year: String(opts.year) } : {}),
            ...(opts?.month ? { month: String(opts.month) } : {}),
          },
        }),
    },

    adjustments: {
      listPending: () =>
        request<CommissionAdjustment[]>(
          '/finance/commission-adjustments/pending',
        ),

      listByPayment: (paymentId: string) =>
        request<CommissionAdjustment[]>('/finance/commission-adjustments', {
          params: { paymentId },
        }),

      request: (data: {
        paymentId: string;
        type: 'discount' | 'waive' | 'bad_debt';
        amount: number;
        reason: string;
      }) =>
        request<CommissionAdjustment>('/finance/commission-adjustments', {
          method: 'POST',
          body: data,
        }),

      approve: (id: string, decisionNote?: string) =>
        request<CommissionAdjustment>(
          `/finance/commission-adjustments/${id}/approve`,
          { method: 'POST', body: { decisionNote } },
        ),

      reject: (id: string, decisionNote?: string) =>
        request<CommissionAdjustment>(
          `/finance/commission-adjustments/${id}/reject`,
          { method: 'POST', body: { decisionNote } },
        ),
    },
  };
}
