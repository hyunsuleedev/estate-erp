# 문서관리(계약서) 작업 — 신규 메인 재적용 조사 보고서

- 작성일: 2026-07-14
- 내 브랜치: `feat/myspider-migration` (fd9eddf), base = 799cc29
- 신규 메인: origin/main (659ffdc), worktree `scratchpad/newmain-wt`
- 성격: READ-ONLY 조사 결과. 코드 변경 없음.

---

## 1. 신규 메인이 그 사이 바꾼 것 (계약서 영역)

### 1.1 스키마 (prisma/schema/crm.prisma, base 대비 +69줄)

- **ContractParty 없음.** 당사자는 여전히 `Contract.buyerContactId` / `sellerContactId` 2명 구조.
- **ContractDocument.kind / sortOrder / kindOrder 없음.**
- 신규 추가: **`ContractDocumentRevision`** 모델 + `ContractDocument.currentRevisionId`(unique FK).
  - 문서의 불변 내용 스냅샷(payload JSONB + contentHash VarChar(64) + revisionNo).
  - AI가 초안(revision)을 준비해도 사람이 승인(`applyRevision`)해야 metadata에 반영되는 승인 파이프라인.
  - `@@unique([documentId, revisionNo])`, contentHash 인덱스.
- ContractDocumentTemplate / OfficePrintTemplate / ContractClauseTemplate 모델 자체는 **변경 없음** (포맷팅만).
- 그 외 crm.prisma: Consultation에 `callLogs` 관계 추가 (CTI 계열, 내 작업과 무관).

→ **내 ContractParty·kind 컬럼과 구조적 충돌 없음.** 같은 `contract_documents` 테이블에 서로 다른 컬럼을 추가하는 관계 (나: kind/sort_order/kind_order, 신규 메인: current_revision_id). 공존 가능.

### 1.2 마이그레이션

신규 메인 신규 5건 (`prisma/schema/migrations/`):
- `20260610111135_listing_p0_fields_user_license`
- `20260706030749_add_call_log`
- `20260706034701_add_vendor_contact_normalized_phone`
- `20260713143000_add_agent_control_plane`
- `20260713143000_contract_document_revisions`

내 신규 5건은 모두 20260713195801 이후 타임스탬프라 **정렬 충돌 없음**. 단:
- 내 `20260713195801_backfill_property_memo_and_sync_drift`는 **구 메인 기준 드리프트 동기화**라 신규 메인 스키마(property/office/agent 대폭 변경)에서는 무효 — **폐기하고 신규 메인 위에서 재생성** 필요.
- 내 `20260713195802_add_contract_parties_and_document_kind`는 내용상 유효하나 신규 메인 스키마 기준으로 `prisma migrate dev` 재생성 권장.
- 내 `20260714001000_add_yearly_to_base_contract_template`는 연세 결정에 종속 (§5).

### 1.3 서버 contracts 모듈 (service +664, controller +77, spec +612)

신규 메인이 추가한 것 (전부 **내 작업과 겹치지 않는 신규 기능**):
- 템플릿 관리: `listPrintTemplates`/`createPrintTemplate`/`removePrintTemplate`, `listClauseTemplates`/`removeClauseTemplate` + `DELETE print-templates/:id`, `DELETE clause-templates/:id`.
- **리비전 파이프라인**: `listDocumentRevisions`, `applyDocumentRevision`/`applyRevision` (contentHash 검증, `GET :id/documents/:documentId/revisions`, `POST .../revisions/:revisionId/apply`).
- **매매계약서 초안(AI 지향)**: `prepareSaleContractDraft` / `validateSaleContractDraft` (`POST :id/sale-contract-draft/prepare`, `GET :id/sale-contract-draft/validate`) — `packages/shared/src/contract-agreement.ts`(신규 455줄, `ResidentialSaleAgreementDraft` 스키마 kr-residential-sale-agreement v1) 기반.
- `findAll`은 **그대로** (officeId 전건 조회, 필터·페이지네이션 없음). 내 서버측 목록필터와 기능 충돌 없음 — 대신 신규 메인은 index.tsx에서 **클라이언트측 필터**(search/status/type/docFilter/date)를 구현.

