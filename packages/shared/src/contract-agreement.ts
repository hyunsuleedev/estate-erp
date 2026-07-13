export const RESIDENTIAL_SALE_AGREEMENT_SCHEMA_ID = 'kr-residential-sale-agreement' as const;
export const RESIDENTIAL_SALE_AGREEMENT_SCHEMA_VERSION = 1 as const;

export type SaleAgreementPartyRole =
  | 'principal'
  | 'co_owner'
  | 'representative'
  | 'corporate_representative';

export type SaleAgreementPartyType = 'individual' | 'corporation';

export interface SaleAgreementPartySnapshot {
  key: string;
  contactId: string | null;
  partyType: SaleAgreementPartyType;
  role: SaleAgreementPartyRole;
  name: string;
  identificationNoMasked: string;
  address: string;
  phone: string;
  shareRatio: number | null;
  representedPartyName: string;
}

export interface ResidentialSaleAgreementDraft {
  schemaId: typeof RESIDENTIAL_SALE_AGREEMENT_SCHEMA_ID;
  schemaVersion: typeof RESIDENTIAL_SALE_AGREEMENT_SCHEMA_VERSION;
  actualAgreementAt: string;
  writtenAt: string;
  property: {
    roadAddress: string;
    jibunAddress: string;
    targetDescription: string;
    landCategory: string;
    landAreaM2: number | null;
    buildingStructure: string;
    buildingUse: string;
    buildingAreaM2: number | null;
  };
  payment: {
    totalPriceManwon: number | null;
    depositManwon: number | null;
    depositDueAt: string;
    interimManwon: number | null;
    interimDueAt: string;
    balanceManwon: number | null;
    balanceDueAt: string;
  };
  transfer: {
    deliveryAt: string;
    ownershipTransferAt: string;
    rightsTransferDetails: string;
    conditions: string;
    explanationDeliveredAt: string;
  };
  sellers: SaleAgreementPartySnapshot[];
  buyers: SaleAgreementPartySnapshot[];
  brokerage: {
    officeName: string;
    registrationNo: string;
    representativeName: string;
    address: string;
    phone: string;
    associateName: string;
    associateLicenseNo: string;
  };
  specialTerms: string;
  sourceNotice: string;
}

export interface ResidentialSaleAgreementInput {
  actualAgreementAt?: string | null;
  writtenAt?: string | null;
  property?: Partial<ResidentialSaleAgreementDraft['property']> | null;
  payment?: Partial<ResidentialSaleAgreementDraft['payment']> | null;
  transfer?: Partial<ResidentialSaleAgreementDraft['transfer']> | null;
  seller?: Partial<SaleAgreementPartySnapshot> | null;
  buyer?: Partial<SaleAgreementPartySnapshot> | null;
  sellers?: SaleAgreementPartySnapshot[];
  buyers?: SaleAgreementPartySnapshot[];
  brokerage?: Partial<ResidentialSaleAgreementDraft['brokerage']> | null;
  specialTerms?: string | null;
  sourceNotice?: string | null;
}

export interface AgreementValidationIssue {
  path: string;
  message: string;
}

export interface ResidentialSaleAgreementValidation {
  errors: AgreementValidationIssue[];
  warnings: AgreementValidationIssue[];
  isReadyForGeneration: boolean;
}

