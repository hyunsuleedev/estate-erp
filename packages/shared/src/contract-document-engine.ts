/**
 * 계약 문서 엔진 (순수 TS — React 없음).
 *
 * 레거시 MySpider DMIN001I1M/I2M 에디터 셸의 "폼 정의는 데이터, 엔진은 하나" 원칙 이식.
 * - draft 빌더: contract + template(.metadata) + document(.metadata) → 편집 가능한 필드 셋
 * - fieldGroups: template.metadata.documentEngine.fieldGroups(카탈로그 시드) 우선,
 *   없으면 category 기반 공통 6그룹 fallback
 * - sections: A4 인쇄 미리보기 렌더용 섹션/행 (금액은 한글 병기 — 레거시 GetHangulFromNum)
 * - parties: ContractParty(side one/two/office, subId 순, 대리인 agents 중첩) 반복 렌더
 *
 * 금액은 Estate ERP 관례인 **만원 단위 정수(Int)** 를 따른다.
 */

import {
  createResidentialSaleAgreementDraft,
  readResidentialSaleAgreement,
  type ResidentialSaleAgreementDraft,
} from './contract-agreement.js';
import {
  formatContractAmountWithWon,
  type ContractAmountNotation,
} from './contract-amount.js';
import { isContractRichTextHtml } from './contract-rich-text.js';
import { CONTRACT_TRANSACTION_TYPE_LABELS } from './enums.js';

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
  id?: string | null;
  name?: string | null;
  phone?: string | null;
  address?: string | null;
  phones?: Array<{
    phone: string;
    isPrimary: boolean;
  }>;
};

/**
 * v2 property shape — 서버 /contracts 응답의 deal.listing.property 와
 * /deals 응답의 합성 deal.property 가 공유하는 구조.
 * site 주소는 도로명/지번 이중 주소, dong 은 unit 아래로 중첩되며
 * placeholder(단일 동 건물) 여부를 함께 내려준다.
 */
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
    siteUnitType?: {
      exclusiveAreaM2?: number | string | null;
    } | null;
  } | null;
};

/**
 * 계약서 당사자 행 (레거시 TPCT02S/TPCT28S 대응).
 * api-client 의 ContractParty 와 구조적으로 호환된다 (필요 필드만 선언).
 * - side: 'one'(매도/임대측) | 'two'(매수/임차측) | 'office'(중개사무소)
 * - 대리인은 agents 로 중첩 (parentId 가 있는 행은 대리인 행)
 * - idNumber 는 서버가 마스킹('*')해 내려줄 수 있음 — 엔진은 받은 값을 그대로 표시만 한다.
 */
export type ContractDocumentEngineParty = {
  side: string;
  subId?: number | null;
  role?: string | null;
  name?: string | null;
  idType?: string | null;
  idNumber?: string | null;
  address?: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  sharePercent?: string | null;
  country?: string | null;
  parentId?: string | null;
  agentLabel?: string | null;
  officeName?: string | null;
  officeRegNo?: string | null;
  agents?: ContractDocumentEngineParty[] | null;
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
  office?: {
    name?: string | null;
    licenseNo?: string | null;
    ceoName?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null;
  buyerContact?: ContractDocumentEngineContact | null;
  sellerContact?: ContractDocumentEngineContact | null;
  /** 당사자 배열 — side(one→two→office) → subId 정렬, 대리인 agents 중첩. 없으면 buyer/sellerContact fallback */
  parties?: ContractDocumentEngineParty[] | null;
  deal?: {
    property?: ContractDocumentEngineProperty | null;
    listing?: {
      property?: ContractDocumentEngineProperty | null;
    } | null;
  } | null;
};

/**
 * 매매계약서(base_contract × sale) 전용 구조화 초안 글루 —
 * 저장된 residentialSaleAgreement 스냅샷이 있으면 그것을, 없으면 계약
 * 스냅샷에서 kr-residential-sale-agreement v1 초안을 생성한다
 * (shared contract-agreement.ts 연동, 서버 prepareSaleContractDraft 와 동일 스키마).
 */
export function buildResidentialSaleAgreement(
  contract: ContractDocumentEngineContract,
  template: ContractDocumentEngineTemplate,
  document?: ContractDocumentEngineDocument | null,
): ResidentialSaleAgreementDraft | null {
  if (template.code !== 'base_contract' || contract.transactionType !== 'sale') {
    return null;
  }

  const stored = readResidentialSaleAgreement(document?.metadata);
  if (stored) return stored;

  const property = contract.deal?.property ?? contract.deal?.listing?.property;
  const dong = property?.unit?.dong;
  const targetDescription = [
    property?.site?.name,
    dong && !dong.isPlaceholder ? dong.name : null,
    property?.unit?.name,
  ]
    .filter(Boolean)
    .join(' ');

  return createResidentialSaleAgreementDraft({
    actualAgreementAt: contract.contractDate,
    writtenAt: contract.contractDate,
    property: {
      roadAddress: property?.site?.roadAddress ?? '',
      jibunAddress: property?.site?.jibunAddress ?? '',
      targetDescription,
      buildingAreaM2: toNullableEngineNumber(
        property?.unit?.exclusiveAreaM2 ?? property?.unit?.siteUnitType?.exclusiveAreaM2,
      ),
    },
    payment: {
      totalPriceManwon: contract.totalPrice,
      depositManwon: contract.statedDeposit,
      depositDueAt: contract.contractDate ?? undefined,
      interimManwon: contract.statedInterimPayment,
      interimDueAt: contract.statedInterimDate ?? undefined,
      balanceManwon: contract.statedBalance,
      balanceDueAt: contract.statedBalanceDate ?? undefined,
    },
    transfer: {
      deliveryAt: contract.moveInDate ?? contract.statedBalanceDate ?? undefined,
      ownershipTransferAt: contract.statedBalanceDate ?? undefined,
      explanationDeliveredAt: contract.contractDate ?? undefined,
      rightsTransferDetails:
        '잔금 지급과 동시에 소유권이전등기에 필요한 서류를 교부하고 권리관계를 정리한다.',
    },
    seller: {
      contactId: contract.sellerContact?.id ?? null,
      name: contract.sellerContact?.name ?? '',
      address: contract.sellerContact?.address ?? '',
      phone: getEngineContactPhone(contract.sellerContact),
    },
    buyer: {
      contactId: contract.buyerContact?.id ?? null,
      name: contract.buyerContact?.name ?? '',
      address: contract.buyerContact?.address ?? '',
      phone: getEngineContactPhone(contract.buyerContact),
    },
    brokerage: {
      officeName: contract.office?.name ?? '',
      registrationNo: contract.office?.licenseNo ?? '',
      representativeName: contract.office?.ceoName ?? '',
      address: contract.office?.address ?? '',
      phone: contract.office?.phone ?? '',
    },
    specialTerms: contract.specialTerms,
  });
}

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
  // 인덱스 시그니처로만 존재하는 파생 필드 (기존 호출부의 전량 리터럴 생성 하위호환):
  // - totalPriceHangulText / monthlyRentHangulText: 한글 금액 병기 ("일금 …원정 (₩…)")
  // - template.metadata.documentEngine.fieldGroups 가 정의한 서식별 필드 키
} & Record<string, string>;