**주의**: 파일 자체는 양쪽이 같은 구역(import, contractInclude, DTO 타입, createDocument/updateDocument 주변, 말미 헬퍼)을 대량 수정 → **git 3-way 병합은 대충돌. 메서드 단위 수동 이식이 현실적.**

### 1.4 계약서 페이지 리빌드 (desktop·web 공통)

구 2,000줄 모놀리식 index.tsx를 **컴포넌트 8~9개로 분해** (index.tsx는 914줄로 축소):

| 신규 메인 파일 | 줄수(web) | 내용 |
|---|---|---|
| index.tsx | 914 | 목록 + 통계 타일 + 클라이언트측 필터(DOC_FILTER_OPTIONS, search/status/type/date) + ContractsTable/ContractsDocGrid |
| -contract-detail.tsx | 663 | `ContractDetailCard` — 상세 폼. 당사자는 buyerContact/sellerContact 이름 표시 수준 |
| -contract-shared.tsx | 392 | 거래유형/상태 상수, 배지, 헬퍼 |
| -contract-context.tsx | 213 | DealInfoTab + ActivityLogPanel |
| -document-hub.tsx | 206 | `DocumentHub` + DocumentRowsTable — 단순 테이블. **kind/sortOrder 개념 없음** |
| -document-editor.tsx | 631(web)/559(desktop) | `DocumentEditorSheet` + DocumentInputFormSection + DocumentEngineFieldControl + ContractDocumentPage(인쇄 미리보기, window.print) |
| -special-terms-card.tsx | 295 | 특약 카드 — **일반 Textarea** + ContractClauseTemplate 삽입. 리치텍스트 없음 |
| -payment-timeline.tsx | 215 | 지급 타임라인 |
| -residential-sale-editor.tsx | 769 | **web 전용** — 매매계약서 초안/리비전 승인 편집기 |

**결정적 사실**: 신규 메인의 컴포넌트들은 base 모놀리스에서 **거의 그대로 추출**된 것이고, 내 작업은 같은 모놀리스를 **제자리에서 확장**한 것. 함수명이 1:1로 일치한다 — 내 `ContractDetailCard`→`-contract-detail.tsx`, 내 `DocumentHub`/`ContractDocumentListTable`→`-document-hub.tsx`, 내 `DocumentEditorSheet`/`DocumentInputFormSection`/`DocumentEngineFieldControl`/`ContractDocumentPage`/`DocumentPreviewRow`/`SignatureBlock`→`-document-editor.tsx`. **내 모놀리스 델타를 추출된 파일 위에 재생하는 기계적 이식이 가능.**

### 1.5 문서 엔진

- 신규 메인은 엔진을 **route 파일에 유지** (web 895줄 / desktop 776줄, shared 추출 안 함). base 대비 변경(web +215/desktop +68):
  1. `buildResidentialSaleAgreement()` 추가 — shared `contract-agreement.ts` 글루.
  2. **property 타입 shape 변경**: 구 `property.site.address`/`property.dong` → 신 `site.roadAddress/jibunAddress`, `unit.dong`, `unit.siteUnitType.exclusiveAreaM2` (신규 메인의 property 스키마 개편 반영).
  3. workflow byCode 매핑·sections 일부 수정.
- `getContractDocumentEngineFieldGroups(category)`는 base와 동일하게 **category 하드코딩 스키마** 유지. -document-editor.tsx가 `(form.category)`로 호출.
- **내 shared 추출본**(`packages/shared/src/contract-document-engine.ts`, 1,400줄)은 `getContractDocumentEngineFieldGroups`에 **category 오버로드를 하위호환으로 유지** + template(metadata.documentEngine.fieldGroups) 오버로드 추가. → 신규 메인 editor의 기존 호출은 shim 교체 후에도 그대로 동작. 단 **내 추출본은 구 property shape 기준**이라 위 (2)의 신 shape을 반영해야 함.

### 1.6 템플릿 카탈로그

- `prisma/contract-template-catalog.ts` / `seed-contract-templates.ts`: 신규 메인 **무변경** (base와 동일). base 카탈로그는 마이그레이션(20260502170000)으로 INSERT된 30종 + upsert 파이프라인 골격만.
- 내 카탈로그: 신규 정의 9종 추가(30+9=39종, `CONTRACT_DOCUMENT_KINDS`와 동기), 서식별 `metadata.documentEngine.fieldGroups` 스키마 8세트, kind×거래유형 기본 본문 시드. → **그대로 이식 가능** (yearly 참조만 §5 결정에 따라 조정).

