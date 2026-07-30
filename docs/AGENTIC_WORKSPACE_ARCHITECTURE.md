# Agentic Workspace Architecture

최종 수정: 2026-07-29

Estate ERP를 중개사 전용 “Linear + Notion” 협업 도구로 확장하는 기준 문서다.
사람의 일반 업무와 agent의 고빈도 요청을 같은 테이블에 넣지 않는다. PostgreSQL의
구조화 레코드와 불변 증거가 원장이며, AI 대화는 원장이 아니다.

## 1. 제품 결정

첫 번째 agentic 업무 도메인은 광고 운영이다.

```text
이실장/부동산뱅크 skill + computer use
  → 정확한 Listing/Property/Unit에 ListingAdvertisement 저장
  → ListingAdvertisement.naverUrl을 네이버 읽기 skill로 확인
  → 광고노트 ExternalListing에 시장 관측 원본을 독립 저장
  → OfficeAdvertisement(Group)에 내 광고용 순위·중복 비교를 독립 저장
  → 독립 AgentActionRequest 생성
  → 지정 reviewer가 exact contentHash 승인
  → 이실장 광고관리 skill + computer use로 실행
  → 같은 이실장 record를 reload하여 persisted 값 확인
  → 일치하면 AgentActionRequest 완료 + ListingAdvertisement 동기화
  → 불일치/CAPTCHA/MFA/계정·대상 문제일 때만 Task 생성
```

이실장 실행 뒤 네이버를 다시 관측하지 않는다.

범용 `Rule / Proposal / EntityDraft` 시스템을 만들지 않는다.
`AgentActionRequest`는 임의 테이블 patch가 아니라 코드로 정의된 capability 한
개가 외부 시스템에 만드는 부작용 한 건이다.

## 2. Task와 AI 요청의 경계

| 모델 | 소유하는 것 | 만들거나 바꾸는 주체 |
|---|---|---|
| `Task` | 직원이 직접 처리할 업무, 담당자, 우선순위, 기한, 업무 상태 | 직원 또는 실제 사람 작업이 필요한 예외 |
| `AgentActionRequest` | AI 변경안, 검토, 승인된 명령, 실행, 검증 | skill/agent + reviewer |
| `AgentRun` | 한 번의 agent 실행 attempt와 lease/result | control plane |
| `AgentActivity` | agent 실행의 append-only 활동 | control plane |

정상적인 광고 변경안은 `Task`가 아니다.

`AgentSession`은 `taskId` 또는 `agentActionRequestId` 중 하나에만 연결할 수 있다.
따라서 실행 로그를 추적하기 위해 두 업무 타입을 한 테이블로 합칠 필요가 없다.

- 제안 생성: Task 없음
- 승인/반려/철회: Task 생성·상태 변경 없음
- 실행 성공/검증 일치: Task 생성·완료 없음
- 실행 불일치, CAPTCHA, MFA, 계정·대상·화면 불일치: 이때만
  `Task(source=ai, category=advertisement)` 생성

예외 Task는 `AgentActionRequest.escalationTaskId`로 한 번만 연결되고 이후 다른
Task로 바꿀 수 없다. 이 구조 덕분에 일반 직원 업무 목록은 AI의 승인 요청
볼륨으로 오염되지 않는다. 화면에서 함께 보여줄 때만 두 쿼리 결과를 control
plane UI가 조합한다.

## 3. 데이터 모델의 역할

