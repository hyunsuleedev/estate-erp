import type { RequestFn } from '../client.js';

export type CommissionPaymentStatus =
  | 'pending'
  | 'collected'
  | 'overdue'
  | 'partial'
  | 'waived';

export type TaxInvoiceStatus = 'none' | 'issued' | 'sent';

export interface CommissionPayment {
  id: string;
  officeId: string;
  dealId: string;
  side: string;
  payerContactId: string | null;
  expectedAmount: number;
  actualAmount: number | null;
  dueDate: string | null;
  paidAt: string | null;
  status: CommissionPaymentStatus;
  method: string | null;
  taxInvoiceStatus: TaxInvoiceStatus;
  taxInvoiceNo: string | null;
  taxInvoiceDate: string | null;
  note: string | null;
  payerContact?: { id: string; name: string; phone: string | null };
}

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
  price: number | null;
  siteName: string;
  dongName: string | null;
  unitName: string | null;
  transactionType: string;
  commissionTotal: number | null;
  buyerContactName: string | null;
  sellerContactName: string | null;
  finalPaymentDate: string | null;
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

      issueTaxInvoice: (
        id: string,
        data: { taxInvoiceNo: string; taxInvoiceDate?: string },
      ) =>
        request<CommissionPayment>(
          `/finance/commission-payments/${id}/tax-invoice`,
          { method: 'POST', body: data },
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
  };
}
