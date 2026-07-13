export type ContractDocumentEngineMetadata = Record<string, unknown>;

export type ContractDocumentEngineTemplate = {
  id: string;
  code: string;
  title: string;
  category: string;
  metadata?: ContractDocumentEngineMetadata | null;
};

export type ContractDocumentEngineDocument = {
  title?: string | null;
  metadata?: ContractDocumentEngineMetadata | null;
};

export type ContractDocumentEngineContact = {
  name?: string | null;
  phone?: string | null;
  address?: string | null;
};

export type ContractDocumentEngineProperty = {
  site?: {
    name?: string | null;
    roadAddress?: string | null;
    jibunAddress?: string | null;
  } | null;
  unit?: {
    name?: string | null;
    exclusiveAreaM2?: number | string | null;
    supplyAreaM2?: number | string | null;
    dong?: {
      name?: string | null;
      isPlaceholder?: boolean;
    } | null;
  } | null;
};

export type ContractDocumentEngineContract = {
  id: string;
  transactionType: string;
  totalPrice?: number | null;
  monthlyRent?: number | null;
  contractDate?: string | null;
  statedDeposit?: number | null;
  statedInterimPayment?: number | null;
  statedInterimDate?: string | null;
  statedBalance?: number | null;
  statedBalanceDate?: string | null;
  moveInDate?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  specialTerms?: string | null;
  memo?: string | null;
  buyerContact?: ContractDocumentEngineContact | null;
  sellerContact?: ContractDocumentEngineContact | null;
  deal?: {
    property?: ContractDocumentEngineProperty | null;
    listing?: {
      property?: ContractDocumentEngineProperty | null;
    } | null;
  } | null;
};

export type ContractDocumentEngineFields = {
  documentTitle: string;
  writtenDate: string;
  contractDateText: string;
  propertyLabel: string;
  propertyAddress: string;
  propertyAreaText: string;
  partyOneRole: string;
  partyOneName: string;
  partyOneAddress: string;
  partyOnePhone: string;
  partyTwoRole: string;
  partyTwoName: string;
  partyTwoAddress: string;
  partyTwoPhone: string;
  transactionTypeText: string;
  totalPriceText: string;
  monthlyRentText: string;
  paymentSchedule: string;
  leasePeriod: string;
  moveInDateText: string;
  bodyText: string;
  legalBasisText: string;
  sourceNotice: string;
  specialTerms: string;
  officeNotice: string;
  confirmationMemo: string;
  receiptMemo: string;
  ledgerMemo: string;
  settlementMemo: string;
} & Record<string, string>;

export type ContractDocumentEngineFieldDefinition = {
  key: keyof ContractDocumentEngineFields & string;
  label: string;
  multiline?: boolean;
};

export type ContractDocumentEngineFieldGroup = {
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
};

export type ContractDocumentEngineSection = {
  title: string;
  rows: Array<{
    label: string;
    value: string;
    multiline?: boolean;
  }>;
};

export type ContractDocumentEngineWorkflow = {
  inputFormName: string;
  reportName: string;
  formTitle: string;
  previewTitle: string;
};

export type ContractDocumentEngineDraft = {
  title: string;
  subtitle: string;
  category: string;
  templateCode: string;
  workflow: ContractDocumentEngineWorkflow;
  fields: ContractDocumentEngineFields;
  fieldGroups: ContractDocumentEngineFieldGroup[];
  sections: ContractDocumentEngineSection[];
};

export function buildContractDocumentEngineDraft({
  contract,
  template,
  document,
  baseDate = new Date(),
}: {
  contract: ContractDocumentEngineContract;
  template: ContractDocumentEngineTemplate;
  document?: ContractDocumentEngineDocument | null;
  baseDate?: Date;
}): ContractDocumentEngineDraft {
  const defaults = buildDefaultFields(contract, template, baseDate);
  const templateFields = readDocumentEngineFields(template.metadata);
  const documentFields = readDocumentEngineFields(document?.metadata);
  const fields: ContractDocumentEngineFields = {
    ...defaults,
    ...templateFields,
    ...documentFields,
  };

  const title = document?.title || fields.documentTitle || template.title;
  fields.documentTitle = fields.documentTitle || title;

  return {
    title,
    subtitle: `${getTransactionTypeLabel(contract.transactionType)} · ${getCategoryLabel(template.category)}`,
    category: template.category,
    templateCode: template.code,
    workflow: getContractDocumentEngineWorkflow(template),
    fields,
    fieldGroups: getContractDocumentEngineFieldGroups(template.category),
    sections: getContractDocumentEngineSections(template.category, fields),
  };
}

