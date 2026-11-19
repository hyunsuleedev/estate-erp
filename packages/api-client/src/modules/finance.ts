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
}

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

export interface OfficeExpenseTemplate {
  id: string;
  officeId: string;
  title: string;
  category: string;
  amount: number;
  frequency: string;
  dayOfMonth: number | null;
  taxDeductible: boolean;
  isActive: boolean;
  note: string | null;
}

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
  collected: number;
  expense: number;
  net: number;
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
  taxInvoiceStatus: TaxInvoiceStatus;
  taxInvoiceNo: string | null;
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
    amount: number;
    paymentCode: string | null;
    dealId: string;
    reason: string;
  }>;
  groups: LedgerDealGroup[];
}

export interface CashflowSummary {
  collected: number;
  pending: number;
  overdue: number;
  expected: number;
  monthlyExpense: number;
  netProfit: number;
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
  dealId: string;
  dealTitle: string;
  receivedAt: string;
  amountWon: number;
  /** balance: 잔금을 기다림 / participants: 담당 배분이 없음 / ratio: 직원 몫이 정해지지 않음 */
  reason: 'balance' | 'participants' | 'ratio';
}

export interface SettlementView {
  month: string;
  status: 'draft' | 'confirmed';
  timing: SettlementTiming;
  confirmedAt: string | null;
  lines: SettlementLine[];
  waiting: SettlementWaitingItem[];
  /** 확정할 수 없는 이유. 확정할 수 있으면 null. */
  blockedReason: string | null;
  canUnconfirm: boolean;
}

export interface MySettlementLine extends Omit<SettlementLine, 'userId' | 'name' | 'lineId'> {
  lineId: string;
  month: string;
  confirmedAt: string;
}

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

      /** 입금 한 건을 원 단위(부가세 포함)로 기록한다 */
      addReceipt: (
        id: string,
        data: { amountWon: number; receivedAt?: string; method?: string; memo?: string },
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

      issueTaxInvoice: (
        id: string,
        data: { taxInvoiceNo: string; taxInvoiceDate?: string },
      ) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/tax-invoice`,
          { method: 'POST', body: data },
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

    expenses: {
      list: () => request<OfficeExpenseTemplate[]>('/finance/expenses'),

      create: (data: {
        title: string;
        category: string;
        amount: number;
        frequency?: string;
        dayOfMonth?: number;
        taxDeductible?: boolean;
        note?: string;
      }) =>
        request<OfficeExpenseTemplate>('/finance/expenses', {
          method: 'POST',
          body: data,
        }),

      update: (
        id: string,
        data: Partial<{
          title: string;
          category: string;
          amount: number;
          frequency: string;
          dayOfMonth: number;
          taxDeductible: boolean;
          isActive: boolean;
          note: string;
        }>,
      ) =>
        request<OfficeExpenseTemplate>(`/finance/expenses/${id}`, {
          method: 'PATCH',
          body: data,
        }),

      remove: (id: string) =>
        request<void>(`/finance/expenses/${id}`, { method: 'DELETE' }),
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
