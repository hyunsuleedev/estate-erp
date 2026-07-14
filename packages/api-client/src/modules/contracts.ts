import type { RequestFn } from '../client.js';
import type { PaginatedResponse } from '../types.js';
import type { ResidentialSaleAgreementValidation } from '@estate-erp/shared';
import type { Contact } from './contacts.js';
import type { Deal } from './deals.js';

export type ContractDocumentType = 'generated' | 'uploaded' | 'external';

/**
 * 계약서 당사자 행 역할 — 레거시 TPCT02S.Cntr_Stat_Clsf 대응.
 * one(01): 매도/임대/양도측, two(02): 매수/임차/양수측, office(99): 중개사무소.
 */
export type ContractPartySide = 'one' | 'two' | 'office';

/** 식별번호 유형 — 레거시 Ownr_Clsf 대응 */
export type ContractPartyIdType = 'resident' | 'corporate' | 'foreign' | 'birth';

/**
 * 계약서 당사자 (레거시 TPCT02S/TPCT28S).
 * 응답은 side(one→two→office) → subId 정렬, 대리인은 agents 로 중첩된다.
 * idNumber 는 잔금일+15일 경과 시 서버가 뒷자리를 마스킹해 반환한다.
 */
export interface ContractParty {
  id: string;
  officeId: string;
  contractId: string;
  side: ContractPartySide | string;
  /** 같은 side 내 순번 (1=대표) — 레거시 Sub_Id */
  subId: number;
  /** 표기 라벨 override ("갑", "전대인" 등). null이면 transactionType에서 유도 */
  role: string | null;
  name: string;
  idType: ContractPartyIdType | string | null;
  idNumber: string | null;
  address: string | null;
  phone: string | null;
  mobilePhone: string | null;
  /** 거래지분 "N분의 M" — 레거시 Tran_Stak_Silt/Per */
  sharePercent: string | null;
  country: string | null;
  contactId: string | null;
  /** null = 본인 행, 값 = 이 당사자(parent)의 대리인 행 */
  parentId: string | null;
  /** 대리인 라벨: "대리인" / "공동대리인" / 커스텀 */
  agentLabel: string | null;
  // ─── 사무소 행(side="office") 전용 ─────────────────────────
  officeName: string | null;
  officeRegNo: string | null;
  partnerOfficeId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 본인 행에만 존재 — 이 당사자의 대리인 (최대 2명, subId 순) */
  agents?: ContractParty[];
}

/** 당사자별 대리인 입력 (레거시 TPCT28S, 당사자당 최대 2명) */
export interface ContractPartyAgentInput {
  /**
   * 기존 행(ContractParty.id) 참조 — GET 응답의 id 를 그대로 되돌려 보내면
   * 마스킹('*')된 idNumber 가 순서 변경/삭제와 무관하게 본인 원본으로 보존된다.
   * 서버는 id + 이름 일치를 함께 검증한다.
   */
  id?: string;
  name: string;
  /** "대리인" / "공동대리인" / 커스텀. 생략 시 순번에 따라 자동 라벨링 */
  agentLabel?: string;
  idType?: ContractPartyIdType;
  idNumber?: string;
  address?: string;
  phone?: string;
  mobilePhone?: string;
  country?: string;
  contactId?: string;
}

/** 계약서 당사자 1행 입력 (본인 행). 대리인은 agents 로 중첩 → 서버가 parentId 부여 */
export interface ContractPartyInput {
  /**
   * 기존 행(ContractParty.id) 참조 — GET 응답의 id 를 그대로 되돌려 보내면
   * 마스킹('*')된 idNumber 가 순서 변경/삭제와 무관하게 본인 원본으로 보존된다.
   * 서버는 id + 이름 일치를 함께 검증한다.
   */
  id?: string;
  side: ContractPartySide;
  /** 같은 side 내 순번 (1=대표). 생략 시 배열 순서대로 자동 부여 */
  subId?: number;
  role?: string;
  name: string;
  idType?: ContractPartyIdType;
  idNumber?: string;
  address?: string;
  phone?: string;
  mobilePhone?: string;
  sharePercent?: string;
  country?: string;
  /** 고객 마스터 연동 — 반드시 같은 사무소의 Contact */
  contactId?: string;
  // ─── 사무소 행(side="office") 전용 ─────────────────────────
  officeName?: string;
  officeRegNo?: string;
  /** 공동중개 상대 사무소 참조 (레거시 Comm_Ofcr_Id) */
  partnerOfficeId?: string;
  /** 이 당사자의 대리인 (최대 2명, side=office 행은 불가) */
  agents?: ContractPartyAgentInput[];
}

