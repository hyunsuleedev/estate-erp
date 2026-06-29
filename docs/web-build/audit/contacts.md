# 감사: contacts — partial (6.5/10)

목록(무한스크롤+ViewBar 검색/필터/정렬), 행 클릭 QuickSheet(운영 알림 룰 포함), 상세 탭 페이지(기본정보/연결매물/매수요건/상담/관계), 수정 다이얼로그, 삭제, 전화번호 중복 확인이 붙은 신규 등록까지 핵심 CRUD 흐름이 동작하며 만원→억 표기, 평 변환, 전화번호 포맷 등 한국 실무 표기 품질도 양호하다. 다만 PRD의 핵심인 그룹 사이드바/그룹 필터가 전혀 없고(그룹 태그로 목록을 좁힐 수단 자체가 부재), 관계(ContactRelation) 추가·삭제 UI가 없으며, 수정 다이얼로그가 phones[]를 2개 슬롯으로 통째 교체해 3개 이상 전화번호가 소실되는 데이터 손실 버그가 있다. 삭제 가드·에러 재시도·소유물건 컬럼 등 PRD 수용 기준 대비 갭이 남아 partial로 판정한다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 연락처 목록: 무한스크롤(50건/페이지) + 이름/전화(정규화 숫자)/이메일 통합 검색 (서버 normalizedPhone contains 검색)
- ViewBar 필터: 매물 연결 있음, 매수요건 있음, 추가 태그(데이터에서 동적 수집) + 정렬(최근 수정/등록일/이름, 헤더 정렬 동기화)
- 다중 전화번호(ContactPhone[]) 표시: primary 우선 정렬, legacy contact.phone 폴백, 02/010 하이픈 포맷팅
- 목록 컬럼: 연결 카운트 칩(_count.propertyContacts/buyerRequirements), 마지막 상담내역+날짜(latestConsultation 서버 projection), 수정일 relative 표시
- 행 클릭 → ContactQuickSheet: '지금 확인할 것' 운영 알림(연락 예정일 경과/임박, 상담 공백 30일/60일, 매물 미연결 룰), 전화번호 목록, 연결 매물, 매수요건, 최근 상담 3건, 관계, 메모 + tel:/mailto: 액션
- 상세 페이지($id): 5개 탭(기본 정보/연결 매물/매수요건/상담/관계), 탭별 개수 뱃지, 병렬 쿼리(property-contacts/buyer-requirements/consultations)
- 연락처 수정 다이얼로그: 이름 필수 검증, 그룹 선택기(ContactGroupSelector), 추가 태그, 메모, 캐시 무효화
- 연락처 삭제: window.confirm + 실패 시 페이지 에러 배너
- 신규 등록(new): 전화번호 7자리 이상 입력 시 실시간 중복 후보 패널(대기/로딩 스켈레톤/발견 경고/없음 3상태), 생성 성공 후 상세 자동 이동
- 태그 체계: 고정 그룹 5종 + 추가 태그 분리(splitContactTags), deprecated 태그 숨김
- 컨텍스트 점프: PropertyContact 카드/행 → /properties/$id 링크
- 한국 실무 표기: formatPrice(만원→억), sqmToPyeong(m²→평), 매수요건 예산 요약(매매/전세/월세 분기), preferredRegions 법정동(ward/district) 표시
- 로딩(스켈레톤)·빈 상태 처리: 검색 결과 없음 vs 등록된 연락처 없음 메시지 구분, 탭별 EmptyState

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- PRD 핵심인 좌측 그룹 사이드바(전체 연락처 + 고정 그룹 5종 + 그룹별 개수) 미구현 — ViewBar의 '추가 태그' 필터는 CONTACT_GROUP_TAGS를 제외하므로 그룹(소유자/매수·투자/임차/매물상담/거래처)으로 목록을 필터링할 수단이 전혀 없고, 목록에 '그룹' 컬럼도 없음
- 수정 다이얼로그가 phone+phone2 2개 슬롯만 지원하면서 서버 update는 phones deleteMany 후 재생성 → 전화번호 3개 이상 또는 라벨/메모가 있는 연락처를 수정하면 데이터가 조용히 소실됨. ContactPhone[] 동적 행 편집 UI 필요
- 상세 '관계' 탭이 읽기 전용 — api.contactRelations.create / createWithNewContact / remove가 이미 존재하는데 사용하지 않음. PRD의 '관계 유형 선택 + 전화번호 입력 → Contact 자동 생성 + 관계 연결' 등록 UI와 관계 삭제 버튼 없음
- 상세 페이지에 후속 액션 CTA 없음: 매수요건 추가, 상담 기록 작성, 매물 연결(PropertyContact 생성), Task 생성 진입점이 전부 부재 (PRD 9장 저장 후 후속 액션, 12장 연결 화면)
- 삭제 가드 없음: 서버 remove()가 연결 엔터티(PropertyContact/BuyerRequirement/Consultation/Task) 검사 없이 hard delete, UI도 차단 사유 안내 없이 '삭제에 실패했습니다' 일반 메시지만 표시. 역할(owner/manager/agent)별 삭제 권한 분기도 UI·서버 모두 없음
- 목록에 '소유물건' 컬럼 없음 — PRD는 PropertyContact role in (owner, co_owner) 기준 대표 물건명 1~2개 + 총개수 요구, 현재는 익명 카운트 칩('매물 N')만 표시
- 목록/상세 에러 상태 미처리: index.tsx의 useInfiniteQuery에서 isError 미사용으로 조회 실패 시 재시도 버튼 없음(PRD 11장), $id.tsx는 API 에러와 404를 구분하지 못하고 모두 '연락처를 찾을 수 없습니다'로 표시
- '최근 상담 있음' 필터 미구현 (PRD 7장 필터 항목)
- 중복 후보가 발견된 상태에서도 신규 등록이 확인 절차 없이 통과됨 — PRD는 '중복 후보가 있어도 생성은 가능하되 사용자가 명시적으로 확인해야 한다'고 요구(확인 체크박스/컨펌 다이얼로그 필요)
- 매수요건 카드 → /buyer-requirements, 상담 카드 → /consultations 딥링크 없음, 관계 카드에서 상대 연락처(/contacts/$id) 이동 링크 없음 — 사람 기준 허브 점프 흐름 단절
- 키보드 단축키(Cmd/Ctrl+F 검색 포커스, Cmd/Ctrl+N 신규, Enter 상세 열기, ↑↓ 행 이동) 및 더블클릭 상세 진입 미구현 (단일 클릭→QuickSheet 패턴으로 대체된 점은 명시적 결정이면 PRD 갱신 필요)
- 상세 레이아웃이 PRD의 '좌 2/3 정보 + 우 1/3 상담내역 고정 스크롤 패널' 대신 탭 구조 — 상담내역을 다른 정보와 동시에 볼 수 없음
- 실시간 갱신(다른 사용자의 생성/수정 반영) 없음, 신규/수정 폼에서 이메일 형식 검증이 브라우저 type=email에만 의존

