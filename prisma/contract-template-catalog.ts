type TemplateFields = {
  bodyText: string;
  legalBasisText: string;
  sourceNotice: string;
  officeNotice?: string;
  confirmationMemo?: string;
  receiptMemo?: string;
  ledgerMemo?: string;
  settlementMemo?: string;
};

export type ContractTemplateBodySeed = {
  code: string;
  sourceName: string;
  sourceUrl?: string;
  copiedVerbatimFromMySpider: false;
  fields: TemplateFields;
};

export type OfficePrintTemplateSeed = {
  type: string;
  title: string;
  transactionTypes: string[];
  isDefault: boolean;
  data: Record<string, unknown>;
};

export type OfficeClauseTemplateSeed = {
  type: string;
  contractKind: string | null;
  transactionTypes: string[];
  title: string;
  content: string;
  isDefault: boolean;
  sortOrder: number;
};

type ContractTemplatePrisma = {
  contractDocumentTemplate: {
    findMany(args: unknown): Promise<Array<{ id: string; code: string; metadata: unknown }>>;
    update(args: unknown): Promise<unknown>;
  };
};

type OfficeTemplatePrisma = {
  officePrintTemplate: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
  contractClauseTemplate: {
    deleteMany(args: unknown): Promise<unknown>;
    createMany(args: unknown): Promise<unknown>;
  };
};

const SOURCE_NOTICE =
  '공개 표준서식과 법령 체계를 기준으로 만든 테스트 템플릿입니다. 실제 계약 전 최신 공식 서식과 개별 사안을 확인하세요.';

const MYSPIDER_REFERENCE = {
  product: 'MySpiderII',
  usedFor: 'document coverage, input form mapping, report workflow reference',
  bodyCopiedVerbatim: false,
};

export const MYSPIDER_REFERENCED_TEMPLATE_CODES = [
  'base_contract',
  'purchase_right_contract',
  'union_member_right_contract',
  'commercial_premium_contract',
  'right_transfer_contract',
  'right_succession_contract',
  'standard_lease_contract',
  'commercial_standard_lease_contract',
  'house_lease_contract',
  'sublease_contract',
  'sublease_agreement',
  'identity',
  'broker_explanation',
  'broker_explanation_residential',
  'broker_explanation_non_residential',
  'broker_explanation_land',
  'broker_explanation_special',
  'registry_document',
  'real_estate_transaction_report',
  'real_estate_transaction_cancel_report',
  'house_transaction_report',
  'lease_declaration',
  'lease_change_declaration',
  'renewal_confirmation',
  'guarantee_non_enrollment_agreement',
  'guarantee_partial_enrollment_agreement',
  'jeonse_registration_not_requested',
  'cash_receipt_document',
  'privacy_agreement',
  'broker_fee_receipt',
] as const;

