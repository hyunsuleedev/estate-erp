# 감사: packages/api-client (전 도메인 API 래퍼 패키지 감사) — partial (7.5/10)

api-client는 client.ts(fetch 래퍼: Bearer 토큰, 401→onAuthFailure, 204 처리) + 35개 도메인 모듈로 구성되며, 서버 40개 컨트롤러의 엔드포인트를 약 95% 커버한다. any 사용이 0건이고 JSONB 필드는 unknown으로 처리하는 등 타입 위생은 매우 좋으나, @estate-erp/shared를 package.json dependency로 선언만 하고 한 줄도 import하지 않아 모든 enum 유니온이 로컬 중복 정의(CommissionPaymentStatus, ListingAdvertisementStatus 등 — 스팟체크 결과 현재는 shared와 일치)이거나 plain string(Deal.stage, Match.stage, Listing.checkStatus, transactionType)으로 풀려 있어 드리프트 리스크가 있다. 기능적 공백은 CTI/녹음 계열(phone-index, with-recording 업로드)과 inbox revision, office-sites 단건 조회/수정 정도이며, 특히 client.ts가 JSON body만 지원해 multipart(녹음 파일 업로드) 호출은 구조적으로 불가능하다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- client.ts: 공통 fetch 래퍼 (baseUrl, getToken 비동기 토큰, 401 시 onAuthFailure 콜백, 쿼리파람 직렬화, 204 처리, ApiError 변환)
- auth: logout / me — 서버 auth.controller와 1:1 일치
- CRM 코어 완전 커버: properties, listings(filter-sites 포함), listing-intakes(map/confirm/status 포함), contacts(연관 property-contacts·buyer-requirements·consultations 서브조회 포함), consultations(recent 포함), buyer-requirements(due-contacts 포함), matches, deals(stage/cancel), contracts(문서·인쇄·특약 템플릿 14개 엔드포인트 전부)
- 장소 체인 커버: sites(overview 포함), dongs, units, office-sites(목록/검색/추가/삭제), regions(provinces/districts/wards/search)
- 관계 데이터 커버: property-contacts(with-contact 포함), contact-relations(with-contact 포함), tenants(expiring/with-contact 포함)
- 운영 도메인 커버: tasks(reorder/bulk-status/bulk-delete), calendar-events, employees(status/role/reset-password/performance), offices(me/commission-config)
- finance 5개 컨트롤러 전부 커버: commission-payments(collect/waive/confirm/tax-invoice/distributions 양쪽 — :id 및 deal/:dealId), expenses, cashflow, ledger, commission-adjustments(pending/approve/reject)
- 광고·외부매물 커버: listing-advertisements, office-advertisements(batch/link), external-listings(groups 목록·상세·수정, batch, snapshot sessions active/create/complete/cancel)
- AI 직원 커버: proposals(approve/reject), agent/rules(list/update), inbox(decide/reject/snooze/unsnooze/comments)
- 기타: partner-brokers, public-documents, property-photos(reorder 포함), service-vendors(contacts·favorite 포함), call-recordings(list/findOne/stt-status), mcp api-key(조회/발급/폐기)
- 타입 위생: any 사용 0건, JSONB·비정형 필드는 unknown 사용, 모든 응답 타입 명시적 인터페이스 정의

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- @estate-erp/shared 미사용: dependency로 선언했지만 import 0건. CheckStatus·MatchStage·DealStage·TransactionType 등 shared enum이 있는데 api-client는 plain string(Deal.stage, Match.stage, Listing.checkStatus, transactionType)으로 선언 — 컴파일 타임 검증 불가
- enum 유니온 로컬 중복 정의: ListingAdvertisementStatus, CommissionPaymentStatus, VendorAdTier, ProposalStatus 등이 shared와 별도로 api-client에 재정의됨. 스팟체크 결과 현재는 값이 일치하나 수동 동기화 의존 → 드리프트 리스크
- client.ts가 JSON body만 지원 (Content-Type: application/json 고정) — multipart/FormData 업로드 불가. 녹음 파일 업로드(POST /consultations/with-recording)는 현 구조에서 호출 자체가 불가능
- 응답 타입이 서버 Prisma include 형태를 수작업으로 모사 (listings.ts의 175줄짜리 중첩 Listing 타입 등) — 서버 select/include 변경 시 silent 불일치 발생 가능
- ListingsFilter에 sido/sigungu/eupmyeondong 자유텍스트 필터 잔존 — CLAUDE.md의 wardCode FK 정규화 방침과 어긋나는 레거시 시그니처 (서버와 일치하는지 별도 확인 필요)
- PaginatedResponse 사용이 모듈별 비일관: listings·contacts·consultations는 PaginatedResponse, deals·matches·contracts·tasks는 배열 반환 — 서버 응답 형태 차이를 그대로 노출
- remove()의 반환 타입 비일관: 대부분 void, listing-advertisements·partner-brokers·listing-intakes는 엔티티 반환, service-vendors는 { success: true }

## API 갭
- GET /contacts/phone-index — CTI 전화번호 인덱스 (server contacts.controller:51) api-client 메서드 없음
- POST /consultations/with-recording — 녹음 파일 multipart 업로드 + 상담 생성 (server consultations.controller:136). client.ts가 JSON 전용이라 FormData 지원 자체를 추가해야 함
- POST /consultations/recordings — 통화 로그(녹음 없는 콜) 생성 (server consultations.controller:173) 미구현
- POST /inbox/:id/revision — 수정 요청 제출 (server inbox.controller:109) 미구현 (MCP 도구 inbox_submit_revision은 존재하나 REST 클라이언트엔 없음)
- PATCH /listings/:id/check-status — 전용 확인상태 변경 엔드포인트 (server listings.controller:88) 미구현 (UpdateListingDto.checkStatus로 일반 PATCH 우회만 가능)
- GET /office-sites/:id — 관리단지 단건 조회 (server office-sites.controller:37) 미구현
- PATCH /office-sites/:id — 관리단지 memo 수정 (server office-sites.controller:53) 미구현
- (참고: POST /mcp JSON-RPC와 GET /.well-known/oauth-protected-resource는 외부 AI/OAuth 디스커버리용이라 앱 클라이언트 제외가 타당)

## 파일
- /Users/hyunsulee/estate-erp/packages/api-client/src/client.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/types.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/index.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/listings.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/listing-intakes.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/properties.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/contacts.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/deals.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/contracts.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/finance.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/external-listings.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/office-advertisements.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/inbox.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/proposals.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/call-recordings.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/service-vendors.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/sites.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/tasks.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/employees.ts
- /Users/hyunsulee/estate-erp/packages/api-client/src/modules/offices.ts

## 공유 의존성 (수정 금지 영역)
- @estate-erp/shared (package.json dependency로 선언만 되고 src에서 import 0건 — enums/utils 미연동)
- 소비처: apps/web, apps/desktop, apps/mobile이 createApiClient를 공유 — 모듈 시그니처 변경 시 3개 앱 동시 영향
- 타입 단방향 의존: 모듈 간 cross-import 다수 (listings→tenants, deals→contacts·listings·properties, office-sites→sites, contacts→property-contacts·buyer-requirements·consultations)