### 1.7 enums / 연세(yearly)

- 신규 메인 `ContractTransactionType` = sale/jeonse/monthly/exchange/sublease/transfer/succession **7종. yearly 없음.**
- 신규 메인은 `prisma/migrate-remove-yearly-rent.ts`(253줄)로 **연세 폐기를 명시적 제품 결정으로 집행**: "거래유형은 sale/jeonse/monthly 3종만 지원한다. 연세(연간 임대료 일시납) → 월세. 연액 ÷ 12 환산, 보증금 유지, memo 태그(`[연세→월세 자동 전환]`)로 이력 보존." Listing 레벨 yearly_rent 데이터를 병합·삭제하는 멱등 스크립트.
- 신규 메인 enums 추가분: TRANSACTION_TYPE_LABELS, UserLicenseType, MaintenanceFeeInclude 등 — 내 추가분(YEARLY, CONTRACT_DOCUMENT_KINDS 39종 목록)과 **다른 위치, additive 병합 가능** (경미한 텍스트 충돌).

### 1.8 api-client

- 신규 메인 contracts.ts +80줄: ContractDocumentRevision 타입, deletePrintTemplate/deleteClauseTemplate, documentRevisions/applyDocumentRevision, prepareSaleContractDraft/validateSaleContractDraft.
- 내 contracts.ts +272줄: ContractParty 타입군, ReplaceContractPartiesDto, ContractsFilter/ContractsPaginatedFilter, replaceParties/copy/delete 메서드.
- **API 표면 겹침 없음.** 같은 파일 additive 병합.

---

## 2. 내 조각별 판정

| # | 조각 | 판정 | 근거 |
|---|---|---|---|
| 1 | **ContractParty 모델 + ContractDocument.kind/sortOrder/kindOrder** | **(b)** | 신규 메인에 유사물 없음. ContractDocumentRevision과 컬럼 공존. 마이그레이션 SQL만 신규 메인 기준 재생성 (드리프트 마이그레이션 1건 폐기) |
| 2 | **템플릿 카탈로그 39종 + fieldGroups + 기본 본문** | **(b)** | 신규 메인이 카탈로그·시드를 전혀 안 건드림. yearly 참조만 조정 |
| 3 | **shared/contract-document-engine.ts (엔진 추출)** | **(c)** 부분 재작성 | 추출 자체는 유효(하위호환 오버로드 보유). 단 신규 메인 route 엔진의 델타(신 property shape, buildResidentialSaleAgreement 글루, workflow/sections 수정 — web 215줄/desktop 68줄)를 추출본에 반영 후 shim 교체 필요 |
| 4 | **shared/contract-amount.ts (한글/한자 금액)** | **(b)** | 독립 신규 파일. 대응물 없음 |
| 5 | **rich-text (shared/contract-rich-text.ts + rich-text-editor.tsx + TipTap deps)** | **(b)** 모듈 / **(c)** 배선 | 신규 메인은 특약이 일반 Textarea(-special-terms-card.tsx). 모듈은 그대로 이식, 배선처가 카드/에디터 컴포넌트로 바뀜 |
| 6 | **서버 replaceParties + contract-party-crypto.util + dto + 마스킹** | **(b)** | 신규 파일 2개는 그대로. service/controller 삽입은 라우트 충돌 없음, 텍스트 충돌만 수동 해소 |
| 7 | **서버 목록필터 (findAll 재작성 + 페이지네이션)** | **(c)** | 신규 메인 findAll 무변경이나, index.tsx에 클라이언트측 필터가 이미 존재 → 서버측으로 치환하는 UI 재배선 결정 필요 |
| 8 | **서버 사본/삭제 (copyContract/copyDocument/remove/removeDocument)** | **(b)+주의** | 대응물 없음. 단 copyDocument가 신규 `currentRevisionId`/`revisions`를 복제하지 않도록 1곳 적응 |
| 9 | **UI 당사자 편집 (-parties-editor.tsx, 1,103줄×2앱)** | **(b)** 파일 / **(c)** 배선 | 파일 그대로 투하. 호출부가 내 모놀리스 ContractDetailCard → 신규 -contract-detail.tsx로 이동 |
| 10 | **UI 동적 폼 (템플릿 fieldGroups 렌더링, AmountEngineFieldControl 등)** | **(c)** 유리한 재작성 | 신규 -document-editor.tsx가 같은 base 코드의 추출본이라 함수명 1:1 — 모놀리스 델타를 추출 파일에 재생 |
| 11 | **UI 필터바 (ContractListFilterBar + 서버 페이지네이션 연동)** | **(c)** | 신규 index.tsx의 자체 클라이언트 필터와 병합/치환 설계 필요 |
| 12 | **UI 문서 허브 kind 탭/정렬/사본/삭제** | **(c)** 소규모 | 신규 -document-hub.tsx(206줄)에 kind 개념 없음 — 델타 이식 |
| 13 | **dirty tracking (§3.1 스냅샷 패턴)** | **(c)** 소규모 | 패턴 자체는 이식 가능, 부착점이 -contract-detail/-document-editor로 분산 |
| 14 | **api-client contracts.ts 확장** | **(b)** | 표면 겹침 없음, additive |
| 15 | **enums (CONTRACT_DOCUMENT_KINDS 39종)** | **(b)** | additive. yearly만 별도 (§5) |
| 16 | **테스트 (service.spec +1,098 / shared 4파일 / catalog test)** | **(b/c)** | shared 테스트 (b). service.spec은 신규 메인 +612와 같은 파일 — additive 병합. web 카탈로그 테스트 (b) |
| 17 | **연세(yearly) 추가** | **충돌** | 신규 메인이 정반대의 제품 결정 + 데이터 마이그레이션 집행. §5 |