export function getContractDocumentEngineWorkflow(
  template: ContractDocumentEngineTemplate,
): ContractDocumentEngineWorkflow {
  const byCode: Record<string, Pick<ContractDocumentEngineWorkflow, 'inputFormName' | 'reportName'>> = {
    base_contract: {
      inputFormName: 'ContractInputForm',
      reportName: 'ApartmentTradeContractReport',
    },
    purchase_right_contract: {
      inputFormName: 'SalesRightContractInputForm',
      reportName: 'PurchaseRightTradeContractReport',
    },
    union_member_right_contract: {
      inputFormName: 'HProjectMembersContractFrom',
      reportName: 'HProjectMembersContractReport',
    },
    commercial_premium_contract: {
      inputFormName: 'BuildingLeasePremiumContractInputForm',
      reportName: 'BuildingLeasePremiumContractReport',
    },
    right_transfer_contract: {
      inputFormName: 'TransferContractInputForm',
      reportName: 'RightTransferContractReport',
    },
    right_succession_contract: {
      inputFormName: 'SuccessionContractInputForm',
      reportName: 'RightSuccessionContractReport',
    },
    standard_lease_contract: {
      inputFormName: 'StandardLeaseContractInputForm',
      reportName: 'StandardLeaseContractReport',
    },
    commercial_standard_lease_contract: {
      inputFormName: 'BuildingLeaseStandardContractInputForm',
      reportName: 'BuildingLeaseStandardContractReport',
    },
    house_lease_contract: {
      inputFormName: 'HouseLeaseContractInputForm',
      reportName: 'HouseLeaseContractReport',
    },
    sublease_contract: {
      inputFormName: 'SubleaseContractInputForm',
      reportName: 'RealStateSubleaseContractReport',
    },
    sublease_agreement: {
      inputFormName: 'SubleaseAgreeInputForm',
      reportName: 'SubleaseAgreeReport',
    },
    broker_explanation: {
      inputFormName: 'ConfirmExplanationInputForm1',
      reportName: 'MediationTargetConfrimExplanation1Report',
    },
    broker_explanation_residential: {
      inputFormName: 'ConfirmExplanationInputForm1',
      reportName: 'MediationTargetConfrimExplanation1Report',
    },
    broker_explanation_non_residential: {
      inputFormName: 'ConfirmExplanationInputForm2',
      reportName: 'MediationTargetConfrimExplanation2Report',
    },
    broker_explanation_land: {
      inputFormName: 'ConfirmExplanationInputForm3',
      reportName: 'MediationTargetConfrimExplanation3Report',
    },
    broker_explanation_special: {
      inputFormName: 'ConfirmExplanationInputForm4',
      reportName: 'MediationTargetConfrimExplanation4Report',
    },
    lease_declaration: {
      inputFormName: 'HouseLeaseDeclarationInputForm',
      reportName: 'HouseLeaseDeclarationReport',
    },
    lease_change_declaration: {
      inputFormName: 'LeaseChangeInputForm',
      reportName: 'LeaseChangeReport',
    },
    renewal_confirmation: {
      inputFormName: 'RenewalInputForm',
      reportName: 'RenewalReport',
    },
    guarantee_non_enrollment_agreement: {
      inputFormName: 'RenterAgreeInputForm',
      reportName: 'RenterAgreeReport',
    },
    guarantee_partial_enrollment_agreement: {
      inputFormName: 'RenterAgreeInputForm2',
      reportName: 'RenterAgreeReport2',
    },
    jeonse_registration_not_requested: {
      inputFormName: 'NotRequestInputForm',
      reportName: 'NotRequestReport',
    },
    cash_receipt_document: {
      inputFormName: 'CashReceiptInputForm',
      reportName: 'CashReceipReport',
    },
    broker_fee_receipt: {
      inputFormName: 'CashReceiptInputForm',
      reportName: 'ReceiptReport',
    },
  };

  const mapped = byCode[template.code] ?? getWorkflowByCategory(template.category);

  return {
    ...mapped,
    formTitle: `${template.title} 입력`,
    previewTitle: `${template.title} 출력 미리보기`,
  };
}

