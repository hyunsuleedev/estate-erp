import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/** 고정비 분류. 화면(cashflow/expenses.tsx)의 목록과 같다. */
export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'ad',
  'telecom',
  'insurance',
  'association',
  'supplies',
  'vehicle',
  'other',
] as const;
const EXPENSE_FREQUENCIES = ['monthly', 'quarterly', 'yearly'] as const;
/** 한 항목의 금액 상한 (만원). 100억. 잘못 친 숫자가 순이익을 망가뜨리지 않게 한다. */
const MAX_AMOUNT = 1_000_000;

interface ExpenseInput {
  title?: string;
  category?: string;
  amount?: number;
  frequency?: string;
  dayOfMonth?: number | null;
  taxDeductible?: boolean;
  isActive?: boolean;
  note?: string | null;
}

/** 들어온 값을 검사하고 저장할 모양으로 바꾼다. 없는 칸은 건드리지 않고, null 은 비운다. */
function cleanExpense(data: ExpenseInput, creating: boolean) {
  const out: {
    title?: string;
    category?: string;
    amount?: number;
    frequency?: string;
    dayOfMonth?: number | null;
    taxDeductible?: boolean;
    isActive?: boolean;
    note?: string | null;
  } = {};
  if (creating || data.title !== undefined) {
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title) throw new BadRequestException('항목명을 적어 주세요.');
    out.title = title;
  }
  if (creating || data.category !== undefined) {
    if (!EXPENSE_CATEGORIES.includes(data.category as (typeof EXPENSE_CATEGORIES)[number])) {
      throw new BadRequestException('분류가 올바르지 않습니다.');
    }
    out.category = data.category;
  }
  if (creating || data.amount !== undefined) {
    if (!Number.isInteger(data.amount) || (data.amount as number) <= 0 || (data.amount as number) > MAX_AMOUNT) {
      throw new BadRequestException('금액은 1 이상의 만원 단위 정수로 적어 주세요.');
    }
    out.amount = data.amount;
  }
  if (data.frequency !== undefined) {
    if (!EXPENSE_FREQUENCIES.includes(data.frequency as (typeof EXPENSE_FREQUENCIES)[number])) {
      throw new BadRequestException('주기는 매월, 분기, 연간 가운데 하나여야 합니다.');
    }
    out.frequency = data.frequency;
  }
  if (data.dayOfMonth !== undefined) {
    if (data.dayOfMonth !== null && (!Number.isInteger(data.dayOfMonth) || data.dayOfMonth < 1 || data.dayOfMonth > 31)) {
      throw new BadRequestException('결제일은 1일에서 31일 사이로 적어 주세요.');
    }
    out.dayOfMonth = data.dayOfMonth;
  }
  if (data.taxDeductible !== undefined) out.taxDeductible = Boolean(data.taxDeductible);
  if (data.isActive !== undefined) out.isActive = Boolean(data.isActive);
  if (data.note !== undefined) {
    out.note = typeof data.note === 'string' && data.note.trim() ? data.note.trim() : null;
  }
  return out;
}

@Injectable()
export class OfficeExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async list(officeId: string) {
    return this.prisma.officeExpenseTemplate.findMany({
      where: { officeId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(officeId: string, data: ExpenseInput) {
    const clean = cleanExpense(data ?? {}, true);
    return this.prisma.officeExpenseTemplate.create({
      data: {
        officeId,
        title: clean.title as string,
        category: clean.category as string,
        amount: clean.amount as number,
        frequency: clean.frequency ?? 'monthly',
        dayOfMonth: clean.dayOfMonth ?? null,
        taxDeductible: clean.taxDeductible ?? false,
        note: clean.note ?? null,
      },
    });
  }

  async update(id: string, officeId: string, data: ExpenseInput) {
    const clean = cleanExpense(data ?? {}, false);
    const existing = await this.prisma.officeExpenseTemplate.findFirst({
      where: { id, officeId },
    });
    if (!existing) throw new NotFoundException('고정비 항목을 찾지 못했습니다.');

    return this.prisma.officeExpenseTemplate.update({
      where: { id },
      data: clean,
    });
  }

  async remove(id: string, officeId: string) {
    const existing = await this.prisma.officeExpenseTemplate.findFirst({
      where: { id, officeId },
    });
    if (!existing) throw new NotFoundException('고정비 항목을 찾지 못했습니다.');

    return this.prisma.officeExpenseTemplate.delete({ where: { id } });
  }

  async getMonthlyTotal(officeId: string): Promise<number> {
    const templates = await this.prisma.officeExpenseTemplate.findMany({
      where: { officeId, isActive: true },
    });
    let total = 0;
    for (const t of templates) {
      if (t.frequency === 'monthly') total += t.amount;
      else if (t.frequency === 'quarterly') total += Math.round(t.amount / 3);
      else if (t.frequency === 'yearly') total += Math.round(t.amount / 12);
    }
    return total;
  }
}