**(a) 이미 있음(중복) 판정 조각: 없음.** 내 문서관리 기능 중 신규 메인이 선점한 것은 없다. 유일한 기능적 인접물은 신규 메인의 리비전/매매초안 파이프라인인데, 이는 내 작업과 직교(orthogonal)하며 오히려 공존 정합만 챙기면 된다.

---

## 3. 총난이도 평가

**중상 (예상 5~7 작업일).** 이유:

- 스키마·카탈로그·shared 유틸·서버 신규 파일·api-client·parties-editor 등 **분량의 60%+가 신규 파일이거나 무변경 영역**이라 파일 단위 이식(git checkout / 복붙)이 됨.
- 어려운 곳은 3군데: (1) `contracts.service.ts` 수동 병합(양쪽 합계 ~1,900줄 추가가 같은 파일), (2) UI 델타를 모놀리스→추출 컴포넌트로 재배치(web+desktop 2벌), (3) 엔진 추출본에 신규 메인 델타 반영.
- 신규 메인의 컴포넌트 분해가 **base의 충실한 추출**이라는 점이 난이도를 크게 낮춘다 — 내 델타의 앵커(함수명·구조)가 살아 있음.
- desktop/web 이원화: 신규 메인은 web에만 -residential-sale-editor가 있고 엔진도 web(895줄)/desktop(776줄)이 다름. 내 이식도 두 앱에 각각 적용하되 web을 먼저, desktop을 미러.

---

## 4. 구체 작업 계획

### Phase 0 — 준비 (0.5d)
1. origin/main에서 새 브랜치 (`feat/docs-reapply` 등).
2. 연세 결정 확정 (§5). 기본: yearly 제외하고 이식.
3. 내 `20260713195801_backfill_property_memo_and_sync_drift` **폐기 확정**.

### Phase 1 — 스키마 + 마이그레이션 (0.5d)
- `prisma/schema/crm.prisma`: ContractParty 모델 블록 + ContractDocument의 kind/sortOrder/kindOrder 3필드 + Contract.parties 관계를 **수동 삽입** (ContractDocumentRevision 블록과 공존).
- `pnpm prisma migrate dev`로 신규 메인 기준 마이그레이션 재생성 (기존 `20260713195802` SQL을 참고 자료로만 사용).

