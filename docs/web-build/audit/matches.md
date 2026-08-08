# 감사: matches — partial (6/10)

매칭 페이지는 고객별/매물별/단계별/칸반/리스트 5가지 뷰, 검색·단계 필터, 단계 진행 노드(popover) 기반 stage 전환, 방문 일정 캘린더 연동, 상세 다이얼로그(메모 수정·거래 전환·종료)까지 갖춘 비교적 완성도 높은 조회·진행 관리 화면이다. 다만 Match 생성 UI가 웹앱 전체에 부재하고(properties 상세의 '매칭 생성' 버튼은 핸들러 없는 죽은 버튼), 거래 전환이 stage만 바꿀 뿐 실제 Deal을 생성하지 않으며, 서버 include 누락으로 매물별 뷰의 소유자 정보와 구매조건의 지역 요약이 항상 placeholder로 표시된다. 에러 처리(onError/toast/쿼리 에러 상태)와 삭제 액션, 관련 화면(BuyerRequirement/Listing/Deal)으로의 컨텍스트 점프, 상담/태스크 후속 CTA도 빠져 있어 파이프라인 '추적'은 되지만 '연결'이 끊긴 상태다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 5가지 뷰 모드: 고객별(Contact→BuyerRequirement→Match 계층), 매물별(Listing 그룹+소유자 표시 시도), 단계별 그룹 테이블, 칸반(5 active 컬럼+거래전환/종료 결과 패널), 전체 리스트 — PRD의 3뷰 + 후속 확장(매물별)까지 커버
- 검색(고객명/연락처/매물명/도로명·지번주소/메모, useDeferredValue) + 단계 multi-select 필터
- stage 전환: 진행 노드 popover(현재/완료/예정 상태별 액션), '다음 단계' 버튼, 드롭다운 메뉴의 임의 단계 이동, 종료(destructive)
- suggested→buyerInterested→viewingConfirmed→viewing→negotiating→dealCreated→closed 7단계 파이프라인 전체 시각화(progress node, 단계별 색상)
- 방문(viewing) 일정 캘린더 연동: CalendarEvent 생성/변경 + 일정 등록 시 viewing 단계 자동 이동, 예정 방문 표시 — PRD MVP 초과 구현
- 매칭 상세 다이얼로그(더블클릭 진입): 진행 단계 progress, 구매자 정보, 매물 정보(단지/호실/주소/가격), 메모 인라인 편집, 거래 전환/종료 버튼
- 만원→억 표기(formatPrice: 158000→'15억 8,000만'), 월세 보증금/월세 분리 표기, placeholder Dong 숨김 처리 등 한국 실무 표기 준수
- 뷰별 빈 상태 문구, 칸반 컬럼별 빈 상태, 검색 결과 없음 표시
- 같은 고객의 서로 다른 BuyerRequirement를 buyerReqId 기준으로 분리 그룹화 (PRD 핵심 요구 충족)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 거래 전환이 stage를 'dealCreated'로 바꾸기만 하고 실제 Deal을 생성하지 않음 — pipelines.md 규칙('dealCreated 진입 시 Deal 자동 생성')과 PRD 충돌 상태 경고('dealCreated인데 Deal 없음') 위반. 거래 전환 시 api.deals.create({matchId,...}) 호출 다이얼로그 또는 서버측 자동 생성 필요, 전환 후 Deal 화면 이동 흐름도 없음
- Match 생성 UI가 웹앱 전체에 없음 — api.matches.create는 존재하나 호출처 0건. properties/$id.tsx 246행 '매칭 생성' 버튼은 onClick 핸들러 없는 죽은 버튼이고, buyer-requirements 페이지에도 매칭 생성 진입점 없음. listingId+buyerReqId 선택 다이얼로그 구현 필요
- 매물별 뷰 소유자 표시가 항상 '소유자 정보 없음' — matches.service.ts include에 property.propertyContacts(+contact)가 없어 getPrimaryOwnerText가 데이터를 받지 못함
- 구매조건 요약의 지역이 항상 '지역 협의' — matches.service.ts include에 buyerRequirement.preferredRegions(province/district/ward)가 없어 formatRequirementSummaryFromBuyerRequirement의 지역 라벨이 빈 배열
- 에러/로딩 처리 부실: stage 변경·방문 일정 mutation에 onError 없음(실패 시 무반응, PRD '실패 시 이전 상태 유지+오류 표시' 위반), useQuery isError 미처리(서버 다운 시 빈 상태로 오인), 로딩 스켈레톤 없음(칸반 외 뷰는 로딩 중에도 '매칭이 없습니다' 노출 가능)
- 상세 다이얼로그에서 관련 화면 컨텍스트 점프 전무 — PRD 하단 액션 '관련 BuyerRequirement/Listing/Deal로 이동' 미구현 (고객명/매물명이 링크가 아님)
- 후속 액션 CTA 없음 — PRD 상세 레이아웃 좌측 '후속 액션'(상담 기록 생성, 후속 태스크 생성) 미구현. Consultation.matchId/Task 연결 자동 세팅 흐름 부재
- Match 삭제 액션 UI 없음 — api.matches.remove와 DELETE /matches/:id는 존재하나 어떤 메뉴에도 노출 안 됨
- 상단 KPI tiles(진행 매칭/방문 단계/거래 전환/종료 카운트) 미구현 — PRD 상단 영역 요구
- 중복 매칭 방지 없음 — 같은 listingId+buyerReqId 조합에 대해 서버 create 체크도, Prisma unique 제약도 없음 (PRD 폼 규칙 위반)
- 서버 stage 검증 없음 — updateStage DTO가 raw 객체로 임의 문자열 허용(class-validator 미적용), 전이 정책 미적용. UI 드롭다운은 역방향 이동('이 단계로 되돌리기')을 허용해 pipelines.md '역방향 금지' 규칙과 불일치
- 거래유형/지역 필터 없음(단계 필터만 존재), 키보드 단축키(Cmd+F, 1/2/3, Enter) 미구현, 실시간 동기화(socket) 없음, 낙관적 업데이트 없음
- URL 검색 파라미터 미지원 — 다른 페이지(BuyerRequirement/Listing/Deal)에서 특정 매칭으로 딥링크 진입 불가

