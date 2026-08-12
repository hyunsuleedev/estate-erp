/**
 * 조항 임베디드 편집 레이아웃 (순수 데이터 상수 — React 없음).
 *
 * 레거시 MySpider ContractInputForm 의 "제N조 문장 안에 금액/날짜/드롭다운/체크가
 * 임베디드된" 편집면을 데이터로 기술한다 (document-hub-editor-plan.md §4.2 하이브리드 b′).
 * - 값은 스키마 DSL 이 아니라 **기존 engineFields 카탈로그 키**(salePrice/loanAmount/…)를
 *   그대로 읽고 쓴다 — 제네릭 편집기·프리뷰·주서식 승계와 값 호환 유지.
 * - 문장(관용구·선택지 문구)은 이 파일의 TS 상수로 둔다. 조항 원문 서식 텍스트는
 *   복제하지 않으며(제3조~ 는 기존 CONTRACT_TEMPLATE_BODY_CLAUSES 시드 = bodyText 사용),
 *   `현 상태에서 매수인이 승계한다.` 같은 선택지 문구는 업계 표준 표현이라 verbatim.
 * - 편집면 = 인쇄면: 같은 레이아웃을 UI 는 편집 모드로, 프리뷰(P5)는 읽기 전용으로 렌더.
 * - 렌더 프리미티브 5종(ClauseArticle/AmountRow/InlineDate/InlineSelect/InlineCheck)은
 *   apps/{web,desktop} 표현 컴포넌트 책임 — 여기는 데이터와 가시성 로직만.
 *
 * printOptions 연동: 공란인쇄/행 토글/2조 직접입력 등 문서 단위 인쇄 옵션은 engineFields
 * 가 아니라 metadata.documentEngine.printOptions(contract-document-engine.ts) 에 저장된다.
 * FieldSlot.fieldKey 가 printOptions 키(`isContractPrintOptionFieldKey`)면 렌더러는
 * printOptions 에서 읽고 쓴다 — `getClauseFieldValue` 헬퍼가 두 소스를 통일한다.
 */

import type { ContractDocumentEnginePrintOptions } from './contract-document-engine.js';

// ─────────────────────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────────────────────

/** 문장 내 인라인 컨트롤 종류 (렌더 프리미티브 매핑) */
export type ClauseFieldControl =
  | 'amount' // 金 [입력] 만원… — 만원 Int 문자열, 단위 해석은 printOptions.amountUnit
  | 'date' // [YYYY]년 [MM]월 [DD]일 — 저장은 ISO date 문자열
  | 'select' // 문장 폭 소형 드롭다운
  | 'check' // 인라인 체크박스 (공란인쇄/행 토글)
  | 'text' // 자유 텍스트 (bodyText 등)
  | 'receipt'; // 영수증 발행 버튼 — P1 은 비활성 placeholder (P5 범위)

export type ClauseSegment =
  | { kind: 'text'; text: string }
  | {
      kind: 'field';
      /** engineFields 카탈로그 키 또는 printOptions 키 (isContractPrintOptionFieldKey) */
      fieldKey: string;
      control: ClauseFieldControl;
      /** select 선택지 — 카탈로그 fieldGroups 의 options 와 반드시 일치 (테스트 검증) */
      options?: string[];
      /** 컨트롤 뒤에 붙는 문구 ("만원정은", "에 지불하며," 등) / check·receipt 는 라벨 */
      suffix?: string;
    };

export type ClauseRow = {
  key: string;
  /** 행 라벨 셀 ("매매대금", "융자금" …). 없으면 문장 전폭 행 */
  label?: string;
  segments: ClauseSegment[];
  /**
   * 조건부 표시 — fieldKey 값(engineFields 또는 printOptions, getClauseFieldValue 규칙)이
   * equals 와 같을 때만 행을 렌더/인쇄한다.
   * 예: 현 임대보증금 행은 printOptions.includeTenantDeposit === true 일 때만.
   */
  visibleWhen?: { fieldKey: string; equals: string };
};