export const CONTRACT_TEMPLATE_BODY_SEEDS: ContractTemplateBodySeed[] = [
  seed('base_contract', '부동산 거래계약 일반 조항', [
    '제1조 당사자는 표시된 부동산에 관하여 계약금, 중도금, 잔금 및 인도일을 약정한다.',
    '제2조 매도인 또는 임대인은 잔금 수령과 동시에 목적물을 인도하고 권리 이전에 필요한 서류를 제공한다.',
    '제3조 매수인 또는 임차인은 약정한 기일에 대금을 지급하고 계약 이행에 필요한 정보를 제공한다.',
    '제4조 계약 해제, 위약금, 원상회복, 특약은 본 계약서와 관계 법령에 따른다.',
  ]),
  seed('purchase_right_contract', '분양권 거래 실무 확인 항목', [
    '제1조 양도인은 분양계약상 권리와 의무의 범위를 양수인에게 설명하고 관련 서류를 제시한다.',
    '제2조 양수인은 분양대금 납부 현황, 중도금 대출, 전매 제한 및 명의변경 가능 여부를 확인한다.',
    '제3조 당사자는 시행사 또는 조합의 명의변경 승인 절차와 비용 부담 주체를 특약에 적는다.',
  ]),
  seed('union_member_right_contract', '입주권 거래 실무 확인 항목', [
    '제1조 양도인은 조합원 지위, 권리가액, 추가분담금 및 이전 제한 사항을 설명한다.',
    '제2조 양수인은 조합 정관, 사업 진행 단계, 승계 요건을 확인한 뒤 잔금 지급 여부를 결정한다.',
    '제3조 조합 승인 또는 관계기관 신고가 필요한 경우 그 기한과 미이행 책임을 특약으로 정한다.',
  ]),
  seed('commercial_premium_contract', '상가건물 임대차보호법 권리금 회수기회 보호 취지', [
    '제1조 기존 임차인은 신규 임차인에게 영업시설, 거래처, 신용, 영업상 이익 등 권리금 대상 가치를 이전한다.',
    '제2조 신규 임차인은 권리금 지급 전 임대차계약 체결 가능성, 임대인의 동의 및 업종 제한을 확인한다.',
    '제3조 권리금 계약은 임대차계약 성립을 전제로 하며, 불성립 시 반환 범위와 손해배상을 특약으로 정한다.',
  ]),
  seed('right_transfer_contract', '권리 양도 계약 실무 확인 항목', [
    '제1조 양도인은 대상 권리의 존재, 제한, 담보 제공 여부를 양수인에게 고지한다.',
    '제2조 양수인은 잔금 지급 전 권리 이전에 필요한 동의, 신고, 승계 절차를 확인한다.',
    '제3조 이전 불능 또는 제한 사유가 확인되면 해제와 비용 부담은 특약에 따른다.',
  ]),
  seed('right_succession_contract', '권리의무 승계 계약 실무 확인 항목', [
    '제1조 승계인은 기존 계약의 권리와 의무, 미납금, 보증금, 관리비 정산 내역을 승계 범위로 확인한다.',
    '제2조 양도인은 상대방 또는 관리 주체의 승낙이 필요한 사항을 잔금 전까지 협조한다.',
    '제3조 승계일 이후 발생하는 비용과 책임은 승계인이 부담하되, 이전 기간의 책임은 별도 정산한다.',
  ]),
  seed('standard_lease_contract', '법무부 주택임대차표준계약서', [
    '제1조 임대인은 목적 주택을 임차인에게 사용ㆍ수익하게 하고 임차인은 보증금과 차임을 지급한다.',
    '제2조 임대차 기간, 보증금, 차임, 관리비 및 지급 방법은 계약서 표시 내용에 따른다.',
    '제3조 임대인은 계약 체결 후 입주 전 권리관계 변동이 있을 경우 임차인에게 알려야 한다.',
    '제4조 임차인은 대항력, 우선변제권, 확정일자, 전입신고 등 보증금 보호 절차를 확인한다.',
    '제5조 수선, 원상회복, 계약갱신, 해지 및 보증금 반환은 주택임대차보호법과 특약에 따른다.',
  ], 'https://moj.go.kr/moj/314/subview.do'),
  seed('commercial_standard_lease_contract', '상가건물 임대차보호법 표준계약 취지', [
    '제1조 임대인은 상가건물을 영업 목적으로 사용하게 하고 임차인은 보증금과 차임을 지급한다.',
    '제2조 업종, 사용 범위, 관리비, 부가세, 원상회복 및 시설물 귀속 여부를 계약서에 명확히 적는다.',
    '제3조 임차인은 사업자등록, 확정일자, 권리금 회수기회 보호 및 갱신요구권 관련 사항을 확인한다.',
    '제4조 임대차 종료 시 보증금 반환, 명도, 시설물 정산 및 권리금 관련 분쟁 처리는 특약에 따른다.',
  ], 'https://www.moj.go.kr'),
  seed('house_lease_contract', '주택임대차보호법 및 주택 임대차 일반 조항', [
    '제1조 임대인은 주택을 임차인에게 인도하고 임차인은 약정 보증금과 차임을 지급한다.',
    '제2조 임차인은 입주 전 등기사항, 선순위 보증금, 조세 체납 가능성 및 관리비 내역을 확인한다.',
    '제3조 계약갱신, 묵시적 갱신, 해지 통지는 관계 법령과 특약에서 정한 방식에 따른다.',
  ]),
  seed('sublease_contract', '전대차 계약 일반 조항', [
    '제1조 전대인은 원 임대차계약상 전대 가능 여부와 임대인의 동의 여부를 전차인에게 설명한다.',
    '제2조 전차인은 원 임대차 기간, 보증금 반환 구조, 사용 범위 및 관리비 부담을 확인한다.',
    '제3조 원 임대차 종료 또는 동의 철회가 전대차에 미치는 영향은 특약으로 정한다.',
  ]),
  seed('sublease_agreement', '전대차 동의 확인 항목', [
    '임대인은 임차인이 표시된 목적물을 전차인에게 전대하는 것에 동의한다.',
    '동의 범위, 전대 기간, 사용 목적, 보증금 반환 책임 및 원 임대차와의 관계를 확인한다.',
  ]),
  seed('identity', '계약 당사자 확인 체크리스트', [
    '당사자의 성명, 생년월일, 주소, 연락처와 신분증 표시 내용의 일치 여부를 확인한다.',
    '대리인이 있는 경우 위임장, 인감증명서 또는 본인확인 자료를 함께 확인한다.',
  ]),
  seed('broker_explanation', '공인중개사법 시행규칙 중개대상물 확인ㆍ설명서', [
    '개업공인중개사는 중개대상물의 권리관계, 공법상 제한, 시설 상태, 거래 조건을 성실하고 정확하게 설명한다.',
    '설명의 근거가 되는 등기사항증명서, 건축물대장, 토지대장, 토지이용계획확인서 등 자료를 확인한다.',
    '거래당사자는 설명을 듣고 확인ㆍ설명서와 손해배상책임 보장 증명서류를 수령한다.',
  ], 'https://www.law.go.kr'),
  seed('broker_explanation_residential', '공인중개사법 시행규칙 별지 제20호서식 계열', [
    '주거용 건축물의 소재지, 면적, 권리관계, 비선호시설, 관리비, 입지조건 및 내부ㆍ외부 시설 상태를 확인한다.',
    '임대차인 경우 선순위 권리, 보증금 보호, 전입신고와 확정일자 관련 사항을 설명한다.',
  ], 'https://www.law.go.kr'),
  seed('broker_explanation_non_residential', '공인중개사법 시행규칙 별지 제20호의2서식 계열', [
    '비주거용 건축물의 용도, 권리관계, 공법상 제한, 관리비, 시설 상태, 업종 제한 및 인도 조건을 확인한다.',
    '영업용 건물은 부가세, 권리금, 원상회복, 인허가 가능성을 별도 확인 항목으로 관리한다.',
  ], 'https://www.law.go.kr'),
  seed('broker_explanation_land', '공인중개사법 시행규칙 별지 제20호의3서식 계열', [
    '토지의 지목, 면적, 경계, 도로, 토지이용계획, 공법상 제한, 거래허가 대상 여부를 확인한다.',
    '건축 가능성, 농지ㆍ산지 전용, 개발행위허가 등은 관계기관 자료를 기준으로 설명한다.',
  ], 'https://www.law.go.kr'),
  seed('broker_explanation_special', '공인중개사법 시행규칙 확인ㆍ설명 특수 항목', [
    '입목, 광업재단, 공장재단 등 특수 물건은 목적물의 표시, 권리관계, 이용 제한 및 이전 절차를 별도 확인한다.',
    '일반 부동산 서식으로 설명하기 어려운 항목은 첨부 자료와 특약에 근거를 남긴다.',
  ], 'https://www.law.go.kr'),
  seed('registry_document', '등기사항 및 권리관계 확인 체크리스트', [
    '등기사항증명서, 건축물대장, 토지대장 등 공적장부를 계약 직전 기준으로 확인한다.',
    '소유자, 근저당권, 가압류, 가처분, 전세권, 임차권등기 등 권리 제한 사항을 당사자에게 설명한다.',
  ]),
  seed('real_estate_transaction_report', '부동산 거래신고 제도 확인 항목', [
    '매매계약 체결 후 신고 대상, 신고 기한, 실제 거래가격, 계약 조건 및 당사자 정보를 확인한다.',
    '공동중개 또는 대리 신고가 있는 경우 신고 주체와 제출 자료를 명확히 한다.',
  ]),
  seed('real_estate_transaction_cancel_report', '부동산 거래계약 해제등 신고 확인 항목', [
    '계약 해제, 무효, 취소가 발생한 경우 해제 사유, 해제일, 당사자 확인 및 신고 기한을 확인한다.',
    '이미 신고된 거래의 정정 또는 해제 신고에 필요한 증빙 자료를 첨부한다.',
  ]),
  seed('house_transaction_report', '주택 거래계약 신고 확인 항목', [
    '주택 매매의 실제 거래가격, 자금조달 관련 확인사항, 계약 조건 및 신고 자료를 확인한다.',
    '신고 내용과 계약서 금액, 지급 일정, 당사자 정보가 일치하는지 대조한다.',
  ]),
  seed('lease_declaration', '주택 임대차계약 신고 제도 확인 항목', [
    '임대차계약의 보증금, 차임, 계약기간, 계약일, 임대인ㆍ임차인 정보를 신고 기준에 맞게 확인한다.',
    '신고 대상 지역과 금액 기준, 신고 기한, 변경ㆍ해제 신고 필요 여부를 확인한다.',
  ]),
  seed('lease_change_declaration', '임대차계약 변경신고 확인 항목', [
    '보증금, 차임, 계약기간, 당사자 등 신고된 임대차계약 내용이 변경된 경우 변경 전후 내용을 확인한다.',
    '변경일, 합의 방식, 증액 제한 또는 갱신 관련 쟁점은 특약과 함께 관리한다.',
  ]),
  seed('renewal_confirmation', '계약갱신요구권 행사 여부 확인 항목', [
    '임차인의 계약갱신요구권 행사 여부, 행사일, 거절 사유, 갱신 조건 변경 여부를 확인한다.',
    '당사자 확인 문구와 서명란을 통해 향후 분쟁 시 확인 자료로 보관한다.',
  ]),
  seed('guarantee_non_enrollment_agreement', '민간임대주택 보증 관련 확인 항목', [
    '임대보증금 보증 가입 대상 여부, 미가입 사유, 임차인의 설명 청취 및 동의 여부를 확인한다.',
    '보증 미가입에 따른 위험과 대체 보증 수단은 계약 전 별도로 고지한다.',
  ]),
  seed('guarantee_partial_enrollment_agreement', '민간임대주택 일부 보증 확인 항목', [
    '보증 가입 금액, 미보증 금액, 보증 기간, 보증기관 및 임차인 동의 여부를 확인한다.',
    '일부 가입으로 보호되지 않는 범위는 임차인이 이해할 수 있도록 별도 표시한다.',
  ]),
  seed('jeonse_registration_not_requested', '전세권설정 미요청 확인 항목', [
    '임차인이 전세권설정 등기를 요청하지 않는 경우 그 사실과 대체 보호 절차를 확인한다.',
    '전입신고, 확정일자, 점유 유지 등 보증금 보호 절차를 안내한다.',
  ]),
  seed('cash_receipt_document', '현금보관증 및 금전 수령 확인 문구', [
    '수령인은 표시 금액을 지정한 용도로 보관 또는 수령하였음을 확인한다.',
    '반환 조건, 사용 목적, 수령일, 지급 방법, 당사자 확인 사항을 함께 적는다.',
  ]),
  seed('privacy_agreement', '개인정보 수집ㆍ이용 동의 확인 항목', [
    '계약 진행, 중개대상물 확인, 신고, 세무ㆍ법무 협조를 위해 필요한 개인정보 항목과 이용 목적을 고지한다.',
    '보유 기간, 제3자 제공 여부, 동의 거부 권리를 확인하고 서명을 받는다.',
  ]),
  seed('broker_fee_receipt', '중개보수 영수증 표시 항목', [
    '개업공인중개사는 거래금액, 보수 요율, 산출 금액, 부가세, 지급일 및 지급자를 확인하여 영수한다.',
    '공동중개인 경우 각 사무소별 수령 금액과 발행 주체를 구분한다.',
  ]),
];

