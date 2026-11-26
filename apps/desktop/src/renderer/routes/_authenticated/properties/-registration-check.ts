import { parseManwonText } from './-manwon-input';

/**
 * 매물 등록 문서의 "등록 전 확인" — 저장을 누르기 전에 무엇이 채워졌고 무엇이 빠졌는지.
 * 저장할 때의 검사(등록 폼의 mutation)와 같은 순서로 본다. 여기서는 화면에 보이는 칸만 본다:
 * 고르지 않은 거래유형의 금액, 꺼 둔 임차인처럼 숨은 칸의 값은 저장도 검사도 하지 않는다.
 */
export type RegistrationTransactionType = 'sale' | 'jeonse' | 'monthly';

export interface RegistrationProblem {
  /** 폼이 포커스를 옮길 칸(data-reg-field) */
  field: string;
  text: string;
  /** 비어 있음 · 읽을 수 없는 값 · 이미 있는 것과 겹침 */
  kind: 'missing' | 'invalid' | 'conflict';
}

export interface RegistrationDealInput {
  transactionTypes: RegistrationTransactionType[];
  salePrice: string;
  jeonsePrice: string;
  monthlyDeposit: string;
  monthlyRent: string;
  /** 같은 호실에 이미 있는 거래유형의 이름("전세") */
  conflictLabels: string[];
}

/** 거래 조건에서 가장 먼저 고칠 것. 없으면 null */
export function dealProblem(input: RegistrationDealInput): RegistrationProblem | null {
  if (input.conflictLabels.length > 0) {
    return { field: 'deal-type', kind: 'conflict', text: `이 호실에 이미 ${input.conflictLabels.join(', ')} 조건이 있습니다` };
  }
  for (const type of input.transactionTypes) {
    if (type === 'monthly') {
      if (!parseManwonText(input.monthlyDeposit).valid) {
        return { field: 'monthly-deposit', kind: 'invalid', text: '월세 보증금을 읽을 수 없습니다' };
      }
      const rent = parseManwonText(input.monthlyRent);
      if (!rent.valid) return { field: 'monthly-rent', kind: 'invalid', text: '월세를 읽을 수 없습니다' };
      if (rent.value == null) return { field: 'monthly-rent', kind: 'missing', text: '월세를 적으세요' };
      continue;
    }
    const sale = type === 'sale';
    const parsed = parseManwonText(sale ? input.salePrice : input.jeonsePrice);
    if (!parsed.valid) {
      return { field: `${type}-price`, kind: 'invalid', text: sale ? '매매가를 읽을 수 없습니다' : '전세가를 읽을 수 없습니다' };
    }
    if (parsed.value == null) {
      return { field: `${type}-price`, kind: 'missing', text: sale ? '매매가를 적으세요' : '전세가를 적으세요' };
    }
  }
  return null;
}

/** 금액 칸 여럿 가운데 읽지 못한 첫 칸 */
export function moneyProblem(fields: ReadonlyArray<{ field: string; label: string; value: string; shown: boolean }>): RegistrationProblem | null {
  for (const item of fields) {
    if (item.shown && !parseManwonText(item.value).valid) {
      return { field: item.field, kind: 'invalid', text: `${item.label} 금액을 읽을 수 없습니다` };
    }
  }
  return null;
}

export interface RegistrationCheckItem {
  key: 'place' | 'deal' | 'owner' | 'tenant' | 'terms';
  title: string;
  required: boolean;
  state: 'done' | 'todo' | 'problem' | 'optional';
  detail: string;
  field: string;
}

/**
 * 확인 줄 하나의 상태. 꼭 채울 줄은 저장을 한 번 눌러 보기 전에는 빨갛게 하지 않는다(빈 문서를
 * 열자마자 경고가 뜨지 않게). 읽을 수 없는 값처럼 이미 틀린 것은 바로 알린다.
 */
export function checkItem(input: {
  key: RegistrationCheckItem['key'];
  title: string;
  required: boolean;
  /** 채워졌을 때 보일 요약. 비었으면 '' */
  summary: string;
  problem: RegistrationProblem | null;
  /** 비어 있을 때의 안내 */
  idle: string;
  /** 비어 있을 때 갈 칸 */
  field: string;
  /** 저장을 눌러 봤는가 */
  attempted: boolean;
}): RegistrationCheckItem {
  const { problem } = input;
  if (problem) {
    // 비어 있는 것은 눌러 본 뒤에, 이미 틀린 값은 바로 알린다
    const loud = input.attempted || problem.kind !== 'missing' || !input.required;
    return {
      key: input.key,
      title: input.title,
      required: input.required,
      state: loud ? 'problem' : 'todo',
      detail: problem.text,
      field: problem.field,
    };
  }
  if (input.summary) {
    return { key: input.key, title: input.title, required: input.required, state: 'done', detail: input.summary, field: input.field };
  }
  return {
    key: input.key,
    title: input.title,
    required: input.required,
    state: input.required ? 'todo' : 'optional',
    detail: input.idle,
    field: input.field,
  };
}