export type ClauseArticle = {
  /** 조항 번호 밴드 ("제1조", "제2조", "제3조~") */
  no: string;
  title?: string;
  /** 도입문 (필드 슬롯 없는 순수 문장) */
  intro?: string;
  rows: ClauseRow[];
};

/** 문서 등록 메뉴의 종류 선택값. 레이아웃 문구의 목적물 명칭 치환에만 사용한다. */
export type ContractClauseLayoutContext = {
  propertyClass?: string | null;
  cntrClsf?: string | null;
  groupLabel?: string | null;
  contractSubject?: string | null;
  customContractSubject?: string | null;
};

// ─────────────────────────────────────────────────────────────
// printOptions 키 판별 — 렌더러의 읽기/쓰기 라우팅 기준
// ─────────────────────────────────────────────────────────────

/**
 * ClauseSegment.fieldKey / visibleWhen.fieldKey 로 쓰일 수 있는 printOptions boolean 키.
 * (amountUnit/amountNotation 은 문서 상단 옵션 바 전용이라 조항 슬롯으로 쓰지 않는다.)
 */
export const CONTRACT_PRINT_OPTION_FIELD_KEYS = [
  'financeLoanBlankPrint',
  'interim2BlankPrint',
  'includeTenantDeposit',
  'directClause2',
] as const;

export type ContractPrintOptionFieldKey = (typeof CONTRACT_PRINT_OPTION_FIELD_KEYS)[number];

export function isContractPrintOptionFieldKey(
  fieldKey: string,
): fieldKey is ContractPrintOptionFieldKey {
  return (CONTRACT_PRINT_OPTION_FIELD_KEYS as readonly string[]).includes(fieldKey);
}

/**
 * 조항 슬롯 값 읽기 — engineFields(string 관례)와 printOptions(boolean)를 통일한다.
 * printOptions boolean 은 checkbox 관례('true'/'')로 정규화해 반환한다.
 */
export function getClauseFieldValue(
  fieldKey: string,
  fields: Record<string, string>,
  printOptions?: ContractDocumentEnginePrintOptions | null,
): string {
  if (isContractPrintOptionFieldKey(fieldKey)) {
    return printOptions?.[fieldKey] === true ? 'true' : '';
  }
  return fields[fieldKey] ?? '';
}

/** visibleWhen 평가 — 없으면 항상 표시 */
export function isClauseRowVisible(
  row: ClauseRow,
  fields: Record<string, string>,
  printOptions?: ContractDocumentEnginePrintOptions | null,
): boolean {
  if (!row.visibleWhen) return true;
  return (
    getClauseFieldValue(row.visibleWhen.fieldKey, fields, printOptions) === row.visibleWhen.equals
  );
}

/** 레이아웃이 참조하는 모든 fieldKey (segments + visibleWhen, 중복 제거) */
export function collectContractClauseFieldKeys(articles: ClauseArticle[]): string[] {
  const keys = new Set<string>();
  for (const article of articles) {
    for (const row of article.rows) {
      if (row.visibleWhen) keys.add(row.visibleWhen.fieldKey);
      for (const segment of row.segments) {
        if (segment.kind === 'field') keys.add(segment.fieldKey);
      }
    }
  }
  return [...keys];
}

// ─────────────────────────────────────────────────────────────
// 선택지 문구 상수 — 카탈로그(prisma/contract-template-catalog.ts)와 단일 소스 공유.
// 레거시 콤보 문구 verbatim (법적 의미 보존 우선, plan §4.1/§6-2).
// ─────────────────────────────────────────────────────────────

/** 융자금 처리 (레거시 loanPriceComboBox 3지) */
export const BASE_CONTRACT_LOAN_HANDLING_OPTIONS = [
  '현 상태에서 매수인이 승계한다.',
  '매도인이 잔금일까지 말소한다.',
  '특약사항에 별도 명시한다.',
] as const;