export function createResidentialSaleAgreementDraft(
  input: ResidentialSaleAgreementInput = {},
): ResidentialSaleAgreementDraft {
  const actualAgreementAt = toDateInput(input.actualAgreementAt);
  const writtenAt = toDateInput(input.writtenAt) || actualAgreementAt;
  const totalPriceManwon = nullableNumber(input.payment?.totalPriceManwon);
  const depositManwon = nullableNumber(input.payment?.depositManwon);
  const interimManwon = nullableNumber(input.payment?.interimManwon);
  const explicitBalance = nullableNumber(input.payment?.balanceManwon);
  const derivedBalance =
    explicitBalance ??
    (totalPriceManwon !== null
      ? Math.max(totalPriceManwon - (depositManwon ?? 0) - (interimManwon ?? 0), 0)
      : null);

  return {
    schemaId: RESIDENTIAL_SALE_AGREEMENT_SCHEMA_ID,
    schemaVersion: RESIDENTIAL_SALE_AGREEMENT_SCHEMA_VERSION,
    actualAgreementAt,
    writtenAt,
    property: {
      roadAddress: input.property?.roadAddress ?? '',
      jibunAddress: input.property?.jibunAddress ?? '',
      targetDescription: input.property?.targetDescription ?? '',
      landCategory: input.property?.landCategory ?? '',
      landAreaM2: nullableNumber(input.property?.landAreaM2),
      buildingStructure: input.property?.buildingStructure ?? '',
      buildingUse: input.property?.buildingUse ?? '',
      buildingAreaM2: nullableNumber(input.property?.buildingAreaM2),
    },
    payment: {
      totalPriceManwon,
      depositManwon,
      depositDueAt: toDateInput(input.payment?.depositDueAt) || actualAgreementAt,
      interimManwon,
      interimDueAt: toDateInput(input.payment?.interimDueAt),
      balanceManwon: derivedBalance,
      balanceDueAt: toDateInput(input.payment?.balanceDueAt),
    },
    transfer: {
      deliveryAt: toDateInput(input.transfer?.deliveryAt),
      ownershipTransferAt:
        toDateInput(input.transfer?.ownershipTransferAt) ||
        toDateInput(input.payment?.balanceDueAt),
      rightsTransferDetails: input.transfer?.rightsTransferDetails ?? '',
      conditions: input.transfer?.conditions ?? '',
      explanationDeliveredAt:
        toDateInput(input.transfer?.explanationDeliveredAt) || actualAgreementAt,
    },
    sellers: input.sellers?.map((party, index) => normalizeParty(party, 'seller', index)) ?? [
      normalizeParty(input.seller ?? {}, 'seller', 0),
    ],
    buyers: input.buyers?.map((party, index) => normalizeParty(party, 'buyer', index)) ?? [
      normalizeParty(input.buyer ?? {}, 'buyer', 0),
    ],
    brokerage: {
      officeName: input.brokerage?.officeName ?? '',
      registrationNo: input.brokerage?.registrationNo ?? '',
      representativeName: input.brokerage?.representativeName ?? '',
      address: input.brokerage?.address ?? '',
      phone: input.brokerage?.phone ?? '',
      associateName: input.brokerage?.associateName ?? '',
      associateLicenseNo: input.brokerage?.associateLicenseNo ?? '',
    },
    specialTerms: input.specialTerms ?? '',
    sourceNotice:
      input.sourceNotice ??
      '공인중개사법 시행령 제22조의 거래계약서 필수기재사항을 기준으로 작성한 초안입니다. 계약 확정 전 최신 공적장부와 당사자 신분을 다시 확인하세요.',
  };
}

export function readResidentialSaleAgreement(
  metadata: Record<string, unknown> | null | undefined,
): ResidentialSaleAgreementDraft | null {
  const raw = asRecord(metadata?.contractAgreement);
  if (
    !raw ||
    raw.schemaId !== RESIDENTIAL_SALE_AGREEMENT_SCHEMA_ID ||
    raw.schemaVersion !== RESIDENTIAL_SALE_AGREEMENT_SCHEMA_VERSION
  ) {
    return null;
  }

  const property = asRecord(raw.property);
  const payment = asRecord(raw.payment);
  const transfer = asRecord(raw.transfer);
  const brokerage = asRecord(raw.brokerage);

  return createResidentialSaleAgreementDraft({
    actualAgreementAt: asString(raw.actualAgreementAt),
    writtenAt: asString(raw.writtenAt),
    property: {
      roadAddress: asString(property?.roadAddress),
      jibunAddress: asString(property?.jibunAddress),
      targetDescription: asString(property?.targetDescription),
      landCategory: asString(property?.landCategory),
      landAreaM2: nullableNumber(property?.landAreaM2),
      buildingStructure: asString(property?.buildingStructure),
      buildingUse: asString(property?.buildingUse),
      buildingAreaM2: nullableNumber(property?.buildingAreaM2),
    },
    payment: {
      totalPriceManwon: nullableNumber(payment?.totalPriceManwon),
      depositManwon: nullableNumber(payment?.depositManwon),
      depositDueAt: asString(payment?.depositDueAt),
      interimManwon: nullableNumber(payment?.interimManwon),
      interimDueAt: asString(payment?.interimDueAt),
      balanceManwon: nullableNumber(payment?.balanceManwon),
      balanceDueAt: asString(payment?.balanceDueAt),
    },
    transfer: {
      deliveryAt: asString(transfer?.deliveryAt),
      ownershipTransferAt: asString(transfer?.ownershipTransferAt),
      rightsTransferDetails: asString(transfer?.rightsTransferDetails),
      conditions: asString(transfer?.conditions),
      explanationDeliveredAt: asString(transfer?.explanationDeliveredAt),
    },
    sellers: readParties(raw.sellers, 'seller'),
    buyers: readParties(raw.buyers, 'buyer'),
    brokerage: {
      officeName: asString(brokerage?.officeName),
      registrationNo: asString(brokerage?.registrationNo),
      representativeName: asString(brokerage?.representativeName),
      address: asString(brokerage?.address),
      phone: asString(brokerage?.phone),
      associateName: asString(brokerage?.associateName),
      associateLicenseNo: asString(brokerage?.associateLicenseNo),
    },
    specialTerms: asString(raw.specialTerms),
    sourceNotice: asString(raw.sourceNotice),
  });
}