/** PUT /contracts/:id/parties — 전체 교체(replace) 방식 */
export interface ReplaceContractPartiesDto {
  parties: ContractPartyInput[];
}

export type ContractDocumentStatus =
  | 'draft'
  | 'generated'
  | 'signed'
  | 'submitted'
  | 'archived'
  | 'cancelled';

export interface ContractDocumentTemplate {
  id: string;
  officeId: string | null;
  code: string;
  title: string;
  category: string;
  transactionTypes: string[];
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContractDocumentRevision {
  id: string;
  officeId: string;
  documentId: string;
  revisionNo: number;
  contentHash: string;
  payload: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  appliedBy: string | null;
  appliedAt: string | null;
}

export interface ContractDocument {
  id: string;
  officeId: string;
  contractId: string;
  templateId: string | null;
  type: ContractDocumentType | string;
  category: string;
  title: string;
  /** 서식 템플릿 코드 — 레거시 Cntr_Clsf (base_contract / proxy ...) */
  kind: string | null;
  /** 묶음 내 탭 순서 — 레거시 Orde */
  sortOrder: number;
  /** 동일 서식 반복 순번 (위임장 2장 등) — 레거시 Cntr_Clsf_Orde */
  kindOrder: number;
  status: ContractDocumentStatus | string;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  generatedAt: string | null;
  signedAt: string | null;
  submittedAt: string | null;
  generatedById: string | null;
  externalRefId: string | null;
  metadata: Record<string, unknown>;
  memo: string | null;
  currentRevisionId: string | null;
  createdAt: string;
  updatedAt: string;
  template?: ContractDocumentTemplate | null;
  generatedBy?: { id: string; name: string } | null;
  currentRevision?: ContractDocumentRevision | null;
}

export interface OfficePrintTemplate {
  id: string;
  officeId: string;
  type: string;
  title: string;
  transactionTypes: string[];
  isDefault: boolean;
  isActive: boolean;
  data: Record<string, unknown>;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractClauseTemplate {
  id: string;
  officeId: string;
  type: string;
  contractKind: string | null;
  transactionTypes: string[];
  title: string;
  content: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractOffice {
  id: string;
  name: string;
  licenseNo: string | null;
  ceoName: string | null;
  phone: string | null;
  address: string | null;
}

export interface Contract {
  id: string;
  officeId: string;
  dealId: string;
  transactionType: string;
  buyerContactId: string;
  sellerContactId: string;
  totalPrice: number;
  monthlyRent: number | null;
  status: string;
  contractDate: string | null;
  /// 계약서 상 계약금 (만원). 실제 입금은 DealPayment(kind='contract') 참조.
  statedDeposit: number | null;
  /// 계약서 상 중도금 (만원).
  statedInterimPayment: number | null;
  statedInterimDate: string | null;
  /// 계약서 상 잔금 (만원).
  statedBalance: number | null;
  statedBalanceDate: string | null;
  moveInDate: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  specialTerms: string | null;
  attachments: string[];
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  documentCount?: number;
  missingDocumentCount?: number;
  requiredDocuments?: string[];
  missingDocuments?: string[];
  requiredDocumentTemplates?: ContractDocumentTemplate[];
  /**
   * 거래신고 상태 롤업 (레거시 TRAN_REPT_CLSF) — category=report 문서
   * (cancelled 제외)의 최상위 status. 신고 문서 없으면 'none'.
   */
  transactionReportStatus?: ContractDocumentStatus | 'none' | string;
  /** 문서 목록 — sortOrder → kindOrder 정렬 */
  documents?: ContractDocument[];
  /** 당사자 — side(one→two→office) → subId 정렬, 대리인은 agents 중첩 */
  parties?: ContractParty[];
  deal?: Deal | null;
  office?: ContractOffice | null;
  buyerContact?: Contact | null;
  sellerContact?: Contact | null;
}

export interface CreateContractDto {
  dealId: string;
  transactionType?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  totalPrice?: number;
  monthlyRent?: number;
  status?: string;
  contractDate?: string;
  statedDeposit?: number;
  statedInterimPayment?: number;
  statedInterimDate?: string;
  statedBalance?: number;
  statedBalanceDate?: string;
  moveInDate?: string;
  leaseStartDate?: string;
  leaseEndDate?: string;
  specialTerms?: string;
  attachments?: string[];
  memo?: string;
}

export interface UpdateContractDto {
  transactionType?: string;
  buyerContactId?: string;
  sellerContactId?: string;
  totalPrice?: number;
  monthlyRent?: number | null;
  status?: string;
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
  attachments?: string[];
  memo?: string | null;
}

/** 날짜 검색 기준 컬럼 — 레거시 DMLS001Q01 Date_Clsf (기본 contractDate) */
export type ContractDateField =
  | 'contractDate'
  | 'statedInterimDate'
  | 'statedBalanceDate'
  | 'leaseEndDate'
  | 'createdAt';

/** 금액 검색 기준 컬럼 (만원 단위) — 레거시 Price_Clsf (기본 totalPrice) */
export type ContractPriceField = 'totalPrice' | 'statedDeposit' | 'monthlyRent';

/**
 * 텍스트 검색 기준 — 레거시 SearchClsf (기본 all).
 * 레거시 4종: UserName→party / PhneNo→phone / Addr→address / OffcName→partnerOffice.
 */
export type ContractSearchField =
  | 'title'
  | 'party'
  | 'phone'
  | 'address'
  | 'partnerOffice'
  | 'memo'
  | 'all';

/**
 * GET /contracts 검색 필터 — 레거시 문서관리 목록(DMLS001Q01) 대응.
 * 모든 파라미터 optional. 배열은 콤마로 합쳐 전송된다.
 */
export interface ContractsFilter {
  /** 서식 템플릿 코드(레거시 Cntr_Clsf) — ContractDocument.kind 또는 template.code 매칭 */
  kind?: string | string[];
  /** 문서 분류 (contract / report / receipt ...) */
  category?: string;
  transactionType?: string | string[];
  status?: string | string[];
  dateField?: ContractDateField;
  dateFrom?: string;
  dateTo?: string;
  priceField?: ContractPriceField;
  /** 만원 단위 */
  priceMin?: number;
  /** 만원 단위 */
  priceMax?: number;
  searchField?: ContractSearchField;
  search?: string;
  /** 공동중개 필터 — Deal.isJointBrokerage 경유 (레거시 Union=Y) */
  isJointBrokerage?: boolean;
  /**
   * 보존기간 경과 필터 (레거시 PeriodOver, 기본 5년) —
   * contractDate(없으면 createdAt)가 기준일 이전인 계약만 반환.
   */
  retentionOverdue?: boolean;
  /** 보존기간 기준일 override (ISO 날짜). 생략 시 오늘 - 5년 */
  retentionBefore?: string;
}

/**
 * page/limit 포함 검색 — 지정 시 서버가 { items, pagination } 봉투로 응답.
 * findAll(배열 응답)과 구분하기 위해 findAllPaginated() 전용 타입으로 분리.
 */
export interface ContractsPaginatedFilter extends ContractsFilter {
  page?: number;
  limit?: number;
}

export interface CreateContractDocumentDto {
  templateId?: string;
  type?: ContractDocumentType | string;
  category?: string;
  title?: string;
  status?: ContractDocumentStatus | string;
  /** 서식 템플릿 코드 — 레거시 Cntr_Clsf. 생략 시 template.code 에서 유도 */
  kind?: string;
  /** 묶음 내 탭 순서 — 레거시 Orde. 생략 시 마지막 순서 + 1 자동 부여 */
  sortOrder?: number;
  /** 동일 서식 반복 순번 — 레거시 Cntr_Clsf_Orde. 생략 시 같은 kind 내 자동 증가 */
  kindOrder?: number;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  generatedAt?: string;
  signedAt?: string;
  submittedAt?: string;
  externalRefId?: string;
  metadata?: Record<string, unknown>;
  memo?: string;
}

export interface UpdateContractDocumentDto {
  templateId?: string | null;
  type?: ContractDocumentType | string;
  category?: string;
  title?: string;
  status?: ContractDocumentStatus | string;
  kind?: string | null;
  sortOrder?: number;
  kindOrder?: number;
  fileUrl?: string | null;
  fileSize?: number | null;
  mimeType?: string | null;
  generatedAt?: string | null;
  signedAt?: string | null;
  submittedAt?: string | null;
  externalRefId?: string | null;
  metadata?: Record<string, unknown>;
  memo?: string | null;
}

export interface PrepareSaleContractDraftDto {
  actualAgreementAt?: string;
  conditions?: string;
  specialTerms?: string;
  rightsTransferDetails?: string;
  explanationDeliveredAt?: string;
}

export interface PrepareSaleContractDraftResult {
  document: ContractDocument;
  revision: ContractDocumentRevision;
  validation: ResidentialSaleAgreementValidation;
}

export interface ApplyContractDocumentRevisionResult {
  document: ContractDocument;
  revision: ContractDocumentRevision;
}

export interface ContractDocumentTemplateFilter {
  transactionType?: string;
  category?: string;
  requiredOnly?: boolean;
}

export interface OfficePrintTemplateFilter {
  type?: string;
  transactionType?: string;
  activeOnly?: boolean;
}

export interface CreateOfficePrintTemplateDto {
  type: string;
  title: string;
  transactionTypes?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  data?: Record<string, unknown>;
}

export interface UpdateOfficePrintTemplateDto {
  type?: string;
  title?: string;
  transactionTypes?: string[];
  isDefault?: boolean;
  isActive?: boolean;
  data?: Record<string, unknown>;
}

export interface ContractClauseTemplateFilter {
  type?: string;
  contractKind?: string;
  transactionType?: string;
  activeOnly?: boolean;
}

export interface CreateContractClauseTemplateDto {
  type: string;
  contractKind?: string | null;
  transactionTypes?: string[];
  title: string;
  content: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export interface UpdateContractClauseTemplateDto {
  type?: string;
  contractKind?: string | null;
  transactionTypes?: string[];
  title?: string;
  content?: string;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

/** 배열 필터는 콤마로 합쳐 전송 — 서버 toArray()가 콤마 분리로 복원 */
function buildContractsParams(
  filter: ContractsPaginatedFilter = {},
): Record<string, string | number | boolean | undefined> {
  const { kind, transactionType, status, ...rest } = filter;

  const joinValues = (value?: string | string[]) =>
    Array.isArray(value) ? (value.length > 0 ? value.join(',') : undefined) : value;

  return {
    ...rest,
    kind: joinValues(kind),
    transactionType: joinValues(transactionType),
    status: joinValues(status),
  };
}

export function createContractsApi(request: RequestFn) {
  return {
    /**
     * 계약 목록 — 레거시 DMLS001Q01 필터 지원. 필터 없이 호출하면
     * 기존과 동일하게 전체 계약 배열을 반환한다 (하위호환).
     */
    findAll: (filter?: ContractsFilter) =>
      request<Contract[]>('/contracts', {
        params: buildContractsParams(filter),
      }),
    /**
     * page/limit 지정 검색 — 서버가 { items, pagination } 봉투로 응답.
     * page 기본 1, limit 기본 20 (서버 최대 100).
     */
    findAllPaginated: (filter?: ContractsPaginatedFilter) =>
      request<PaginatedResponse<Contract>>('/contracts', {
        params: {
          ...buildContractsParams(filter),
          page: filter?.page ?? 1,
          limit: filter?.limit ?? 20,
        },
      }),
    findOne: (id: string) => request<Contract>(`/contracts/${id}`),
    create: (dto: CreateContractDto) =>
      request<Contract>('/contracts', { method: 'POST', body: dto }),
    update: (id: string, dto: UpdateContractDto) =>
      request<Contract>(`/contracts/${id}`, { method: 'PATCH', body: dto }),
    /**
     * 계약 영구 삭제 (레거시 §1.3 삭제) — 소속 문서/당사자/리비전 cascade 삭제.
     * 복구 불가하므로 호출 전 확인 다이얼로그를 거칠 것.
     */
    remove: (id: string) =>
      request<{ id: string; deleted: boolean }>(`/contracts/${id}`, {
        method: 'DELETE',
      }),
    /**
     * 당사자 전체 교체 (단일 트랜잭션 replace).
     * 응답: side(one→two→office) → subId 정렬된 당사자 트리 (대리인 agents 중첩).
     */
    replaceParties: (id: string, dto: ReplaceContractPartiesDto) =>
      request<ContractParty[]>(`/contracts/${id}/parties`, {
        method: 'PUT',
        body: dto,
      }),
    /**
     * 계약 문서 세트 전체 사본 — 동일 Contract 내 새 draft 문서 세트 추가
     * (Contract.dealId @unique 제약으로 Contract 행 자체는 복제하지 않음).
     * 원본 문서의 currentRevisionId/리비전 이력은 복제하지 않는다.
     */
    copyContract: (id: string) =>
      request<Contract>(`/contracts/${id}/copy`, { method: 'POST' }),
    documentTemplates: (filter?: ContractDocumentTemplateFilter) =>
      request<ContractDocumentTemplate[]>('/contracts/document-templates', {
        params: (filter ?? {}) as Record<string, string | number | boolean | undefined>,
      }),
    printTemplates: (filter?: OfficePrintTemplateFilter) =>
      request<OfficePrintTemplate[]>('/contracts/print-templates', {
        params: (filter ?? {}) as Record<string, string | number | boolean | undefined>,
      }),
    createPrintTemplate: (dto: CreateOfficePrintTemplateDto) =>
      request<OfficePrintTemplate>('/contracts/print-templates', {
        method: 'POST',
        body: dto,
      }),
    updatePrintTemplate: (
      templateId: string,
      dto: UpdateOfficePrintTemplateDto,
    ) =>
      request<OfficePrintTemplate>(`/contracts/print-templates/${templateId}`, {
        method: 'PATCH',
        body: dto,
      }),
    deletePrintTemplate: (templateId: string) =>
      request<void>(`/contracts/print-templates/${templateId}`, {
        method: 'DELETE',
      }),
    clauseTemplates: (filter?: ContractClauseTemplateFilter) =>
      request<ContractClauseTemplate[]>('/contracts/clause-templates', {
        params: (filter ?? {}) as Record<string, string | number | boolean | undefined>,
      }),
    createClauseTemplate: (dto: CreateContractClauseTemplateDto) =>
      request<ContractClauseTemplate>('/contracts/clause-templates', {
        method: 'POST',
        body: dto,
      }),
    updateClauseTemplate: (
      templateId: string,
      dto: UpdateContractClauseTemplateDto,
    ) =>
      request<ContractClauseTemplate>(`/contracts/clause-templates/${templateId}`, {
        method: 'PATCH',
        body: dto,
      }),
    deleteClauseTemplate: (templateId: string) =>
      request<void>(`/contracts/clause-templates/${templateId}`, {
        method: 'DELETE',
      }),
    documents: (contractId: string) =>
      request<ContractDocument[]>(`/contracts/${contractId}/documents`),
    documentRevisions: (contractId: string, documentId: string) =>
      request<ContractDocumentRevision[]>(
        `/contracts/${contractId}/documents/${documentId}/revisions`,
      ),
    applyDocumentRevision: (
      contractId: string,
      documentId: string,
      revisionId: string,
      contentHash: string,
    ) =>
      request<ApplyContractDocumentRevisionResult>(
        `/contracts/${contractId}/documents/${documentId}/revisions/${revisionId}/apply`,
        { method: 'POST', body: { contentHash } },
      ),
    prepareSaleContractDraft: (
      contractId: string,
      dto: PrepareSaleContractDraftDto = {},
    ) =>
      request<PrepareSaleContractDraftResult>(
        `/contracts/${contractId}/sale-contract-draft/prepare`,
        { method: 'POST', body: dto },
      ),
    validateSaleContractDraft: (contractId: string, revisionId?: string) =>
      request<ResidentialSaleAgreementValidation>(
        `/contracts/${contractId}/sale-contract-draft/validate`,
        { params: { revisionId } },
      ),
    createDocument: (contractId: string, dto: CreateContractDocumentDto) =>
      request<ContractDocument>(`/contracts/${contractId}/documents`, {
        method: 'POST',
        body: dto,
      }),
    updateDocument: (
      contractId: string,
      documentId: string,
      dto: UpdateContractDocumentDto,
    ) =>
      request<ContractDocument>(
        `/contracts/${contractId}/documents/${documentId}`,
        { method: 'PATCH', body: dto },
      ),
    /**
     * 서식 단건 사본 (레거시 "다른저장") — 새 draft 문서로 복제하고
     * 같은 kind 의 다음 kindOrder 를 부여한다 (위임장 2장 케이스).
     * 원본의 currentRevisionId/리비전 이력은 복제하지 않는다.
     */
    copyDocument: (
      contractId: string,
      documentId: string,
      dto?: { title?: string },
    ) =>
      request<ContractDocument>(
        `/contracts/${contractId}/documents/${documentId}/copy`,
        { method: 'POST', body: dto ?? {} },
      ),
    /** 문서 단건 영구 삭제 — status=cancelled 우회가 아닌 실제 삭제 (복구 불가) */
    removeDocument: (contractId: string, documentId: string) =>
      request<{ id: string; deleted: boolean }>(
        `/contracts/${contractId}/documents/${documentId}`,
        { method: 'DELETE' },
      ),
  };
}