export const OFFICE_PRINT_TEMPLATE_SEEDS: OfficePrintTemplateSeed[] = [
  {
    type: 'contract_cover',
    title: '기본 계약서 표지',
    transactionTypes: [],
    isDefault: true,
    data: {
      showOfficeLogo: true,
      showBrokerInfo: true,
      showDocumentChecklist: true,
      footerText: '계약 전 공적장부와 당사자 신분을 다시 확인하세요.',
    },
  },
  {
    type: 'receipt',
    title: '기본 영수증 출력',
    transactionTypes: [],
    isDefault: true,
    data: {
      showVat: true,
      showPaymentMethod: true,
      showBrokerStamp: true,
      memo: '위 금액을 정히 영수합니다.',
    },
  },
  {
    type: 'ledger_print',
    title: '기본 거래대장 인쇄',
    transactionTypes: [],
    isDefault: true,
    data: {
      showCommissionSplit: true,
      showPartnerBroker: true,
      showPaymentSchedule: true,
      showDocumentStatus: true,
    },
  },
  {
    type: 'settlement',
    title: '기본 정산 출력물',
    transactionTypes: [],
    isDefault: true,
    data: {
      showAgentDistribution: true,
      showOfficeExpenses: true,
      showReceivableStatus: true,
    },
  },
  {
    type: 'office_notice',
    title: '기본 사무소 안내 문구',
    transactionTypes: [],
    isDefault: true,
    data: {
      notice:
        '본 출력물은 사무소 업무 참고용입니다. 계약 체결 전 최신 등기사항과 공식 서식을 확인하세요.',
    },
  },
];