### Phase 2 — shared 패키지 (0.5~1d)
- `contract-amount.ts`, `contract-rich-text.ts`: 내 브랜치에서 **파일 그대로 checkout** + index.ts export + 테스트 3파일.
- `contract-document-engine.ts`: 내 추출본 투하 후 **신규 메인 route 엔진 델타 반영** — ContractDocumentEngineProperty를 신 shape(site.roadAddress/jibunAddress, unit.dong, unit.siteUnitType)으로 갱신, buildContractDocumentEngineDraft의 property 접근 경로 수정, workflow/sections의 신규 메인 수정분 채택. `buildResidentialSaleAgreement`는 shared `contract-agreement.ts` 의존 글루이므로 route 파일에 남기거나 shared로 함께 이동(전자 권장 — 신규 메인 소유 코드 최소 접촉).
- 양 앱 `-document-engine.ts`를 shim으로 교체 (category 오버로드 하위호환 확인: `-document-editor.tsx:182`의 `getContractDocumentEngineFieldGroups(form.category)` 그대로 동작해야 함).

### Phase 3 — 서버 (1~1.5d)
- 신규 파일 checkout: `contract-party-crypto.util.ts`, `dto/contract-party.dto.ts`.
- `contracts.service.ts` **메서드 단위 수동 이식**: findAll(필터·페이지네이션) 치환, replaceParties + loadExistingPartyIdNumbers/findPreservableIdNumber/resolveWriteIdNumber, sanitizeDocumentMetadata/sanitizeEngineFieldsRecord, copyDocument/copyContract/remove/removeDocument, buildPartiesTree/buildContractWhere/buildSearchClauses/resolveRetentionCutoff, nextDocumentSortOrder/KindOrder, assertContractDocumentKind, contractInclude에 parties 추가.
- **정합 체크 2건**: copyDocument에서 `currentRevisionId`·`revisions` 미복제. 내 sanitize 경로가 신규 applyRevision의 metadata 쓰기와 충돌하지 않는지(리비전 apply는 검증된 payload를 그대로 쓰므로 sanitize 우회 유지가 자연스러움).
- controller: `PUT :id/parties`, `POST :id/copy`, `POST :id/documents/:documentId/copy`, `DELETE :id/documents/:documentId`, `DELETE :id` 추가 (신규 메인 라우트와 충돌 없음).
- spec: 내 +1,098줄 테스트를 신규 메인 +612줄 spec에 describe 블록 단위 additive 병합.

### Phase 4 — api-client (0.25d)
- contracts.ts에 내 타입·메서드 병합 (겹침 없음). index.ts export 추가.

### Phase 5 — UI (web 먼저 2d, desktop 미러 0.5~1d)
1. `-parties-editor.tsx` 파일 checkout → `-contract-detail.tsx`의 ContractDetailCard에 당사자 섹션·시트 배선 (내 모놀리스 1408~1790 구간의 배선 델타 참조).
2. `-document-editor.tsx`: 내 DocumentEngineFieldControl 확장(AmountEngineFieldControl, parseUnitToManwon 등) + 템플릿 fieldGroups 오버로드 호출(`getContractDocumentEngineFieldGroups(template, options)`) + dirty tracking(스냅샷 + 저장버튼 게이팅 + 닫기 확인) + ContractRichTextView 이식.
3. `-special-terms-card.tsx`: Textarea → rich-text-editor 교체 (기존 ClauseTemplate 삽입 흐름 유지).
4. `-document-hub.tsx`: kind 탭/kindOrder 반복 서식/sortOrder 정렬/문서 사본·삭제 액션 이식 (`sortContractDocuments`, `findPrimaryContractDocument` 등).
5. `index.tsx`: ContractListFilterBar 이식 + 서버 페이지네이션 쿼리 연결. **권고**: 신규 메인의 클라이언트 필터 UI(통계 타일 연동)는 보존하고, 데이터 소스만 서버측 `ContractsPaginatedFilter`로 치환 — 신규 메인 필터 항목(status/type/doc/date/search)은 모두 내 서버 필터가 superset으로 커버.
6. `components/rich-text-editor.tsx`, `lib/contract-rich-text.ts` checkout. package.json TipTap deps + pnpm-workspace.yaml catalog 병합 → `pnpm install`로 lockfile 재생성.
7. desktop 미러: 동일 파일 적용. desktop -document-editor는 559줄(리비전 미리보기 등 web 전용분 없음) — web에서 이식 완료된 델타만 미러.

### Phase 6 — 카탈로그/시드 (0.25d)
- `contract-template-catalog.ts`, `seed-contract-templates.ts` checkout. yearly `appliesTo`/`transactionTypes` 항목 제거 또는 게이트. `apps/web/test/contract-template-catalog.test.ts` 이식.

