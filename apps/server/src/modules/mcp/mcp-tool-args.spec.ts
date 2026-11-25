import { BadRequestException, ConflictException } from '@nestjs/common';
import { formatToolError, normalizeDateArgs, validateToolArgs } from './mcp-tool-args';

const schema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    stage: { type: 'string', enum: ['a', 'b'] },
    price: { type: 'number' },
    flag: { type: 'boolean' },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['id'],
};

describe('validateToolArgs', () => {
  it('rejects a call without the required id (it used to act on an arbitrary record)', () => {
    expect(validateToolArgs(schema, {})).toContain('id');
    expect(validateToolArgs(schema, undefined)).toContain('id');
    expect(validateToolArgs(schema, { id: '' })).toContain('id');
    expect(validateToolArgs(schema, { id: null })).toContain('id');
  });

  it('rejects an object where a string is expected (a Prisma filter passed as an id)', () => {
    expect(validateToolArgs(schema, { id: { not: 'x' } })).toContain('글자열');
    expect(validateToolArgs(schema, { id: ['x'] })).toContain('글자열');
  });

  it('checks enums, numbers, booleans and arrays', () => {
    expect(validateToolArgs(schema, { id: 'x', stage: 'c' })).toContain('a | b');
    expect(validateToolArgs(schema, { id: 'x', price: '1000' })).toContain('숫자');
    expect(validateToolArgs(schema, { id: 'x', flag: 'yes' })).toContain('true');
    expect(validateToolArgs(schema, { id: 'x', tags: 'vip' })).toContain('배열');
    expect(validateToolArgs(schema, { id: 'x', tags: ['vip', 3] })).toContain('tags[1]');
  });

  it('accepts a valid call, null for optional values and keys the schema does not list', () => {
    expect(validateToolArgs(schema, { id: 'x', stage: 'a', price: 158000, flag: false, tags: [] })).toBeNull();
    expect(validateToolArgs(schema, { id: 'x', price: null, extra: { any: 1 } })).toBeNull();
    expect(validateToolArgs({ type: 'object', properties: {} }, undefined)).toBeNull();
  });
});

describe('validateToolArgs — nested values', () => {
  const nested = {
    type: 'object',
    properties: {
      listings: {
        type: 'array',
        items: {
          type: 'object',
          properties: { transactionType: { type: 'string', enum: ['sale', 'jeonse'] }, price: { type: 'number' } },
          required: ['transactionType'],
        },
      },
      raw: { type: 'object' },
    },
  };

  it('rejects a bad item anywhere in an array before the tool runs (no partial save)', () => {
    const args = { listings: [{ transactionType: 'sale', price: 158000 }, { price: 'x' }] };
    expect(validateToolArgs(nested, args)).toContain('listings[1].transactionType');
    expect(validateToolArgs(nested, { listings: [{ transactionType: 'sale' }, { transactionType: 'rent' }] })).toContain(
      'listings[1].transactionType',
    );
    expect(validateToolArgs(nested, { listings: [{ transactionType: 'sale' }, 'x'] })).toContain('listings[1]');
  });

  it('lets a free-form object through', () => {
    expect(validateToolArgs(nested, { raw: { anything: [1, { deep: true }] }, listings: [{ transactionType: 'jeonse' }] })).toBeNull();
  });
});

describe('normalizeDateArgs', () => {
  it('reads a date-only value in a …At field as midnight in Korea and leaves the rest alone', () => {
    const args = { receivedAt: '2026-12-01', nextConfirmAt: '2026-12-02T09:00:00+09:00', memo: '2026-12-01', dueDate: '2026-12-01' };
    expect(normalizeDateArgs(args)).toEqual({ ...args, receivedAt: '2026-12-01T00:00:00+09:00' });
    const untouched = { memo: 'x' };
    expect(normalizeDateArgs(untouched)).toBe(untouched);
  });
});

describe('formatToolError', () => {
  it('keeps the extra fields the server attached to an error', () => {
    const text = formatToolError(new ConflictException({ message: '이미 등록된 번호입니다.', contactId: 'c-1' }));
    expect(text).toContain('이미 등록된 번호입니다.');
    expect(text).toContain('"contactId":"c-1"');
  });

  it('returns the plain message of ordinary errors', () => {
    expect(formatToolError(new BadRequestException('날짜를 확인해 주세요.'))).toBe('날짜를 확인해 주세요.');
    expect(formatToolError(new Error('boom'))).toBe('boom');
  });
});