| 모델 | 책임 |
|---|---|
| `ExternalListingGroup / ExternalListing` | 광고노트에서 사용하는 네이버 관측 projection |
| `ListingAdvertisement` | 정확한 매물·호실에 귀속된 실제 CP 광고(`active/ended`)와 네이버 기준 링크 |
| `OfficeAdvertisementGroup / OfficeAdvertisement` | ListingAdvertisement별 현재 네이버 순위·중복 비교 스냅샷 |
| `AgentActionRequest` | 독립 AI 검토함의 정확한 외부 변경 명령과 결정 |
| `AgentActionVerification` | 이실장 실행 뒤 읽은 append-only persisted-state 검증 |
| `Task` | 예외가 실제 직원 업무로 승격됐을 때만 사용 |
| `AgentSession/Wakeup/Run/Activity` | 장기 실행, lease, 재시도, 실행 활동 |
| `ActivityLog` | 사용자·MCP·시스템의 비즈니스 감사 |
| `Notification` | reviewer 또는 예외 Task 담당자 주의 환기 |

`OfficeAdvertisementGroup`은 독립적인 호실 힌트나 연결/제외 상태를 갖지 않는다.
반드시 하나의 `ListingAdvertisement`에 귀속되며, 현재 네이버 비교 메모리로만
사용한다.

가격 경고는 순위 규칙이 아니다. 현재 비교 스냅샷의 활성 비소유 광고 중
비교 가능한 가격 조건이 더 낮은 row가 하나라도 있으면, 그 광고가 내 광고보다
뒤에 있어도 `더 싼 광고 있음`으로 검토 대상이 된다. 순위는 경고의 원인이
아니라 함께 보여주는 근거다. `OfficeAdvertisement.floorInfo`와
`floorExposureMode` 역시 네이버 노출 관측값이며 내부 호실 층과 섞지 않는다.

`ExternalListing`과 `ListingAdvertisement`는 FK나 논리적 join을 갖지 않는다.
CP가 제공한 `ListingAdvertisement.naverArticleNo`는 내 광고 비교 응답에서
`OfficeAdvertisement.isMain`을 정하는 스칼라 식별값일 뿐, 광고노트 row를 찾는
키로 사용하지 않는다. 같은 네이버 캡처가 두 projection을 채울 수는 있지만 두
projection의 ID를 서로 저장하거나 action 계약에 전달하지 않는다.

CP 조회는 현재 광고 중인 항목 전체를 반환한다. 완전한 조회가 성공하기 전에는
광고 원장을 바꾸지 않으며, 실패는 `AdvertisementSyncRun/Step.error`에만
기록한다. 따라서 `ListingAdvertisement`에 `paused`나 `error` 상태를 만들지
않는다. 성공한 전체 조회에서 사라진 기존 광고만 이력 보존을 위해 `ended`로
전환한다.

## 4. AgentActionRequest 불변 조건

- 한 요청은 외부 부작용 한 건이다.
- `reviewerId`가 반드시 존재하며 같은 사무소의 활성 사용자여야 한다.
- `escalationTaskId`는 정상 흐름에서 null이다.
- 첫 슬라이스는 `OfficeAdvertisementGroup.mainAdvertisement.articleNo`가
  CP가 제공한 `ListingAdvertisement.naverArticleNo`와 같은 내 광고만
  대상으로 한다.
- `payload`, `preconditions`, `evidence`, skill 버전, 설명, 대상 ID는 생성 뒤
  DB trigger로 수정할 수 없다.
- `contentHash`는 대상, 명령, 설명, 근거, 사전조건, 만료 시각을 canonical
  JSON으로 직렬화한 SHA-256이다.
- 승인은 요청 ID, `contentHash`, optimistic `version`에 동시에 묶인다.
- 관측 후 2시간이 지나면 승인할 수 없다.
- 승인 직전 `ListingAdvertisement`의 CP 상태 또는
  `OfficeAdvertisementGroup / OfficeAdvertisement` 비교 스냅샷 해시가
  달라졌으면 요청은 `stale`이다.
- 변경안을 수정할 때 기존 row를 덮어쓰지 않고 새 요청이
  `supersedesId`로 이전 pending 요청을 대체한다.
- 동일 target/base state/command의 반복 제안은 capture 시간이 달라져도 기존
  active 요청을 재사용한다.
