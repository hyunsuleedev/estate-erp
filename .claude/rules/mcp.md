---
paths:
  - "apps/server/src/modules/mcp/**"
---

# MCP 규칙

## 방향

- 제품에 AI를 넣지 않는다. 서버가 MCP 서버이고, 사용자가 자기 Claude·ChatGPT를 연결한다.
- 서버는 외부 사이트를 수집하지 않고 agent를 기다리거나 깨우지도 않는다. CP·네이버 조회와 브라우저 자동화는 사용자 PC의 로컬 Skill이 하고, 서버에는 완전한 관측 결과만 받는다.
- 광고는 매물 없이도 넣는다. 에이전트는 아는 만큼(건물 → 관리 공간 → 매물) 연결하고, 호실까지 찾았으면 묻지 않고 Property를 만든다(`find_or_create_property`). 매물을 새로 만드는 것(`create_listing`)은 다 넣은 뒤 사용자에게 묻는다.
- 광고 한 줄은 한 광고다. 같은 매물 · 같은 채널의 광고를 다시 넣으면 새 줄이 아니라 그 줄이 고쳐진다(재광고 · 다시 게재 포함). 네이버 비교는 내 광고 한 건의 목록을 통째로 넣고, 여러 광고는 한 호출에 모아 보낸다(알림이 호출 단위로 묶인다).
- 광고를 바꿔 달라는 요청은 `create_advertisement_change_request`로 만든다(업무가 함께 생긴다). 사용자가 이미 CP에서 바꾼 값은 `update_listing_advertisement`로 기록만 맞춘다.
- 광고 업무는 일반 `Task(category=advertisement)`다. 외부 AI가 `claim_task`로 선점해 중복 실행을 막는다. 실행 단계와 재시도는 로컬 Skill의 SQLite가 갖고 서버에 올리지 않는다.

## 구현

- 엔드포인트는 `/mcp` (Streamable HTTP, 상태 없음).
- 도구는 `mcp-tools.service.ts`에 정의한다. 목록은 그 파일이 기준이고 문서에 옮겨 적지 않는다.
- 도구 이름은 `snake_case`, 동사는 `find_ / get_ / create_ / update_ / delete_`로 맞춘다.
- **AI에게 "매물"은 하나다**(사용자 결정 2026-11-28). MCP에서 `listing`은 매물관리 화면의 한 줄(DB의 ListingIntake), `term`은 그 안의 거래 조건 하나(DB의 Listing: 매매 · 전세 · 월세)다. DB 이름을 그대로 따르던 때에는 `find_listings`(조건)와 `find_listing_intakes`(의뢰)가 함께 있어 "매물 알려 줘"에 무엇을 부를지 정해지지 않았다. 바꾸는 것은 MCP 층뿐이고 DB · 서비스 · REST · 화면의 이름은 그대로다:
  - 도구 이름과 인자: 매물은 `*_listing` · `listingId`, 조건은 `*_listing_term` · `termId`. 조건만 따로 찾거나 보는 도구는 두지 않는다(매물의 `terms`에 실린다).
  - 응답의 칸 이름은 `mcp-vocabulary.ts`가 한 번에 옮긴다(`intakeId` → `listingId`, `listingId` → `termId`, `listings` → `terms`). 도구를 새로 만들 때 손으로 옮기지 않는다.
  - 매물 · 조건의 id를 그 도구가 받지 않는 이름으로 보내면 버리지 않고 거절한다 — 걸러 달라는 id가 버려지면 걸러지지 않은 목록이 정답처럼 돌아온다.
- 도구는 새 로직을 갖지 않고 기존 서비스를 부른다. 화면과 MCP가 같은 규칙을 타게 하기 위해서다.
- 읽기 도구는 **정규 조회**를 쓴다: 가벼운 목록(`findAll`)과 한 건 상세(`findOne`). 목록에 없는 것은 한 건 조회 도구로 본다(`find_deals` → `get_deal`). 한 화면을 위한 펼침 · 조건 · 선택지(아래 `server.md`의 "화면에 특화된 것")는 도구가 쓰지 않는다 — 화면을 고칠 때 함께 바뀌는 것이라 도구의 응답이 예고 없이 달라진다. 정규 조회로 AI에게 모자란 것이 있으면 화면용 옵션을 빌리지 말고 도구가 자기 옵션을 둔다(`find_units`의 `withPlace`).
- 도구는 화면(REST)과 같은 권한을 따른다. 서비스를 바로 부르면 컨트롤러가 하던 역할 검사와 가리기를 건너뛰므로, 도구에서 보는 사람(`{ userId, role }`)을 넘기거나 같은 가리기를 거친다: 직원의 급여·배분율(대표와 본인만), 수수료 청구(중개사는 담당 거래만), 캐시플로우 요약(대표·매니저만). `mcp-tools.permissions.spec.ts`가 이것을 검사한다.

## 인증

- 외부 AI 클라이언트는 OAuth로 붙는다(Auth0 로그인, 클라이언트가 스스로 등록, MCP 전용 대상의 토큰).
- 자동화는 API 키(`Authorization: Bearer esk_…`, 만료 없음)를 쓴다.
- 데스크톱 앱의 로그인 토큰은 `/mcp`에서 받지 않는다(`audience-separation.spec.ts`).

## 변경 기록

- MCP로 바꾼 데이터도 `ActivityLog`에 남는다. `source = "mcp"`, `actor = "mcp:claude"`.
