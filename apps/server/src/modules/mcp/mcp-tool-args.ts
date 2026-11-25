import { HttpException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * MCP 도구를 부르기 전에 인자를 그 도구의 inputSchema로 확인하고, 실패했을 때의 글을 AI가 읽을 수 있게 다듬는다.
 *
 * 확인이 없던 때의 문제(2026-11-25 운영 점검): 필수 id를 빼고 부르면 서비스의 `findFirst({ where: { id, officeId } })`에서
 * Prisma가 `id: undefined`를 "조건 없음"으로 읽어 사무소의 아무 기록이나 돌려주거나 바꿨다
 * (`get_contact {}`가 남의 연락처를, `cancel_advertisement_change_request {}`가 지정하지 않은 요청을 취소).
 * id 자리에 `{ not: … }` 같은 객체를 넣으면 Prisma 필터로 그대로 들어가기도 했다.
 * 그래서 도구의 손잡이(handler)에 닿기 전에 여기서 막는다: 필수값은 꼭 있어야 하고, 값의 종류는 스키마와 같아야 한다.
 */

type Schema = Record<string, unknown>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function checkValue(path: string, schema: Schema, value: unknown): string | null {
  const type = schema.type as string | undefined;
  if (!type) return null;
  const actual = typeName(value);
  switch (type) {
    case 'string':
      if (actual !== 'string') return `${path}: 글자열이어야 합니다 (받은 값: ${actual})`;
      if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        return `${path}: ${(schema.enum as unknown[]).join(' | ')} 중 하나여야 합니다 (받은 값: ${String(value)})`;
      }
      return null;
    case 'number':
    case 'integer':
      if (actual !== 'number' || !Number.isFinite(value as number)) {
        return `${path}: 숫자여야 합니다 (받은 값: ${actual})`;
      }
      if (type === 'integer' && !Number.isInteger(value)) return `${path}: 정수여야 합니다`;
      return null;
    case 'boolean':
      return actual === 'boolean' ? null : `${path}: true 또는 false여야 합니다 (받은 값: ${actual})`;
    case 'array': {
      if (actual !== 'array') return `${path}: 배열이어야 합니다 (받은 값: ${actual})`;
      const items = schema.items;
      // 항목을 하나씩 저장하는 도구가 있다(의뢰의 거래 조건, 비교 목록 등). 중간 항목이 틀린 것을 손잡이에 닿기 전에
      // 잡지 못하면 앞의 항목만 저장되고 호출 전체는 실패로 끝난다 — 그래서 객체 항목도 모두 미리 확인한다.
      if (isPlainObject(items)) {
        for (const [index, item] of (value as unknown[]).entries()) {
          const problem = checkValue(`${path}[${index}]`, items, item);
          if (problem) return problem;
        }
      }
      return null;
    }
    case 'object':
      if (!isPlainObject(value)) return `${path}: 객체여야 합니다 (받은 값: ${actual})`;
      // 안쪽 객체도 스키마에 적힌 만큼 확인한다(칸을 적지 않은 자유 형식 객체는 그대로 통과한다).
      return checkObject(path, schema, value);
    default:
      return null;
  }
}

function checkObject(path: string, schema: Schema, value: Record<string, unknown>): string | null {
  const properties = isPlainObject(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  for (const key of required) {
    const item = value[key];
    if (item === undefined || item === null || item === '') {
      return `${path ? `${path}.` : ''}${key}: 꼭 필요한 값입니다`;
    }
  }
  for (const [key, item] of Object.entries(value)) {
    const propertySchema = properties[key];
    // 스키마에 없는 값과, 비우려고 준 null은 손잡이가 알아서 다룬다
    if (!isPlainObject(propertySchema) || item === undefined || item === null) continue;
    const problem = checkValue(`${path ? `${path}.` : ''}${key}`, propertySchema, item);
    if (problem) return problem;
  }
  return null;
}

/** 문제가 없으면 null, 있으면 AI에게 돌려줄 한 줄. */
export function validateToolArgs(inputSchema: Schema, args: unknown): string | null {
  if (args === undefined || args === null) args = {};
  if (!isPlainObject(args)) return '인자는 객체여야 합니다';
  return checkObject('', inputSchema, args);
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 시각 칸(이름이 …At)에 날짜만("2026-12-01") 오면 그날 한국 시각 0시로 읽는다. 서비스가 문자열을 그대로 Prisma에 넘기는
 * 곳이 있어 날짜만 주면 "Expected ISO-8601 DateTime"으로 실패했다. 날의 경계는 한국 시각으로 자른다는 규칙을 따른다.
 * 모든 도구에 쓰지 않는다(날짜만 받는 칸도 이름이 …At인 도구가 있다) — 쓸 도구는 mcp-tools.service.ts가 고른다.
 */
export function normalizeDateArgs(args: Record<string, unknown>): Record<string, unknown> {
  let changed: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(args)) {
    if (key.endsWith('At') && typeof value === 'string' && DATE_ONLY.test(value)) {
      changed ??= { ...args };
      changed[key] = `${value}T00:00:00+09:00`;
    }
  }
  return changed ?? args;
}

/**
 * 실패를 AI가 다음 행동을 정할 수 있는 글로 바꾼다. 서버가 붙여 준 부가 정보(이미 있는 연락처의 contactId,
 * 같은 이름의 공공 호 unitId 등)는 버리지 않고 함께 준다. DB의 원문 오류(요청 내용이 통째로 실려 나온다)는 내보내지 않는다.
 */
export function formatToolError(err: unknown): string {
  if (err instanceof HttpException) {
    const response = err.getResponse();
    if (isPlainObject(response)) {
      const { message, statusCode: _statusCode, error: _error, ...extra } = response;
      const text = Array.isArray(message) ? message.join(', ') : String(message ?? err.message);
      return Object.keys(extra).length > 0 ? `${text} ${JSON.stringify(extra)}` : text;
    }
    return typeof response === 'string' ? response : err.message;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? '';
      const fields = Array.isArray(target) ? target.join(', ') : target;
      return `같은 값의 기록이 이미 있습니다${fields ? ` (${fields})` : ''}. 먼저 찾아서 그 기록을 쓰세요.`;
    }
    if (err.code === 'P2003') return '연결하려는 기록을 찾을 수 없습니다. id를 다시 확인하세요.';
    if (err.code === 'P2025') return '기록을 찾을 수 없습니다.';
    if (err.code === 'P2023') return 'id 형식이 올바르지 않습니다 (UUID여야 합니다).';
    return '요청을 처리하지 못했습니다. 인자를 다시 확인하세요.';
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return '인자의 형식이 올바르지 않습니다. 날짜는 ISO 형식(예: 2026-12-01T09:00:00+09:00), 숫자는 숫자로 주세요.';
  }
  return err instanceof Error ? err.message : String(err);
}
