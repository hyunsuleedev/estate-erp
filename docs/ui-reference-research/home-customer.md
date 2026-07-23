# Estate ERP 홈·고객 업무 UI 레퍼런스 보고서

- 조사일: 2026-07-17
- 범위: 로그인/사무소 온보딩, 대시보드, AI 인박스, 할 일, 캘린더, 연락처 목록·상세·등록, 매수요청 목록·상세·등록/수정, 상담, 통화기록
- 대상: Web 라우트를 기준으로 분석했으며 Desktop의 동형 라우트에도 같은 원칙을 적용할 수 있다.
- 해석: 요청의 “sass 오픈소스”는 문맥상 “SaaS형 오픈소스 제품”으로 해석했다. SCSS 컴포넌트 모음이 아니라 실제 업무 SaaS의 정보 구조와 상호작용을 조사했다.

## 1. 결론부터

한 제품을 그대로 모방하는 것보다 아래 조합이 Estate ERP에 가장 잘 맞는다.

| 영역 | 1차 기준 | 보조 기준 | Estate ERP에 가져올 핵심 |
|---|---|---|---|
| 전역 셸·레코드 | Twenty, Attio | HubSpot | 낮은 시각 소음, 저장된 뷰, 좌측 핵심 속성 + 중앙 활동 + 우측 연관 정보 |
| 연락처·매수요청 | Frappe CRM, Attio | Twenty, HubSpot | 촘촘한 표, 빠른 등록, 레코드 중심 타임라인, 관계 객체 |
| AI 승인 큐 | Plane Intake | Linear Triage, Chatwoot | 목록-상세-근거 3분할, 승인/거절/보류, 제안 근거와 변경 diff |
| 할 일 | Vikunja | Asana My Tasks, Plane | 동일 데이터를 목록/표/보드로 전환, 오늘·지연·예정 구획 |
| 캘린더 | Twenty | Google Calendar, Asana, Cal.diy | 월/주/일/아젠다, 빈 시간 빠른 등록, 일관된 색 의미 |
| 상담·통화 | Frappe CRM, Meetily | Attio Activity, Gong | 고객 타임라인, 오디오-전사 동기화, 구조화 요약, 후속 업무 생성 |
| 온보딩 | Twenty | Plane, Linear | 한 단계 한 결정, 진행률, 필수값 최소화, 생성 후 설정으로 자연스럽게 연결 |

권장 방향은 “CRM 카드 대시보드”보다 “업무 밀도 높은 데스크톱 레코드 시스템”이다. 장식적 카드 수를 줄이고, 사용자가 매일 반복하는 검색 → 선택 → 확인 → 다음 행동의 거리를 줄이는 것이 핵심이다.

## 2. 현재 구현 기능 인벤토리

| 페이지 | 실제 라우트 | 현재 핵심 기능 | 재설계의 중심 질문 |
|---|---|---|---|
| 로그인 | [login.tsx](../../apps/web/src/routes/_auth/login.tsx) | Clerk 로그인/가입, 분할형 히어로 | 로그인 작업보다 마케팅 비주얼이 강하지 않은가 |
| 사무소 온보딩 | [onboarding.office.tsx](../../apps/web/src/routes/onboarding.office.tsx) | 2열 설정, 단계 표시, 사무소명 필수 | 생성과 고급 설정을 분리했는가 |
| 대시보드 | [dashboard.tsx](../../apps/web/src/routes/_authenticated/dashboard.tsx) | 긴급 카드, 할 일, 일정, 임대만료, 잔금, 파이프라인 | 오늘 해야 할 행동이 첫 화면에서 명확한가 |
| AI 인박스 | [inbox/index.tsx](../../apps/web/src/routes/_authenticated/inbox/index.tsx) | 상태 탭, 검색/필터, 승인·거절·보류·실행취소, AI 초안/규칙 제안 | 한 항목의 근거와 영향 범위를 목록을 떠나지 않고 판단할 수 있는가 |
| 할 일 | [tasks/index.tsx](../../apps/web/src/routes/_authenticated/tasks/index.tsx) | 목록/상태/분류/보드, 인라인 수정, 드래그, 일괄 작업 | 뷰를 바꿔도 필터와 맥락이 유지되는가 |
| 캘린더 | [calendar/index.tsx](../../apps/web/src/routes/_authenticated/calendar/index.tsx) | 월/주/일/아젠다, 검색/담당자/유형 필터, 재무 오버레이, 드래그 | 업무 일정과 재무 일정이 충돌 없이 구분되는가 |
| 연락처 목록 | [contacts/index.tsx](../../apps/web/src/routes/_authenticated/contacts/index.tsx) | 그룹 칩, 검색/필터/정렬, 표, 빠른 시트, 무한 로딩 | 많은 고객을 빠르게 훑고 다음 행동으로 전환할 수 있는가 |
| 연락처 상세 | [contacts/$id.tsx](../../apps/web/src/routes/_authenticated/contacts/$id.tsx) | 연락처 정보, 관계/매물/매수요청/활동, 상담 패널 | 사실·관계·활동·다음 행동의 우선순위가 보이는가 |
| 연락처 등록 | [contacts/new.tsx](../../apps/web/src/routes/_authenticated/contacts/new.tsx) | 다중 전화, 태그/메모, 실시간 중복 검사 | 최소 입력과 중복 확인이 동시에 빠른가 |
| 매수요청 목록 | [buyer-requirements/index.tsx](../../apps/web/src/routes/_authenticated/buyer-requirements/index.tsx) | 프리셋, 검색/필터/정렬, 예산·지역·매칭·후속일 표 | “연락이 필요한 수요”와 “매칭 가능한 수요”가 즉시 구분되는가 |
| 매수요청 상세 | [buyer-requirements/$id.tsx](../../apps/web/src/routes/_authenticated/buyer-requirements/$id.tsx) | 상태, 조건, 지역/단지, 필수/선호, 매칭, 상담 | 요구 조건과 고객 활동을 한 화면에서 의사결정할 수 있는가 |
| 매수요청 폼 | [-buyer-form.tsx](../../apps/web/src/routes/_authenticated/buyer-requirements/-buyer-form.tsx) | 거래유형, 금액/면적, 지역/단지, 필수/선호, 입주, 담당/후속 | 긴 조건 입력을 오류 없이 끝낼 수 있는가 |
| 상담 | [consultations/index.tsx](../../apps/web/src/routes/_authenticated/consultations/index.tsx) | 날짜/고객 그룹 원장, 필터/정렬, 상세 시트, 후속 신호 | 상담 기록이 다음 업무와 매칭에 실제로 연결되는가 |
| 통화기록 | [calls/index.tsx](../../apps/web/src/routes/_authenticated/calls/index.tsx) | 3분할, 오디오, AI 요약, 전사, 상담 전환, 최근 상담 | 재생·전사·요약·고객 맥락이 같은 시간축을 공유하는가 |

## 3. 조사 방법과 판단 기준

오픈소스는 공식 GitHub 저장소, LICENSE, 공식 문서/제품 페이지, 공식 릴리스를 교차 확인했다. 상용 제품은 공식 Help/Product 문서만 사용했다. 아래의 “채택”은 출처가 말하는 사실이 아니라 Estate ERP 기능을 대입한 설계 판단이다.

평가 기준은 다음과 같다.

