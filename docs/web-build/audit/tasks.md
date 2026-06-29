# 감사: tasks — partial (6.5/10)

단일 라우트 파일(1,940줄)에 PRD의 4개 뷰(작업별/상태별/보드/전체)가 모두 구현되어 있고, 상태/마감일/카테고리/담당자/내 업무 필터, 인라인 수정(상태·우선순위·마감일·담당자), 상태별 뷰 drag-and-drop reorder + cross-status 이동, 전체 뷰 멀티선택 벌크 액션, 8개 컨텍스트 엔터티 칩(억/만원 가격 표기 포함)까지 갖춘 상당히 완성도 높은 프로토타입이다. 다만 에러 처리·빈 상태 UI가 전무하고, cancelled 업무가 어떤 필터로도 조회 불가한 버그가 있으며, 컨텍스트 칩에서 관련 화면으로 이동이 불가능하고, 삭제 확인 다이얼로그와 Task.source 표시/보호가 없어 프로덕션 수준에는 미달한다. PRD가 명시한 8개 API 엔드포인트와 api-client 메서드는 모두 존재한다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 4개 뷰 모드: 작업별(카테고리 접이식 테이블), 상태별(접이식 그룹 + dnd-kit reorder/cross-status 이동), 보드(pending/in_progress/completed 3컬럼 칸반), 전체(단일 테이블)
- 필터 바: 내 업무 토글, 상태, 마감일(지연/오늘/이번주/없음), 카테고리(13종), 담당자(전체/미배정/직원별), 필터 초기화 — sticky 상단 고정
- Task 생성/수정 모달(TaskFormModal): 제목(필수 검증), 설명, 카테고리, 우선순위, 담당자 지정(PRD 작성 시점에 없던 기능이 추가됨), 마감일
- 인라인 수정: 상태/우선순위 Popover 선택, 마감일 date picker(제거 포함), 담당자 picker(미배정 포함) — 모든 테이블 뷰에서 동작
- 전체 뷰 멀티선택 + 벌크 액션 바(진행중/완료/삭제/선택취소), 전체선택 체크박스
- reorder API 연동(같은 그룹 내 순서 변경) + cross-status drag 시 status 변경, DragOverlay 표시
- 컨텍스트 칩: contact/property/listing/buyerRequirement/match/deal/contract/consultation 8종 표시, 매칭/거래/계약 단계 한국어 라벨
- 한국 실무 표기: formatManwon으로 만원→억 변환(예: 15.8억), 월세 보증금/월세 병기, 단지명+호수 라벨, 도로명/지번 주소 툴팁
- overdue 빨간 강조 + 마감임박 주황 표시 + 완료 line-through, 마감일 상대 표기(오늘/내일/N일 지남)
- 뷰별 로딩 스켈레톤
- 수정 모달 내 연결 문맥 읽기 전용 패널(TaskContextPanel)
- 서버: GET/POST/PATCH/DELETE /tasks, POST /tasks/reorder, /tasks/bulk-status, /tasks/bulk-delete 모두 구현 + JWT 가드 + officeId 격리

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- cancelled 업무 조회 불가 버그: filteredTasks(index.tsx:501)에서 status==='cancelled'를 무조건 제외한 뒤 statusFilter를 검사하므로, 상태 필터에서 '취소'를 선택해도 항상 0건. 취소 업무를 볼 수 있는 화면(아카이브 뷰)이 전혀 없음 — statusFilter==='cancelled'일 때는 제외 로직을 건너뛰도록 수정 필요
- 에러 처리 전무: useQuery의 isError 미처리(쿼리 실패 시 빈 화면), 모든 mutation에 onError/toast 없음 — 저장·reorder·벌크 실패 시 사용자가 실패 사실과 이유를 알 수 없음(PRD 수용 기준 위반). sonner 등 토스트 + 실패 시 재조회 필요
- 빈 상태 UI 없음: 필터 결과 0건일 때 작업별 뷰는 아무것도 렌더하지 않고 전체 뷰는 빈 테이블만 표시 — PRD가 요구하는 '업무 추가' CTA 포함 empty state 컴포넌트 필요
- 삭제 확인 없음: 단건 삭제와 벌크 삭제가 즉시 실행됨(AlertDialog/undo 없음) — 특히 벌크 삭제는 확인 다이얼로그 필수
- 컨텍스트 점프 미구현: 연락처/매물/리스팅/거래/계약 칩이 표시 전용 Badge로, 클릭해도 해당 상세 화면(/contacts/:id, /properties/:id 등)으로 이동하지 않음 — PRD '관련 엔터티 화면으로 이동' 액션 부재
- Task.source(manual/system/ai) UI 미노출: PRD가 중요 구분값으로 명시했으나 어떤 뷰에도 source 배지가 없고, 시스템/AI 생성 task의 삭제 보호·구분 처리도 없음
- 생성/수정 모달에 context FK(contactId/propertyId/listingId/dealId 등) 연결·해제 UI 없음 — CreateTaskDto/UpdateTaskDto는 모두 지원하지만 이 페이지에서 직접 문맥 연결 불가(수정 모달은 읽기 전용 패널만)
- 텍스트 검색 없음: 제목/내용/연락처명 검색 입력이 없고, PRD 키보드 단축키(N 새 업무, / 검색 포커스)도 미구현
- 권한 게이팅 없음: 벌크 삭제가 agent 역할에게도 동일하게 노출됨(PRD: owner/manager 중심이 안전) — useAuth의 role 기반 비활성화 필요
- 보드 뷰에 drag-and-drop 없음(드롭다운 quick action만 가능)이고, 칸반 컬럼 하단 버튼 라벨이 '새 프로젝트'로 잘못 표기됨('새 업무'여야 함). 칸반 추가 버튼이 해당 컬럼의 status를 프리셋하지 않음
- DnD status 변경 실패 시 로컬 낙관 상태 롤백 없음: onStatusChange mutation은 onSuccess에서만 invalidate하므로 실패 시 화면과 서버 상태가 어긋남(reorder는 onSettled로 처리됨)
- 실시간 업데이트 미연동: 다른 직원의 상태 변경/벌크 처리가 팀 화면에 반영되지 않음(Socket.io invalidation 없음) — PRD desktop 요구사항
- 서버사이드 필터/페이지네이션 없음: GET /tasks가 office 전체를 항상 반환하고 클라이언트에서 그룹화 — PRD상 후속 과제지만 대량 데이터 대비 필요

## API 갭
- GET /tasks 서버사이드 필터/검색/페이지네이션 쿼리 파라미터 미지원 (status, category, assignedToId, dueDate 범위, search, cursor/limit) — 현재 office 전체 조회만 가능. PRD 명시 8개 엔드포인트(findAll/findOne/create/update/reorder/bulk-status/bulk-delete/remove)와 api-client 메서드는 모두 존재함

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/tasks/index.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 싱글톤)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts (cn)
- /Users/hyunsulee/estate-erp/apps/web/src/providers/auth-provider.tsx (useAuth)
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/* (avatar, badge, button, checkbox, dialog, dropdown-menu, input, label, select, popover, skeleton, switch, textarea)
- @estate-erp/api-client (Task, CreateTaskDto, Employee 타입 + api.tasks.*, api.employees.findAll)
- @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities, @dnd-kit/modifiers