/** 현 임대보증금 처리 (레거시 rentGrantPriceComboBox 3지) */
export const BASE_CONTRACT_TENANT_DEPOSIT_HANDLING_OPTIONS = [
  '현 상태에서 매수인이 승계한다.',
  '특약사항에 별도 명시한다.',
  '매수인이 인수하지 아니한다.',
] as const;

/** 계약금 지불시기 (레거시 contractPriceComboBox 2지) */
export const BASE_CONTRACT_DOWN_PAYMENT_PAY_TIME_OPTIONS = ['계약시에 지불', '특약사항에 준'] as const;

// ─────────────────────────────────────────────────────────────
// base_contract × sale 조항 레이아웃
// ─────────────────────────────────────────────────────────────

function text(value: string): ClauseSegment {
  return { kind: 'text', text: value };
}

function slot(
  fieldKey: string,
  control: ClauseFieldControl,
  extra: Pick<Extract<ClauseSegment, { kind: 'field' }>, 'options' | 'suffix'> = {},
): ClauseSegment {
  return { kind: 'field', fieldKey, control, ...extra };
}

/**
 * 아파트/오피스텔/부동산/상가 매매 계약서 (base_contract × sale).
 *
 * - 값 키는 전부 카탈로그 BASE_CONTRACT_FIELD_GROUPS 의 실제 키
 *   (테스트 contract-clause-layouts.test.ts 가 무결성 검증).
 * - receipt 슬롯의 fieldKey 는 해당 금액 필드 키를 가리킨다(어느 금액의 영수증인지 식별).
 *   TODO(P5): 영수증 즉석 발행 — P1 에서는 비활성 placeholder 버튼으로만 배치한다.
 * - 레거시는 "위 아파트의 …" 처럼 Kind 별 치환이었으나 v2 base_contract 는 건물형 공용
 *   서식이므로 "위 부동산의 …" 로 일반화한다.
 */