## API 갭
- GET /contacts 목록 응답에 '소유물건 요약' projection 없음 — PropertyContact(owner/co_owner) 기준 대표 site/unit 이름 1~2개 + 총개수 필드 추가 필요 (현재 _count와 latestConsultation만 제공, PRD 18장 열린 질문에도 명시된 미해결 항목)
- 그룹(태그)별 카운트 엔드포인트 없음 — 그룹 사이드바용 GET /contacts/group-counts (태그별 aggregate) 또는 동등한 api-client 메서드 필요. 현재는 그룹마다 findAll을 반복 호출해야 함
- GET /contacts에 hasRecentConsultation(최근 상담 있음) 필터 파라미터 없음 (서버 ContactSearchQuery·api-client ContactsFilter 모두 미지원)
- DELETE /contacts/:id가 연결 엔터티 검사 없는 hard delete — 연결된 PropertyContact/BuyerRequirement/Consultation/Task 존재 시 409 + 사유 반환하거나 archive 대안 엔드포인트 필요 (contacts.service.ts remove()는 findOne 후 즉시 prisma.contact.delete)
- contact-relations에 PATCH(수정) 메서드 없음 — api-client는 findByContact/create/createWithNewContact/remove만 제공, 관계 라벨·메모 수정 불가

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/contacts/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/contacts/$id.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/contacts/new.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 클라이언트 인스턴스)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/contacts.ts (CONTACT_GROUPS, formatPhoneNumber, normalizePhone, splitContactTags, mergeContactTags, parseContactTags, stringifyContactTags, isContactTagVisible)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts (cn)
- /Users/hyunsulee/estate-erp/apps/web/src/components/data-table/* (DataTable, DateCell, ViewBar, FilterDefinition/SortDefinition 타입)
- /Users/hyunsulee/estate-erp/apps/web/src/components/quick-sheet.tsx (SheetSection, SheetEmptyState, SheetNoticeRow, formatDateShort/formatDateTime/getDaysSince/getDaysUntil)
- /Users/hyunsulee/estate-erp/apps/web/src/components/contacts/contact-group-selector.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/* (button, badge, dialog, sheet, input, label, tabs, textarea, skeleton)
- @estate-erp/api-client (Contact, ContactDetail, ContactRelation, PropertyContact, BuyerRequirement, Consultation 타입)
- @estate-erp/shared (formatPrice, sqmToPyeong)