function getWorkflowByCategory(
  category: string,
): Pick<ContractDocumentEngineWorkflow, 'inputFormName' | 'reportName'> {
  if (category === 'explanation') {
    return {
      inputFormName: 'ConfirmExplanationInputForm1',
      reportName: 'MediationTargetConfrimExplanation1Report',
    };
  }

  if (category === 'receipt') {
    return {
      inputFormName: 'CashReceiptInputForm',
      reportName: 'ReceiptReport',
    };
  }

  if (category === 'report') {
    return {
      inputFormName: 'LeaseInputForm',
      reportName: 'LeaseReport',
    };
  }

  return {
    inputFormName: 'ContractInputForm',
    reportName: 'AnnexedReport',
  };
}

export function mergeContractDocumentEngineMetadata(
  metadata: ContractDocumentEngineMetadata | null | undefined,
  fields: Partial<ContractDocumentEngineFields>,
): ContractDocumentEngineMetadata {
  return {
    ...(metadata ?? {}),
    documentEngine: {
      version: 1,
      fields: cleanEngineFields(fields),
    },
  };
}

function buildDefaultFields(
  contract: ContractDocumentEngineContract,
  template: ContractDocumentEngineTemplate,
  baseDate: Date,
): ContractDocumentEngineFields {
  // 서버 /contracts 응답은 deal.listing.property 형태로 내려오고,
  // /deals 응답은 deal.property 가 합성돼 있으므로 둘 다 지원한다.
  const property = contract.deal?.property ?? contract.deal?.listing?.property;
  const siteName = property?.site?.name ?? '';
  const dong = property?.unit?.dong;
  const dongName = dong && !dong.isPlaceholder ? (dong.name ?? '') : '';
  const unitName = property?.unit?.name ?? '';
  const partyRoles = getPartyRoles(contract.transactionType);
  const seller = contract.sellerContact;
  const buyer = contract.buyerContact;

  return {
    documentTitle: template.title,
    writtenDate: formatEngineDate(baseDate),
    contractDateText: formatDateText(contract.contractDate),
    propertyLabel: [siteName, dongName, unitName].filter(Boolean).join(' ') || '-',
    propertyAddress:
      property?.site?.roadAddress ?? property?.site?.jibunAddress ?? '-',
    propertyAreaText: formatAreaText(
      property?.unit?.exclusiveAreaM2,
      property?.unit?.supplyAreaM2,
    ),
    partyOneRole: partyRoles.partyOne,
    partyOneName: seller?.name ?? '',
    partyOneAddress: seller?.address ?? '',
    partyOnePhone: seller?.phone ?? '',
    partyTwoRole: partyRoles.partyTwo,
    partyTwoName: buyer?.name ?? '',
    partyTwoAddress: buyer?.address ?? '',
    partyTwoPhone: buyer?.phone ?? '',
    transactionTypeText: getTransactionTypeLabel(contract.transactionType),
    totalPriceText: formatManwon(contract.totalPrice),
    monthlyRentText: contract.monthlyRent ? formatManwon(contract.monthlyRent) : '',
    paymentSchedule: buildPaymentSchedule(contract),
    leasePeriod: buildLeasePeriod(contract),
    moveInDateText: formatDateText(contract.moveInDate),
    bodyText: defaultBodyText(template.category),
    legalBasisText: defaultLegalBasisText(template.category),
    sourceNotice: defaultSourceNotice(template.metadata),
    specialTerms: contract.specialTerms ?? '',
    officeNotice: readString(template.metadata, 'officeNotice'),
    confirmationMemo: defaultConfirmationMemo(template.category),
    receiptMemo: defaultReceiptMemo(template.category),
    ledgerMemo: defaultLedgerMemo(template.category),
    settlementMemo: defaultSettlementMemo(template.category),
  };
}