- `failed` 또는 `needs_input` 요청은 이력으로 남되 새 요청의 dedupe를 막지
  않는다. 재시도도 새 hash에 대한 새 사람 검토를 거친다.
- 요청과 검증 레코드는 삭제하지 않는다.

`AgentActionRequest`와 `AgentActionVerification`은 `ExternalListing` FK를
갖지 않는다. 요청 생성 시점의 CP 상태와 내 광고 비교 결과는 불변 `evidence`
JSON에 고정되므로 광고노트의 보존·정리 수명주기와 서로 영향을 주지 않는다.

## 5. capability

### `advertisement.takedown`

```json
{
  "schemaVersion": 1,
  "listingAdvertisementId": "...",
  "channel": "esiljang",
  "articleNo": "...",
  "desiredStatus": "ended",
  "reasonCode": "deal_progress"
}
```

### `advertisement.terms.set`

가격·보증금·월세를 증감이 아니라 최종값으로 설정한다. 재시도해도 값이 누적되지
않는 수렴형 명령이다. 가격 단위는 모두 만원이다.

```json
{
  "schemaVersion": 1,
  "listingAdvertisementId": "...",
  "channel": "esiljang",
  "articleNo": "...",
  "advertisedPrice": 158000,
  "advertisedDeposit": null,
  "advertisedMonthlyRent": null
}
```

## 6. 상태

```text
review
pending → approved | rejected | withdrawn | expired | stale | superseded

execution
not_started → awaiting_manual → succeeded | failed | needs_input
not_started → cancelled

verification
pending → matched | mismatch | not_found | blocked | not_required
```

- 승인하면 `approved / awaiting_manual / pending`이 된다.
- 이실장 reload 결과가 payload와 같을 때만
  `approved / succeeded / matched`가 된다.
- 저장값 불일치는 `approved / failed / mismatch`가 되고 예외 Task를 만든다.
- CAPTCHA·MFA·계정/대상/화면 문제는
  `approved / needs_input / blocked|not_found`가 되고 예외 Task를 만든다.
- 반려·철회·만료·stale·superseded는
  `cancelled / not_required`로 외부 효과 없이 닫힌다.

## 7. 사람과 agent의 권한

- MCP는 네이버 관측 저장, 변경안 생성/조회/철회, 승인된 실행 receipt 기록,
  blocker 보고를 할 수 있다.
- MCP에는 승인·반려 도구를 노출하지 않는다.
- 승인·반려는 JWT로 로그인한 앱 사용자만 수행한다.
- 지정 reviewer, owner, manager가 검토할 수 있다.
- agent가 보낸 payload를 그대로 신뢰하지 않는다. 서버가 capability별
  payload를 검증·정규화하고 현재 `ExternalListing`에서 evidence와 precondition을
  만든다.
- 실행자는 승인된 exact hash/version/target 밖으로 범위를 넓힐 수 없다.

광고 MCP scope:

```text
advertisements:read
advertisements:observe
advertisements:propose
advertisements:execute
```

## 8. Skill 계약

### 네이버 부동산 읽기

1. 로컬 browser에서 한 `(site, transactionType)` 범위를 읽는다.
2. snapshot session을 열고 `batch_upsert_external_listings`로 광고노트에 쓴다.
3. 완전한 수집만 complete하고, 부분 수집은 cancel한다.
4. 정확히 연결된 내부 광고와 사무소 guide를 비교한다.
5. 변경이 필요하면 reviewer에게 독립 `AgentActionRequest`를 만든다.
6. 매핑이 모호할 때만 별도 사람 Task를 만든다.
7. 변경안 생성에서 역할을 마치며 이실장 실행 뒤 네이버를 다시 읽지 않는다.

### 이실장 광고관리

```text
prepare → approved hash/version/target 확인
read    → 이실장 계정·대상·현재값 확인
apply   → 승인된 final-value 명령 한 번
reload  → 같은 이실장 record의 persisted 값 읽기
record  → execution receipt 제출
```

