import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const BROKERAGE_CASE_LEDGER_SORT_FIELDS = [
  'customer',
  'intentCount',
  'budgetMin',
  'budgetMax',
  'monthlyRentMin',
  'monthlyRentMax',
  'areaMin',
  'areaMax',
  'matchCount',
  'createdAt',
] as const;

export type BrokerageCaseLedgerSortField =
  (typeof BROKERAGE_CASE_LEDGER_SORT_FIELDS)[number];
export type BrokerageCaseLedgerSortOrder = 'asc' | 'desc';

type LedgerCursorSortValue = Date | Prisma.Decimal | string | null;

interface LedgerCursorPayload {
  v: 1;
  sortBy: BrokerageCaseLedgerSortField;
  sortOrder: BrokerageCaseLedgerSortOrder;
  sortValue: string | null;
  customerName: string | null;
  id: string;
  total: number;
}

export interface BrokerageCaseLedgerCursor {
  sortBy: BrokerageCaseLedgerSortField;
  sortOrder: BrokerageCaseLedgerSortOrder;
  sortValue: LedgerCursorSortValue;
  customerName: string | null;
  id: string;
  total: number;
}

export interface BrokerageCaseLedgerCursorRow {
  sortValue: Date | Prisma.Decimal | number | string | null;
  customerName: string | null;
  id: string;
}

const LEDGER_SORT_FIELD_SET = new Set<string>(
  BROKERAGE_CASE_LEDGER_SORT_FIELDS,
);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CURSOR_LENGTH = 2_048;

function invalidCursor(): never {
  throw new BadRequestException('유효하지 않은 고객 원장 cursor입니다.');
}

function serializeSortValue(
  sortBy: BrokerageCaseLedgerSortField,
  value: BrokerageCaseLedgerCursorRow['sortValue'],
) {
  if (value === null) return null;

  if (sortBy === 'createdAt') {
    const date = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(date.getTime())) invalidCursor();
    return date.toISOString();
  }

  if (sortBy === 'customer') return String(value);

  try {
    const decimal = new Prisma.Decimal(String(value));
    if (!decimal.isFinite()) invalidCursor();
    return decimal.toString();
  } catch {
    return invalidCursor();
  }
}

function deserializeSortValue(
  sortBy: BrokerageCaseLedgerSortField,
  value: string | null,
): LedgerCursorSortValue {
  if (value === null) return null;

  if (sortBy === 'createdAt') {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) invalidCursor();
    return date;
  }

  if (sortBy === 'customer') return value;

  try {
    const decimal = new Prisma.Decimal(value);
    if (!decimal.isFinite()) invalidCursor();
    return decimal;
  } catch {
    return invalidCursor();
  }
}

export function encodeBrokerageCaseLedgerCursor(input: {
  sortBy: BrokerageCaseLedgerSortField;
  sortOrder: BrokerageCaseLedgerSortOrder;
  row: BrokerageCaseLedgerCursorRow;
  total: number;
}) {
  const payload: LedgerCursorPayload = {
    v: 1,
    sortBy: input.sortBy,
    sortOrder: input.sortOrder,
    sortValue: serializeSortValue(input.sortBy, input.row.sortValue),
    customerName: input.row.customerName,
    id: input.row.id,
    total: input.total,
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeBrokerageCaseLedgerCursor(
  encoded: string,
  expectedSortBy: BrokerageCaseLedgerSortField,
  expectedSortOrder: BrokerageCaseLedgerSortOrder,
): BrokerageCaseLedgerCursor {
  if (!encoded || encoded.length > MAX_CURSOR_LENGTH) invalidCursor();

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return invalidCursor();
  }

  if (!payload || typeof payload !== 'object') invalidCursor();
  const candidate = payload as Partial<LedgerCursorPayload>;
  if (
    candidate.v !== 1 ||
    typeof candidate.sortBy !== 'string' ||
    !LEDGER_SORT_FIELD_SET.has(candidate.sortBy) ||
    !['asc', 'desc'].includes(candidate.sortOrder ?? '') ||
    (candidate.sortValue !== null &&
      typeof candidate.sortValue !== 'string') ||
    (candidate.customerName !== null &&
      typeof candidate.customerName !== 'string') ||
    typeof candidate.id !== 'string' ||
    !UUID_PATTERN.test(candidate.id) ||
    typeof candidate.total !== 'number' ||
    !Number.isSafeInteger(candidate.total) ||
    candidate.total < 0
  ) {
    invalidCursor();
  }

  if (
    candidate.sortBy !== expectedSortBy ||
    candidate.sortOrder !== expectedSortOrder ||
    (expectedSortBy === 'createdAt' && candidate.sortValue === null)
  ) {
    invalidCursor();
  }

  return {
    sortBy: expectedSortBy,
    sortOrder: expectedSortOrder,
    sortValue: deserializeSortValue(expectedSortBy, candidate.sortValue),
    customerName: candidate.customerName,
    id: candidate.id,
    total: candidate.total,
  };
}

function buildCustomerCursorCondition(cursor: BrokerageCaseLedgerCursor) {
  if (cursor.customerName === null) {
    return Prisma.sql`eligible.customer_name IS NULL
      AND eligible.id > ${cursor.id}::uuid`;
  }

  return Prisma.sql`(
    eligible.customer_name IS NULL
    OR eligible.customer_name > ${cursor.customerName}
    OR (
      eligible.customer_name = ${cursor.customerName}
      AND eligible.id > ${cursor.id}::uuid
    )
  )`;
}

function buildTieBreakerCursorCondition(cursor: BrokerageCaseLedgerCursor) {
  if (cursor.sortBy === 'createdAt') {
    return Prisma.sql`eligible.id > ${cursor.id}::uuid`;
  }

  return buildCustomerCursorCondition(cursor);
}

export function buildBrokerageCaseLedgerCursorCondition(input: {
  cursor: BrokerageCaseLedgerCursor;
  orderExpression: Prisma.Sql;
}) {
  const { cursor, orderExpression } = input;
  const tieBreakerCondition = buildTieBreakerCursorCondition(cursor);

  if (cursor.sortValue === null) {
    return Prisma.sql`${orderExpression} IS NULL
      AND (${tieBreakerCondition})`;
  }

  const primaryAfter =
    cursor.sortOrder === 'asc'
      ? Prisma.sql`${orderExpression} > ${cursor.sortValue}`
      : Prisma.sql`${orderExpression} < ${cursor.sortValue}`;

  if (cursor.sortBy === 'createdAt') {
    return Prisma.sql`(
      ${primaryAfter}
      OR (
        ${orderExpression} = ${cursor.sortValue}
        AND eligible.id > ${cursor.id}::uuid
      )
    )`;
  }

  return Prisma.sql`(
    ${orderExpression} IS NULL
    OR ${primaryAfter}
    OR (
      ${orderExpression} = ${cursor.sortValue}
      AND (${tieBreakerCondition})
    )
  )`;
}