### Phase 7 — 검증 (1d)
- `pnpm typecheck`, shared/서버 테스트, 시드 실행(39종 upsert 멱등 확인).
- 계약 페이지 수동 검증: 당사자 편집→저장→마스킹, 문서 허브 kind 탭, 동적 폼, 리치텍스트 특약, 인쇄 미리보기, 사본/삭제, 목록 필터.
- **신규 메인 회귀 확인 필수**: 리비전 목록/apply, 매매초안 prepare/validate, print/clause 템플릿 삭제 — 내 병합이 이 플로우를 깨지 않는지.

### 이식 방법 요약
- **파일 단위 checkout**: parties-editor(×2), rich-text-editor(×2), lib/contract-rich-text(×2), contract-amount, contract-rich-text(shared), contract-party-crypto.util, dto/, 카탈로그, shared 테스트 4파일, 카탈로그 테스트.
- **수동 병합**: contracts.service.ts, contracts.controller.ts, contracts.service.spec.ts, api-client contracts.ts/index.ts, enums.ts, crm.prisma, package.json/pnpm-workspace.
- **재작성(델타 재배치)**: index.tsx 필터 연동, -contract-detail 당사자 배선, -document-editor 확장, -document-hub kind 탭, shared 엔진의 신 property shape 정렬.
- **git cherry-pick(fd9eddf 통째)은 비권장** — index.tsx·service·spec에서 해소 불가능 수준의 충돌.

---

## 5. 연세(yearly) 처리 권고

**상황**: 나는 `ContractTransactionType`에 YEARLY(레거시 Tran_Clsf 08)를 추가했고, base_contract 템플릿 transactionTypes에 yearly를 추가하는 마이그레이션(20260714001000)과 카탈로그 appliesTo까지 연동했다. 신규 메인은 정반대로 "거래유형은 sale/jeonse/monthly 3종만"이라는 제품 결정을 내리고, 기존 yearly_rent Listing 데이터를 월세(연액÷12, 보증금 유지, memo 태그)로 전환·병합·삭제하는 마이그레이션 스크립트까지 집행했다.

**권고: 1차 이식에서는 yearly를 제외한다.**
1. 신규 메인의 결정은 Listing 레벨이지만, ContractTransactionType에 yearly를 넣으면 계약서 UI·서식·필터 전반에 4번째 임대유형이 재등장해 결정 취지와 충돌한다.
2. 레거시 연세 계약 이관은 신규 메인의 전환 규칙과 동일하게 **월세로 환산 + 특약/memo에 원 연세 조건 보존**으로 처리하면 데이터 손실이 없다.
3. 제외 비용이 작다: enums 2줄, 마이그레이션 1건, 카탈로그 appliesTo 몇 곳, 필터바 옵션 1개 — 이식 시 걷어내기 쉽고, 나중에 재도입도 쉽다.
4. 만약 계약서 원문 충실성(제주 연세 관행 등) 요구가 확인되면, **Contract 단계 한정 재도입**을 신규 메인 오너와 별도 합의 — ContractTransactionType은 이미 Listing 3종을 넘는 확장(교환/전대/양도/승계)을 허용하는 계층이므로 명분은 있다. 단 Listing/Deal/통계 어디에도 노출하지 않는 조건.

---

## 6. 리스크

| 리스크 | 대응 |
|---|---|
| contracts.service.ts 병합 중 리비전 플로우 파손 | Phase 7에서 revision/draft 회귀 테스트 필수. copyDocument의 리비전 미복제 확인 |
| 엔진 property shape 불일치 (내 추출본 = 구 shape) | Phase 2에서 신규 메인 web 엔진(895줄)을 기준 텍스트로 삼아 타입·접근경로 정렬 |
| 서버 필터 치환 시 신규 메인 통계 타일(active/signed/balancePending/missingDocs) 데이터 소스 상실 | 통계는 별도 경량 쿼리 유지 또는 페이지네이션 응답에 집계 포함 |
| desktop/web 엔진·에디터 이질화 심화 | web 완료 후 미러 원칙. 장기적으로 shared 추출이 이 문제 자체를 해소 |
| TipTap 의존성 추가로 lockfile 대변경 | `pnpm install` 재생성으로 처리, lockfile은 수동 병합 금지 |
