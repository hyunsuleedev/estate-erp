# 감사: calls — partial (5.5/10)

통화 기록 페이지는 목록(방향/부재중/STT 상태 배지, AI 요약 1줄, 기간·방향·상태·텍스트 필터, 요약 통계 5종)과 상세 시트(STT 화자별 말풍선 타임라인, Gemini AI 분석, 연결된 상담 표시)까지 조회 UX가 깔끔하게 구현되어 있다. 그러나 도메인 기대치의 핵심인 "상담 전환" 액션이 UI·서버 DTO·api-client 전 구간에 없고, 서버가 녹음 파일을 S3에 저장하지 않아 fileUrl이 항상 null이라 오디오 재생기가 동작하지 않으며, STT 처리 중 자동 갱신(폴링) 문구도 실제 구현이 없다. 필터가 최초 100건 클라이언트 필터에 불과하고 페이지네이션·에러 처리·컨텍스트 점프도 빠져 있어 조회 전용 부분 구현 수준이다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 통화 기록 목록: 수신/발신 아이콘, 부재중 배지(durationSec<5 휴리스틱), STT 상태 배지, AI 요약 1줄, 통화시간·상대시간 표시
- 필터 바: 기간 프리셋(오늘/이번 주/이번 달/전체, 월요일 시작), 방향, STT 상태, 이름·번호·요약·대화내용 통합 검색 (모두 클라이언트 사이드)
- 요약 통계 카드 5종: 전체/수신/발신/부재중/STT 완료
- 상세 Sheet: 연락처·번호·시각·통화시간·담당 중개사 헤더, AI 분석(요약/고객 니즈/다음 조치), STT 대화 화자별 말풍선 + 타임스탬프, 연결된 상담 기록 목록 표시
- STT 상태별 안내: processing(분석 중), failed(실패 안내), none(녹음 미포함), 빈 메시지 처리
- 목록 로딩 스켈레톤 + 빈 상태 메시지
- 서버 파이프라인: 녹음 업로드(POST /consultations/with-recording) → VITO STT 비동기 처리 → CallRecordingMessage 저장 → Gemini LLM 분석(summary/customerNeed/nextActions)
- 녹음 없는 통화 로그 생성(POST /consultations/recordings) 시 전화번호로 연락처 자동 매칭
- 멀티테넌시(officeId) 격리 및 사이드바 네비게이션(/calls) 등록

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 상담 전환 기능 전무 — 상세 시트에 '상담으로 전환' 버튼 없음. Consultation.callRecordingId FK는 스키마에 있으나 서버 create DTO, api-client CreateConsultationDto, UI 모두 미지원. 통화 내용/AI 요약을 프리필한 상담 생성 다이얼로그 필요
- 녹음 재생 불가 — consultations.service.ts가 녹음 파일을 VITO STT로만 전송하고 S3 저장을 하지 않아 fileUrl이 항상 null. 상세 시트의 <audio> 플레이어가 절대 렌더링되지 않는 dead code
- STT 처리 중 자동 갱신 미구현 — '완료되면 자동으로 업데이트됩니다' 문구와 달리 refetchInterval/폴링/WebSocket 없음. api.callRecordings.getSttStatus 메서드가 존재하나 미사용
- 서버 사이드 필터·페이지네이션 부재 — list({limit:100}) 1회 호출 후 기간/방향/상태/검색을 클라이언트에서만 필터링. 100건 초과 시 통계와 필터 결과 왜곡, 페이지네이션 UI 없음
- 목록 쿼리 에러 상태 미처리 — isError 분기가 없어 API 실패 시 '조건에 맞는 통화 기록이 없습니다'로 오인 표시
- 미등록 번호(contact null) 후속 액션 없음 — '연락처로 등록' 또는 '기존 연락처 연결' 버튼 없음, 서버에도 recording에 contactId를 연결하는 PATCH 없음
- 컨텍스트 점프 없음 — 연락처명 클릭 시 /contacts 상세 이동 없음, 연결된 상담 항목도 /consultations로 링크 없음
- CRUD 불완전 — 통화 기록 삭제/수정 UI·엔드포인트 없음, STT 실패 시 '다시 시도해주세요' 문구만 있고 재시도 액션·엔드포인트 없음, 화자 라벨(나/고객) 수정 불가
- 부재중 판정 부정확 — createRecordingLog가 받는 result 파라미터를 DB에 저장하지 않아 클라이언트가 durationSec<5 휴리스틱에 의존
- STT 메시지 타임스탬프(startMs) 클릭 시 해당 구간 오디오 재생 미구현 (스키마 주석에 '구간 재생용'으로 명시된 기능)
- 전화번호 한국식 하이픈 포맷팅 없음 (01012345678 그대로 노출)
- index.tsx에 미사용 import 다수 (UserIcon, Loader2, Button, SheetDescription/SheetHeader/SheetTitle)

## API 갭
- GET /consultations/recordings/list — direction, sttStatus, dateFrom/dateTo, q(검색) 서버 사이드 필터 파라미터 미지원 (현재 contactId/page/limit만)
- 녹음 파일 S3 업로드 + fileUrl(또는 presigned URL 발급 엔드포인트) 부재 — CallRecording.fileUrl이 서버 코드 어디에서도 set되지 않음
- POST /consultations (create) — callRecordingId 파라미터 미지원 (서버 DTO + api-client CreateConsultationDto 양쪽), 통화→상담 전환에 필수
- PATCH /consultations/recordings/:id — contactId 연결, 화자 라벨 수정 등 갱신 엔드포인트 없음
- DELETE /consultations/recordings/:id — 삭제 엔드포인트 없음
- POST /consultations/recordings/:id/retry-stt — STT 실패 재시도 엔드포인트 없음
- createRecordingLog(POST /consultations/recordings)의 result(부재중 여부) 필드가 DB에 저장되지 않음 — 스키마 필드 추가 필요

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/calls/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/calls/-detail-sheet.tsx

## 공유 의존성 (수정 금지 영역)
- @estate-erp/api-client (callRecordings 모듈: CallRecordingListItem, SttStatus, CallDirection, CallRecordingMessage 타입)
- @/lib/api (api.callRecordings)
- @/lib/utils (cn)
- @/components/ui/badge
- @/components/ui/button
- @/components/ui/input
- @/components/ui/select
- @/components/ui/sheet
- @/components/ui/skeleton
- @/components/layout/app-sidebar.tsx (/calls 네비 항목, 페이지가 직접 import하진 않음)