/** template metadata 기반 입력 타입 (카탈로그 ContractTemplateFieldType 대응) */
export type ContractDocumentEngineFieldInputType =
  | 'text'
  | 'number'
  | 'amount'
  | 'date'
  | 'select'
  | 'textarea'
  | 'checkbox';

export type ContractDocumentEngineFieldDefinition = {
  key: keyof ContractDocumentEngineFields & string;
  label: string;
  multiline?: boolean;
  /** template.metadata.documentEngine.fieldGroups 에서 온 입력 타입 (없으면 text 취급) */
  inputType?: ContractDocumentEngineFieldInputType;
  /** select 옵션 목록 */
  options?: string[];
  /** 단위 표기 (amount='만원', number='m2' 등) */
  unit?: string;
};

export type ContractDocumentEngineFieldGroup = {
  /** metadata fieldGroups 의 그룹 key (fallback 그룹은 생략) */
  key?: string;
  title: string;
  fields: ContractDocumentEngineFieldDefinition[];
};

/** template.metadata.documentEngine.fieldGroups 원본 스키마 (카탈로그 시드 형태) */
export type ContractDocumentEngineTemplateField = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  /** 거래유형 조건부 표시 (없으면 전체 표시) */
  appliesTo?: string[];
  unit?: string;
};

export type ContractDocumentEngineTemplateFieldGroup = {
  key?: string;
  title: string;
  fields: ContractDocumentEngineTemplateField[];
};