export const BASE_CONTRACT_SALE_CLAUSES: ClauseArticle[] = [
  {
    no: '제1조',
    intro: '위 부동산의 매매에 있어 매수인은 매매대금을 아래와 같이 지불하기로 한다.',
    rows: [
      {
        // 우측 상단 토글 (레거시 grantOrInterimcheckEdit) — 체크 시 아래 '현 임대보증금' 행 표시
        key: 'tenantDepositToggle',
        segments: [slot('includeTenantDeposit', 'check', { suffix: '현 임차보증금 입력란 추가' })],
      },
      {
        key: 'salePrice',
        label: '매매대금',
        segments: [text('金'), slot('salePrice', 'amount', { suffix: '만원정' })],
      },
      {
        key: 'loan',
        label: '융자금',
        segments: [
          text('金'),
          slot('loanAmount', 'amount', { suffix: '만원정은' }),
          slot('loanHandling', 'select', { options: [...BASE_CONTRACT_LOAN_HANDLING_OPTIONS] }),
          slot('financeLoanBlankPrint', 'check', { suffix: '공란인쇄' }),
        ],
      },
      {
        key: 'currentTenantDeposit',
        label: '현 임대보증금',
        visibleWhen: { fieldKey: 'includeTenantDeposit', equals: 'true' },
        segments: [
          text('金'),
          slot('currentTenantDeposit', 'amount', { suffix: '만원은' }),
          slot('currentTenantDepositHandling', 'select', {
            options: [...BASE_CONTRACT_TENANT_DEPOSIT_HANDLING_OPTIONS],
          }),
        ],
      },
      {
        key: 'downPayment',
        label: '계약금',
        segments: [
          text('金'),
          slot('downPayment', 'amount', { suffix: '만원정은' }),
          slot('downPaymentPayTime', 'select', {
            options: [...BASE_CONTRACT_DOWN_PAYMENT_PAY_TIME_OPTIONS],
          }),
          text('하고 영수함.'),
          text('영수자 ( 자필서명 ) (인)'),
          // TODO(P5): 계약금 영수증 즉석 발행 (OfficePrintTemplate receipt 렌더러)
          slot('downPayment', 'receipt', { suffix: '계약금영수증' }),
        ],
      },
      {
        key: 'interimPayment',
        label: '중도금',
        segments: [
          text('金'),
          slot('interimPayment', 'amount', { suffix: '만원정은' }),
          slot('interimPaymentDate', 'date', { suffix: '에 지불하며,' }),
          slot('interimPaymentBlankPrint', 'check', { suffix: '공란인쇄' }),
          // TODO(P5): 중도금 영수증 즉석 발행
          slot('interimPayment', 'receipt', { suffix: '중도금영수증' }),
        ],
      },
      {
        key: 'interimPayment2',
        label: '중도금(2차)',
        segments: [
          text('金'),
          slot('interimPayment2', 'amount', { suffix: '만원정은' }),
          slot('interimPayment2Date', 'date', { suffix: '에 지불하며,' }),
          slot('interim2BlankPrint', 'check', { suffix: '공란인쇄' }),
          // TODO(P5): 중도금(2차) 영수증 즉석 발행
          slot('interimPayment2', 'receipt', { suffix: '중도금영수증' }),
        ],
      },
      {
        key: 'balancePayment',
        label: '잔금',
        segments: [
          text('金'),
          slot('balancePayment', 'amount', { suffix: '만원정은' }),
          slot('balancePaymentDate', 'date', { suffix: '에 지불하기로 함.' }),
          // TODO(P5): 잔금 영수증 즉석 발행
          slot('balancePayment', 'receipt', { suffix: '잔금영수증' }),
        ],
      },
      {
        // 레거시 chkSecUse — 체크 시 제2조 자동 문장을 비우고 본문 조항에 직접 기재
        key: 'directClause2Toggle',
        segments: [slot('directClause2', 'check', { suffix: '계약사항2조 직접입력' })],
      },
    ],
  },
  {
    no: '제2조',
    rows: [
      {
        key: 'handover',
        // directClause2(계약사항2조 직접입력) 체크 시 자동 문장을 표시/인쇄하지 않는다.
        visibleWhen: { fieldKey: 'directClause2', equals: '' },
        segments: [
          text(
            '매도인은 매수인으로부터 매매대금의 잔금을 수령함과 동시에 매수인에게 소유권 이전등기에 필요한 모든 서류를 교부하고 등기절차에 협력하며, 위 부동산의 인도는',
          ),
          slot('handoverDate', 'date', { suffix: '로 한다.' }),
        ],
      },
    ],
  },
  {
    // 제3조~ 는 기존 bodyText(서식×거래유형 기본 본문 = CONTRACT_TEMPLATE_BODY_CLAUSES 시드,
    // 사용자 편집 가능)를 그대로 사용한다 — 조항 원문 복제 금지 원칙.
    no: '제3조~',
    title: '본문 조항',
    rows: [
      {
        key: 'bodyClauses',
        segments: [slot('bodyText', 'text')],
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// 임대차 및 전용 계약서 제1·2조 레이아웃
// ─────────────────────────────────────────────────────────────

function bodyArticle(): ClauseArticle {
  return {
    no: '제3조~',
    title: '본문 조항',
    rows: [{ key: 'bodyClauses', segments: [slot('bodyText', 'text')] }],
  };
}

function amountRow(
  key: string,
  label: string,
  suffix = '만원정',
  dateKey?: string,
): ClauseRow {
  return {
    key,
    label,
    segments: [
      text('金'),
      slot(key, 'amount', { suffix }),
      ...(dateKey ? [slot(dateKey, 'date', { suffix: '에 지급하기로 함.' })] : []),
    ],
  };
}

function createBaseLeaseClauses(
  transactionType: 'jeonse' | 'monthly' | 'yearly',
): ClauseArticle[] {
  const rentRows: ClauseRow[] =
    transactionType === 'monthly'
      ? [amountRow('monthlyRent', '차임(월세)', '만원정')]
      : transactionType === 'yearly'
        ? [amountRow('annualRent', '연 차임', '만원정', 'yearlyRentPayDate')]
        : [];

  return [
    {
      no: '제1조',
      intro:
        '위 부동산의 임대차에 있어 임차인은 보증금과 차임을 아래와 같이 지불하기로 한다.',
      rows: [
        amountRow('deposit', '보증금'),
        amountRow('downPayment', '계약금'),
        amountRow('interimPayment', '중도금', '만원정', 'interimPaymentDate'),
        amountRow('balancePayment', '잔금', '만원정', 'balancePaymentDate'),
        ...rentRows,
        {
          key: 'directClause2Toggle',
          segments: [slot('directClause2', 'check', { suffix: '계약사항2조 직접입력' })],
        },
      ],
    },
    {
      no: '제2조',
      rows: [
        {
          key: 'leasePeriod',
          visibleWhen: { fieldKey: 'directClause2', equals: '' },
          segments: [
            text(
              '임대인은 위 부동산을 임대차 목적대로 사용할 수 있는 상태로 임차인에게 인도하며, 인도일은',
            ),
            slot('handoverDate', 'date', { suffix: '로 하고 임대차기간은' }),
            slot('leaseStartDate', 'date', { suffix: '부터' }),
            slot('leaseEndDate', 'date', { suffix: '까지로 한다.' }),
          ],
        },
      ],
    },
    bodyArticle(),
  ];
}

export const BASE_CONTRACT_JEONSE_CLAUSES = createBaseLeaseClauses('jeonse');
export const BASE_CONTRACT_MONTHLY_CLAUSES = createBaseLeaseClauses('monthly');
export const BASE_CONTRACT_YEARLY_CLAUSES = createBaseLeaseClauses('yearly');

function createPaymentContractClauses({
  article1Intro,
  totalKey,
  totalLabel,
  article2Intro,
  article2Rows = [],
  includeInterimDate = false,
}: {
  article1Intro: string;
  totalKey: string;
  totalLabel: string;
  article2Intro: string;
  article2Rows?: ClauseRow[];
  includeInterimDate?: boolean;
}): ClauseArticle[] {
  return [
    {
      no: '제1조',
      intro: article1Intro,
      rows: [
        amountRow(totalKey, totalLabel),
        amountRow('downPayment', '계약금'),
        amountRow(
          'interimPayment',
          '중도금',
          '만원정',
          includeInterimDate ? 'interimPaymentDate' : undefined,
        ),
        amountRow('balancePayment', '잔금', '만원정', 'balancePaymentDate'),
      ],
    },
    {
      no: '제2조',
      intro: article2Intro,
      rows: article2Rows,
    },
    bodyArticle(),
  ];
}

const EXCHANGE_CONTRACT_CLAUSES: ClauseArticle[] = [
  {
    no: '제1조',
    intro:
      '갑과 을은 각자 소유하는 표시 부동산을 상호 교환하고 목적물 평가액의 차액을 아래와 같이 정한다.',
    rows: [
      amountRow('differenceAmount', '차액(보충금)'),
      {
        key: 'differencePayer',
        label: '지급 당사자',
        segments: [slot('differencePayer', 'select', { options: ['갑', '을'] })],
      },
    ],
  },
  {
    no: '제2조',
    intro: '보충금 지급 당사자는 아래 일정에 따라 상대방에게 보충금을 지급한다.',
    rows: [
      amountRow('downPayment', '계약금'),
      amountRow('interimPayment', '중도금', '만원정', 'interimPaymentDate'),
      amountRow('balancePayment', '잔금', '만원정', 'balancePaymentDate'),
    ],
  },
  bodyArticle(),
];

const SUBLEASE_CONTRACT_CLAUSES: ClauseArticle[] = [
  {
    no: '제1조',
    intro:
      '전대인은 표시 부동산을 전차인에게 전대하고 전차인은 보증금과 차임을 아래와 같이 지급한다.',
    rows: [
      amountRow('deposit', '전대차 보증금'),
      amountRow('monthlyRent', '월 차임'),
      amountRow('downPayment', '계약금'),
      amountRow('balancePayment', '잔금'),
    ],
  },
  {
    no: '제2조',
    intro:
      '전대인은 원 임대차계약상 전대 가능 여부와 임대인의 동의 여부를 전차인에게 고지한다.',
    rows: [
      {
        key: 'lessorConsentAttached',
        segments: [slot('lessorConsentAttached', 'check', { suffix: '임대인 전대동의서 첨부' })],
      },
    ],
  },
  bodyArticle(),
];

const PURCHASE_RIGHT_CONTRACT_CLAUSES = createPaymentContractClauses({
  article1Intro:
    '양도인은 분양계약에 따른 권리와 의무를 양수인에게 매도하고 양수인은 매매대금을 아래와 같이 지급한다.',
  totalKey: 'totalPrice',
  totalLabel: '총 매매대금',
  includeInterimDate: true,
  article2Intro:
    '양수인은 분양대금 납부 현황, 중도금 대출과 전매 제한을 확인하고 권리와 의무를 승계한다.',
  article2Rows: [
    amountRow('loanAmount', '중도금 대출 잔액'),
    {
      key: 'loanSuccession',
      label: '대출 처리',
      segments: [
        slot('loanSuccession', 'select', { options: ['승계', '상환', '해당 없음'] }),
      ],
    },
    {
      key: 'nameChangeDeadline',
      label: '명의변경 예정일',
      segments: [slot('nameChangeDeadline', 'date')],
    },
  ],
});

const UNION_RIGHT_CONTRACT_CLAUSES = createPaymentContractClauses({
  article1Intro:
    '양도인은 조합원 지위와 입주권 등 권리·의무 일체를 양수인에게 매도하고 양수인은 매매대금을 아래와 같이 지급한다.',
  totalKey: 'totalPrice',
  totalLabel: '매매대금',
  article2Intro:
    '양수인은 권리가액, 추가분담금, 이주비 대출 및 조합 정관상의 권리와 의무를 확인하고 승계한다.',
  article2Rows: [
    amountRow('appraisedRightValue', '권리가액'),
    amountRow('contributionRemaining', '미납 추가분담금'),
  ],
});

const RIGHT_TRANSFER_CONTRACT_CLAUSES = createPaymentContractClauses({
  article1Intro:
    '양도인은 표시된 권리를 양수인에게 양도하고 양수인은 양도대금을 아래와 같이 지급한다.',
  totalKey: 'totalPrice',
  totalLabel: '양도대금',
  article2Intro:
    '양도인은 잔금 수령과 동시에 권리 이전에 필요한 서류를 교부하고 이전 절차에 협력한다.',
  article2Rows: [
    {
      key: 'transferDate',
      label: '권리 이전일',
      segments: [slot('transferDate', 'date')],
    },
  ],
});

const RIGHT_SUCCESSION_CONTRACT_CLAUSES = createPaymentContractClauses({
  article1Intro:
    '양도인은 기존 계약상 권리와 의무를 승계인에게 승계시키고 승계인은 그 대가를 아래와 같이 지급한다.',
  totalKey: 'totalPrice',
  totalLabel: '승계대가',
  article2Intro:
    '승계인은 기존 계약의 조건, 보증금, 미납금과 관리비 등 승계 범위를 확인한다.',
  article2Rows: [
    {
      key: 'transferDate',
      label: '승계 기준일',
      segments: [slot('transferDate', 'date')],
    },
  ],
});

const COMMERCIAL_PREMIUM_CONTRACT_CLAUSES = createPaymentContractClauses({
  article1Intro:
    '신규임차인은 기존 임차인에게 영업시설·비품과 영업상 이익 등의 대가인 권리금을 아래와 같이 지급한다.',
  totalKey: 'premiumTotal',
  totalLabel: '권리금 총액',
  includeInterimDate: true,
  article2Intro:
    '기존 임차인은 신규임차인을 임대인에게 주선하고 영업시설과 영업상 가치를 이전한다.',
  article2Rows: [
    {
      key: 'handoverDate',
      label: '영업·시설 인도일',
      segments: [slot('handoverDate', 'date')],
    },
  ],
});

function createStandardLeaseClauses(
  subject: string,
  transactionType: 'jeonse' | 'monthly',
  options: { privateRental?: boolean } = {},
): ClauseArticle[] {
  const paymentRows: ClauseRow[] = [amountRow('deposit', '보증금')];
  if (!options.privateRental) {
    paymentRows.push(
      amountRow('downPayment', '계약금'),
      amountRow('interimPayment', '중도금', '만원정', 'interimPaymentDate'),
      amountRow('balancePayment', '잔금', '만원정', 'balancePaymentDate'),
    );
  }
  if (transactionType === 'monthly') paymentRows.push(amountRow('monthlyRent', '차임(월세)'));

  return [
    {
      no: '제1조',
      intro: `위 ${subject}의 임대차에 관하여 임대인과 임차인은 보증금과 차임을 아래와 같이 지급하기로 한다.`,
      rows: paymentRows,
    },
    {
      no: '제2조',
      intro: `임대인은 ${subject}을 임대차 목적대로 사용할 수 있는 상태로 임차인에게 인도한다.`,
      rows: [
        {
          key: 'leasePeriod',
          segments: [
            slot('handoverDate', 'date', { suffix: '에 인도하고, 임대차기간은' }),
            slot('leaseStartDate', 'date', { suffix: '부터' }),
            slot('leaseEndDate', 'date', { suffix: '까지로 한다.' }),
          ],
        },
      ],
    },
    bodyArticle(),
  ];
}

const COMMERCIAL_STANDARD_JEONSE_CLAUSES = createStandardLeaseClauses('상가건물', 'jeonse');
const COMMERCIAL_STANDARD_MONTHLY_CLAUSES = createStandardLeaseClauses('상가건물', 'monthly');
const PRIVATE_RENTAL_JEONSE_CLAUSES = createStandardLeaseClauses('민간임대주택', 'jeonse', {
  privateRental: true,
});
const PRIVATE_RENTAL_MONTHLY_CLAUSES = createStandardLeaseClauses(
  '민간임대주택',
  'monthly',
  { privateRental: true },
);
const HOUSE_LEASE_JEONSE_CLAUSES = createStandardLeaseClauses('주택', 'jeonse');
const HOUSE_LEASE_MONTHLY_CLAUSES = createStandardLeaseClauses('주택', 'monthly');

// ─────────────────────────────────────────────────────────────
// 레이아웃 조회 — CLAUSE_LAYOUTS[templateCode][transactionType]
// ─────────────────────────────────────────────────────────────

/** templateCode × transactionType → 조항 레이아웃. 계약서 등록 메뉴 30개 조합을 모두 포괄한다. */
export const CONTRACT_CLAUSE_LAYOUTS: Record<string, Record<string, ClauseArticle[]>> = {
  base_contract: {
    sale: BASE_CONTRACT_SALE_CLAUSES,
    jeonse: BASE_CONTRACT_JEONSE_CLAUSES,
    monthly: BASE_CONTRACT_MONTHLY_CLAUSES,
    yearly: BASE_CONTRACT_YEARLY_CLAUSES,
  },
  exchange_contract: { exchange: EXCHANGE_CONTRACT_CLAUSES },
  sublease_contract: { sublease: SUBLEASE_CONTRACT_CLAUSES },
  purchase_right_contract: { sale: PURCHASE_RIGHT_CONTRACT_CLAUSES },
  union_member_right_contract: { sale: UNION_RIGHT_CONTRACT_CLAUSES },
  right_transfer_contract: { transfer: RIGHT_TRANSFER_CONTRACT_CLAUSES },
  right_succession_contract: { succession: RIGHT_SUCCESSION_CONTRACT_CLAUSES },
  commercial_premium_contract: {
    jeonse: COMMERCIAL_PREMIUM_CONTRACT_CLAUSES,
    monthly: COMMERCIAL_PREMIUM_CONTRACT_CLAUSES,
  },
  commercial_standard_lease_contract: {
    jeonse: COMMERCIAL_STANDARD_JEONSE_CLAUSES,
    monthly: COMMERCIAL_STANDARD_MONTHLY_CLAUSES,
  },
  private_rental_standard_lease_contract: {
    jeonse: PRIVATE_RENTAL_JEONSE_CLAUSES,
    monthly: PRIVATE_RENTAL_MONTHLY_CLAUSES,
  },
  standard_lease_contract: {
    jeonse: HOUSE_LEASE_JEONSE_CLAUSES,
    monthly: HOUSE_LEASE_MONTHLY_CLAUSES,
  },
  house_lease_contract: {
    jeonse: HOUSE_LEASE_JEONSE_CLAUSES,
    monthly: HOUSE_LEASE_MONTHLY_CLAUSES,
  },
};

const SUBJECT_BY_PROPERTY_CLASS: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  real_estate: '부동산',
  commercial: '상가',
};

const SUBJECT_BY_CNTR_CLSF: Record<string, string> = {
  '01': '아파트',
  '02': '오피스텔',
  '03': '부동산',
  '05': '상가',
};

export function getContractClauseLayoutContext(
  metadata?: Record<string, unknown> | null,
  fields: Record<string, string> = {},
): ContractClauseLayoutContext {
  const registrationValue = metadata?.formRegistration;
  const registration =
    registrationValue && typeof registrationValue === 'object' && !Array.isArray(registrationValue)
      ? (registrationValue as Record<string, unknown>)
      : {};
  const read = (key: string) => {
    const value = registration[key];
    return typeof value === 'string' ? value : undefined;
  };

  return {
    propertyClass: read('propertyClass'),
    cntrClsf: read('cntrClsf'),
    groupLabel: read('groupLabel'),
    contractSubject: fields.contractSubject || read('subjectDefault'),
    customContractSubject: fields.customContractSubject,
  };
}

export function resolveContractClauseSubject(
  context: ContractClauseLayoutContext = {},
): string {
  const explicit = context.contractSubject?.trim();
  if (explicit === '직접입력') {
    return context.customContractSubject?.trim() || '부동산';
  }
  if (explicit) return explicit;

  const propertyClass = context.propertyClass?.trim();
  if (propertyClass && SUBJECT_BY_PROPERTY_CLASS[propertyClass]) {
    return SUBJECT_BY_PROPERTY_CLASS[propertyClass]!;
  }
  if (propertyClass && !['form'].includes(propertyClass)) return propertyClass;

  const cntrClsf = context.cntrClsf?.trim();
  if (cntrClsf && SUBJECT_BY_CNTR_CLSF[cntrClsf]) return SUBJECT_BY_CNTR_CLSF[cntrClsf]!;
  return context.groupLabel?.trim() || '부동산';
}

/** base_contract의 관용구만 목적물 종별로 치환한다. 원본 상수는 변경하지 않는다. */
function applySubjectToLayout(articles: ClauseArticle[], subject: string): ClauseArticle[] {
  if (subject === '부동산') return articles;
  return articles.map((article) => ({
    ...article,
    intro: article.intro?.replaceAll('부동산', subject),
    rows: article.rows.map((row) => ({
      ...row,
      segments: row.segments.map((segment) =>
        segment.kind === 'text'
          ? { ...segment, text: segment.text.replaceAll('부동산', subject) }
          : segment,
      ),
    })),
  }));
}

export function getContractClauseLayout(
  templateCode: string,
  transactionType: string,
  context: ContractClauseLayoutContext = {},
): ClauseArticle[] | null {
  const articles = CONTRACT_CLAUSE_LAYOUTS[templateCode]?.[transactionType] ?? null;
  if (!articles || templateCode !== 'base_contract') return articles;
  return applySubjectToLayout(articles, resolveContractClauseSubject(context));
}