export const OFFICE_CLAUSE_TEMPLATE_SEEDS: OfficeClauseTemplateSeed[] = [
  {
    type: 'special_terms_clause',
    contractKind: 'base_contract',
    transactionTypes: ['sale'],
    title: '기본 매매 특약',
    content:
      '현 시설물 상태에서 계약하며, 잔금일 전 권리관계 변동이 발생한 경우 매도인은 즉시 매수인에게 고지한다.',
    isDefault: true,
    sortOrder: 10,
  },
  {
    type: 'special_terms_clause',
    contractKind: 'standard_lease_contract',
    transactionTypes: ['jeonse', 'monthly'],
    title: '기본 임대차 특약',
    content:
      '임대인은 입주 전까지 현 권리관계를 유지하고, 임차인은 전입신고와 확정일자 등 보증금 보호 절차를 확인한다.',
    isDefault: true,
    sortOrder: 20,
  },
  {
    type: 'confirmation_clause',
    contractKind: 'broker_explanation',
    transactionTypes: [],
    title: '확인설명 기본 문구',
    content:
      '개업공인중개사는 계약 당사자에게 공적장부와 현장 확인 내용을 설명하고 관련 자료를 제시하였다.',
    isDefault: true,
    sortOrder: 30,
  },
  {
    type: 'office_notice',
    contractKind: null,
    transactionTypes: [],
    title: '사무소 공통 안내',
    content:
      '계약서 작성 전 등기사항증명서, 건축물대장, 납세 관련 자료, 대리권 확인 자료를 최신 발급본으로 재확인하세요.',
    isDefault: true,
    sortOrder: 40,
  },
];

