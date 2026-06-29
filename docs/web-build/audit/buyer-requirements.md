# 감사: buyer-requirements — partial (4/10)

목록(DataTable) 화면 하나만 존재하며, 검색·다중 필터(상태/긴급도/거래유형/예산/면적/입주일)·법정동 코드 기반 희망지역 필터·중앙 Site 검색 기반 희망단지 필터·서버 페이지네이션까지 목록 조회 품질은 높다. 그러나 PRD의 핵심인 상세 화면(조건 요약+연결 매칭+우측 상담내역 패널), 생성/수정/삭제/상태변경 UI, due follow-up(연락 필요) 프리셋, 매칭 후보 패널이 전부 없어 읽기 전용 목록에 머문다. api-client에는 create/update/updateStatus/remove/findDueContacts가 모두 준비돼 있으나 페이지는 findAll만 사용한다. 컨텍스트 점프(상세/Contact/Matches)도 전무해 PRD 시나리오 A·B·C 중 어느 것도 완결되지 않는다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- BuyerRequirement 목록 DataTable (서버 페이지네이션 20건, 고정 컬럼, 행 선택, 키보드 내비게이션)
- ViewBar 검색(고객명·전화·메모) + 다중 필터: 상태/긴급도/거래유형/예산/보증금/월세/면적/입주희망일
- 희망 지역 비동기 필터 — api.regions.search 기반, province/district/ward 레벨별 코드 CSV로 분리 전송 (법정동 정규화 반영)
- 희망 단지 비동기 필터 — api.officeSites.searchCentral로 전체 Site 검색 후 preferredSiteIds CSV 전송
- 정렬(등록일/긴급도) + 컬럼 헤더 정렬 연동
- preferredSites/preferredRegions 칩 표시 컬럼 (단지명·법정동명)
- 만원→억 표기 (formatPrice: 158000 → '15억 8,000만')
- 상태/긴급도 한글 라벨 뱃지 (활성/매칭됨/완료/비활성, 급/보통/여유)
- 최근 상담일(lastContactDate) 상대 표시 + 90일 경과 시 빨간색 강조
- 빈 상태 메시지 분기 (필터 적용 시 '검색 결과가 없습니다' / 미적용 시 '구매 희망 고객이 없습니다')
- 로딩 상태 (isLoading → DataTable 스켈레톤)
- 하단 상태바: 포커스 행의 고객명·전화·예산·희망지역·희망단지 요약

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- Buyer Requirement Detail 상세 화면 전무 — $id 라우트 없음, DataTable에 onRowClick/더블클릭 핸들러 미전달이라 행에서 아무 데도 못 감. 서버 findOne은 matches(listing+property+site)·consultations(10건)·preferredSites/Regions를 이미 include하므로, PRD의 '좌측 2/3 조건요약+연결매칭 / 우측 1/3 상담내역 스크롤 패널' 레이아웃으로 상세 화면 신설 필요
- 생성/수정 폼 없음 — '구매요구조건 추가' CTA 자체가 페이지에 없고 웹앱 전체에 BuyerRequirement 생성 UI가 없음. api.buyerRequirements.create/update(preferredSites·preferredRegions DTO 포함)는 존재. 거래유형 조건부 필드(monthly→보증금+월세 상한, sale/jeonse→price range), min<=max 검증, 고정 지역/단지 quick pick 포함 폼 필요
- 상태 변경·삭제 UI 없음 — api.buyerRequirements.updateStatus/remove 미사용. 행 컨텍스트 메뉴 또는 상세에서 active→matched→completed/inactive 전환, Match/Consultation 연결 시 삭제 대신 inactive 유도 정책 구현 필요
- due follow-up('연락 필요') 프리셋 및 좌측 프리셋 사이드바 없음 — findDueContacts API 미사용, '전체/연락 필요/활성/매칭 진행중/완료' 프리셋 탐색 미구현
- 목록 컬럼 누락: 다음 연락일(nextContactDate), 담당자(assignedTo — 서버는 반환 중), 연결 매칭 수(_count.matches — 서버는 반환 중), 마지막 상담내역 1줄 요약. followUpState(overdue/today) 색상 뱃지도 없음
- 매칭 후보 패널 / '매칭 찾기·매칭 생성' CTA 없음 — Matches 화면으로의 컨텍스트 점프 미구현 (PRD 시나리오 C 매칭 진행 허브 미작동)
- 에러 상태 미처리 — useQuery의 error를 사용하지 않아 목록 조회 실패 시 재시도 버튼 없이 빈 테이블만 표시
- 상담 기록 추가·후속 태스크 생성 CTA 없음 — buyerReqId 컨텍스트로 Consultation/Task를 만드는 흐름 부재 (PRD 시나리오 B 미완)
- 필터 누락: 담당자(assignedToId — 서버·api-client 모두 지원), 다음 연락일 이전(nextContactBefore — 지원), '연결 매칭 있음'(서버 미지원), '고정 지역/단지' quick pick 칩 (프리셋 저장소 자체가 없음)
- 고객명 클릭 → Contact Detail($id) 링크 없음
- 키보드 단축키 미구현 — Cmd+N(신규), Cmd+F(검색 포커스), Enter(상세 열기, onRowClick 부재로 무동작)

## API 갭
- GET /buyer-requirements 목록 projection에 '마지막 상담내역/마지막 상담일'(최신 Consultation content·createdAt) 없음 — 서버는 _count.consultations 숫자만 반환. PRD 목록 컬럼용 latestConsultation 요약 필드 추가 필요 (apps/server/src/modules/buyer-requirements/buyer-requirements.service.ts findAll include)
- api-client BuyerRequirement 타입에 assignedTo·_count(matches, consultations) 필드 미정의 — 서버 findAll은 이미 반환하므로 packages/api-client/src/modules/buyer-requirements.ts 타입 보강 필요 (담당자/연결매칭 컬럼 구현의 선행 조건)
- '고정 지역/고정 단지' 프리셋 저장·조회 API 없음 — PRD가 요구하는 사무소/사용자 단위 pinned regions·pinned sites 저장소(서버 모듈 + api-client 메서드) 부재
- '연결 매칭 있음'(hasMatches) 필터 파라미터 서버 미지원 — BuyerRequirementSearchQuery에 없음
- BuyerRequirementsFilter(api-client)에 nextContactAfter/Before는 있으나 'due(연락 필요)' 복합 프리셋(status=active AND nextContactDate<=now)을 목록 API에서 페이지네이션과 함께 쓸 수 있는 파라미터 없음 — findDueContacts는 배열만 반환하고 페이지네이션·정렬 미지원

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/buyer-requirements/index.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/data-table.tsx (DataTable)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/view-bar.tsx (ViewBar)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/cells.tsx (StatusBadgeCell, DateCell, TextCell)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/types.ts (FilterDefinition, ActiveFilter, SortDefinition)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 싱글톤)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts (cn)
- @estate-erp/api-client (BuyerRequirement 타입, buyerRequirements/officeSites/regions 모듈)
- @estate-erp/shared (formatPrice)
