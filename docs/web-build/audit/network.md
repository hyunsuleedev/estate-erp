# 감사: network — missing (0.5/10)

PRD가 P0 킬러피쳐로 정의한 공동중개 네트워크 페이지가 순수 placeholder 상태입니다. 라우트는 FeaturePlaceholderPage(제목+체크리스트 카드)만 렌더링하며 데이터 조회, 컴포넌트, 훅이 전무합니다. Prisma 스키마에는 NetworkRoom 등 5개 모델이 정의되어 있으나 서버 NestJS 모듈과 api-client 모듈이 모두 존재하지 않아 백엔드부터 전면 신규 구현이 필요합니다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- /network 라우트 등록 및 사이드바 네비게이션 진입점
- placeholder 안내 화면 (제목/설명/예정 기능 체크리스트)
- DB 레이어: prisma/schema/network.prisma에 NetworkRoom, NetworkRoomMember, NetworkSharedProperty, NetworkInquiry, NetworkMessage 모델 정의 완료 (init migration 포함)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 서버 network 모듈 전체 부재 — apps/server/src/modules/network 디렉토리 자체가 없음. NetworkRoom/Member/SharedProperty/Inquiry/Message CRUD 컨트롤러·서비스·DTO를 PRD의 12개 엔드포인트 기준으로 신규 구현 필요 (멀티테넌시: 룸은 office 간 공유이므로 기존 officeId 격리 미들웨어 예외 처리 필요)
- api-client network 모듈 부재 — packages/api-client/src/modules/network.ts 신규 작성 및 index 등록 필요
- 룸 작업공간 UI 전체 미구현 — 좌측 룸 목록(검색/참여상태 필터/미응답 문의 수), 중앙 공유매물 피드, 우측 채팅·최근활동 3패널 레이아웃 없음
- 보드형 진입 탭(전체 게시판/내 모임/지역 모임/공동중개) 및 공동중개 보드 검색 미구현 — 거래유형/가격/법정동 주소(시도·시군구·읍면동)/면적/방·욕실 수 필터와 보드 리스트 뷰 없음
- Listing 공유 다이얼로그 + 필드 단위 마스킹 설정 UI 없음 — showSiteName/showDong/showUnit/showPrice/showArea/showFloor/showMemo/showPhotos 토글, 같은 룸 중복 공유 검증, 공유 회수(isActive=false) 액션 필요
- 문의(NetworkInquiry) 생성/수락/거절 흐름 없음 — 받은 문의/보낸 문의 분리 탭, pending/accepted/rejected/expired 상태 배지, 자기 사무소 매물 문의 차단 검증 필요
- 룸 채팅(NetworkMessage) 미구현 — 메시지 목록/전송, 공유 매물 카드 첨부, Socket.io 실시간 반영 또는 polling 필요
- 멤버 승인 관리 탭 없음 — pending/approved/rejected/left 상태 관리, owner/manager 승인/거절 액션, 방 만들기/공개방 참여 요청 흐름 필요
- 컨텍스트 점프 부재 — Listing Detail의 '네트워크 공유' 진입, Notification(network_inquiry) 연결, 문의 수락 후 Deal/공동중개(partnerBroker) 전환 흐름 없음
- 빈 상태/로딩/에러 처리 전무 — 참여 룸 없음 시 '공개방 찾기/방 만들기' 노출, 검색 결과 없음 empty state, 메시지/문의 전송 실패 재시도 등 데이터 화면 자체가 없어 모두 미구현
- 한국 실무 표기 미적용 — 공유 매물 카드의 만원→억 가격 표기, 마스킹된 필드와 비공개 필드의 시각적 구분 등 표시 규칙 구현 대상 없음

## API 갭
- 서버 network 모듈 전체 (apps/server/src/modules/network 부재) — PRD 명시 엔드포인트 전부 없음: GET/POST /network/rooms, GET /network/rooms/:id, POST /network/rooms/:id/join, PATCH /network/rooms/:id/members/:officeId, GET /network/rooms/:id/shared-properties, POST /network/shared-properties, PATCH /network/shared-properties/:id, POST /network/shared-properties/:id/inquiries, PATCH /network/inquiries/:id, GET /network/rooms/:id/messages, POST /network/rooms/:id/messages
- packages/api-client/src/modules/network.ts 부재 — 위 엔드포인트 대응 클라이언트 메서드 전부 없음
- 공동중개 보드 교차 룸 검색 엔드포인트 (지역/가격/면적/방수 필터 query) — PRD 6장 boardSharedPropertyList 대응 API 미정의
- '구합니다'(wanted post) 목록/생성 API — PRD MVP 포함 항목이나 데이터 모델·엔드포인트 모두 미정의
- Socket.io 실시간 채널 — 룸 채팅 메시지, 신규 문의, 문의 응답, 멤버 승인 실시간 이벤트 미구현
- Notification 연동 — network_inquiry/network_join_request 알림 타입 발송 로직 없음

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/network/index.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/components/layout/feature-placeholder-page.tsx (FeaturePlaceholderPage)
- @/components/ui/badge, @/components/ui/card (placeholder 경유)
- lucide-react (Globe 아이콘)
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated.tsx (사이드바 네비게이션 항목)