export type ContractDocumentEngineSection = {
  title: string;
  rows: Array<{
    label: string;
    value: string;
    multiline?: boolean;
    /**
     * value 가 rich text HTML (특약 등) — 렌더러는 반드시 새니타이즈 후
     * HTML 로 렌더해야 한다 (shared sanitizeContractRichText / DOMPurify).
     * 엔진은 원문을 유지하고 새니타이즈는 렌더 경로 책임으로 둔다.
     */
    html?: boolean;
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

export type ContractDocumentEngineFieldGroupOptions = {
  /** 현재 계약의 거래유형 — metadata fieldGroups 의 appliesTo 필터에 사용. 없으면 전체 노출 */
  transactionType?: string;
};

export type ContractDocumentEngineSectionOptions = {
  /** 당사자 반복 렌더 (레거시 TPCT02S person/offc 블록). 없으면 fields 기반 2행 fallback */
  parties?: ContractDocumentEngineParty[] | null;
  /**
   * template.metadata.documentEngine.fieldGroups 기반 편집 그룹 —
   * 서식별 필드(융자금·2차중도금·확인설명 항목 등)를 그룹 제목=섹션,
   * 필드 라벨/값=행으로 추가 렌더한다 (빈 값 스킵, 공통 섹션과 중복 키 제외).
   * category fallback 그룹은 전부 공통 키라 추가 섹션이 생기지 않는다.
   */
  fieldGroups?: ContractDocumentEngineFieldGroup[] | null;
};

export function buildContractDocumentEngineDraft({
  contract,
  template,
  document,
  primaryDocument,
  baseDate = new Date(),
}: {
  contract: ContractDocumentEngineContract;
  template: ContractDocumentEngineTemplate;
  document?: ContractDocumentEngineDocument | null;
  /**
   * 주 계약서 문서 (레거시 getMainContractInfo, §3.3-3) — 부속 서식
   * (확인설명서/위임장 등)이 주 서식에 입력된 소재지·표시·금액 스케줄 값을
   * 기본값으로 승계한다. 우선순위: 계약 엔터티 defaults < 주 서식 필드 <
   * template.metadata < 이 문서에 저장된 필드.
   */
  primaryDocument?: ContractDocumentEngineDocument | null;
  baseDate?: Date;
}): ContractDocumentEngineDraft {
  const defaults = buildDefaultFields(contract, template, baseDate);
  const primaryFields = filterPrimaryInheritedFields(
    readDocumentEngineFields(primaryDocument?.metadata),
  );
  const templateFields = readDocumentEngineFields(template.metadata);
  const documentFields = readDocumentEngineFields(document?.metadata);
  // 신규 문서(저장된 엔진 필드 없음)에만 서식(kind)×거래유형별 기본 본문 조항을
  // 주입한다 — 레거시 DMSV001Q03 이 Cntr_Part 기본 문구를 종류ㆍ거래구분별로
  // 로드하던 동작. 저장된 문서(사용자 편집)는 절대 덮어쓰지 않는다.
  const isNewDocument = Object.keys(documentFields).length === 0;
  const defaultBodyText = isNewDocument
    ? getContractDocumentEngineDefaultBodyText(template, contract.transactionType)
    : '';
  const fields: ContractDocumentEngineFields = {
    ...defaults,
    ...primaryFields,
    ...templateFields,
    // template.metadata.documentEngine.fields.bodyText(거래유형 공통 본문)보다
    // 거래유형별 defaultBody 가 우선한다. 매칭되는 유형이 없으면 공통 본문 유지.
    ...(defaultBodyText ? { bodyText: defaultBodyText } : {}),
    ...documentFields,
  };

  const title = document?.title || fields.documentTitle || template.title;
  fields.documentTitle = fields.documentTitle || title;

  const fieldGroups = getContractDocumentEngineFieldGroups(template, {
    transactionType: contract.transactionType,
  });

  // metadata 구동 필드그룹의 키가 fields 에 없으면 빈 값으로 초기화한다
  // (controlled input 안정성 + merge 시 키 유지).
  for (const group of fieldGroups) {
    for (const field of group.fields) {
      if (fields[field.key] === undefined) {
        fields[field.key] = '';
      }
    }
  }

  return {
    title,
    subtitle: `${getTransactionTypeLabel(contract.transactionType)} · ${getCategoryLabel(template.category)}`,
    category: template.category,
    templateCode: template.code,
    workflow: getContractDocumentEngineWorkflow(template),
    fields,
    fieldGroups,
    sections: getContractDocumentEngineSections(template.category, fields, {
      parties: contract.parties ?? undefined,
      fieldGroups,
    }),
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

// ─────────────────────────────────────────────────────────────
// printOptions — 문서 단위 표기/인쇄 옵션 (metadata.documentEngine.printOptions)
// 레거시 priceUnitRadioGroup(금액단위) / pricePrintTypeRadioGroup(한글·漢字) /
// chkBlank*(공란인쇄) / grantOrInterimcheckEdit(현임차보증금 행) / chkSecUse(2조 직접입력).
// fields 맵(string 관례)과 분리된 별도 JSON 객체 — 서버 스키마 변경 없음.
// ─────────────────────────────────────────────────────────────

/** 금액 입력 해석 단위 (입력 편의용). 저장값은 항상 만원 Int 문자열로 불변 */
export type ContractDocumentEngineAmountUnit = 'manwon' | 'chun' | 'won';

export type ContractDocumentEnginePrintOptions = {
  /** 금액 입력창의 해석 단위 — 기본 manwon. 저장은 항상 만원 Int (표시/해석만 변경) */
  amountUnit: ContractDocumentEngineAmountUnit;
  /** 인쇄 시 금액 표기 — 기본 hangul ("일금 …원정"), hanja ("金…원整") */
  amountNotation: ContractAmountNotation;
  /** 융자금 공란인쇄 — 값이 비어도 인쇄 행 유지 (인쇄 반영은 P5) */
  financeLoanBlankPrint?: boolean;
  /** 2차 중도금 공란인쇄 */
  interim2BlankPrint?: boolean;
  /** '현 임차보증금 입력란 추가' — 현 임대보증금 행 토글 */
  includeTenantDeposit?: boolean;
  /** '계약사항2조 직접입력' — 제2조 자동 문장 대신 본문 조항에 직접 기재 */
  directClause2?: boolean;
};

export const CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS: ContractDocumentEnginePrintOptions =
  {
    amountUnit: 'manwon',
    amountNotation: 'hangul',
  };

const PRINT_OPTION_AMOUNT_UNITS: ReadonlySet<string> = new Set(['manwon', 'chun', 'won']);
const PRINT_OPTION_AMOUNT_NOTATIONS: ReadonlySet<string> = new Set(['hangul', 'hanja']);
const PRINT_OPTION_BOOLEAN_KEYS = [
  'financeLoanBlankPrint',
  'interim2BlankPrint',
  'includeTenantDeposit',
  'directClause2',
] as const;

/** 저장/병합 전 정리 — 알 수 없는 키·형식이 어긋난 값은 조용히 버린다 */
function sanitizePrintOptions(
  raw: Record<string, unknown> | Partial<ContractDocumentEnginePrintOptions> | null | undefined,
): Partial<ContractDocumentEnginePrintOptions> {
  if (!raw) return {};
  const record = raw as Record<string, unknown>;
  const result: Partial<ContractDocumentEnginePrintOptions> = {};

  if (typeof record.amountUnit === 'string' && PRINT_OPTION_AMOUNT_UNITS.has(record.amountUnit)) {
    result.amountUnit = record.amountUnit as ContractDocumentEngineAmountUnit;
  }
  if (
    typeof record.amountNotation === 'string' &&
    PRINT_OPTION_AMOUNT_NOTATIONS.has(record.amountNotation)
  ) {
    result.amountNotation = record.amountNotation as ContractAmountNotation;
  }
  for (const key of PRINT_OPTION_BOOLEAN_KEYS) {
    if (typeof record[key] === 'boolean') {
      result[key] = record[key] as boolean;
    }
  }

  return result;
}

/**
 * metadata.documentEngine.printOptions 읽기 — 저장된 값을 검증하고 기본값
 * (amountUnit: manwon, amountNotation: hangul)으로 채워 항상 완전한 객체를 반환한다.
 */
export function getContractDocumentEnginePrintOptions(
  metadata: ContractDocumentEngineMetadata | null | undefined,
): ContractDocumentEnginePrintOptions {
  const documentEngine = readObject(metadata, 'documentEngine');
  const stored = sanitizePrintOptions(readObject(documentEngine, 'printOptions'));
  return { ...CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS, ...stored };
}

/**
 * 조항 에디터 세대 마커 — 조항 에디터 저장 경로는 printOptions 를 항상 함께
 * 기록하므로, 유효한 printOptions 존재 여부로 "조항 에디터로 저장된 적 있는
 * 문서"를 판별한다.
 *
 * 매매초안 이관(plan §4.4) 1회 판별에 쓴다: 구 편집기(-residential-sale-editor)
 * 저장 경로도 documentEngine.fields 를 항상 기록했기 때문에(초기 draft 기본값
 * 스냅샷, '' 값도 키 유지) fields 존재 여부로는 이관 여부를 구분할 수 없다.
 */
export function hasContractDocumentEnginePrintOptions(
  metadata: ContractDocumentEngineMetadata | null | undefined,
): boolean {
  const documentEngine = readObject(metadata, 'documentEngine');
  const stored = readObject(documentEngine, 'printOptions');
  return stored !== null && Object.keys(sanitizePrintOptions(stored)).length > 0;
}

/**
 * printOptions 만 갱신하는 병합 — documentEngine.fields 등 기존 내용은 보존한다.
 * (fields 도 함께 저장할 때는 mergeContractDocumentEngineMetadata 의 3번째 인자 사용)
 */
export function mergeContractDocumentEnginePrintOptions(
  metadata: ContractDocumentEngineMetadata | null | undefined,
  printOptions: Partial<ContractDocumentEnginePrintOptions>,
): ContractDocumentEngineMetadata {
  const documentEngine = readObject(metadata, 'documentEngine') ?? {};
  const merged = {
    ...sanitizePrintOptions(readObject(documentEngine, 'printOptions')),
    ...sanitizePrintOptions(printOptions),
  };

  return {
    ...(metadata ?? {}),
    documentEngine: {
      ...documentEngine,
      version: 1,
      printOptions: merged,
    },
  };
}

export function mergeContractDocumentEngineMetadata(
  metadata: ContractDocumentEngineMetadata | null | undefined,
  fields: Partial<ContractDocumentEngineFields>,
  printOptions?: Partial<ContractDocumentEnginePrintOptions>,
): ContractDocumentEngineMetadata {
  // 기존 저장된 printOptions 는 인자를 넘기지 않아도 보존한다 — 제네릭 편집기 등
  // printOptions 를 모르는 저장 경로가 조항 에디터의 옵션을 지우지 않도록.
  const documentEngine = readObject(metadata, 'documentEngine');
  const mergedPrintOptions = {
    ...sanitizePrintOptions(readObject(documentEngine, 'printOptions')),
    ...sanitizePrintOptions(printOptions),
  };

  return {
    ...(metadata ?? {}),
    documentEngine: {
      version: 1,
      fields: recomputeHangulAmountFields(cleanEngineFields(fields)),
      ...(Object.keys(mergedPrintOptions).length > 0
        ? { printOptions: mergedPrintOptions }
        : {}),
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 매매초안(residentialSaleAgreement 스냅샷) → engineFields 이관 (plan §4.4)
// 조항 에디터는 engineFields 를 단일 진실로 사용한다. 기존 문서에 스냅샷만 있으면
// 열 때 1회 변환해 engineFields 로 기록하고, 스냅샷은 읽기 하위호환으로만 유지한다.
// ─────────────────────────────────────────────────────────────

/**
 * document.metadata 의 contractAgreement(kr-residential-sale-agreement v1) 스냅샷을
 * 카탈로그 base_contract engineFields 키로 변환한다. 스냅샷이 없으면 null.
 *
 * - 값은 전부 string 관례 (금액은 만원 Int 문자열).
 * - 빈 값은 키를 만들지 않는다 — draft 빌드 시 계약 스냅샷 기본값을 덮지 않도록.
 * - 중개사무소 전화(brokerage.phone)는 대응하는 카탈로그 키가 없어 변환하지 않는다.
 */
export function convertResidentialSaleAgreementToEngineFields(
  metadata: ContractDocumentEngineMetadata | null | undefined,
): Record<string, string> | null {
  const agreement = readResidentialSaleAgreement(metadata);
  if (!agreement) return null;

  const fields: Record<string, string> = {};
  const set = (key: string, value: string | null | undefined) => {
    const trimmed = (value ?? '').trim();
    if (trimmed) fields[key] = trimmed;
  };
  const setNumber = (key: string, value: number | null) => {
    if (value === null || !Number.isFinite(value) || value <= 0) return;
    fields[key] = String(value);
  };

  // 계약일/부동산 표시
  set('contractDate', agreement.actualAgreementAt);
  set('propertyAddress', agreement.property.roadAddress || agreement.property.jibunAddress);
  set('propertyLabel', agreement.property.targetDescription);
  set('landCategory', agreement.property.landCategory);
  setNumber('landArea', agreement.property.landAreaM2);
  set('buildingStructure', agreement.property.buildingStructure);
  set('buildingUse', agreement.property.buildingUse);
  setNumber('buildingArea', agreement.property.buildingAreaM2);

  // 매매대금과 지급 일정 (만원 Int 문자열)
  setNumber('salePrice', agreement.payment.totalPriceManwon);
  setNumber('downPayment', agreement.payment.depositManwon);
  setNumber('interimPayment', agreement.payment.interimManwon);
  set('interimPaymentDate', agreement.payment.interimDueAt);
  setNumber('balancePayment', agreement.payment.balanceManwon);
  set('balancePaymentDate', agreement.payment.balanceDueAt);

  // 인도
  set('handoverDate', agreement.transfer.deliveryAt);

  // 당사자 (대표 1인 — 공동 당사자는 ContractParty 모델이 별도 관리)
  const seller = agreement.sellers[0];
  if (seller) {
    set('partyOneName', seller.name);
    set('partyOneIdNumber', seller.identificationNoMasked);
    set('partyOneAddress', seller.address);
    set('partyOnePhone', seller.phone);
  }
  const buyer = agreement.buyers[0];
  if (buyer) {
    set('partyTwoName', buyer.name);
    set('partyTwoIdNumber', buyer.identificationNoMasked);
    set('partyTwoAddress', buyer.address);
    set('partyTwoPhone', buyer.phone);
  }

  // 중개사무소
  set('brokerOfficeName', agreement.brokerage.officeName);
  set('brokerOfficeRegNo', agreement.brokerage.registrationNo);
  set('brokerCeoName', agreement.brokerage.representativeName);
  set('brokerOfficeAddress', agreement.brokerage.address);
  set('brokerAgentName', agreement.brokerage.associateName);

  // 특약
  set('specialTerms', agreement.specialTerms);

  return fields;
}

/**
 * 조항 에디터 저장 시 engineFields → residentialSaleAgreement 스냅샷 역반영 (plan §4.4).
 *
 * 서버 완료 검증(assertSaleAgreementDocumentCanComplete)과 MCP
 * validate_sale_contract_draft / prepareSaleContractDraft 는 여전히
 * metadata.contractAgreement 스냅샷을 진실로 읽는다. 조항 에디터가 engineFields 만
 * 갱신하면 두 저장 포맷이 영구 분기하므로(사용자가 조항 에디터에서 고친 금액과
 * 다른 값으로 완료 검증/AI 응답), 저장 시 스냅샷을 편집값 기준으로 재생성해
 * 함께 기록한다.
 *
 * - 스냅샷이 없는 문서(조항 에디터로 새로 작성)는 null 을 반환한다 — 새 스냅샷을
 *   만들지 않는다. 서버 검증은 contractAgreement 키가 있을 때만 동작하므로
 *   engineFields 단일 포맷으로 유지된다.
 * - engineFields 에 대응 키가 없는 스냅샷 필드(작성일·계약금 지급일·소유권 이전일·
 *   인도 조건·중개사무소 전화 등)는 기존 스냅샷 값을 보존한다.
 * - 2차 중도금(interimPayment2)은 v1 스키마에 자리가 없어 interimManwon 에
 *   합산한다 — 금액 합계 검증(계약금+중도금+잔금=매매대금) 정합 유지.
 * - '계약사항2조 직접입력'(printOptions.directClause2)으로 인도일 입력이 숨겨진
 *   경우, 빈 handoverDate 가 기존 인도일을 지우지 않도록 스냅샷 값을 보존한다.
 */
export function applyEngineFieldsToResidentialSaleAgreement(
  metadata: ContractDocumentEngineMetadata | null | undefined,
  fields: Record<string, string>,
  printOptions?: ContractDocumentEnginePrintOptions | null,
): ResidentialSaleAgreementDraft | null {
  const base = readResidentialSaleAgreement(metadata);
  if (!base) return null;

  const textOf = (key: string) => (fields[key] ?? '').trim();
  /** 금액 텍스트 → 만원 Int (빈 값/파싱 불가는 null — 검증이 별도로 잡는다) */
  const manwonOf = (key: string): number | null => {
    const raw = textOf(key);
    if (!raw) return null;
    return parseContractManwonText(raw);
  };
  const numberOf = (key: string): number | null => {
    const raw = textOf(key);
    if (!raw) return null;
    const parsed = Number(raw.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  // 이관(convertResidentialSaleAgreementToEngineFields)이 roadAddress || jibunAddress
  // 를 propertyAddress 하나로 합쳤으므로, 지번주소와 같은 값이면 도로명 주소를
  // 덮지 않는다 (도로명이 비어 지번이 노출됐던 케이스의 왕복 안정성).
  const address = textOf('propertyAddress');
  const roadAddress =
    address && address === base.property.jibunAddress
      ? base.property.roadAddress
      : address;

  // 2차 중도금은 v1 스키마에 별도 자리가 없다 — 합산해 합계 검증 정합 유지
  const interim1 = manwonOf('interimPayment');
  const interim2 = manwonOf('interimPayment2');
  const interimManwon =
    interim1 === null && interim2 === null ? null : (interim1 ?? 0) + (interim2 ?? 0);

  const sellerOverlay = {
    name: textOf('partyOneName'),
    identificationNoMasked: textOf('partyOneIdNumber'),
    address: textOf('partyOneAddress'),
    phone: textOf('partyOnePhone'),
  };
  const buyerOverlay = {
    name: textOf('partyTwoName'),
    identificationNoMasked: textOf('partyTwoIdNumber'),
    address: textOf('partyTwoAddress'),
    phone: textOf('partyTwoPhone'),
  };

  return createResidentialSaleAgreementDraft({
    actualAgreementAt: textOf('contractDate'),
    writtenAt: base.writtenAt,
    property: {
      roadAddress,
      jibunAddress: base.property.jibunAddress,
      targetDescription: textOf('propertyLabel'),
      landCategory: textOf('landCategory'),
      landAreaM2: numberOf('landArea'),
      buildingStructure: textOf('buildingStructure'),
      buildingUse: textOf('buildingUse'),
      buildingAreaM2: numberOf('buildingArea'),
    },
    payment: {
      totalPriceManwon: manwonOf('salePrice'),
      depositManwon: manwonOf('downPayment'),
      depositDueAt: base.payment.depositDueAt,
      interimManwon,
      interimDueAt: textOf('interimPaymentDate') || textOf('interimPayment2Date'),
      balanceManwon: manwonOf('balancePayment'),
      balanceDueAt: textOf('balancePaymentDate'),
    },
    transfer: {
      // directClause2 로 제2조(인도일 입력)가 숨겨진 상태의 빈 값은 기존 값 보존
      deliveryAt:
        textOf('handoverDate') ||
        (printOptions?.directClause2 ? base.transfer.deliveryAt : ''),
      ownershipTransferAt: base.transfer.ownershipTransferAt,
      rightsTransferDetails: base.transfer.rightsTransferDetails,
      conditions: base.transfer.conditions,
      explanationDeliveredAt: base.transfer.explanationDeliveredAt,
    },
    // 대표 1인만 engineFields 와 동기화 (이관 방향과 대칭) — 공동 당사자는 보존
    sellers:
      base.sellers.length > 0
        ? base.sellers.map((party, index) =>
            index === 0 ? { ...party, ...sellerOverlay } : party,
          )
        : undefined,
    seller: base.sellers.length === 0 ? sellerOverlay : undefined,
    buyers:
      base.buyers.length > 0
        ? base.buyers.map((party, index) =>
            index === 0 ? { ...party, ...buyerOverlay } : party,
          )
        : undefined,
    buyer: base.buyers.length === 0 ? buyerOverlay : undefined,
    brokerage: {
      ...base.brokerage,
      officeName: textOf('brokerOfficeName'),
      registrationNo: textOf('brokerOfficeRegNo'),
      representativeName: textOf('brokerCeoName'),
      address: textOf('brokerOfficeAddress'),
      associateName: textOf('brokerAgentName'),
    },
    specialTerms: fields.specialTerms ?? '',
    sourceNotice: base.sourceNotice,
  });
}

export type BaseContractSaleValidationIssue = {
  path: string;
  message: string;
};

export type BaseContractSaleValidation = {
  errors: BaseContractSaleValidationIssue[];
  warnings: BaseContractSaleValidationIssue[];
  isValid: boolean;
};

/**
 * base_contract × sale engineFields 검증 (순수 함수) —
 * validateResidentialSaleAgreement 의 금액 합계·필수 일자 검사를 engineFields 기반으로 이식.
 *
 * errors:
 * - 매매대금 필수 + 만원 숫자 형식
 * - 계약금 + 중도금 + 2차 중도금 + 잔금 합계 = 매매대금 (융자금·현 임대보증금은
 *   승계 여부 표시용이라 합계에 포함하지 않음 — 레거시 동일)
 * - 필수 일자: 계약 체결일 / 잔금 지급일 / 인도일
 *   (인도일은 printOptions.directClause2 = '계약사항2조 직접입력' 체크 시 생략 —
 *   제2조 자동 문장과 인도일 입력이 숨겨지고 본문 조항에 직접 기재하므로,
 *   필수로 두면 해소 불가능한 오류가 영구 표시된다)
 * - 중도금(1·2차) 금액이 있으면 해당 지급일 필수
 * warnings:
 * - 부동산 소재지, 당사자 성명 미입력
 */
export function validateBaseContractSaleEngineFields(
  fields: Record<string, string>,
  printOptions?: ContractDocumentEnginePrintOptions | null,
): BaseContractSaleValidation {
  const errors: BaseContractSaleValidationIssue[] = [];
  const warnings: BaseContractSaleValidationIssue[] = [];

  const textOf = (key: string) => (fields[key] ?? '').trim();

  /** 금액 텍스트 → 만원 Int. 비어 있으면 0, 형식 오류는 error 후 0 처리 */
  const readAmount = (key: string, label: string): number => {
    const raw = textOf(key);
    if (!raw) return 0;
    const parsed = parseContractManwonText(raw);
    if (parsed === null) {
      errors.push({ path: key, message: `${label} 금액 형식을 확인하세요 (만원 단위 숫자).` });
      return 0;
    }
    return parsed;
  };

  const salePriceText = textOf('salePrice');
  const salePrice = salePriceText ? parseContractManwonText(salePriceText) : null;
  if (!salePriceText || salePrice === 0) {
    errors.push({ path: 'salePrice', message: '매매대금을 입력하세요.' });
  } else if (salePrice === null) {
    errors.push({ path: 'salePrice', message: '매매대금 금액 형식을 확인하세요 (만원 단위 숫자).' });
  }

  const downPayment = readAmount('downPayment', '계약금');
  const interimPayment = readAmount('interimPayment', '중도금');
  const interimPayment2 = readAmount('interimPayment2', '2차 중도금');
  const balancePayment = readAmount('balancePayment', '잔금');

  if (salePrice !== null && salePrice > 0) {
    const paymentSum = downPayment + interimPayment + interimPayment2 + balancePayment;
    if (paymentSum !== salePrice) {
      errors.push({
        path: 'payment',
        message: '계약금·중도금·잔금 합계가 매매대금과 일치하지 않습니다.',
      });
    }
  }

  if (!textOf('contractDate')) {
    errors.push({ path: 'contractDate', message: '계약 체결일을 입력하세요.' });
  }
  if (!textOf('balancePaymentDate')) {
    errors.push({ path: 'balancePaymentDate', message: '잔금 지급일을 입력하세요.' });
  }
  // '계약사항2조 직접입력' 체크 시 제2조(인도일 임베디드 문장)가 숨겨지고
  // 인도일은 본문 조항(bodyText)에 직접 기재된다 — 필수 검사 생략 (레거시 chkSecUse)
  if (!textOf('handoverDate') && printOptions?.directClause2 !== true) {
    errors.push({ path: 'handoverDate', message: '부동산 인도일을 입력하세요.' });
  }
  if (interimPayment > 0 && !textOf('interimPaymentDate')) {
    errors.push({ path: 'interimPaymentDate', message: '중도금 지급일을 입력하세요.' });
  }
  if (interimPayment2 > 0 && !textOf('interimPayment2Date')) {
    errors.push({ path: 'interimPayment2Date', message: '2차 중도금 지급일을 입력하세요.' });
  }

  if (!textOf('propertyAddress')) {
    warnings.push({ path: 'propertyAddress', message: '부동산 소재지를 확인하세요.' });
  }
  if (!textOf('partyOneName')) {
    warnings.push({ path: 'partyOneName', message: '매도인 성명을 확인하세요.' });
  }
  if (!textOf('partyTwoName')) {
    warnings.push({ path: 'partyTwoName', message: '매수인 성명을 확인하세요.' });
  }

  return {
    errors,
    warnings,
    isValid: errors.length === 0,
  };
}

const HANGUL_TEXT_SUFFIX = 'HangulText';

/**
 * 저장 시점에 모든 `*HangulText`(한글 금액 병기) 파생 필드를 현재 금액값에서
 * 재계산한다 — draft 빌드 시점 스냅샷이 편집된 금액과 어긋나 법적 문서에
 * 상반된 두 금액이 인쇄되는 사고 방지 (레거시 GetHangulFromNum 은 항상
 * 출력 시점 계산이었음).
 * 값 키 해석: `salePriceHangulText` → `salePrice`, `totalPriceHangulText` →
 * `totalPrice`(없으면 `totalPriceText`).
 */
function recomputeHangulAmountFields(
  fields: Record<string, string>,
): Record<string, string> {
  const next = { ...fields };

  for (const key of Object.keys(next)) {
    if (!key.endsWith(HANGUL_TEXT_SUFFIX)) continue;

    const base = key.slice(0, -HANGUL_TEXT_SUFFIX.length);
    const primary = next[base];
    const source =
      primary !== undefined && primary.trim() !== ''
        ? primary
        : (next[`${base}Text`] ?? primary);

    if (source === undefined) continue;

    const parsed = parseContractManwonText(source);
    next[key] = parsed !== null && parsed > 0 ? formatAmountWithWonSafe(parsed) : '';
  }

  return next;
}

/**
 * 금액 텍스트 → 만원 정수 파싱.
 * 허용: "35000", "35,000", "3억", "3억 5000만", "5000만", "5000만원".
 * 그 외 자유 텍스트/음수/소수는 null (한글 병기를 생략해 모순 표기를 막는다).
 */
export function parseContractManwonText(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '');
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number(trimmed);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }

  const match = trimmed.match(/^(?:(\d+)\s*억)?\s*(?:(\d+)\s*만(?:\s*원)?)?$/);
  if (!match || (!match[1] && !match[2])) return null;

  const total = Number(match[1] ?? 0) * 10000 + Number(match[2] ?? 0);
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * 렌더 시점 한글 병기 파생 — 저장된 `*HangulText` 스냅샷 대신 현재 금액
 * 텍스트에서 계산한다. 파싱 불가(자유 텍스트)면 병기를 생략한다.
 */
function deriveAmountHangul(amountText: string | undefined): string {
  const trimmed = (amountText ?? '').trim();
  if (!trimmed) return '';

  const parsed = parseContractManwonText(trimmed);
  return parsed !== null && parsed > 0 ? formatAmountWithWonSafe(parsed) : '';
}

/**
 * 주 서식 → 부속 서식 승계에서 제외하는 문서 고유 필드.
 * 제목/작성일/본문·근거·안내 문구는 문서(카테고리)마다 달라야 하므로
 * 주 계약서 값이 확인설명서·위임장 등의 기본값을 덮지 않도록 한다.
 */
const PRIMARY_INHERIT_EXCLUDED_KEYS: ReadonlySet<string> = new Set([
  'documentTitle',
  'writtenDate',
  'bodyText',
  'legalBasisText',
  'sourceNotice',
  'officeNotice',
  'confirmationMemo',
  'receiptMemo',
  'ledgerMemo',
  'settlementMemo',
]);

function filterPrimaryInheritedFields(
  fields: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) => !PRIMARY_INHERIT_EXCLUDED_KEYS.has(key),
    ),
  );
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
  const partyRoles = getContractPartySideLabels(contract.transactionType);
  const seller = contract.sellerContact;
  const buyer = contract.buyerContact;
  const principals = getPrincipalParties(contract.parties);
  const partyOne = principals.find((party) => party.side === 'one') ?? null;
  const partyTwo = principals.find((party) => party.side === 'two') ?? null;

  return {
    documentTitle: template.title,
    writtenDate: formatEngineDate(baseDate),
    contractDateText: formatDateText(contract.contractDate),
    propertyLabel: [siteName, dongName, unitName].filter(Boolean).join(' ') || '-',
    propertyAddress: property?.site?.roadAddress ?? property?.site?.jibunAddress ?? '-',
    propertyAreaText: formatAreaText(
      property?.unit?.exclusiveAreaM2,
      property?.unit?.supplyAreaM2,
    ),
    partyOneRole: partyOne?.role || partyRoles.one,
    partyOneName: partyOne ? (partyOne.name ?? '') : (seller?.name ?? ''),
    partyOneAddress: partyOne ? (partyOne.address ?? '') : (seller?.address ?? ''),
    partyOnePhone: partyOne
      ? partyOne.mobilePhone || partyOne.phone || ''
      : (seller?.phone ?? ''),
    partyTwoRole: partyTwo?.role || partyRoles.two,
    partyTwoName: partyTwo ? (partyTwo.name ?? '') : (buyer?.name ?? ''),
    partyTwoAddress: partyTwo ? (partyTwo.address ?? '') : (buyer?.address ?? ''),
    partyTwoPhone: partyTwo
      ? partyTwo.mobilePhone || partyTwo.phone || ''
      : (buyer?.phone ?? ''),
    transactionTypeText: getTransactionTypeLabel(contract.transactionType),
    totalPriceText: formatManwon(contract.totalPrice),
    totalPriceHangulText: formatAmountWithWonSafe(contract.totalPrice),
    monthlyRentText: contract.monthlyRent ? formatManwon(contract.monthlyRent) : '',
    monthlyRentHangulText: formatAmountWithWonSafe(contract.monthlyRent),
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

/**
 * 편집 폼 필드그룹.
 * - template 을 넘기면 template.metadata.documentEngine.fieldGroups(카탈로그 시드)를 우선 사용하고,
 *   appliesTo(거래유형) 조건은 options.transactionType 기준으로 필터한다.
 * - 문자열(category)을 넘기면 기존과 동일한 category 기반 공통 6그룹을 반환한다 (하위호환).
 */
export function getContractDocumentEngineFieldGroups(
  category: string,
): ContractDocumentEngineFieldGroup[];
export function getContractDocumentEngineFieldGroups(
  template: ContractDocumentEngineTemplate,
  options?: ContractDocumentEngineFieldGroupOptions,
): ContractDocumentEngineFieldGroup[];
export function getContractDocumentEngineFieldGroups(
  categoryOrTemplate: string | ContractDocumentEngineTemplate,
  options?: ContractDocumentEngineFieldGroupOptions,
): ContractDocumentEngineFieldGroup[] {
  if (typeof categoryOrTemplate === 'string') {
    return getDefaultFieldGroups(categoryOrTemplate);
  }

  const template = categoryOrTemplate;
  const templateGroups = readTemplateFieldGroups(template.metadata);

  if (templateGroups.length > 0) {
    const mapped = templateGroups
      .map((group) => mapTemplateFieldGroup(group, options?.transactionType))
      .filter((group) => group.fields.length > 0);
    if (mapped.length > 0) return mapped;
  }

  return getDefaultFieldGroups(template.category);
}

function getDefaultFieldGroups(category: string): ContractDocumentEngineFieldGroup[] {
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

const TEMPLATE_FIELD_INPUT_TYPES: ReadonlySet<string> = new Set([
  'text',
  'number',
  'amount',
  'date',
  'select',
  'textarea',
  'checkbox',
]);

/** template.metadata.documentEngine.fieldGroups 파싱 (형식이 어긋난 항목은 조용히 건너뜀) */
function readTemplateFieldGroups(
  metadata: ContractDocumentEngineMetadata | null | undefined,
): ContractDocumentEngineTemplateFieldGroup[] {
  const documentEngine = readObject(metadata, 'documentEngine');
  const raw = documentEngine?.fieldGroups;
  if (!Array.isArray(raw)) return [];

  const groups: ContractDocumentEngineTemplateFieldGroup[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.title !== 'string' || !Array.isArray(record.fields)) continue;

    const fields: ContractDocumentEngineTemplateField[] = [];
    for (const rawField of record.fields) {
      if (!rawField || typeof rawField !== 'object' || Array.isArray(rawField)) continue;
      const fieldRecord = rawField as Record<string, unknown>;
      if (typeof fieldRecord.key !== 'string' || typeof fieldRecord.label !== 'string') {
        continue;
      }
      fields.push({
        key: fieldRecord.key,
        label: fieldRecord.label,
        type: typeof fieldRecord.type === 'string' ? fieldRecord.type : undefined,
        options: readStringArray(fieldRecord.options),
        appliesTo: readStringArray(fieldRecord.appliesTo),
        unit: typeof fieldRecord.unit === 'string' ? fieldRecord.unit : undefined,
      });
    }

    groups.push({
      key: typeof record.key === 'string' ? record.key : undefined,
      title: record.title,
      fields,
    });
  }

  return groups;
}

function mapTemplateFieldGroup(
  group: ContractDocumentEngineTemplateFieldGroup,
  transactionType: string | undefined,
): ContractDocumentEngineFieldGroup {
  const fields = group.fields
    .filter((field) => fieldAppliesToTransaction(field, transactionType))
    .map((field) => mapTemplateField(field));

  return {
    key: group.key,
    title: group.title,
    fields,
  };
}

function fieldAppliesToTransaction(
  field: ContractDocumentEngineTemplateField,
  transactionType: string | undefined,
): boolean {
  if (!field.appliesTo || field.appliesTo.length === 0) return true;
  // 거래유형을 모르는 호출부(범용 렌더링)는 전체 필드를 노출한다.
  if (!transactionType) return true;
  return field.appliesTo.includes(transactionType);
}

function mapTemplateField(
  field: ContractDocumentEngineTemplateField,
): ContractDocumentEngineFieldDefinition {
  const inputType = (
    field.type && TEMPLATE_FIELD_INPUT_TYPES.has(field.type) ? field.type : 'text'
  ) as ContractDocumentEngineFieldInputType;

  const label = field.unit ? `${field.label} (${field.unit})` : field.label;

  return {
    key: field.key,
    label,
    inputType,
    multiline: inputType === 'textarea' ? true : undefined,
    options: field.options && field.options.length > 0 ? field.options : undefined,
    unit: field.unit,
  };
}

export function getContractDocumentEngineSections(
  category: string,
  fields: ContractDocumentEngineFields,
  options?: ContractDocumentEngineSectionOptions,
): ContractDocumentEngineSection[] {
  // 한글 병기는 저장된 스냅샷(*HangulText)이 아니라 현재 금액 텍스트에서
  // 렌더 시점에 파생한다 — 편집된 금액과 상반된 병기가 인쇄되는 사고 방지.
  const totalPriceHangul = deriveAmountHangul(fields.totalPriceText);
  const monthlyRentHangul = deriveAmountHangul(fields.monthlyRentText);

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
      rows: buildPartyRows(fields, options?.parties),
    },
    {
      title: '3. 거래 조건',
      rows: [
        { label: '거래 유형', value: fields.transactionTypeText },
        { label: '계약일', value: fields.contractDateText },
        {
          label: '거래 금액',
          value: formatAmountRow(fields.totalPriceText, totalPriceHangul),
        },
        {
          label: '월 차임',
          value:
            fields.monthlyRentText || monthlyRentHangul
              ? formatAmountRow(fields.monthlyRentText, monthlyRentHangul)
              : '-',
        },
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
        {
          label: '특약사항',
          value: fields.specialTerms || '-',
          multiline: true,
          // 레거시 Rider_Part HTML — 렌더러가 새니타이즈 후 HTML 렌더
          html: isContractRichTextHtml(fields.specialTerms) || undefined,
        },
        { label: '확인 메모', value: fields.confirmationMemo || '-', multiline: true },
      ],
    },
  ];

  // template metadata fieldGroups 로 입력된 서식별 필드(융자금·2차중도금·
  // 확인설명 항목 등)를 그룹 단위 섹션으로 추가 렌더 — 편집 폼에서 채운 값이
  // 인쇄물에서 조용히 누락되지 않도록 한다.
  sections.push(...buildTemplateFieldGroupSections(fields, options?.fieldGroups));

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

/**
 * 공통 고정 섹션(부동산 표시/당사자/거래 조건/본문/특약 등)이 이미 렌더하는
 * 필드 키 — metadata fieldGroups 섹션 렌더 시 같은 값이 두 번 인쇄되지 않도록
 * 제외한다. salePrice/deposit/monthlyRent 는 편집기(PRIMARY_AMOUNT_MIRRORS)가
 * 공통 '거래 조건' 행(totalPriceText/monthlyRentText)으로 미러하므로 함께 제외.
 */
const COMMON_SECTION_FIELD_KEYS: ReadonlySet<string> = new Set([
  'documentTitle',
  'writtenDate',
  'propertyAddress',
  'propertyLabel',
  'propertyAreaText',
  'partyOneRole',
  'partyOneName',
  'partyOneAddress',
  'partyOnePhone',
  'partyTwoRole',
  'partyTwoName',
  'partyTwoAddress',
  'partyTwoPhone',
  'transactionTypeText',
  'contractDateText',
  'totalPriceText',
  'monthlyRentText',
  'paymentSchedule',
  'leasePeriod',
  'moveInDateText',
  'bodyText',
  'legalBasisText',
  'sourceNotice',
  'specialTerms',
  'confirmationMemo',
  'officeNotice',
  'receiptMemo',
  'ledgerMemo',
  'settlementMemo',
  'salePrice',
  'deposit',
  'monthlyRent',
]);

/**
 * template.metadata.documentEngine.fieldGroups 기반 추가 섹션 빌드.
 * - 그룹 제목 = 섹션 제목, 필드 라벨/값 = 행
 * - 빈 값·공통 섹션 중복 키·`*HangulText` 파생 키는 스킵
 * - amount 필드는 한글 병기("일금 …원정 (₩…)")를 렌더 시점에 파생
 * - checkbox('true'/'' 관례)는 '예' 로 표기
 * category fallback 그룹은 전부 공통 키라 추가 섹션이 생기지 않는다.
 */
function buildTemplateFieldGroupSections(
  fields: ContractDocumentEngineFields,
  fieldGroups: ContractDocumentEngineFieldGroup[] | null | undefined,
): ContractDocumentEngineSection[] {
  if (!fieldGroups || fieldGroups.length === 0) return [];

  const sections: ContractDocumentEngineSection[] = [];

  for (const group of fieldGroups) {
    const rows: ContractDocumentEngineSection['rows'] = [];

    for (const field of group.fields) {
      if (COMMON_SECTION_FIELD_KEYS.has(field.key)) continue;
      if (field.key.endsWith(HANGUL_TEXT_SUFFIX)) continue;

      const value = fields[field.key] ?? '';
      if (!value.trim()) continue;

      if (field.inputType === 'checkbox') {
        rows.push({ label: field.label, value: value === 'true' ? '예' : value });
        continue;
      }

      if (field.inputType === 'amount') {
        rows.push({
          label: field.label,
          value: formatAmountRow(value, deriveAmountHangul(value)),
        });
        continue;
      }

      rows.push({
        label: field.label,
        value,
        multiline: field.multiline || field.inputType === 'textarea' || undefined,
      });
    }

    if (rows.length > 0) {
      sections.push({ title: group.title, rows });
    }
  }

  return sections;
}

/**
 * 당사자 섹션 행 렌더.
 * parties 가 있으면 side one → two 본인 행 + 중첩 대리인 + office 행을 반복 출력하고
 * (레거시 TPCT02S person/offc 블록 스택), 없으면 fields 기반 2행 fallback 을 유지한다.
 */
function buildPartyRows(
  fields: ContractDocumentEngineFields,
  parties: ContractDocumentEngineParty[] | null | undefined,
): ContractDocumentEngineSection['rows'] {
  const principals = getPrincipalParties(parties);

  if (principals.length === 0) {
    return [
      { label: fields.partyOneRole, value: formatParty(fields, 'partyOne') },
      { label: fields.partyTwoRole, value: formatParty(fields, 'partyTwo') },
    ];
  }

  const sideLabels: Record<string, string> = {
    one: fields.partyOneRole || '갑',
    two: fields.partyTwoRole || '을',
  };

  const sideCounts: Record<string, number> = {};
  for (const party of principals) {
    if (party.side === 'office') continue;
    sideCounts[party.side] = (sideCounts[party.side] ?? 0) + 1;
  }

  const rows: ContractDocumentEngineSection['rows'] = [];
  const sideIndices: Record<string, number> = {};
  let officeIndex = 0;

  for (const party of principals) {
    if (party.side === 'office') {
      officeIndex += 1;
      rows.push({
        label: party.role || (officeIndex === 1 ? '개업공인중개사' : `공동중개 ${officeIndex - 1}`),
        value: formatOfficePartyLine(party),
      });
      continue;
    }

    sideIndices[party.side] = (sideIndices[party.side] ?? 0) + 1;
    const baseLabel = party.role || sideLabels[party.side] || party.side;
    const label =
      (sideCounts[party.side] ?? 0) > 1 ? `${baseLabel} ${sideIndices[party.side]}` : baseLabel;

    rows.push({ label, value: formatPartyLine(party) });

    for (const agent of party.agents ?? []) {
      rows.push({
        label: `${label} ${agent.agentLabel || '대리인'}`,
        value: formatPartyLine(agent),
      });
    }
  }

  return rows;
}

/** 본인 행만 (parentId 가 있는 대리인 행은 agents 중첩으로 렌더) */
function getPrincipalParties(
  parties: ContractDocumentEngineParty[] | null | undefined,
): ContractDocumentEngineParty[] {
  if (!parties || parties.length === 0) return [];
  return parties.filter((party) => !party.parentId);
}

/** 마스킹된 idNumber('*' 포함)는 받은 그대로 표시한다 — 복호/재조회는 엔진 책임이 아님 */
function formatPartyLine(party: ContractDocumentEngineParty): string {
  return (
    [
      party.name,
      party.idNumber,
      party.address,
      party.mobilePhone || party.phone,
      party.sharePercent ? `지분 ${party.sharePercent}` : null,
    ]
      .filter(Boolean)
      .join(' / ') || '-'
  );
}

function formatOfficePartyLine(party: ContractDocumentEngineParty): string {
  return (
    [
      party.officeName,
      party.officeRegNo ? `등록번호 ${party.officeRegNo}` : null,
      party.name ? `대표 ${party.name}` : null,
      party.address,
      party.mobilePhone || party.phone,
    ]
      .filter(Boolean)
      .join(' / ') || '-'
  );
}

/** 금액 행: 축약 표기와 한글 병기("일금 …원정 (₩…)")를 함께 출력 */
function formatAmountRow(shortText: string, hangulText: string): string {
  if (shortText && hangulText) return `${shortText} — ${hangulText}`;
  return hangulText || shortText || '-';
}

/** 만원 단위 Int 가 아닌 값(음수/소수/null)은 조용히 빈 문자열 처리 */
function formatAmountWithWonSafe(value: number | null | undefined): string {
  if (!value || !Number.isInteger(value) || value < 0) return '';
  try {
    return formatContractAmountWithWon(value);
  } catch {
    return '';
  }
}

/**
 * 서식×거래유형별 기본 본문 조항 조회 (레거시 DMSV001Q03 대응).
 * template.metadata.documentEngine.defaultBody 는 카탈로그 시드
 * (prisma/contract-template-catalog.ts 의 CONTRACT_TEMPLATE_BODY_CLAUSES)가 채우는
 * `{ [transactionType]: 본문텍스트 }` 맵이다. 매칭되는 거래유형이 없으면 '' 를
 * 반환하며, 이 경우 draft 는 거래유형 공통 본문(documentEngine.fields.bodyText)
 * 또는 category fallback 을 유지한다.
 */
export function getContractDocumentEngineDefaultBodyText(
  template: ContractDocumentEngineTemplate,
  transactionType: string,
): string {
  const documentEngine = readObject(template.metadata, 'documentEngine');
  const defaultBody = readObject(documentEngine, 'defaultBody');
  const value = defaultBody?.[transactionType];
  return typeof value === 'string' ? value : '';
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

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string');
  return items.length > 0 ? items : undefined;
}

/**
 * 거래유형 → 당사자 역할 라벨 (레거시 ContractUtil.getCntrStatClsfName,
 * documents-legacy-spec §2.1 (e) 표).
 * 엔진 기본 partyOne/TwoRole 과 파티 에디터(apps/*)가 같은 매핑을 공유한다.
 */
export function getContractPartySideLabels(transactionType: string): {
  one: string;
  two: string;
} {
  switch (transactionType) {
    case 'sale':
      return { one: '매도인', two: '매수인' };
    case 'jeonse':
    case 'monthly':
      return { one: '임대인', two: '임차인' };
    case 'exchange':
      return { one: '갑', two: '을' };
    case 'sublease':
      return { one: '전대인', two: '전차인' };
    case 'transfer':
    case 'succession':
      return { one: '양도인', two: '양수인' };
    default:
      return { one: '매도인', two: '매수인' };
  }
}

function getTransactionTypeLabel(transactionType: string) {
  // shared enums 의 라벨 표(7종 완비: 교환/전대/권리양도/권리승계 포함) 단일 사용
  return (
    (CONTRACT_TRANSACTION_TYPE_LABELS as Record<string, string>)[transactionType] ??
    transactionType
  );
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
function formatSingleArea(prefix: string, m2: number | string | null | undefined) {
  if (m2 == null || m2 === '') return null;
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return null;
  const m2Text = String(Math.round(value * 100) / 100);
  const pyeong = (value * 0.3025).toFixed(1);
  return `${prefix} ${m2Text}㎡ (${pyeong}평)`;
}

function getEngineContactPhone(contact: ContractDocumentEngineContact | null | undefined) {
  const primary = contact?.phones?.find((phone) => phone.isPrimary);
  return primary?.phone ?? contact?.phones?.[0]?.phone ?? contact?.phone ?? '';
}

function toNullableEngineNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