export function mergeResidentialSaleAgreementMetadata(
  metadata: Record<string, unknown> | null | undefined,
  agreement: ResidentialSaleAgreementDraft,
): Record<string, unknown> {
  return {
    ...(metadata ?? {}),
    contractAgreement: agreement,
  };
}

export function validateResidentialSaleAgreement(
  agreement: ResidentialSaleAgreementDraft,
): ResidentialSaleAgreementValidation {
  const errors: AgreementValidationIssue[] = [];
  const warnings: AgreementValidationIssue[] = [];
  const required = (value: string, path: string, message: string) => {
    if (!value.trim()) errors.push({ path, message });
  };

  required(agreement.actualAgreementAt, 'actualAgreementAt', '실제 계약 체결일을 입력하세요.');
  required(agreement.writtenAt, 'writtenAt', '계약서 작성일을 입력하세요.');
  if (!agreement.property.roadAddress && !agreement.property.jibunAddress) {
    errors.push({
      path: 'property.address',
      message: '부동산 소재지를 입력하세요.',
    });
  }
  required(
    agreement.property.targetDescription,
    'property.targetDescription',
    '매매 대상 부동산의 동·층·호 등 표시를 입력하세요.',
  );

  if (!agreement.payment.totalPriceManwon || agreement.payment.totalPriceManwon <= 0) {
    errors.push({
      path: 'payment.totalPriceManwon',
      message: '매매대금을 입력하세요.',
    });
  }
  required(agreement.payment.balanceDueAt, 'payment.balanceDueAt', '잔금 지급일을 입력하세요.');

  const paymentSum =
    (agreement.payment.depositManwon ?? 0) +
    (agreement.payment.interimManwon ?? 0) +
    (agreement.payment.balanceManwon ?? 0);
  if (
    agreement.payment.totalPriceManwon !== null &&
    paymentSum !== agreement.payment.totalPriceManwon
  ) {
    errors.push({
      path: 'payment',
      message: '계약금·중도금·잔금 합계가 매매대금과 일치하지 않습니다.',
    });
  }

  validateParties(agreement.sellers, 'sellers', '매도인', errors, warnings);
  validateParties(agreement.buyers, 'buyers', '매수인', errors, warnings);

  required(agreement.transfer.deliveryAt, 'transfer.deliveryAt', '부동산 인도일을 입력하세요.');
  required(
    agreement.transfer.ownershipTransferAt,
    'transfer.ownershipTransferAt',
    '소유권 이전일을 입력하세요.',
  );
  required(
    agreement.transfer.rightsTransferDetails,
    'transfer.rightsTransferDetails',
    '소유권 이전 및 권리관계 정리 내용을 입력하세요.',
  );
  required(
    agreement.transfer.explanationDeliveredAt,
    'transfer.explanationDeliveredAt',
    '중개대상물 확인·설명서 교부일을 입력하세요.',
  );
  required(agreement.brokerage.officeName, 'brokerage.officeName', '중개사무소명을 입력하세요.');
  required(
    agreement.brokerage.registrationNo,
    'brokerage.registrationNo',
    '중개사무소 등록번호를 입력하세요.',
  );
  required(
    agreement.brokerage.representativeName,
    'brokerage.representativeName',
    '개업공인중개사 성명을 입력하세요.',
  );

  if (!agreement.property.landCategory || agreement.property.landAreaM2 === null) {
    warnings.push({
      path: 'property.land',
      message: '토지 지목과 면적을 공적장부 기준으로 확인하세요.',
    });
  }
  if (!agreement.property.buildingStructure || agreement.property.buildingAreaM2 === null) {
    warnings.push({
      path: 'property.building',
      message: '건물 구조·용도·면적을 건축물대장 기준으로 확인하세요.',
    });
  }
  if (!agreement.brokerage.address || !agreement.brokerage.phone) {
    warnings.push({
      path: 'brokerage.contact',
      message: '중개사무소 주소와 연락처를 확인하세요.',
    });
  }

  return {
    errors,
    warnings,
    isReadyForGeneration: errors.length === 0,
  };
}