export function getContractDocumentEngineFieldGroups(
  category: string,
): ContractDocumentEngineFieldGroup[] {
  const groups: ContractDocumentEngineFieldGroup[] = [
    {
      title: '문서 기본',
      fields: [
        { key: 'documentTitle', label: '문서 제목' },
        { key: 'writtenDate', label: '작성일' },
        { key: 'officeNotice', label: '사무소 안내 문구', multiline: true },
      ],
    },
    {
      title: '부동산 표시',
      fields: [
        { key: 'propertyLabel', label: '매물 표시' },
        { key: 'propertyAddress', label: '소재지' },
        { key: 'propertyAreaText', label: '면적' },
      ],
    },
    {
      title: '당사자',
      fields: [
        { key: 'partyOneRole', label: '갑 역할' },
        { key: 'partyOneName', label: '갑 성명' },
        { key: 'partyOneAddress', label: '갑 주소' },
        { key: 'partyOnePhone', label: '갑 연락처' },
        { key: 'partyTwoRole', label: '을 역할' },
        { key: 'partyTwoName', label: '을 성명' },
        { key: 'partyTwoAddress', label: '을 주소' },
        { key: 'partyTwoPhone', label: '을 연락처' },
      ],
    },
    {
      title: '거래 조건',
      fields: [
        { key: 'transactionTypeText', label: '거래 유형' },
        { key: 'totalPriceText', label: '거래 금액' },
        { key: 'monthlyRentText', label: '월 차임' },
        { key: 'paymentSchedule', label: '지급 일정', multiline: true },
        { key: 'leasePeriod', label: '임대차 기간' },
        { key: 'moveInDateText', label: '입주/인도일' },
      ],
    },
    {
      title: '서식 본문',
      fields: [
        { key: 'bodyText', label: '본문 조항/안내문', multiline: true },
        { key: 'legalBasisText', label: '근거/확인 기준', multiline: true },
        { key: 'sourceNotice', label: '출처/검토 안내', multiline: true },
      ],
    },
    {
      title: '특약 및 확인',
      fields: [
        { key: 'specialTerms', label: '특약사항', multiline: true },
        { key: 'confirmationMemo', label: '확인 메모', multiline: true },
      ],
    },
  ];

  if (category === 'receipt') {
    groups.push({
      title: '영수증',
      fields: [{ key: 'receiptMemo', label: '영수증 비고', multiline: true }],
    });
  }

  if (category === 'report') {
    groups.push({
      title: '신고/대장',
      fields: [{ key: 'ledgerMemo', label: '거래대장/신고 메모', multiline: true }],
    });
  }

  if (category === 'attachment' || category === 'guarantee') {
    groups.push({
      title: '정산/보증',
      fields: [{ key: 'settlementMemo', label: '정산/보증 표시 문구', multiline: true }],
    });
  }

  return groups;
}

export function getContractDocumentEngineSections(
  category: string,
  fields: ContractDocumentEngineFields,
): ContractDocumentEngineSection[] {
  const sections: ContractDocumentEngineSection[] = [
    {
      title: '1. 부동산의 표시',
      rows: [
        { label: '소재지', value: fields.propertyAddress },
        { label: '매물', value: fields.propertyLabel },
        { label: '면적', value: fields.propertyAreaText },
      ],
    },
    {
      title: '2. 계약 당사자',
      rows: [
        { label: fields.partyOneRole, value: formatParty(fields, 'partyOne') },
        { label: fields.partyTwoRole, value: formatParty(fields, 'partyTwo') },
      ],
    },
    {
      title: '3. 거래 조건',
      rows: [
        { label: '거래 유형', value: fields.transactionTypeText },
        { label: '계약일', value: fields.contractDateText },
        { label: '거래 금액', value: fields.totalPriceText },
        { label: '월 차임', value: fields.monthlyRentText || '-' },
        { label: '지급 일정', value: fields.paymentSchedule, multiline: true },
        { label: '임대차 기간', value: fields.leasePeriod || '-' },
        { label: '입주/인도일', value: fields.moveInDateText || '-' },
      ],
    },
    {
      title: '4. 서식 본문',
      rows: [
        { label: '본문', value: fields.bodyText || '-', multiline: true },
        { label: '근거/확인 기준', value: fields.legalBasisText || '-', multiline: true },
      ],
    },
    {
      title: '5. 특약 및 확인사항',
      rows: [
        { label: '특약사항', value: fields.specialTerms || '-', multiline: true },
        { label: '확인 메모', value: fields.confirmationMemo || '-', multiline: true },
      ],
    },
  ];

  if (fields.officeNotice) {
    sections.push({
      title: '6. 사무소 안내',
      rows: [{ label: '안내 문구', value: fields.officeNotice, multiline: true }],
    });
  }

  if (fields.sourceNotice) {
    sections.push({
      title: '서식 출처 및 검토',
      rows: [{ label: '안내', value: fields.sourceNotice, multiline: true }],
    });
  }

  if (category === 'receipt') {
    sections.push({
      title: '영수증 표시',
      rows: [{ label: '비고', value: fields.receiptMemo || '-', multiline: true }],
    });
  }

  if (category === 'report') {
    sections.push({
      title: '신고/대장 표시',
      rows: [{ label: '메모', value: fields.ledgerMemo || '-', multiline: true }],
    });
  }

  if (category === 'attachment' || category === 'guarantee') {
    sections.push({
      title: '정산/보증 표시',
      rows: [{ label: '문구', value: fields.settlementMemo || '-', multiline: true }],
    });
  }

  return sections;
}