1. 부동산 중개 실무처럼 레코드와 활동량이 많은 환경에서의 정보 밀도
2. 목록 → 상세 → 후속 행동 전환 비용
3. 상태·담당·기한·관계 객체의 표현력
4. 키보드와 반복 작업 효율
5. AI 결과를 검토하고 되돌릴 수 있는 신뢰 구조
6. React/Tailwind/shadcn으로 재구현 가능한 구조
7. 라이선스와 상용 UI 자산의 사용 경계

## 4. 오픈소스 후보의 라이선스·활성도

활성도는 2026-07-17에 공식 GitHub 릴리스/저장소에서 확인했다. 버전은 “최신 UI를 반드시 Community Edition에서 그대로 쓸 수 있다”는 뜻이 아니라, 프로젝트가 현재 유지되고 있는지를 보는 지표다.

| 제품 | 역할 | 라이선스 확인 | 최근 릴리스 확인 | 주의점 |
|---|---|---|---|---|
| [Twenty](https://github.com/twentyhq/twenty) | CRM 셸, 표, 레코드, 캘린더, 온보딩 | [LICENSE](https://github.com/twentyhq/twenty/blob/main/LICENSE): 주로 AGPL-3.0 | [twenty/v2.21.0, 2026-07-16](https://github.com/twentyhq/twenty/releases/tag/twenty/v2.21.0) | 별도 상용 표기가 있는 파일은 AGPL 범위에서 제외되는 open-core 구조다. |
| [Frappe CRM](https://github.com/frappe/crm) | 고객/리드/딜/콜 | [AGPL-3.0](https://github.com/frappe/crm/blob/develop/LICENSE) | [v1.78.2, 2026-07-16](https://github.com/frappe/crm/releases/tag/v1.78.2) | Frappe 프레임워크 전제와 ERP식 패턴을 그대로 가져오기보다 IA를 참고한다. |
| [Plane](https://github.com/makeplane/plane) | 인테이크, 업무 뷰, 대시보드 | [Community Edition AGPL-3.0](https://github.com/makeplane/plane/blob/preview/LICENSE.txt) | [v1.3.1, 2026-05-14](https://github.com/makeplane/plane/releases/tag/v1.3.1) | [공식 CE/Commercial 범위](https://plane.so/open-source)를 구분해야 한다. |
| [Vikunja](https://github.com/go-vikunja/vikunja) | 할 일 목록/표/칸반 | [AGPL-3.0-or-later](https://github.com/go-vikunja/vikunja/blob/main/LICENSE) | [v2.3.0, 2026-04-09](https://github.com/go-vikunja/vikunja/releases/tag/v2.3.0) | task-first 제품이라 CRM 관계 모델은 별도 설계가 필요하다. |
| [Chatwoot](https://github.com/chatwoot/chatwoot) | 3분할 인박스, 고객 컨텍스트 | [LICENSE](https://github.com/chatwoot/chatwoot/blob/develop/LICENSE): enterprise 밖은 MIT | [v4.15.1, 2026-06-17](https://github.com/chatwoot/chatwoot/releases/tag/v4.15.1) | enterprise 디렉터리와 커뮤니티 범위를 분리해야 한다. |
| [Cal.diy](https://github.com/calcom/cal.diy) | 예약/이벤트 생성 | [MIT](https://github.com/calcom/cal.diy/blob/main/LICENSE) | [v6.2.0, 2026-03-01](https://github.com/calcom/cal.diy/releases/tag/v6.2.0) | [2026-04-15 MIT 재출범 안내](https://cal.com/blog/calcom-v6-4) 이후 저장소 기준으로 참고한다. 내부 캘린더 셸보다 예약 작성 흐름이 유용하다. |
| [Meetily](https://github.com/Zackriya-Solutions/meetily) | 전사·요약 화면 | [MIT](https://github.com/Zackriya-Solutions/meetily/blob/main/LICENSE.md) | [v0.4.0, 2026-06-05](https://github.com/Zackriya-Solutions/meetily/releases/tag/v0.4.0) | Community README의 전사·요약만 기준으로 삼았다. 화자 분리 기능을 Community 기능으로 간주하지 않는다. |

## 5. 페이지별 상세 레퍼런스

### 5.1 로그인·사무소 온보딩

현재 화면은 Clerk 인증과 분할 히어로, 사무소 생성 2열 폼을 제공한다. 인증은 짧지만 사무소 설정은 서비스의 멀티테넌시·권한·초기 데이터 구조를 결정하므로 두 흐름의 시각 우선순위를 분리하는 편이 좋다.

오픈소스 1차 참고:

- [Twenty Create workspace](https://docs.twenty.com/user-guide/getting-started/how-tos/create-workspace): 워크스페이스를 하나의 명확한 단위로 만들고 이후 설정으로 이어지는 흐름.
- [Twenty Configure workspace](https://docs.twenty.com/user-guide/getting-started/how-tos/configure-your-workspace): 생성과 세부 설정을 구분.
- [Plane 소개/온보딩 사례](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane): 워크스페이스 → 데이터 가져오기 → 업무 시작의 순차 구조.

상용 1차 참고:

- [Linear Start Guide](https://linear.app/docs/start-guide)와 [Workspaces](https://linear.app/docs/workspaces): 조직 단위 생성 후 이름·URL·멤버·통합을 관리하는 구조.
- 실제 워크스페이스 생성 단계는 로그인 이후라 공개 문서 범위 밖이다. 아래 이미지는 공개된 설정 화면이며, 생성 마법사의 최신 UI 자체는 로그인 장벽 때문에 검증하지 못했다.

채택 제안:

- 로그인은 좌측 마케팅 영역을 축소하고 중앙 인증 패널을 1순위로 둔다. Clerk 컴포넌트의 오류·SSO·이메일 인증 상태를 브랜드 장식보다 먼저 보이게 한다.
- 온보딩 1단계는 사무소명, 지역/시간대, 대표자만 요구한다. 코드, 로고, 수수료 규칙, 직원 초대는 “지금 설정”과 “나중에”로 분리한다.
- 단계 상단에 “사무소 생성 → 기본 설정 → 완료”를 표시하되, 한 화면에 여러 단계의 폼을 동시에 노출하지 않는다.
- 마지막 화면에서 대시보드로만 보내지 말고 연락처 가져오기, 직원 초대, 첫 매물 등록의 3개 시작 행동을 제공한다.

피할 점:

- 선택 필드를 필수처럼 보이게 만드는 긴 최초 폼.
- 로그인 오류와 사무소 생성 오류가 같은 토스트로만 표시되는 구조.
- 사무소 코드를 사용자가 직접 결정하게 해 내부 규칙을 노출하는 방식.

![Twenty 온보딩](../ui-reference-assets/home-customer/twenty-onboarding.png)

![Plane 워크스페이스 온보딩](../ui-reference-assets/home-customer/plane-workspace-onboarding.webp)

![Linear 워크스페이스 설정](../ui-reference-assets/home-customer-commercial/linear-workspace.png)

### 5.2 대시보드

현재 대시보드는 미확인 매물, 잔금, 임대만료, AI 검토 같은 긴급 카드를 앞에 두고 할 일·일정·파이프라인을 이어 붙인다. 방향은 맞지만 위젯 수가 늘면 “모든 것을 조금씩 보여주는 화면”이 되기 쉽다.

오픈소스 참고:

- [Twenty Dashboards overview](https://docs.twenty.com/user-guide/dashboards/overview)와 [capabilities](https://docs.twenty.com/user-guide/dashboards/capabilities/dashboards): 동일 데이터에서 필터 가능한 보고 위젯.
- [Plane Community Edition](https://plane.so/open-source): 업무와 인사이트를 같은 제품 셸 안에서 연결.

상용 참고:

- [HubSpot dashboard 관리](https://knowledge.hubspot.com/dashboards/manage-your-dashboards): 목적별 대시보드, 빠른/고급 필터, 공유·소유권의 분리.

채택 제안:

- 첫 행은 KPI가 아니라 “오늘 조치할 큐”로 고정한다: 검토 필요, 오늘 후속, 오늘 계약/잔금, 임대만료 임박.
- 두 번째 행에 오늘 일정과 내 할 일을 두고, 파이프라인/통계는 그 아래 배치한다.
- 위젯마다 전체 페이지로 이어지는 명확한 링크와 동일한 필터를 전달한다.
- 사장님용은 전체 사무소, 직원용은 내 담당 기본값을 사용하되 상단 스코프를 한 번에 바꿀 수 있게 한다.
- 차트는 수치 설명보다 행동을 만들 때만 사용한다. 예: “검증 지연 8건”을 클릭하면 해당 저장 뷰가 열린다.

피할 점:

- 의미가 겹치는 KPI 카드 여러 개.
- 원형 차트처럼 작은 차이를 읽기 어려운 시각화를 기본값으로 두는 것.
- 대시보드 필터와 목록 필터가 서로 다른 용어/상태를 쓰는 것.

![Twenty 대시보드](../ui-reference-assets/home-customer/twenty-dashboard.png)

![HubSpot 대시보드 필터와 소유권](../ui-reference-assets/home-customer-commercial/hubspot-dashboard.png)

### 5.3 AI 인박스

현재 구현은 탭·검색·우선순위·카테고리·상태 필터와 승인/거절/보류/실행취소를 이미 갖췄다. 가장 큰 개선 여지는 상세 다이얼로그를 반복해서 여는 대신 한 큐에서 근거와 변경 결과를 계속 비교할 수 있게 만드는 것이다.

오픈소스 참고:

- [Plane Intake 사례](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane): 외부/비정형 입력을 초안 큐에 모으고 승인·거절한 뒤 본 업무 흐름에 넣는다.
- [Chatwoot Shared Inbox](https://www.chatwoot.com/features/shared-inbox): 대화 목록, 본문, 고객 컨텍스트의 3분할과 open/pending/snoozed/resolved 상태.

상용 참고:

- [Linear Triage](https://linear.app/docs/triage): accept, duplicate, decline, snooze와 담당 책임.
- [Linear Triage Intelligence](https://linear.app/docs/triage-intelligence): 팀·프로젝트·담당·라벨 제안, 수락/거절, 제안 이유 확인. Business/Enterprise 기능임을 문서가 명시한다.

채택 제안:

- 데스크톱에서는 30% 목록 / 45% 제안 상세 / 25% 영향·고객 컨텍스트의 3분할을 기본으로 한다.
- 목록 행에는 우선순위, 제안 유형, 대상 고객/매물, 생성 시각, 위험 표시만 둔다.
- 중앙에는 AI 원문, 사람이 확인해야 할 diff, 승인/거절/보류를 고정한다.
- 우측에는 이 변경이 영향을 주는 연락처·매물·계약과 최근 활동을 보여준다.
- AI 제안에는 “왜 이 제안인가”, 근거 링크, 신뢰/검토 필요 상태, 실행될 필드 변경을 함께 노출한다.
- 일괄 승인은 동일 규칙·동일 위험도일 때만 활성화하고, 실행 직후 undo 시간을 명시한다.

피할 점:

- “AI 추천” 배지만 있고 변경 전후가 없는 카드.
- 거절 이유를 매번 모달로 강제해 검토 속도를 떨어뜨리는 구조. 빠른 사유 + 상세 사유 선택이 낫다.
- 고위험 계약/금액 변경을 자동 적용하는 것.

![Plane Intake 큐](../ui-reference-assets/home-customer/plane-intake-inbox.webp)

![Chatwoot 3분할 인박스](../ui-reference-assets/home-customer/chatwoot-inbox.png)

![Linear Triage](../ui-reference-assets/home-customer-commercial/linear-triage.png)

![Linear Triage Intelligence](../ui-reference-assets/home-customer-commercial/linear-ai.png)

### 5.4 할 일

현재는 목록/상태/분류/보드와 인라인 수정, 드래그, 일괄 작업을 제공한다. 뷰 수보다 중요한 것은 동일한 필터와 선택 상태가 뷰 전환 후에도 유지되는 것이다.

오픈소스 참고:

- [Vikunja Views](https://vikunja.io/help/views/)와 [Tasks](https://vikunja.io/help/tasks/): list/table/kanban/gantt, 필터, 드래그, 상세 속성.
- [Plane Work items](https://plane.so/open-source): 여러 업무 뷰와 intake의 연결.

상용 참고:

- [Asana My Tasks](https://help.asana.com/s/article/my-tasks?language=en_US): 모든 프로젝트의 내 업무를 한곳에 모으고 섹션, 필터, 정렬, 목록/보드/캘린더를 제공.
- [My Tasks 활용 가이드](https://help.asana.com/s/article/maximize-productivity-with-my-tasks): Today/This week/Later 같은 개인 우선순위 구조와 규칙 자동화.
- 실제 제품 화면은 로그인 이후이며 Help 문서와 설명을 검증 기준으로 사용했다.

채택 제안:

- 기본 뷰는 “지연 / 오늘 / 이번 주 / 나중”의 시간 구획을 사용한다. 카테고리와 상태는 열/칩이지 별도 세계가 아니다.
- 상태, 담당자, 기한, 연결 고객/매물, 출처를 인라인으로 수정한다.
- 행을 열면 전체 모달 대신 우측 상세 패널을 사용해 목록 위치를 보존한다.
- 보드 이동은 상태 변경, 날짜 구획 이동은 기한 변경처럼 드래그 의미를 명확히 한다.
- 시스템/AI 생성 업무에는 출처와 생성 이유를 표시한다.

피할 점:

- 상태 탭과 보드 컬럼이 서로 다른 상태 체계를 갖는 것.
- 필터 바가 두 줄 이상 상시 점유하는 것. 자주 쓰는 필터 4~5개와 “추가 필터”로 나눈다.
- 완료 업무를 기본 화면에서 같은 강조도로 유지하는 것.

![Vikunja 업무 개요](../ui-reference-assets/home-customer/vikunja-task-overview.png)

![Vikunja 표 보기](../ui-reference-assets/home-customer/vikunja-table.png)

![Vikunja 칸반](../ui-reference-assets/home-customer/vikunja-kanban.png)

### 5.5 캘린더

현재 월/주/일/아젠다와 재무 오버레이까지 기능 범위가 넓다. 일정 유형이 많아질수록 색상보다 레이어와 필터의 의미가 중요하다.

오픈소스 참고:

- [Twenty Calendar](https://docs.twenty.com/user-guide/calendar-emails/capabilities/calendar): CRM 레코드 맥락과 캘린더 활동의 결합.
- [Plane 캘린더 사례](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane): 업무 기한을 캘린더 뷰로 바꾸는 방식.
- [Cal.diy Availability](https://cal.com/docs/availability): 예약 가능 시간과 이벤트 작성 흐름의 보조 참고.

상용 참고:

- [Google Calendar 이벤트 생성](https://support.google.com/calendar/answer/72143?hl=en-uk): 빈 시간을 클릭하거나 드래그해 빠르게 생성하고, 상세 옵션으로 확장.
- [Google Calendar cheat sheet](https://support.google.com/a/users/answer/9290350?hl=en): 참석자, 시간, 공간/자원, 설명을 한 이벤트 모델로 구성.
- [Asana Calendar view](https://help.asana.com/s/article/calendar-view?language=en_US): 월/주 전환, 필터, 색 기준, 드래그로 기한 변경.

채택 제안:

- 월/주/일/아젠다는 상단 한 위치에 두고, 검색·담당·유형·내 일정은 동일 필터 모델을 공유한다.
- 재무 오버레이는 일반 일정 색 중 하나가 아니라 독립 토글 레이어로 둔다. 계약금/중도금/잔금은 금액 아이콘과 텍스트를 함께 표시한다.
- 빈 시간 클릭은 제목+시간의 빠른 생성, “상세”에서 고객/매물/계약 연결로 확장한다.
- 이벤트를 클릭하면 작은 팝오버에서 핵심 정보를 보고, 편집은 패널/다이얼로그로 이어진다.
- 일정을 드래그한 뒤 계약 관련 날짜라면 영향 확인을 보여주고 단순 업무는 즉시 반영한다.

피할 점:

- 유형마다 임의 색을 계속 추가하는 것. 최대 5~6개 의미군으로 제한하고 라벨/아이콘을 병행한다.
- 달력 셀에 금액·고객·주소를 모두 써 읽을 수 없게 만드는 것.
- 월/주/아젠다마다 서로 다른 생성 버튼과 필터를 쓰는 것.

![Twenty 캘린더](../ui-reference-assets/home-customer/twenty-calendar.png)

![Plane 캘린더](../ui-reference-assets/home-customer/plane-calendar.webp)

![Google Calendar 빠른 이벤트 생성](../ui-reference-assets/home-customer-commercial/google-calendar-create.png)

### 5.6 연락처 목록

현재 그룹 칩, ViewBar, 표, 고정 이름 열, 빠른 시트와 무한 로딩이 있다. 기본 뼈대는 좋으며 저장된 뷰와 대량 작업의 일관성을 강화하면 된다.

오픈소스 참고:

- [Frappe CRM Contact](https://docs.frappe.io/crm/contact): 연락처 목록, 빠른 생성, 연결된 거래.
- [Twenty Views](https://docs.twenty.com/user-guide/views-pipelines/overview): 같은 객체를 저장된 필터/정렬/열 구성으로 다시 사용.

상용 참고:

- [HubSpot updated index page](https://knowledge.hubspot.com/records/view-and-filter-records-in-the-updated-index-page): 저장 뷰 탭, 빠른 필터, 고급 필터, 표/보드.
- [Attio create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): all records, 열 구성, 필터/정렬, 일괄 선택과 작업.

채택 제안:

- 상단 순서를 제목/전체 수·등록 → 저장 뷰 → 검색/빠른 필터 → 표로 고정한다.
- “전체, 내 담당, 최근 연락 없음, 매수요청 있음, 중복 의심”을 기본 저장 뷰로 제공한다.
- 이름 열에는 그룹 칩보다 마지막 활동/다음 후속 같은 행동 신호를 우선한다.
- 행 선택 시 하단 일괄 작업 바, 행 클릭 시 우측 빠른 미리보기를 사용한다.
- 무한 로딩을 유지한다면 URL에 정렬/필터/선택 레코드를 보존하고 상세에서 돌아왔을 때 스크롤 위치를 복원한다.

피할 점:

- 모든 그룹을 상단 칩으로 계속 늘리는 것. 자주 쓰는 그룹만 보이고 나머지는 뷰 메뉴로 이동한다.
- 전화번호·이메일·태그·메모를 한 행에 모두 보여 밀도를 오히려 떨어뜨리는 것.
- 대량 선택과 무한 스크롤의 전체 범위가 불분명한 것.

![Frappe CRM 연락처 목록](../ui-reference-assets/home-customer/frappe-contact-list.png)

![HubSpot 연락처 저장 뷰와 필터](../ui-reference-assets/home-customer-commercial/hubspot-contact-list.png)

![Attio 리스트](../ui-reference-assets/home-customer-commercial/attio-list.png)

### 5.7 연락처 상세

현재 상세는 정보 카드와 관계/매물/매수요청/활동, 우측 상담 패널을 제공한다. 섹션이 늘수록 카드 벽이 되기 쉬우므로 사실, 활동, 관계를 명확히 분리하는 것이 좋다.

오픈소스 참고:

- [Frappe CRM Contact](https://docs.frappe.io/crm/contact): 고객 기본 정보와 연결 거래.
- [Twenty Record pages](https://docs.twenty.com/user-guide/layout/capabilities/record-pages)와 [Side panel](https://docs.twenty.com/user-guide/layout/overview): 레코드 상세와 빠른 탐색.

상용 참고:

- [Attio record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): Overview, Activity, Emails, Files, Notes, Tasks, Calls 탭과 좌측 Record Details.
- [HubSpot record layout](https://knowledge.hubspot.com/records/work-with-records): 속성, 활동 타임라인, 연관 레코드.
- [HubSpot customize records](https://knowledge.hubspot.com/object-settings/customize-records): 좌측 정보, 중앙 Overview/Activities, 우측 회사·딜·리드 관계 카드.

채택 제안:

- 상단 헤더에 이름, 연락 상태, 담당자, 마지막/다음 연락과 전화·상담·업무 생성 버튼을 모은다.
- 좌측 280~320px는 연락처/분류/주소/담당 등 느리게 변하는 사실.
- 중앙은 Overview와 Activity 탭. Overview에는 현재 매수요청·보유/연결 매물·중요 메모, Activity에는 상담/전화/업무/변경을 시간순으로 표시한다.
- 우측은 다음 후속, 관계인, 연결 거래를 배치한다. 우측 상담 작성기는 필요할 때 확장되는 composer가 좋다.
- 삭제 제한 사유를 삭제 시점에만 알리지 말고 연관 객체 카드에서 미리 보여준다.

피할 점:

- 모든 관계 객체를 같은 크기의 카드로 쌓는 것.
- 활동 타임라인과 상담 목록을 별도 시간축으로 중복 표시하는 것.
- 전화/상담/업무 생성이 각각 다른 위치와 패턴을 쓰는 것.

![Frappe CRM 연락처 상세](../ui-reference-assets/home-customer/frappe-contact-detail.png)

![Attio 레코드 개요](../ui-reference-assets/home-customer-commercial/attio-record.png)

![HubSpot 3열 레코드](../ui-reference-assets/home-customer-commercial/hubspot-contact.png)

### 5.8 연락처 등록

현재 다중 전화, 태그, 메모와 실시간 중복 검사는 강점이다. 긴 전체 페이지 폼보다 최소 레코드를 빠르게 만들고 필요 시 확장하는 패턴이 적합하다.

오픈소스 참고:

- [Frappe CRM Contact](https://docs.frappe.io/crm/contact): 목록에서 곧바로 열리는 소형 생성 UI.
- Twenty의 레코드 생성 패턴: 현재 보던 목록 맥락을 유지한 채 새 레코드를 만든다.

상용 참고:

- [Attio create records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): cmd/ctrl+K 빠른 생성, 목록 첫 열의 +, 우측 상단 Add, 이메일/도메인 기반 중복 방지.
- [HubSpot create contacts](https://knowledge.hubspot.com/records/create-contacts): 우측 패널에서 최소 정보 입력, 이메일 기반 중복 제거 권장, 연관 레코드 지정.

채택 제안:

- 이름과 대표 전화만으로 임시 고객을 만들 수 있게 하고, 그룹·담당·태그는 바로 아래 “자주 쓰는 필드”로 둔다.
- 추가 전화, 이메일, 주소, 관계, 메모는 접힌 상세 섹션으로 둔다.
- 우측 중복 패널은 이름/전화 유사 후보를 실시간으로 보여주고 “기존 고객 열기”, “정보 병합”, “그래도 신규 생성”을 제공한다.
- 중복 확인 동의 체크박스보다 후보별 비교와 명시적 행동 버튼이 이해하기 쉽다.
- 저장 후 연락처 상세로 이동할지, 현재 목록에 머물며 연속 등록할지 선택한다.

피할 점:

- 중복 후보를 토스트로만 알리는 것.
- 전화번호 형식 오류를 저장 시점에만 검사하는 것.
- 모든 CRM 필드를 첫 화면에 노출하는 것.

![Frappe CRM 연락처 빠른 생성](../ui-reference-assets/home-customer/frappe-contact-create.png)

![Attio 목록 안에서 레코드 추가](../ui-reference-assets/home-customer-commercial/attio-create.png)

### 5.9 매수요청 목록

매수요청은 일반 리드 목록보다 예산, 지역/단지, 면적, 긴급도, 다음 연락, 매칭 수가 동시에 중요하다. 현재 필드 구성은 맞지만 한 행에서 판단해야 할 신호의 순서를 더 엄격히 잡아야 한다.

오픈소스 참고:

- [Frappe CRM Lead](https://docs.frappe.io/crm/lead): 리드 목록과 담당/상태 중심 업무 흐름.
- [Twenty filtered views](https://docs.twenty.com/user-guide/views-pipelines/overview): 같은 객체에서 목적별 저장 뷰를 만드는 방식.

상용 참고:

- [Attio lists](https://attio.com/help/reference/managing-your-data/lists/create-lists): 한 객체에 표/칸반 뷰, 목록별 속성, 저장 필터.
- [HubSpot record index](https://knowledge.hubspot.com/records/view-and-filter-records): 객체 목록, 저장 뷰, 고급 AND/OR 필터.

채택 제안:

- 기본 열은 고객, 상태/긴급, 거래유형, 예산, 핵심 지역/단지, 매칭 수, 다음 연락, 담당자 순으로 둔다.
- “오늘 후속”, “후속 지연”, “새 매칭”, “적극”, “휴면/완료”를 기본 뷰로 제공한다.
- 예산과 면적은 범위를 한 셀에 표기하고 숫자는 오른쪽 정렬한다. 만원/억과 m²/평 환산을 혼용하지 말고 사용자 선택 기준을 고정 표시한다.
- 매칭 수는 단순 숫자가 아니라 신규/검토/제안 완료를 구분한다.
- 고객명에 마우스를 올리면 전화/상담 기록, 행 끝에는 빠른 후속 기록을 제공한다.

피할 점:

- 상태·긴급도·거래유형·담당을 모두 강한 색 칩으로 표현하는 것.
- 지역 전체 문자열을 행에 그대로 펼치는 것. 대표 지역 + N으로 축약한다.
- 다음 연락일과 마지막 연락일의 시각 위계를 같게 두는 것.

![Frappe CRM 리드 목록](../ui-reference-assets/home-customer/frappe-lead-list.png)

![Attio 필드 중심 리스트](../ui-reference-assets/home-customer-commercial/attio-list.png)

### 5.10 매수요청 상세

현재 조건, 지역/단지, 필수/선호, 매칭, 상담 패널을 모두 제공한다. 핵심은 이 데이터를 “고객이 원하는 것”, “우리가 한 것”, “다음에 할 것”으로 읽히게 만드는 것이다.

오픈소스 참고:

- [Frappe CRM Lead](https://docs.frappe.io/crm/lead)와 [Deal](https://docs.frappe.io/crm/deal): 리드/딜 상태와 활동을 한 레코드 안에서 운영.
- [Twenty Record pages](https://docs.twenty.com/user-guide/layout/capabilities/record-pages): 레코드 레이아웃과 관계 정보.

상용 참고:

- [Attio record pages](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): 좌측 속성, 중앙 highlights/activity, 관계 탭.
- [HubSpot record layout](https://knowledge.hubspot.com/records/work-with-records): 활동 유형 필터와 연관 객체.

채택 제안:

- 헤더에는 고객, 요청 상태, 긴급도, 담당, 다음 후속과 상태 전환을 고정한다.
- Overview 첫 블록은 예산/거래/면적/입주/핵심 지역을 한눈에 비교 가능한 요약으로 만든다.
- 필수 조건과 선호 조건은 색만 다르게 하지 말고 체크 아이콘/라벨과 설명을 구분한다.
- 매칭 영역은 후보 수보다 “왜 맞는지/왜 탈락인지”, 최근 변경, 고객 제안 여부를 보여준다.
- 상담/통화/업무는 하나의 Activity 시간축으로 합치고, 작성 composer에서 유형을 선택하게 한다.
- 비활성/삭제는 연관 매칭·거래 영향과 복구 가능 여부를 함께 보여준다.

피할 점:

- 조건 섹션과 매칭 섹션이 서로 다른 용어를 쓰는 것.
- 상태 전환을 더보기 메뉴 깊숙이 숨기는 것.
- 고객의 최근 반응과 다음 연락을 화면 아래에서만 확인하게 하는 것.

![Frappe CRM 리드 상세](../ui-reference-assets/home-customer/frappe-lead-page.png)

![Attio 레코드의 요약·활동·관계 구조](../ui-reference-assets/home-customer-commercial/attio-record.png)

### 5.11 매수요청 등록·수정 폼

이 폼은 금액, 면적, 법정동/단지, 필수/선호 조건 등 도메인 입력이 길다. 단순 2열 폼보다 사용자가 완성 상태와 오류를 계속 확인할 수 있는 구조가 필요하다.

오픈소스 참고:

- [Frappe CRM Custom fields](https://docs.frappe.io/crm/custom-fields): 업무 객체 필드 구성의 참고.
- [Frappe CRM Lead](https://docs.frappe.io/crm/lead): 고객/리드 생성과 후속 활동 연결.

상용 참고:

- [Attio create and view records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): 생성 위치와 템플릿 기반 필드 구성.
- [HubSpot create contacts](https://knowledge.hubspot.com/records/create-contacts): 최소 필드, 연관 레코드, 저장 후 연속 등록.

채택 제안:

- 섹션 순서를 고객 → 거래/예산 → 지역/단지 → 면적/조건 → 입주/후속 → 메모로 고정한다.
- 데스크톱 우측에는 “요청 요약”을 sticky로 두어 예산·면적·지역·필수조건이 자연어 한 문단으로 갱신되게 한다.
- 가격 입력은 만원 원본을 유지하면서 억/만원 읽기 값을 바로 아래 표시한다.
- 면적은 m² 원본과 평 환산을 동시에 보여주되 어느 값이 저장 기준인지 명확히 한다.
- 지역과 단지는 법정동 검색 → 선택 칩 → 우선순위 지정 흐름을 사용한다.
- 저장 템플릿을 제공한다: 아파트 매매, 아파트 전세, 상가 임대, 토지 등.
- 수정 화면은 바뀐 필드와 기존 매칭에 미치는 영향을 저장 전에 보여준다.

피할 점:

- 빈 선택 필드를 모두 펼쳐 세로 길이를 늘리는 것.
- 금액/면적 단위를 placeholder에만 의존하는 것.
- 지역 자유 텍스트와 법정동 선택을 섞어 저장하는 것.

![Attio 빠른 생성 진입점](../ui-reference-assets/home-customer-commercial/attio-create.png)

### 5.12 상담

현재 상담 원장은 날짜/고객 그룹, 필터/정렬, 상세 시트와 후속 신호를 제공한다. 상담 기록을 독립 노트 목록으로 두기보다 고객 Activity의 한 유형이자 후속 업무의 입력으로 다루는 것이 좋다.

오픈소스 참고:

- [Frappe CRM Note](https://docs.frappe.io/crm/note)와 [Lead](https://docs.frappe.io/crm/lead): 레코드에 메모/활동을 연결.
- Frappe 연락처 상세의 연결 거래 패턴: 상담에서 관련 매수요청/매물을 바로 확인.

상용 참고:

- [Attio Activity tab](https://attio.com/help/reference/managing-your-data/records/create-and-view-records): 회의, 수동 활동, 노트, 속성 변경, 예정 업무를 한 시간축에 표시.
- [HubSpot log activities](https://knowledge.hubspot.com/records/manually-log-activities-on-records): call/email/meeting/note/task를 레코드에 기록하고 후속 업무를 생성.
- [HubSpot activity timeline filters](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline): 활동 유형별 필터와 레코드 타임라인.

채택 제안:

- 상담 목록 기본 단위는 날짜 그룹 + 고객 + 핵심 요약 + 관련 매수요청/매물 + 다음 후속이다.
- 상세 시트 상단에 고객/관련 객체를 고정하고, 본문 아래에서 바로 다음 업무와 후속일을 생성한다.
- 상담 유형·신호는 자유 태그와 시스템 신호를 구분한다.
- 고객 상세와 매수요청 상세에서 보이는 상담은 같은 Activity 컴포넌트를 사용한다.
- 통화에서 전환된 상담은 원본 통화, 타임스탬프, AI 요약 출처를 보존한다.

피할 점:

- 상담 저장 후 후속 업무를 다시 별도 화면에서 만드는 것.
- 상담 본문보다 유형 칩과 메타데이터가 더 강하게 보이는 것.
- AI 요약을 상담자의 확정 기록처럼 표시하는 것. 검토 상태를 구분한다.

![Attio 활동 타임라인](../ui-reference-assets/home-customer-commercial/attio-activity.png)

### 5.13 통화기록

현재 3분할 구조와 오디오/AI 요약/전사/상담 전환은 좋은 출발이다. Frappe CRM의 전화 업무 맥락과 Meetily/Gong의 미디어 검토 구조를 결합하는 것이 적합하다.

오픈소스 참고:

- [Frappe CRM Call log](https://docs.frappe.io/crm/call-log): 통화 목록, 연락처/딜 연결, 콜 UI.
- [Meetily](https://github.com/Zackriya-Solutions/meetily): 로컬 전사와 구조화 요약 UI. Community 기준으로 전사·요약만 참고한다.

상용 참고:

- [Gong call page](https://help.gong.io/v1/docs/intro-to-the-call-page): Briefs, Outline, Transcript, Call info, Points of interest와 재생기.
- [Gong call review](https://help.gong.io/docs/review-what-happened-in-a-call): 1문단 recap, key points, next steps, 타임스탬프 점프.
- [Gong transcript](https://help.gong.io/docs/view-a-call-transcript): 오디오와 전사 동기화, 문장 클릭 점프, 검색/주석/스니펫.

채택 제안:

- 좌측은 검색/상태/미연결/전사 처리 필터가 있는 통화 목록.
- 중앙 상단은 고객/시간/방향/연결 상태와 재생기, 하단은 Summary/Transcript 탭.
- 우측은 연락처, 관련 매수요청/매물, 최근 상담, 빠른 상담 전환과 업무 생성을 둔다.
- 요약은 “결론, 고객 요구, 반대/우려, 약속, 다음 행동”의 고정 구조로 만들고 각 항목에 원본 타임스탬프를 연결한다.
- 전사 처리 중/실패/낮은 신뢰도 상태를 목록과 상세 모두에서 보여준다.
- 수정된 전사와 AI 원문을 구분하고 변경 이력을 남긴다.
- 녹음 동의/보존 정책 상태를 통화 메타에 표시한다.

피할 점:

- 화자 분리 정확도가 불확실한데 이름을 확정적으로 붙이는 것.
- 요약만 복사되고 원본 통화/타임스탬프 연결이 끊기는 것.
- 상담 전환 시 같은 내용을 복제해 이후 두 기록이 서로 달라지는 것.

![Frappe CRM 통화 UI](../ui-reference-assets/home-customer/frappe-call-ui.png)

![Frappe CRM 통화 목록](../ui-reference-assets/home-customer/frappe-call-log.png)

![Meetily 전사·요약](../ui-reference-assets/home-customer/meetily-summary.png)

![Gong Briefs와 재생기](../ui-reference-assets/home-customer-commercial/gong-brief.jpg)

![Gong 동기화 전사](../ui-reference-assets/home-customer-commercial/gong-transcript.jpg)

## 6. 통합 UI 시스템 제안

### 6.1 네 가지 화면 원형

1. 목록형: 연락처, 매수요청, 상담, 할 일
   - Page header → Saved views → Filter bar → Data surface → Quick preview.
2. 레코드형: 연락처 상세, 매수요청 상세
   - Record header → Left facts → Center overview/activity → Right relationships/next action.
3. 검토 큐형: AI 인박스, 통화
   - Queue list → Evidence/detail → Entity context/action.
4. 시간형: 캘린더, 대시보드
   - Scope/filter → Time/action surface → Supporting metrics.

이 네 원형을 먼저 만들면 페이지마다 새로운 카드·필터·상세 레이아웃을 발명할 필요가 없다.

### 6.2 공통 컴포넌트 후보

| 컴포넌트 | 사용 페이지 | 반드시 공유할 상태 |
|---|---|---|
| PageHeader | 전체 | 제목, 수, 스코프, primary action |
| SavedViewTabs | 연락처, 매수요청, 할 일, 상담 | 필터, 정렬, 열, 밀도 |
| FilterBar | 모든 목록/캘린더 | 빠른 필터, 고급 필터, 초기화 |
| EntityTable | 연락처, 매수요청, 할 일 | 고정 열, 선택, 일괄 작업, 열 설정 |
| QuickPreview | 연락처, 매수요청, 할 일 | 선택 레코드와 URL |
| RecordHeader | 연락처/매수요청 상세 | 상태, 담당, 마지막/다음 활동, actions |
| ActivityTimeline | 연락처, 매수요청, 상담, 통화 | 유형, 작성자/출처, 시각, 연결 객체 |
| RelationCard | 연락처/매수요청 | 객체 종류, 상태, 중요 속성 |
| ActionQueue | AI 인박스 | 선택, 우선순위, 상태, bulk scope |
| ChangeDiff | AI 인박스 | before/after, 근거, 위험, undo |
| QuickCreatePanel | 연락처/업무/일정 | 최소 입력, 중복/검증, 연속 등록 |
| AudioTranscript | 통화 | current time, active segment, speaker confidence |

### 6.3 제안 토큰과 밀도

다음 수치는 조사 제품의 사실이 아니라 Estate ERP 구현을 위한 제안값이다.

- 4px 기본 그리드, 주요 간격 8/12/16/24px.
- 본문/표 14px, 보조 메타 12px, 페이지 제목 20~24px.
- 표 행은 compact 36px, comfortable 44px 두 밀도를 지원.
- 카드 radius는 한 단계로 제한하고, 중첩 카드에는 그림자보다 경계/배경 차를 사용.
- 상태는 색 + 아이콘/문자 라벨을 항상 함께 사용.
- 가격/면적/날짜는 tabular 숫자와 우측 정렬을 사용.
- 초점, hover, selected, pending, destructive의 상태를 공통 토큰으로 정의.
- 밝은 배경에서 색 칩을 남용하지 말고 중요한 경고·기한 초과·AI 위험에만 강한 색을 남긴다.

### 6.4 한국 부동산 도메인에 필요한 별도 규칙

- 가격: 저장 단위가 만원임을 입력 옆에 고정 표시하고 15.8억 같은 읽기 형식을 보조한다.
- 면적: 저장 기준 m²와 평 환산을 같은 컴포넌트에서 처리한다.
- 주소: 법정동 선택 결과와 표시 주소를 시각적으로 구분한다.
- 동·호: Site → Dong → Unit의 현재 위치를 breadcrumb/관계 카드로 일관되게 표시한다.
- 연락 활동: 전화, 상담, 문자, 매물 제안, 방문을 하나의 시간축으로 합친다.
- 상태: DB enum 문구를 화면에 그대로 노출하지 말고 사용자 언어와 전환 규칙을 디자인 시스템에 매핑한다.

## 7. 우선순위별 적용 순서

### 1차: 기반과 고객 레코드

1. PageHeader, SavedViewTabs, FilterBar, EntityTable, QuickPreview 구축
2. 연락처 목록/상세/등록에 적용
3. ActivityTimeline과 RelationCard 통합

이 단계가 끝나면 매수요청과 상담의 상당 부분을 같은 패턴으로 재사용할 수 있다.

### 2차: 매수요청 업무 흐름

1. 매수요청 목록의 저장 뷰와 행 정보 우선순위 정리
2. 상세를 Record 원형으로 재배치
3. 폼에 sticky 요약, 단위 컴포넌트, 지역/단지 선택, 수정 영향 표시 추가

### 3차: 검토 큐

1. AI 인박스를 3분할로 전환
2. ChangeDiff, 근거, 위험, undo를 공통화
3. 통화의 오디오/전사/요약과 상담 전환을 같은 컨텍스트 패널 규칙에 맞춤

### 4차: 개인 생산성·요약

1. 할 일의 시간 구획과 상세 패널
2. 캘린더의 빠른 생성/레이어/색 의미 정리
3. 대시보드를 “오늘 행동” 중심으로 재조합
4. 온보딩을 최소 생성 + 후속 설정으로 단순화

## 8. 상용 제품 검증 경계

| 제품 | 공개 검증 범위 | 로그인 장벽/주의 |
|---|---|---|
| Linear | Triage, Triage Intelligence, Workspace 공식 문서와 공식 스크린샷 | 실제 새 워크스페이스 생성 화면은 로그인 이후라 최신 live step을 검증하지 못함 |
| Asana | My Tasks와 Calendar 공식 Help 문서 | 실제 데이터가 든 화면은 로그인 필요, 플랜별 차이가 있을 수 있음 |
| HubSpot | Dashboard, index, record, activity 공식 Knowledge Base | 계정 생성 시점/베타에 따라 index UI가 달라질 수 있다고 공식 문서가 명시 |
| Attio | Records, Lists, Activity 공식 Help와 공식 스크린샷 | 실제 워크스페이스 레이아웃은 관리자 커스터마이징에 따라 달라짐 |
| Google Calendar | 이벤트 생성/cheat sheet 공식 Help | 조직의 방/자원/권한 설정에 따라 옵션 차이 |
| Gong | Call page, review, transcript 공식 Help와 공식 스크린샷 | 실제 통화 데이터/AI 기능은 계정·언어·권한에 따라 달라짐 |

상용 사례는 시각·상호작용 참고용이다. 코드, 아이콘, 스크린샷, 상표 자산을 제품에 복제하지 않는다. 오픈소스도 저장소 라이선스가 문서 스크린샷의 재사용 권리까지 자동으로 보장하는 것은 아니므로, 보고서 내부 참고 외에는 각 프로젝트의 미디어 정책을 별도 확인해야 한다.

## 9. 이미지 provenance

### 9.1 오픈소스 제품 이미지

| 로컬 파일 | 공식 원본/페이지 | 비고 |
|---|---|---|
| twenty-onboarding.png | [Twenty raw image](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/images/releases/0.20/0.20-onboarding.png) | Twenty 공식 저장소 문서 이미지 |
| twenty-dashboard.png | [Twenty raw image](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/images/user-guide/dashboard/dashboards_v2.png) | Twenty 공식 저장소 문서 이미지 |
| twenty-calendar.png | [Twenty raw image](https://raw.githubusercontent.com/twentyhq/twenty/main/packages/twenty-docs/images/user-guide/views/calendar-view.png) | Twenty 공식 저장소 문서 이미지 |
| plane-workspace-onboarding.webp | [Plane 공식 글](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane) · [원본](https://plane.so/api/media/file/blog_marketing-switch-to-plane-workspace-windows.webp) | 공식 블로그 제품 이미지 |
| plane-dashboard.webp | [Plane 공식 글](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane) · [원본](https://plane.so/api/media/file/blog_marketing-switch-to-plane-delightful-dashboards.webp) | 공식 블로그 제품 이미지 |
| plane-intake-inbox.webp | [Plane 공식 글](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane) · [원본](https://plane.so/api/media/file/blog_marketing-switch-to-plane-inbox.webp) | 공식 블로그 제품 이미지 |
| plane-calendar.webp | [Plane 공식 글](https://plane.so/blog/marketing-and-design-agencies-switch-to-plane) · [원본](https://plane.so/api/media/file/blog_marketing-switch-to-plane-calendar.webp) | 공식 블로그 제품 이미지 |
| chatwoot-inbox.png | [Chatwoot raw image](https://raw.githubusercontent.com/chatwoot/chatwoot/develop/.github/screenshots/dashboard.png) | 공식 저장소 README 이미지 |
| vikunja-task-overview.png | [Vikunja Features](https://vikunja.io/features/) · [원본](https://vikunja.io/_image?href=%2F_astro%2F01-task-overview.BHqt3K0j.png&w=1400&h=850&q=95&f=png) | 공식 사이트 최적화 이미지 |
| vikunja-table.png | [Vikunja Views](https://vikunja.io/help/views/) · [원본](https://vikunja.io/_image?href=%2F_astro%2Fviews-table.CixXNzro.png&w=1000&h=592&q=95&f=png) | 공식 사이트 최적화 이미지 |
| vikunja-kanban.png | [Vikunja Views](https://vikunja.io/help/views/) · [원본](https://vikunja.io/_image?href=%2F_astro%2Fkanban.B53XXUc5.png&w=1000&h=592&q=95&f=png) | 공식 사이트 최적화 이미지 |
| frappe-contact-list.png | [Frappe Contact docs](https://docs.frappe.io/crm/contact) · [원본](https://docs.frappe.io/files/imagea1fa73.png) | 공식 문서 이미지 |
| frappe-contact-create.png | [Frappe Contact docs](https://docs.frappe.io/crm/contact) · [원본](https://docs.frappe.io/files/imagec2412f.png) | 공식 문서 이미지 |
| frappe-contact-detail.png | [Frappe Contact docs](https://docs.frappe.io/crm/contact) · [원본](https://docs.frappe.io/files/imageefefb8.png) | 공식 문서 이미지 |
| frappe-lead-list.png | [Frappe raw image](https://raw.githubusercontent.com/frappe/crm/develop/.github/screenshots/LeadList.png) | 공식 저장소 README 이미지 |
| frappe-lead-page.png | [Frappe raw image](https://raw.githubusercontent.com/frappe/crm/develop/.github/screenshots/LeadPage.png) | 공식 저장소 README 이미지 |
| frappe-call-ui.png | [Frappe raw image](https://raw.githubusercontent.com/frappe/crm/develop/.github/screenshots/CallUI.png) | 공식 저장소 README 이미지 |
| frappe-call-log.png | [Frappe raw image](https://raw.githubusercontent.com/frappe/crm/develop/.github/screenshots/CallLog.png) | 공식 저장소 README 이미지 |
| meetily-summary.png | [Meetily raw image](https://raw.githubusercontent.com/Zackriya-Solutions/meetily/main/docs/summary.png) | 공식 저장소 문서 이미지 |

### 9.2 상용 제품 이미지

| 로컬 파일 | 공식 원본/페이지 | 사용 경계 |
|---|---|---|
| linear-workspace.png | [Linear Workspaces](https://linear.app/docs/workspaces) · [공식 원본](https://webassets.linear.app/images/ornj730p/production/903aa378bb458c634ef798c0aff3dda591da05ea-2344x1694.png?w=1440&q=95) | 내부 디자인 참고만 |
| linear-triage.png | [Linear Triage](https://linear.app/docs/triage) · [공식 원본](https://webassets.linear.app/images/ornj730p/production/30183e73c9ef009bb8cb14adbe97d9f34a5b9a69-2352x1632.png?w=1440&q=95) | 내부 디자인 참고만 |
| linear-ai.png | [Linear Triage Intelligence](https://linear.app/docs/triage-intelligence) · [공식 원본](https://webassets.linear.app/images/ornj730p/production/02067ce6f9065399e26861ebb5db223bdc0c897e-1494x584.png?w=1440&q=95) | 내부 디자인 참고만 |
| hubspot-dashboard.png | [HubSpot dashboard docs](https://knowledge.hubspot.com/dashboards/manage-your-dashboards) · [공식 원본](https://53.fs1.hubspotusercontent-na1.net/hub/53/hubfs/Knowledge_Base_2023-24-25/KB-dashboards/dashboards-manage-access.png?width=1645&height=750&name=dashboards-manage-access.png) | 내부 디자인 참고만 |
| hubspot-contact-list.png | [HubSpot updated index docs](https://knowledge.hubspot.com/records/view-and-filter-records-in-the-updated-index-page) · [공식 원본](https://53.fs1.hubspotusercontent-na1.net/hub/53/hubfs/Knowledge_Base_2023-24-25/KB-Records/Index%20pages/LITE/updated-table-view.png?width=1750&height=633&name=updated-table-view.png) | 내부 디자인 참고만 |
| hubspot-contact.png | [HubSpot customize records](https://knowledge.hubspot.com/object-settings/customize-records) · [공식 원본](https://53.fs1.hubspotusercontent-na1.net/hub/53/hubfs/Knowledge_Base_2023-24-25/KB-Records/view-contact-record.png?width=2000&height=1165&name=view-contact-record.png) | 내부 디자인 참고만 |
| attio-list.png | [Attio Lists](https://attio.com/help/reference/managing-your-data/lists/create-lists) · [공식 원본](https://a.storyblok.com/f/234930/2460x1468/071fd78b6d/lists.png) | 내부 디자인 참고만 |
| attio-create.png | [Attio Records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) · [공식 원본](https://a.storyblok.com/f/234930/852x580/6dfa63f5ba/add-record-all-records-pgae.png) | 내부 디자인 참고만 |
| attio-record.png | [Attio Records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) · [공식 원본](https://a.storyblok.com/f/234930/1829x1067/6aed6cc3ee/full-record-page-overview.png) | 내부 디자인 참고만 |
| attio-activity.png | [Attio Records](https://attio.com/help/reference/managing-your-data/records/create-and-view-records) · [공식 원본](https://a.storyblok.com/f/234930/1920x1428/0273484c64/record-page-activity-tab.png) | 내부 디자인 참고만 |
| google-calendar-create.png | [Google Calendar cheat sheet](https://support.google.com/a/users/answer/9290350?hl=en) · [공식 원본](https://lh3.googleusercontent.com/ZmYoAdkuWWFcwQjQ-XcR_BzXi6bPIGRxZgAw8LmzPgSFZnbGeEX7PA6EFiSxNaNtkQ) | 내부 디자인 참고만 |
| gong-brief.jpg | [Gong call review](https://help.gong.io/docs/review-what-happened-in-a-call), 이미지명 Briefs11.jpg | 공식 문서 CDN의 단기 서명 URL로 수집, 내부 디자인 참고만 |
| gong-transcript.jpg | [Gong transcript](https://help.gong.io/docs/view-a-call-transcript), 이미지명 Transcript2.jpg | 공식 문서 CDN의 단기 서명 URL로 수집, 내부 디자인 참고만 |

## 10. 최종 추천안

가장 현실적인 리디자인 기준은 “Twenty의 조용한 셸 + Attio의 레코드/리스트 + Plane/Linear의 검토 큐 + Vikunja/Asana의 개인 업무 + Meetily/Gong의 통화 검토”다.

첫 구현 대상은 연락처 목록/상세/등록이다. 이 세 화면에서 공통 셸, 저장 뷰, 필터, 표, 빠른 미리보기, 레코드 헤더, 활동 타임라인을 확정하면 매수요청·상담·통화 화면까지 같은 시스템으로 확장할 수 있다.
