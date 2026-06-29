# 감사: employees — partial (6.5/10)

직원관리 페이지는 단일 라우트 파일(index.tsx, 약 950줄)에 디렉터리 목록 + 상세 패널 2단 구성으로 구현되어 있고, PRD의 MVP 범위(목록/검색/필터, 직원 추가, 기본정보 수정, 역할 변경, 활성/비활성, 비밀번호 초기화, 담당 Task·고객·거래 참여·상담·활동로그 요약, 사무소 배분 정책 요약)를 대부분 커버한다. 서버(employees 모듈)와 api-client도 PRD에 정의된 8개 엔드포인트를 모두 갖추고 있으며 마지막 owner 보호, manager 권한 제한도 서버에서 동작한다. 다만 뮤테이션 에러/성공 피드백(토스트)이 전혀 없고, PRD가 기본 흐름으로 정의한 loginId 자동 발급, officeSummary(사무소 코드/maxUsers) 연동, 관련 엔터티로의 컨텍스트 점프(Deal/Task 링크)가 빠져 있어 production 직전 단계의 partial 수준이다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 직원 목록(이름/loginId/역할 badge/활성 상태/진행 업무·거래 수) + 검색(이름/loginId/이메일/전화) + 역할·활성 상태 필터
- 상단 메트릭 바: 전체/활성/비활성/매니저/거래 담당 인원 수
- 직원 추가 다이얼로그 (이름/loginId/휴대폰/이메일/역할/초기 비밀번호, 필수값 검증, manager는 agent만 생성 가능하도록 roleOptions 제한)
- 직원 상세 패널: 헤더(역할·활성 badge, 연락처) + 진행 업무/거래/담당 고객/미정산 참여 메트릭 타일
- 기본 정보 수정(이름/휴대폰/이메일 PATCH), 역할 변경(PATCH /employees/:id/role), 활성/비활성 토글(PATCH /employees/:id/status)
- 비밀번호 초기화(POST /employees/:id/reset-password, 서버에 분당 5회 Throttle)
- 실적 카드: GET /employees/:id/performance 기반 누적 상담 수 + 참여 수수료 합계(formatPrice로 만원→억 표기)
- 담당 업무(Task)/담당 고객·요구조건(BuyerRequirement)/거래 참여·배분(DealParticipant role·side·settlementStatus·금액)/최근 상담/최근 활동(ActivityLog) 리스트 섹션 (각각 빈 상태 메시지 포함)
- 사무소 수수료 배분 정책 요약 (Office.commissionConfig의 defaultAgentRate/listingAgentRate/buyingAgentRate/dualAgentRate)
- 서버측 보호 규칙: 마지막 owner 비활성화 금지, manager는 agent만 관리, owner 권한은 owner만 부여, loginId 중복 ConflictException
- agent 로그인 시 편집 UI 비활성화(canManage), 날짜 ko-KR 포맷, 미선택 시 상세 빈 상태 문구

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 뮤테이션 에러/성공 피드백 전무: create/update/role/status/password 뮤테이션에 onError 핸들러와 toast(sonner는 이미 components/ui/sonner.tsx에 존재)가 없어 loginId 충돌(409), 권한 거부(403), 마지막 owner 보호(400) 등 서버 에러가 사용자에게 전혀 표시되지 않음. 비밀번호 재설정 성공 메시지('직원에게 카톡으로 전달하세요')도 무시됨
- loginId 자동 발급 흐름 없음: PRD는 '사무소 코드 + 일련번호' 자동 생성 preview가 기본인데, UI는 수동 입력 필수이고 서버 create()도 dto.loginId 미제공 시 BadRequest를 던질 뿐 자동 생성 로직이 없음
- 관련 엔터티 컨텍스트 점프 없음: 담당 업무/거래 참여/담당 고객 리스트가 정적 div라 Deal Detail·Task·BuyerRequirement로 이동 불가 (PRD 액션 '담당 거래 열기' 미구현, Link/useNavigate 미사용)
- officeSummary 미연동: api.offices.getMe()가 존재하는데도 사무소 코드/maxUsers/구독 정보를 로드하지 않아 '직원 추가' 시 maxUsers 잔여 슬롯 표시와 빈 상태의 사무소 코드 안내가 없음
- 비활성화/역할 변경 확인 다이얼로그 없음: owner 비활성화 경고 강화(PRD 10절)와 진행 중 업무 다수 경고 없이 버튼 한 번으로 즉시 실행됨
- agent 접근 차단 미구현: PRD는 agent의 페이지 진입 차단(또는 자기 정보만)을 요구하나, agent도 전체 직원 목록·수수료 배분 금액·실적까지 조회 가능 (서버 findAll/findOne/getPerformance도 전 역할 허용)
- 목록 필터 부족: '진행 중 Task 있음' / '진행 중 Deal 참여 있음' 필터 없음, 목록에 '최근 활동(latestActivityAt)' 표시 없음(서버는 내려줌), 활성 직원 우선 정렬 미적용(role/name 순)
- Employee Detail 상단 요약 바에 '최근 ActivityLog 시간' 미표시 (PRD 5절 요약 바 4번째 항목)
- 로딩 상태 미흡: isLoading이 빈 상태 분기에만 쓰이고 목록/상세 로딩 스켈레톤·에러(isError) 시 재시도 UI가 없음
- owner 역할 부여 불가: 서버는 owner→owner 부여를 허용하지만 UI roleOptions에 'owner'가 없어 owner 승계/양도가 화면에서 불가능하고, 대상이 owner면 역할 Select가 통째로 disabled됨
- 키보드 단축키 미구현: '/' 검색 포커스, Enter 상세 열기, Cmd/Ctrl+N 직원 추가 (PRD 13절)
- 비활성 직원 목록 회색 처리 없음(badge 색상만 다름), 배분 정책 요약에 managerRate/closerBonus 누락

## API 갭
- loginId 자동 발급 엔드포인트 없음: PRD의 '사무소 코드 기반 자동 발급'을 위한 GET /employees/next-login-id (또는 create 시 서버 자동 생성) 가 서버/api-client 모두에 없음 — 서버 create()는 loginId 미제공 시 그냥 400을 던짐 (apps/server/src/modules/employees/employees.service.ts:209-212)
- POST /employees에 Office.maxUsers 초과 검증 없음: PRD 9절 '저장 전 검증 - maxUsers 초과 여부 확인'이 employees.service.create()에 구현되어 있지 않음 (office는 id만 select)
- GET /employees에 검색/필터/페이지네이션 파라미터 없음: 현재 전건 조회 후 클라이언트 필터링이라 PRD 7절 필터('진행 중 Task 있음' 등)와 15절 100명 규모 성능 요구를 서버에서 지원하지 못함
- agent 역할의 직원 데이터 접근 제한 정책 미구현: findAll/findOne/getPerformance가 USER_ROLES 전체 허용이라 PRD 3절(agent 접근 차단 또는 자기 정보만)과 불일치 — 별도 엔드포인트 신설보다는 Roles 제한 또는 self-only 분기 필요

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/employees/index.tsx

## 공유 의존성 (수정 금지 영역)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/api.ts (api 싱글톤)
- /Users/hyunsulee/estate-erp/apps/web/src/providers/auth-provider.tsx (useAuth)
- /Users/hyunsulee/estate-erp/apps/web/src/lib/utils.ts (cn)
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/badge.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/button.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/dialog.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/input.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/label.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/select.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/components/ui/scroll-area.tsx
- @estate-erp/api-client (Employee/EmployeeDetail/CreateEmployeeDto 타입, employees 모듈)
- @estate-erp/shared (formatPrice)