## API 갭
- GET /matches 응답 include에 listing.property.propertyContacts(+contact) 누락 — 매물별 뷰 소유자 표시용 (apps/server/src/modules/matches/matches.service.ts matchInclude)
- GET /matches 응답 include에 buyerRequirement.preferredRegions(+province/district/ward) 누락 — 지역 요약 표시용
- PATCH /matches/:id/stage가 dealCreated 전환 시 Deal 자동 생성 안 함 — Deal 자동 생성 로직 또는 POST /matches/:id/convert-to-deal 같은 전용 전환 엔드포인트 필요
- Match→Deal 연결 상태(dealLinkage) 조회 불가 — Deal.matchId 관계는 스키마에 있으나 matches 응답에 deals 미포함
- POST /matches에 동일 listingId+buyerReqId 중복 방지 로직/unique 제약 없음
- updateStage에 stage enum/전이 검증 DTO 없음 (class-validator 미적용)
- GET /matches 서버측 필터·pagination 파라미터 없음 (PRD 후속 개선 항목, 데이터 증가 시 필요)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/matches/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/matches/-match-view-utils.ts

## 공유 의존성 (수정 금지 영역)
- @/lib/api (api 싱글턴)
- @/lib/utils (cn)
- @/components/ui/avatar
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/dropdown-menu
- @/components/ui/dialog
- @/components/ui/input
- @/components/ui/multi-select
- @/components/ui/popover
- @/components/ui/textarea
- @estate-erp/api-client (Match, CalendarEvent, CreateCalendarEventDto, UpdateCalendarEventDto 타입)
- @estate-erp/shared (formatPrice)
