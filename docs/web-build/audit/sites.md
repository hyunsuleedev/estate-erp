# 감사: sites — partial (5/10)

관리단지 허브의 골격(좌측 단지 목록+그룹화, 중앙 Site 검색 기반 단지 추가, 호실 테이블 뷰, 네이버 스타일 floor×lineNo 배치표, 동/타입/통합검색 필터, 호실 상세 다이얼로그)은 1,831줄 단일 라우트 파일에 상당히 완성도 있게 구현되어 있다. 그러나 동 추가/호수 추가 다이얼로그는 여는 버튼이 없는 데드코드이고, 관리단지 제거·호실 수정/삭제도 mutation/메뉴만 있고 실제로 동작하지 않아 CRUD 절반이 죽어 있다. PRD MVP 범위인 점유상태 뷰, 등기부등본 발급/이력, 만기·변동 정보 구조는 전혀 없으며, 매물 등록 CTA는 호실 컨텍스트 없이 /properties/new로만 이동한다. 에러 처리(쿼리 실패, mutation 실패 피드백)가 전무하고 가격이 억 단위 변환 없이 "만" 단위로만 표기된다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 관리단지 목록 조회 + 건물명/주소 검색 + 로딩 스켈레톤 + 빈 상태
- 지역/유형 그룹화 사이드바 (주소 regex 기반 region 추출, 그룹 접기/펼치기)
- 중앙 Site 검색(2글자 이상) 기반 OfficeSite 추가, 이미 추가된 단지 '추가됨' 배지 표시
- 단지 선택 → GET /sites/:id 상세 조회 → 호실 테이블 뷰 (동/호수/공급/전용/타입/소유자/세입자/등록매물/최근상담/상담일 컬럼, 정렬, 핀 컬럼, 포커스 행 status bar)
- 배치표 뷰: 동별 floor×lineNo 그리드, floor/lineNo 없을 때 호수명 숫자 파싱 fallback, 매물/상담 유무 색상 구분 + legend, 배치 불가 호수 별도 표시, 데이터 부족 빈 상태
- 동 multi-select / 타입 multi-select 필터 (검색 가능 드롭다운) + 호수·이름·전화·상담내용 통합 검색 + 필터 초기화
- 호실 상세 다이얼로그: 개요(기본정보+등록매물 카드)/소유자·세입자/상담 탭, 각 탭별 빈 상태
- 면적 평 환산 표기 (m² × 0.3025)
- 사이드바 접기/펼치기 (PanelLeft 토글)
- 단지 미선택 시 안내 빈 상태 화면

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 동 추가/호수 추가 다이얼로그가 렌더링만 되고 여는 버튼이 없음 — setShowAddDongDialog(true)/setShowAddUnitDialog(true) 호출 코드가 0건. 필터바 또는 단지 헤더에 '동 추가'/'호수 추가' 진입 버튼 연결 필요 (MVP 포함 항목)
- 관리단지 제거 UI 없음 — removeSiteMutation(line 571)이 정의만 되고 사이드바 row 컨텍스트 메뉴 등 트리거가 없음
- 호실 상세 다이얼로그의 '수정'/'삭제' DropdownMenuItem(line 1460-1461)에 onClick 없음 — api.units.update/remove는 존재하므로 수정 폼 다이얼로그 + 삭제 확인 연결 필요
- 매물 등록 CTA가 컨텍스트 전달 없이 <Link to="/properties/new">로만 이동 — siteId/unitId search param 전달 및 properties/new의 validateSearch 수신 구현 필요 (PRD: 호실 문맥에서 매물 등록)
- 점유상태 뷰 미구현 (MVP 포함) — 내부 CRM 데이터(PropertyContact.isResident, Tenant.status/monthlyRent)로 자가/전세/월세/공실·미상 분류 + quick filter + legend 필요. view mode가 'table'|'layout' 2개뿐
- 등기부등본 발급 CTA 및 호실별 발급 이력/최신본 표시 미구현 (MVP 포함) — public-documents API(list/create)가 이미 있으나 페이지에서 전혀 미사용
- 만기/변동 뷰(만기 AI 알림·등기변동·거래 AI 알림) 정보 구조 미구현 (MVP는 정보 구조까지 요구)
- 호실 상세에 '상담 추가' CTA 없음 — 호실/Property 컨텍스트로 Consultation 작성 시작 흐름 부재. 상담 탭도 서버 프로젝션(take:1) 때문에 property당 최신 1건만 표시 가능, PRD는 전체 타임라인 요구
- 호실 상세 소유자 카드에 지분율(shareRatio)/실거주/공동소유 구분/메모/'연락처 상세 열기' 링크 없음, 세입자 카드에 계약 시작·종료일/퇴거예정일/상태 없음, 매물 카드에 '매물 상세 열기' 링크와 최근 수정일 없음 — 다른 페이지로의 컨텍스트 점프가 전혀 없음
- 호실 상세에 후속 작업(Task)/최근 활동 로그(ActivityLog)/등기 문서 섹션 없음 (PRD 호실 상세페이지 정의 대비)
- siteDetail 로딩 중 '단지를 선택하세요' 빈 상태가 그대로 노출 (조건이 selectedOfficeSite && siteDetail) — 로딩 스켈레톤 분기 필요. 쿼리/뮤테이션 에러 처리(재시도 안내, 실패 토스트) 전무
- 가격 표기가 '158,000만' 식으로 억 단위 변환 없음 — formatPriceLabel에 만원→억 변환(예: 15.8억) 적용 필요 (한국 실무 표기)
- selectedUnit이 클릭 시점 스냅샷이라 siteDetail invalidate 후에도 다이얼로그 데이터가 갱신되지 않음 (stale) — unitId로 siteDetail에서 derive하거나 별도 쿼리 필요
- 키보드 단축키 미구현 (/ 검색 포커스, Enter 열기, Cmd+K 단지 추가)
- 지역 그룹화가 wardCode(법정동 체인)가 아닌 주소 문자열 regex 기반이라 오분류 가능
- 배치표 floors.map에서 key 없는 Fragment(<>) 사용 — React key 경고 발생 (line 272)
- OfficeSite memo 편집 UI 없음 (PRD상 MVP 제외이나 서버 PATCH는 존재)

