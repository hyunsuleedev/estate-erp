/**
 * Shim — 계약 문서 엔진 구현은 packages/shared/src/contract-document-engine.ts 로 이동했다.
 *
 * TanStack Router 의 '-' 접두 파일 규칙(라우트 제외)과 기존 import 경로
 * (`./-document-engine`)를 유지하기 위해 shared 의 심볼을 그대로 re-export 한다.
 * apps/desktop 의 동일 shim 과 함께, 두 앱이 하나의 엔진을 공유한다.
 * (매매초안 글루 buildResidentialSaleAgreement 포함 — shared contract-agreement.ts 연동)
 */
export {
  applyEngineFieldsToResidentialSaleAgreement,
  buildContractDocumentEngineDraft,
  buildResidentialSaleAgreement,
  convertResidentialSaleAgreementToEngineFields,
  getContractDocumentEngineDefaultBodyText,
  getContractDocumentEngineFieldGroups,
  getContractDocumentEnginePrintOptions,
  getContractDocumentEngineSections,
  getContractDocumentEngineWorkflow,
  getContractPartySideLabels,
  hasContractDocumentEnginePrintOptions,
  mergeContractDocumentEngineMetadata,
  mergeContractDocumentEnginePrintOptions,
  parseContractManwonText,
  validateBaseContractSaleEngineFields,
  CONTRACT_DOCUMENT_ENGINE_DEFAULT_PRINT_OPTIONS,
} from '@estate-erp/shared';
export type {
  BaseContractSaleValidation,
  BaseContractSaleValidationIssue,
  ContractDocumentEngineAmountUnit,
  ContractDocumentEngineMetadata,
  ContractDocumentEnginePrintOptions,
  ContractDocumentEngineTemplate,
  ContractDocumentEngineDocument,
  ContractDocumentEngineContact,
  ContractDocumentEngineParty,
  ContractDocumentEngineProperty,
  ContractDocumentEngineContract,
  ContractDocumentEngineFields,
  ContractDocumentEngineFieldInputType,
  ContractDocumentEngineFieldDefinition,
  ContractDocumentEngineFieldGroup,
  ContractDocumentEngineFieldGroupOptions,
  ContractDocumentEngineTemplateField,
  ContractDocumentEngineTemplateFieldGroup,
  ContractDocumentEngineSection,
  ContractDocumentEngineSectionOptions,
  ContractDocumentEngineWorkflow,
  ContractDocumentEngineDraft,
} from '@estate-erp/shared';

// 조항 임베디드 레이아웃 (shared/contract-clause-layouts.ts) — 조항 에디터/프리뷰 공유
export {
  BASE_CONTRACT_SALE_CLAUSES,
  collectContractClauseFieldKeys,
  getClauseFieldValue,
  getContractClauseLayout,
  isClauseRowVisible,
  isContractPrintOptionFieldKey,
} from '@estate-erp/shared';
export type {
  ClauseArticle,
  ClauseFieldControl,
  ClauseRow,
  ClauseSegment,
  ContractAmountNotation,
  ContractPrintOptionFieldKey,
} from '@estate-erp/shared';
