# 감사: partner-brokers — partial (5.5/10)

공동중개 파트너 주소록의 기본 CRUD는 완성도 있게 구현됨 — Notion 스타일 DataTable에 사무소명/대표자/등록번호/전화/주소/메모 컬럼, 클라이언트 검색·정렬(ko-KR locale), 등록/수정 다이얼로그, 소프트 삭제(비활성화), 로딩/빈 상태 처리까지 갖춤. 그러나 도메인 핵심인 '거래 횟수'는 서버에서 dealCount 집계 캐시를 갱신하는 코드가 전무해 항상 0으로 표시되고, '연결 Deal' 목록·거래 상세로의 점프 흐름이 전혀 없어 주소록 이상의 가치를 제공하지 못함. 에러 처리(쿼리 실패, 뮤테이션 실패 토스트)도 빠져 있음.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 파트너 목록 테이블 (사무소명, 대표자/중개업 등록번호, 대표폰, 사무소 전화, 주소, 거래 수 배지, ERP 가입(linkedOfficeId) 배지, 메모, 수정일 상대시간)
- 클라이언트 사이드 통합 검색 (사무소명/대표자/전화/등록번호/주소/메모)
- 클라이언트 사이드 정렬 — ko-KR locale-aware, 빈 값 후순위, dealCount/날짜 숫자 정렬
- 파트너 등록 다이얼로그 (사무소명 필수 검증, 대표자/대표폰/등록번호/전화/주소/메모)
- 파트너 수정 다이얼로그 (행 클릭 또는 연필 아이콘, 기존 값 프리필)
- 소프트 삭제(비활성화) — confirm 후 DELETE, 서버는 isActive=false 처리로 Deal FK 보존
- 로딩 상태(DataTable isLoading) 및 빈 상태 메시지(검색 결과 없음 vs 데이터 없음 구분)
- 상태바에 필터링/전체 건수 표시
- 비활성 파트너 행에 '비활성' 라벨 표시
- 서버 모듈 완비: GET/POST/PATCH/DELETE + officeId 멀티테넌시 격리 + includeInactive 쿼리 파라미터
- Deal 생성 폼(properties/new.tsx)과 캐시플로우 원장(cashflow/-ledger.tsx)에서 partnerBrokers API 재사용 — 주소록이 실제 거래 흐름에 연결됨

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 거래 횟수(dealCount)가 항상 0 — prisma/schema/partner-broker.prisma 주석은 'Deal upsert 시 갱신'이라 하지만 apps/server/src/modules/deals/deals.service.ts의 create/update 어디에도 partnerBroker.dealCount 증감 로직이 없고 DB 트리거도 없음. Deal create/update/cancel 시 dealCount를 증감하거나 list 응답에서 _count.deals로 실시간 집계해야 함
- 연결 Deal 목록 없음 — 파트너 행 클릭 시 편집 다이얼로그만 열림. 상세 패널(또는 다이얼로그 탭)에 해당 파트너와 진행한 Deal 목록(단계, 거래유형, 합의가, 수수료 배분)을 표시하고 각 Deal 상세로 점프하는 링크 필요. 선행으로 파트너별 Deal 조회 API 필요 (apiGaps 참조)
- 비활성 파트너 복구 불가 — api.partnerBrokers.list(includeInactive)와 UpdatePartnerBrokerDto.isActive가 이미 존재하지만 UI에 '비활성 포함' 토글과 재활성화 버튼이 없어 비활성화하면 UI에서 영구히 사라짐
- 에러 처리 전무 — useQuery 실패 시 isError 미처리로 '등록된 중개사무소가 없습니다'로 오인 표시, create/update/remove 뮤테이션에 onError 토스트 없음(조용히 실패)
- email 필드 미노출 — PartnerBroker 스키마/DTO/서버에 email이 있으나 폼과 테이블 컬럼 어디에도 없음
- 전화번호 액션 없음 — 대표폰/사무소 전화 셀에 tel: 링크나 복사 버튼이 없고 입력 시 전화번호 형식 검증/자동 하이픈 포맷팅도 없음
- 비활성화 확인에 네이티브 confirm() 사용 — 다른 페이지 패턴(shadcn AlertDialog) 대비 UI 일관성 떨어짐
- 페이지네이션 없음 — 전체 목록을 한 번에 로드하고 pageSize를 전체 길이로 고정 (파트너 수가 적어 당장은 수용 가능하나 서버 list도 페이징 미지원)
- linkedOfficeId 연결 수단 없음 — 'ERP 가입' 배지는 표시하지만 가입 사무소를 검색해 연결하는 UI 없음 (Phase 2 네트워크 연동 시 자동 채움 예정이므로 후순위)

## API 갭
- 파트너별 연결 Deal 조회 불가 — api.deals.findAll()이 무인자이고 서버 DealsService.findAll(officeId)도 필터를 받지 않음. GET /deals?partnerBrokerId= 필터 추가 또는 GET /partner-brokers/:id/deals 엔드포인트 + api-client 메서드 신설 필요
- dealCount 집계 갱신 로직 부재 — deals.service.ts의 create/update(partnerBrokerId 변경)/cancel 경로에서 partnerBroker.dealCount 증감이 없음 (또는 partner-brokers list 응답에 _count.deals 실시간 집계 포함)
- PATCH /partner-brokers/:id 재활성화는 서버에 이미 존재(isActive)하나 페이지에서 미사용 — API 신설은 불필요하고 UI 연결만 필요

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/partner-brokers/index.tsx

## 공유 의존성 (수정 금지 영역)
- @/components/data-table (DataTable, DateCell, ViewBar) — apps/web/src/components/data-table/
- @/components/ui/button
- @/components/ui/dialog
- @/components/ui/input
- @/components/ui/label
- @/components/ui/textarea
- @/components/ui/tooltip
- @/lib/api (api.partnerBrokers)
- @/lib/utils (cn)
- @estate-erp/api-client (PartnerBroker, CreatePartnerBrokerDto, UpdatePartnerBrokerDto 타입)