function validateParties(
  parties: SaleAgreementPartySnapshot[],
  path: 'sellers' | 'buyers',
  label: string,
  errors: AgreementValidationIssue[],
  warnings: AgreementValidationIssue[],
) {
  if (parties.length === 0) {
    errors.push({ path, message: `${label}을 한 명 이상 입력하세요.` });
    return;
  }

  parties.forEach((party, index) => {
    if (!party.name.trim()) {
      errors.push({
        path: `${path}.${index}.name`,
        message: `${label} 성명을 입력하세요.`,
      });
    }
    if (!party.address.trim()) {
      errors.push({
        path: `${path}.${index}.address`,
        message: `${label} 주소를 입력하세요.`,
      });
    }
    if (!party.phone.trim()) {
      warnings.push({
        path: `${path}.${index}.phone`,
        message: `${label} 연락처를 확인하세요.`,
      });
    }
    if (!party.identificationNoMasked.trim()) {
      warnings.push({
        path: `${path}.${index}.identificationNoMasked`,
        message: `${label} 식별정보 확인 여부를 기록하세요. 원문 번호는 보안 저장소 없이 저장하지 마세요.`,
      });
    }
    if (party.role === 'representative' && !party.representedPartyName.trim()) {
      errors.push({
        path: `${path}.${index}.representedPartyName`,
        message: '대리 대상 당사자명을 입력하세요.',
      });
    }
  });
}

function normalizeParty(
  party: Partial<SaleAgreementPartySnapshot>,
  side: 'seller' | 'buyer',
  index: number,
): SaleAgreementPartySnapshot {
  return {
    key: party.key ?? `${side}-${index + 1}`,
    contactId: party.contactId ?? null,
    partyType: party.partyType === 'corporation' ? 'corporation' : 'individual',
    role: isPartyRole(party.role) ? party.role : index === 0 ? 'principal' : 'co_owner',
    name: party.name ?? '',
    identificationNoMasked: party.identificationNoMasked ?? '',
    address: party.address ?? '',
    phone: party.phone ?? '',
    shareRatio: nullableNumber(party.shareRatio),
    representedPartyName: party.representedPartyName ?? '',
  };
}

function readParties(value: unknown, side: 'seller' | 'buyer') {
  if (!Array.isArray(value)) return undefined;
  return value.map((item, index) => {
    const party = asRecord(item) ?? {};
    return normalizeParty(
      {
        key: asString(party.key),
        contactId: asString(party.contactId) || null,
        partyType: party.partyType === 'corporation' ? 'corporation' : 'individual',
        role: isPartyRole(party.role) ? party.role : undefined,
        name: asString(party.name),
        identificationNoMasked: asString(party.identificationNoMasked),
        address: asString(party.address),
        phone: asString(party.phone),
        shareRatio: nullableNumber(party.shareRatio),
        representedPartyName: asString(party.representedPartyName),
      },
      side,
      index,
    );
  });
}

function isPartyRole(value: unknown): value is SaleAgreementPartyRole {
  return ['principal', 'co_owner', 'representative', 'corporate_representative'].includes(
    String(value),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function nullableNumber(value: unknown): number | null {
  if (value === '' || value === undefined || value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateInput(value: unknown) {
  if (typeof value !== 'string' || !value) return '';
  return value.length >= 10 ? value.slice(0, 10) : value;
}