function readDocumentEngineFields(
  metadata: ContractDocumentEngineMetadata | null | undefined,
): Record<string, string> {
  const documentEngine = readObject(metadata, 'documentEngine');
  const engine = readObject(metadata, 'engine');
  const fields =
    readObject(documentEngine, 'fields') ??
    readObject(engine, 'fields') ??
    readObject(metadata, 'fields');

  if (!fields) return {};

  return cleanEngineFields(fields);
}

function cleanEngineFields(
  fields: Record<string, unknown> | Partial<ContractDocumentEngineFields>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

function readObject(
  source: ContractDocumentEngineMetadata | null | undefined,
  key: string,
): Record<string, unknown> | null {
  if (!source) return null;
  const value = source[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(
  source: ContractDocumentEngineMetadata | null | undefined,
  key: string,
): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

function getPartyRoles(transactionType: string) {
  if (transactionType === 'sale') {
    return { partyOne: '매도인', partyTwo: '매수인' };
  }

  return { partyOne: '임대인', partyTwo: '임차인' };
}

function getTransactionTypeLabel(transactionType: string) {
  const labels: Record<string, string> = {
    sale: '매매',
    jeonse: '전세',
    monthly: '월세',
    exchange: '교환',
    sublease: '전대',
    transfer: '권리양도',
    succession: '권리승계',
  };
  return labels[transactionType] ?? transactionType;
}

function getCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    agreement: '동의서',
    attachment: '첨부',
    confirmation: '확인서',
    contract: '계약서',
    explanation: '확인설명',
    guarantee: '보증',
    identity: '신분',
    receipt: '영수증',
    report: '신고',
  };
  return labels[category] ?? category;
}

function buildPaymentSchedule(contract: ContractDocumentEngineContract) {
  return [
    contract.statedDeposit ? `계약금 ${formatManwon(contract.statedDeposit)}` : null,
    contract.statedInterimPayment
      ? `중도금 ${formatManwon(contract.statedInterimPayment)} (${formatDateText(contract.statedInterimDate)})`
      : null,
    contract.statedBalance
      ? `잔금 ${formatManwon(contract.statedBalance)} (${formatDateText(contract.statedBalanceDate)})`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function buildLeasePeriod(contract: ContractDocumentEngineContract) {
  if (!contract.leaseStartDate && !contract.leaseEndDate) return '';
  return `${formatDateText(contract.leaseStartDate)}부터 ${formatDateText(contract.leaseEndDate)}까지`;
}

function formatParty(
  fields: ContractDocumentEngineFields,
  prefix: 'partyOne' | 'partyTwo',
) {
  const name = fields[`${prefix}Name`];
  const address = fields[`${prefix}Address`];
  const phone = fields[`${prefix}Phone`];
  return [name, address, phone].filter(Boolean).join(' / ') || '-';
}

function formatAreaText(
  exclusiveAreaM2: number | string | null | undefined,
  supplyAreaM2: number | string | null | undefined,
) {
  const parts = [
    formatSingleArea('전용', exclusiveAreaM2),
    formatSingleArea('공급', supplyAreaM2),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' / ') : '-';
}

/** "전용 84.92㎡ (25.7평)" — 평 = m² × 0.3025, 소수 1자리 */
function formatSingleArea(
  prefix: string,
  m2: number | string | null | undefined,
) {
  if (m2 == null || m2 === '') return null;
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return null;
  const m2Text = String(Math.round(value * 100) / 100);
  const pyeong = (value * 0.3025).toFixed(1);
  return `${prefix} ${m2Text}㎡ (${pyeong}평)`;
}

function formatManwon(value: number | null | undefined) {
  if (!value) return '';
  if (value >= 10000) {
    const eok = Math.floor(value / 10000);
    const man = value % 10000;
    return man === 0 ? `${eok}억` : `${eok}억 ${man.toLocaleString('ko-KR')}만`;
  }
  return `${value.toLocaleString('ko-KR')}만`;
}

function formatEngineDate(value: Date) {
  return `${value.getFullYear()}.${String(value.getMonth() + 1).padStart(2, '0')}.${String(value.getDate()).padStart(2, '0')}`;
}

function formatDateText(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return formatEngineDate(date);
}

function defaultConfirmationMemo(category: string) {
  if (category === 'explanation') {
    return '중개대상물의 권리관계, 시설 상태, 거래 조건을 계약 당사자에게 설명했습니다.';
  }

  if (category === 'confirmation') {
    return '계약 당사자의 요청 및 확인 사항을 문서 작성 시점 기준으로 확인했습니다.';
  }

  return '';
}

function defaultBodyText(category: string) {
  if (category === 'contract') {
    return '계약 목적물, 당사자, 금액, 지급 일정, 인도일, 특약 및 계약 해제 조건을 확인합니다.';
  }

  if (category === 'explanation') {
    return '중개대상물의 권리관계, 공법상 제한, 시설 상태, 거래 조건 및 확인 자료를 설명합니다.';
  }

  if (category === 'report') {
    return '신고 대상 정보, 계약 금액, 계약일, 당사자 정보 및 제출 기한을 확인합니다.';
  }

  if (category === 'receipt') {
    return '수령 금액, 지급인, 수령인, 지급 목적, 지급 방법 및 수령일을 확인합니다.';
  }

  return '문서 작성에 필요한 입력값과 첨부 자료를 확인합니다.';
}

function defaultLegalBasisText(category: string) {
  if (category === 'explanation') {
    return '공인중개사법 및 같은 법 시행규칙 확인ㆍ설명서 서식 기준';
  }

  if (category === 'report') {
    return '부동산 거래신고 및 임대차 신고 관련 공개 신고 서식 기준';
  }

  if (category === 'contract') {
    return '민법, 주택임대차보호법, 상가건물 임대차보호법 및 공개 표준계약서 기준';
  }

  return '업무 확인용 테스트 서식 기준';
}

function defaultSourceNotice(metadata: ContractDocumentEngineMetadata | null | undefined) {
  const sourceName = readString(metadata, 'sourceName');
  const sourceUrl = readString(metadata, 'sourceUrl');
  const copiedVerbatim = metadata?.copiedVerbatimFromMySpider;
  const sourceText = [sourceName, sourceUrl].filter(Boolean).join(' · ');
  const copyText =
    copiedVerbatim === false
      ? '마이스파이더 원문은 복제하지 않고 문서 범위와 흐름만 참고했습니다.'
      : '';

  return [sourceText, copyText].filter(Boolean).join('\n');
}

function defaultReceiptMemo(category: string) {
  return category === 'receipt' ? '위 금액을 정히 영수합니다.' : '';
}

function defaultLedgerMemo(category: string) {
  return category === 'report' ? '거래대장 및 신고 출력 전 금액, 일정, 당사자 정보를 재확인합니다.' : '';
}

function defaultSettlementMemo(category: string) {
  return category === 'guarantee' || category === 'attachment'
    ? '보증, 정산, 첨부 서류의 표시 항목을 사무소 기준에 맞게 확인합니다.'
    : '';
}
