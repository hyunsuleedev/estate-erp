import { BadRequestException, ForbiddenException } from '@nestjs/common';

/**
 * 거래 조건(Listing)의 입력 검사와 고칠 수 있는 칸 목록.
 * 생성(의뢰와 함께·조건 추가)과 수정이 같은 기준을 쓴다.
 */

/** 금액 칸 — 모두 만원 단위 정수 */
// [은/는 붙인 이름, 이/가 붙인 이름]
const MONEY_FIELD_LABELS = {
  price: ['가격은', '가격이'],
  deposit: ['보증금은', '보증금이'],
  monthlyRent: ['월세는', '월세가'],
  maintenanceFee: ['관리비는', '관리비가'],
  loanAmount: ['융자금은', '융자금이'],
  premium: ['권리금은', '권리금이'],
} as const;

/** 1조원(만원 단위). 그보다 큰 값은 단위를 잘못 넣은 것으로 본다(원 단위로 넣는 등). */
export const MAX_LISTING_MONEY_MANWON = 100_000_000;

export function assertValidListingMoney(dto: Partial<Record<keyof typeof MONEY_FIELD_LABELS, unknown>>) {
  for (const [field, [topic, subject]] of Object.entries(MONEY_FIELD_LABELS)) {
    const value = dto[field as keyof typeof MONEY_FIELD_LABELS];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`${topic} 만원 단위 숫자로 입력해 주세요.`);
    }
    if (!Number.isInteger(value)) {
      throw new BadRequestException(`${topic} 만원 단위 정수로 입력해 주세요.`);
    }
    if (value < 0) {
      throw new BadRequestException(`${topic} 0 이상으로 입력해 주세요.`);
    }
    if (value > MAX_LISTING_MONEY_MANWON) {
      throw new BadRequestException(
        `${subject} 너무 큽니다. 만원 단위로 입력했는지 확인해 주세요.`,
      );
    }
  }
}

/** 입주 가능 시기 종류: 즉시 · 특정일 이후 · 기간 협의 · 협의 · 확인 필요 */
export const MOVE_IN_AVAILABLE_TYPE_VALUES = [
  'immediate',
  'date',
  'range',
  'negotiable',
  'unknown',
] as const;
const MOVE_IN_AVAILABLE_TYPES: ReadonlySet<string> = new Set(MOVE_IN_AVAILABLE_TYPE_VALUES);

function parseMoveInDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  // 화면은 "2027-03-01"처럼 날짜만 보낸다. Prisma는 시각 없는 글을 받지 않아(500) Date로 바꿔 넘긴다.
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException('입주 가능일의 날짜 형식이 잘못되었습니다. 예: 2027-03-01');
  }
  return date;
}

/**
 * 입주 가능 시기 칸을 저장할 수 있는 모양으로 바꾼다(생성·수정 공통).
 * undefined는 "바꾸지 않음", null·빈 글자는 "비움"이다.
 */
export function normalizeListingMoveIn<
  T extends {
    moveInAvailableType?: string | null;
    moveInAvailableFrom?: Date | string | null;
    moveInAvailableTo?: Date | string | null;
  },
>(dto: T): Omit<T, 'moveInAvailableFrom' | 'moveInAvailableTo'> & {
  moveInAvailableFrom?: Date | null;
  moveInAvailableTo?: Date | null;
} {
  const type = dto.moveInAvailableType;
  if (type !== undefined && type !== null && !MOVE_IN_AVAILABLE_TYPES.has(type)) {
    throw new BadRequestException('입주 가능 시기는 즉시·특정일 이후·기간 협의·협의·확인 필요 중 하나여야 합니다.');
  }
  const from = parseMoveInDate(dto.moveInAvailableFrom);
  const to = parseMoveInDate(dto.moveInAvailableTo);
  if (from && to && from.getTime() > to.getTime()) {
    throw new BadRequestException('입주 가능 기간의 끝날이 시작날보다 빠릅니다.');
  }
  const { moveInAvailableFrom: _from, moveInAvailableTo: _to, ...rest } = dto;
  return {
    ...rest,
    ...(from !== undefined ? { moveInAvailableFrom: from } : {}),
    ...(to !== undefined ? { moveInAvailableTo: to } : {}),
  };
}

/** 수정 요청에서 고칠 수 있는 칸만 남긴다 — 사무소·매물·의뢰·생성 시각 같은 칸은 요청으로 바꾸지 못한다. */
const UPDATABLE_LISTING_FIELDS = [
  'transactionType',
  'price',
  'deposit',
  'monthlyRent',
  'maintenanceFee',
  'maintenanceFeeIncludes',
  'loanAmount',
  'premium',
  'moveInAvailableType',
  'moveInAvailableFrom',
  'moveInAvailableTo',
  'isPaused',
  'memo',
] as const;

export type UpdatableListingField = (typeof UPDATABLE_LISTING_FIELDS)[number];

export function pickUpdatableListingFields<T extends object>(
  patch: T,
): Partial<Pick<T, Extract<keyof T, UpdatableListingField>>> {
  const picked: Record<string, unknown> = {};
  for (const field of UPDATABLE_LISTING_FIELDS) {
    if (field in patch && (patch as Record<string, unknown>)[field] !== undefined) {
      picked[field] = (patch as Record<string, unknown>)[field];
    }
  }
  return picked as Partial<Pick<T, Extract<keyof T, UpdatableListingField>>>;
}

/**
 * 매물(거래 조건) 지우기는 대표·매니저만 한다. 직원이 실수로 지우면 되돌릴 수 없고,
 * 끝난 거래는 지우는 것이 아니라 의뢰 종료로 남겨야 하기 때문이다.
 * (등록한 직원 본인도 허용하려 했으나 의뢰에 등록한 사람을 적는 칸이 없다 — 보고서 참고)
 */
export const LISTING_DELETE_ROLES: ReadonlySet<string> = new Set(['owner', 'manager']);

export function assertCanDeleteListing(role?: string | null) {
  if (role === undefined) return; // 서버 안쪽(시스템) 호출
  if (!role || !LISTING_DELETE_ROLES.has(role)) {
    throw new ForbiddenException(
      '매물 삭제는 대표·매니저만 할 수 있습니다. 거래가 끝났으면 의뢰 종료를 쓰세요.',
    );
  }
}
