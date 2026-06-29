# 감사: consultations — partial (5/10)

날짜별 타임라인(대화 원장) 목록 + 우측 상세 Sheet 구조로 읽기 경험은 완성도가 높다. 검색·퀵필터·고객/매물(단지→동→호) 계층 필터·정렬·페이지네이션·컨텍스트 점프(고객/매물 상세)가 동작하고, placeholder 동 숨김·억/만원 가격 표기 등 컨벤션도 준수한다. 그러나 완전히 읽기 전용 페이지로 상담 등록/수정/삭제 UI가 전혀 없고, 도메인 핵심 기대치인 purpose(목적)별 필터와 통화녹음(callRecordingId) 연결이 미구현이다. 업무 신호/결과 분류가 content 정규식 휴리스틱에 의존하는 점도 신뢰성 리스크다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 날짜별 그룹 타임라인 목록 (대화 원장) + 표시 건수 배지
- 상담 내용 검색(q) + 퀵필터(전체/후속 필요/매물 연결/구매요건)
- 엔티티 필터: 고객 Command 검색 선택, 매물 계층 필터(단지 검색 → 동 칩 → 호 그리드, isPlaceholder 동 숨김, 단독/토지 안내문), 상담유형(전화/방문/온라인)
- 활성 필터 칩 표시 + 개별 해제 + 전체 초기화
- 정렬(최신순/오래된순) + 페이지네이션(이전/다음, 전체 건수)
- 상세 Sheet: 업무 신호/결과 타일, 연결 맥락 카드(고객/매물/리스팅/매칭/구매요건), 후속 액션 후보, 상담 전문, 메타(일시/담당자/연락처/단지)
- 컨텍스트 점프: /contacts/$id, /properties/$id, /matches, /buyer-requirements 링크
- 로딩 스켈레톤 + 빈 상태 메시지
- 가격 억/만원 표기(formatPrice: 15.8억 → 15억 8,000만), 동/호 접미사 정규화

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 상담 등록/수정/삭제 UI 전무 — api.consultations.create/update/remove 메서드가 api-client에 이미 존재하나 페이지에 '새 상담' 버튼·폼·수정·삭제 액션이 없음 (완전 읽기 전용)
- purpose(목적)별 필터·표시 없음 — Consultation.purpose(general/listing_confirm/buyer_consult/deal_followup, DB 인덱스 [officeId, purpose] 존재)가 목록 행·상세 시트·필터 어디에도 노출되지 않음
- 통화녹음 연결 UI 없음 — 스키마에 callRecordingId 존재하고 /calls 페이지와 api.callRecordings(list/findOne/getSttStatus)가 있으나, 상세 시트에 녹음 메타·STT 요약·/calls 점프 링크가 없음
- listingIntake(의뢰) 컨텍스트 카드 누락 — api-client Consultation 타입에 listingIntakeId/listingIntake 있고 서버가 context=listingIntake 필터를 지원하나, getConsultationContextCards/Labels와 퀵필터에서 미처리
- 매칭/구매요건/리스팅 카드 딥링크 없음 — /matches, /buyer-requirements 목록 루트로만 이동(해당 레코드 하이라이트/검색 파라미터 없음), 리스팅 카드는 매물 상세로 우회
- 업무 신호·결과·후속 액션이 content 정규식 휴리스틱(signalMatchers) — purpose 필드 미활용, '업무에서 관리' 버튼이 consultationId가 연결된 Task 생성이 아닌 단순 /tasks 링크
- 에러 상태 미처리 — useQuery isError를 무시해 API 실패 시 '상담 기록이 없습니다' 빈 상태로 오인 표시
- 날짜 범위(dateFrom/dateTo)·기록자(createdById)·unlinked 컨텍스트 필터 UI 없음 — 서버와 api-client ConsultationsFilter는 모두 지원
- 상세 시트 딥링크 불가 — 선택 ID가 URL search param이 아닌 로컬 state, 현재 페이지 items에서만 탐색(findOne 미사용)하여 페이지 전환 시 선택 해제

## API 갭
- GET /consultations에 purpose 쿼리 파라미터 미지원 — consultations.controller.ts findAll에 @Query('purpose') 없음, api-client ConsultationsFilter에도 purpose 필드 없음 (DB 인덱스 [officeId, purpose]는 이미 존재)
- consultations 목록/상세 응답에 callRecordingId/callRecording 관계 미포함 — consultations.service.ts defaultInclude에 callRecording 누락, api-client Consultation 인터페이스에도 해당 필드 없음 (통화녹음 연결 UI 구현에 필수)
- PATCH /consultations/:id가 type/content만 수정 가능 — purpose 및 컨텍스트 FK(propertyId/listingIntakeId/listingId/matchId/buyerReqId) 변경 불가 (controller dto와 api-client UpdateConsultationDto 동일하게 제한적, 수정 UI 구현 시 확장 필요)

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/consultations/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/consultations/-consultation-view-utils.ts

## 공유 의존성 (수정 금지 영역)
- @/lib/api (api 싱글톤)
- @/lib/utils (cn)
- @/components/ui/avatar
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/command
- @/components/ui/input
- @/components/ui/popover
- @/components/ui/scroll-area
- @/components/ui/select
- @/components/ui/sheet
- @estate-erp/api-client 타입 (Consultation, Contact, Site, Dong, Unit)
