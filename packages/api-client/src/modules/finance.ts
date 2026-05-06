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
    negotiating: PipelineBucket;
    contract: PipelineBucket;
    balanceWaiting: PipelineBucket;
    collected: PipelineBucket;
    overdue: PipelineBucket;
  };
  deals: PipelineDeal[];
  monthlyTrend: MonthlyTrend[];
}

export function createFinanceApi(request: RequestFn) {
  return {
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