## API 갭
- api-client officeSites.update() 메서드 없음 — 서버에는 PATCH /office-sites/:id 존재 (memo 수정용), 클라이언트 모듈에 미노출
- 호실 상세 전용 풀 프로젝션 API 없음 — GET /units/:id는 properties를 중첩 관계 없이 반환하고, GET /sites/:id 프로젝션은 consultations take:1 + propertyContacts role=owner 한정. PRD 호실 상세(전체 상담 타임라인, 모든 소유자 role, 세입자 계약기간, Task, ActivityLog)를 위한 GET /units/:id?include=full 또는 별도 엔드포인트 필요
- public-documents API에 unitId 기반 필터 없음 — list 필터가 propertyId/siteId/type뿐이라 PRD의 'GET /registry-documents?unitId=' 흐름 불가. Property 미생성 호실에서 발급 시작하려면 unitId 파라미터 필요
- 등기 공용 스냅샷 API(GET /registry-snapshots/by-unit) 서버 모듈/api-client 모두 부재 (PRD MVP: 타 사무소 발급본 공용 스냅샷 열람)
- 만기 AI 알림/등기변동 알림/거래 AI 알림 API 부재 (수집 파이프라인 전제, future)
- api-client 타입 갭: UnitTenant에 contractStart/contractEnd/moveOutDate 누락, UnitPropertyContact에 shareRatio/memo 누락 (서버는 include로 전체 스칼라를 반환하나 타입 미정의)
- 대형 단지 대비 unit pagination/동별 partial fetch 파라미터 없음 (PRD 비기능 요구사항: 분할 fetch 검토)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/sites/index.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table (DataTable, ColumnDef 사용)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 클라이언트 싱글톤)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts (cn)
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/* (button, input, badge, separator, skeleton, scroll-area, dialog, label, select, dropdown-menu, tabs)
- @estate-erp/api-client 타입 (Dong, Unit, OfficeSite)