export async function seedContractTemplateBodies(prisma: ContractTemplatePrisma) {
  const seedMap = new Map(CONTRACT_TEMPLATE_BODY_SEEDS.map((seed) => [seed.code, seed]));
  const templates = await prisma.contractDocumentTemplate.findMany({
    where: {
      officeId: null,
      code: { in: CONTRACT_TEMPLATE_BODY_SEEDS.map((seed) => seed.code) },
    },
    select: { id: true, code: true, metadata: true },
  });

  for (const template of templates) {
    const seed = seedMap.get(template.code);
    if (!seed) continue;

    await prisma.contractDocumentTemplate.update({
      where: { id: template.id },
      data: { metadata: mergeTemplateMetadata(template.metadata, seed) },
    });
  }
}

export async function seedOfficeContractTemplateDefaults(
  prisma: OfficeTemplatePrisma,
  officeId: string,
  createdById?: string | null,
) {
  await prisma.officePrintTemplate.deleteMany({
    where: {
      officeId,
      title: { in: OFFICE_PRINT_TEMPLATE_SEEDS.map((seed) => seed.title) },
    },
  });
  await prisma.officePrintTemplate.createMany({
    data: OFFICE_PRINT_TEMPLATE_SEEDS.map((seed) => ({
      officeId,
      type: seed.type,
      title: seed.title,
      transactionTypes: seed.transactionTypes,
      isDefault: seed.isDefault,
      isActive: true,
      data: seed.data,
      createdById,
    })),
  });

  await prisma.contractClauseTemplate.deleteMany({
    where: {
      officeId,
      title: { in: OFFICE_CLAUSE_TEMPLATE_SEEDS.map((seed) => seed.title) },
    },
  });
  await prisma.contractClauseTemplate.createMany({
    data: OFFICE_CLAUSE_TEMPLATE_SEEDS.map((seed) => ({
      officeId,
      type: seed.type,
      contractKind: seed.contractKind,
      transactionTypes: seed.transactionTypes,
      title: seed.title,
      content: seed.content,
      isDefault: seed.isDefault,
      isActive: true,
      sortOrder: seed.sortOrder,
      createdById,
    })),
  });
}

function seed(
  code: string,
  sourceName: string,
  lines: string[],
  sourceUrl?: string,
): ContractTemplateBodySeed {
  return {
    code,
    sourceName,
    sourceUrl,
    copiedVerbatimFromMySpider: false,
    fields: {
      bodyText: lines.join('\n'),
      legalBasisText: sourceName,
      sourceNotice: SOURCE_NOTICE,
    },
  };
}

function mergeTemplateMetadata(
  metadata: unknown,
  seed: ContractTemplateBodySeed,
): Record<string, unknown> {
  const current = asRecord(metadata);
  const documentEngine = asRecord(current.documentEngine);
  const fields = asRecord(documentEngine.fields);

  return {
    ...current,
    sourceName: seed.sourceName,
    sourceUrl: seed.sourceUrl ?? current.sourceUrl,
    copiedVerbatimFromMySpider: seed.copiedVerbatimFromMySpider,
    mySpiderReference: {
      ...asRecord(current.mySpiderReference),
      ...MYSPIDER_REFERENCE,
    },
    documentEngine: {
      ...documentEngine,
      version: 1,
      fields: {
        ...fields,
        ...seed.fields,
      },
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