CAPTCHA, MFA, 계정 전환, 대상 없음, 화면 불일치, 현재값 불일치, 결과 불명은
우회하거나 추측하지 않고 `report_agent_action_blocker`로 보고한다. 서버가 한 개의
예외 Task를 reviewer에게 배정한다.

## 9. 로컬 computer use 경계

- 실제 외부 쓰기는 사용자가 보고 중단할 수 있는 로컬 agent-browser 또는 Orca
  computer-use 세션에서 수행한다.
- CP 아이디·비밀번호는 Electron `userData` 아래 암호문으로만 저장하고, 암복호화는
  macOS Keychain/Windows DPAPI/Linux Secret Service를 사용하는 `safeStorage`에
  맡긴다. Linux `basic_text` fallback에서는 저장을 거부한다.
- 쿠키·OTP·browser profile은 CP별 Electron persistent partition에만 남기며,
  계정 변경·삭제 시 해당 partition을 비운다.
- 로컬 MCP는 `127.0.0.1` 임의 포트와 프로세스 수명 Bearer token으로만 열고,
  비밀번호 조회 도구 없이 계정 상태와 로그인 준비 도구만 제공한다.
- 서버 wakeup은 `runnerDeviceId`로 해당 자격증명을 보유한 로컬 실행기에 묶는다.
- 서버에는 capability, 대상 ID, approval, content hash, 비밀정보 없는 receipt와
  artifact reference만 저장한다.
- 페이지가 바뀔 때마다 새 snapshot을 만들고 현재 ref/semantic locator를 쓴다.
- 저장 toast나 click ACK만으로 성공 처리하지 않는다.
- 응답이 유실되면 재클릭하지 않고 먼저 이실장 persisted state를 읽는다.
- Socket.io는 알림 신호일 뿐이며 durable 명령과 결과는 PostgreSQL에 둔다.

## 10. Control plane 화면 원칙

DB 모델은 분리하고 화면에서만 조합한다.

```text
내 업무
  - Task만 조회

AI 요청함
  - reviewerId 기준 AgentActionRequest
  - 승인 대기 / 실행 대기 / 확인 필요

통합 Control Plane
  - Task + AgentActionRequest + AgentRun을 각각 조회
  - type badge와 서로 다른 상태 전이로 렌더링
```

일반 Task 정렬·마감·담당자 통계에 `AgentActionRequest`를 섞지 않는다.

## 11. 완료 기준

- 네이버 데이터가 광고노트 `ExternalListing`에 저장된다.
- 내 광고 비교 데이터가 별도 `OfficeAdvertisementGroup /
  OfficeAdvertisement`에 저장되고 광고노트 ID와 연결되지 않는다.
- 더 싼 활성 비교 광고가 하나라도 있으면 앞/뒤 순위와 무관하게 내 광고
  목록과 주의 필터에서 경고된다.
- 정상 제안부터 성공까지 Task row와 Task.status가 변하지 않는다.
- CAPTCHA·불일치 등 예외에서만 한 개의 Task가 생성·연결된다.
- 같은 관측과 명령을 반복해도 active request가 중복되지 않는다.
- 다른 사무소의 사용자, 광고, 요청, 검증을 ID로 조회하거나 변경할 수 없다.
- 해시 또는 version이 다르면 승인·반려·철회·실행 기록이 실패한다.
- 승인 전에 저장된 CP 상태나 내 광고 비교 스냅샷이 바뀌면 외부 효과 없이
  `stale`이 된다.
- 실행 뒤 reload한 이실장 값이 승인 명령과 일치할 때만 내부 광고를 동기화한다.
- 요청 payload 수정/삭제와 검증 수정/삭제를 DB trigger가 거부한다.
- 모든 전이가 actor, source, hash를 포함한 `ActivityLog`를 남긴다.
