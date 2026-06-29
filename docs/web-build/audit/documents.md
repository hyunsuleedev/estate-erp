# 감사: documents — partial (5.5/10)

자료관리 페이지는 공적장부 발급 이력 테이블(index.tsx)과 매물 사진 검색(photos.tsx) 두 화면이 구현되어 있다. 종류별 필터, 비용 합계, 파일 열람, 매물 상세 점프, 로딩 스켈레톤/빈 상태까지 조회 기능은 깔끔하게 동작하고 api-client·서버 모듈(public-documents, property-photos)도 완비되어 있다. 그러나 사이드바에 두 페이지로 가는 링크가 전혀 없어 URL 직접 입력 외에는 도달 불가능한 고아 페이지 상태이며, 에러 처리·pending 상태 갱신·삭제/재발급 등 관리 액션이 없어 조회 전용 스캐폴딩 수준에 머물러 있다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 공적장부 발급 이력 전체 테이블 (상태/종류/매물·단지/발급일/요청자/비용 컬럼)
- 장부 6종(등기부등본·건축물대장·토지대장·지적도·토지이용계획·대지권등록부) + 전체 종류별 필터 칩
- 총 발급 건수 및 완료 건 발급 비용 합계 요약 (원 단위 표기, 무료 건 구분)
- 완료 건 fileUrl 열람/다운로드 링크 (새 탭)
- 상태별 뱃지 (완료/처리중 스피너/실패 아이콘)
- 발급 건 → 매물 상세(/properties/$id) 컨텍스트 점프 링크 (단지명+동+호 표기)
- 로딩 스켈레톤 + 필터별 빈 상태 메시지 (양 페이지)
- 매물 사진 검색: 단지명(2글자 이상)/평형(84A) 조건부 쿼리 (enabled 가드)
- 사진을 매물(Property) 단위로 그룹핑 + 매물별 장수 뱃지 + 매물 상세 링크
- 사진 카테고리(외관/거실/주방 등 11종) 한글 라벨 오버레이
- 서버 측 public-documents·property-photos 모듈 완비 (officeId 격리, type/siteName/siteUnitTypeName 필터 지원)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 사이드바(app-sidebar.tsx navItems)에 /documents, /documents/photos 항목이 전혀 없음 — 페이지가 UI에서 도달 불가능한 고아 라우트. '자료관리' 메뉴(공적장부 이력 + 매물 사진 하위 항목) 추가 필요
- pending(처리중) 건 자동 갱신 없음 — useQuery에 refetchInterval/polling이 없어 처리중 스피너가 수동 새로고침 전까지 영원히 유지됨. 실제 발급 벤더(틸코 등) 연동도 미구현이라 pending → completed 전환 주체가 서버에 없음
- 쿼리 에러 상태(isError) 미처리 — API 실패 시 '발급된 공적장부가 없습니다' 빈 상태로 잘못 표시됨 (index.tsx, photos.tsx 공통). 에러 배너 + 재시도 버튼 필요
- 발급 이력 행에 삭제 액션 없음 — api.publicDocuments.remove()가 이미 존재하나 UI 버튼/확인 다이얼로그 미구현
- 실패(failed) 건의 errorMessage 미표시 및 재발급(재시도) 액션 없음 — 실패 사유를 알 수 없고 매물 상세로 돌아가야만 재발급 가능
- 목록 검색(단지명/제목 텍스트)·발급일 기간 필터·페이지네이션 없음 — 이력이 쌓이면 전체 fetch로 성능 저하
- expiresAt(유효기간) 컬럼 미표시 — 등기부등본 등 장부 최신성/만료 여부 판단 불가 (타입에 필드는 존재)
- photos.tsx가 순수 조회 전용 — 카테고리 변경(update)·삭제(remove)·정렬(reorder) API가 모두 존재하나 UI 없음, 사진 클릭 시 라이트박스/원본 확대 보기도 없음
- photos 검색 입력 디바운스 없음 — 키 입력마다 새 쿼리 발사 (queryKey에 raw 입력값 포함)
- photos에 카테고리(외관/거실 등) 필터 칩 없음 — 평면도만 모아보기 같은 실무 시나리오 불가
- 요약 합계(총 발급/비용)가 현재 종류 필터가 적용된 데이터 기준이라 '전체' 합계와 혼동됨 — 필터와 무관한 전체 기준 별도 쿼리 필요
- index.tsx의 Badge import 미사용 (린트 정리), 하드코딩 한국어로 사이드바의 i18n(useTranslation) 패턴과 불일치

## API 갭
- GET /public-documents에 페이지네이션(page/limit)·기간(from/to)·텍스트 검색(q) 파라미터 없음 — 현재 type/propertyId/siteId 필터만 지원, 이력 누적 시 전체 fetch
- 공적장부 실제 발급 처리 파이프라인 부재 — POST /public-documents는 pending 레코드만 생성하고, 외부 벤더(틸코 등) 연동 워커나 콜백이 없어 PATCH /public-documents/:id/status를 클라이언트가 수동 호출해야만 상태 전환됨
- 발급 문서 일괄 다운로드(ZIP) 엔드포인트 없음 — 매물 상세의 'ZIP 일괄 다운로드' 버튼이 더미 상태이며 documents 목록 페이지에서도 활용 불가
- property-photos 업로드용 S3 presigned URL 발급 엔드포인트 없음 — create는 fileUrl 문자열을 받기만 함 (PRD상 S3 업로드는 Phase 2이나 사진 관리 완성에 필수)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/documents/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/documents/photos.tsx

## 공유 의존성 (수정 금지 영역)
- @/lib/api (api 싱글톤)
- @/lib/utils (cn)
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/skeleton
- @/components/ui/input
- @estate-erp/api-client (PublicDocument, PropertyPhoto 타입)
- @/components/layout/app-sidebar.tsx (내비게이션 항목 추가 시 수정 필요 — 다른 페이지와 충돌 표면)
