---
paths:
  - "apps/server/src/modules/mcp/**"
---

# MCP 규칙

## 방향

- 제품에 AI를 넣지 않는다. 서버가 MCP 서버이고, 사용자가 자기 Claude·ChatGPT를 연결한다.
- 서버는 외부 사이트를 수집하지 않고 agent를 기다리거나 깨우지도 않는다. CP·네이버 조회와 브라우저 자동화는 사용자 PC의 로컬 Skill이 하고, 서버에는 완전한 관측 결과만 받는다.
- 광고 업무는 일반 `Task(category=advertisement)`다. 외부 AI가 `claim_task`로 선점해 중복 실행을 막는다. 실행 단계와 재시도는 로컬 Skill의 SQLite가 갖고 서버에 올리지 않는다.

## 구현

- 엔드포인트는 `/mcp` (Streamable HTTP, 상태 없음).
- 도구는 `mcp-tools.service.ts`에 정의한다. 목록은 그 파일이 기준이고 문서에 옮겨 적지 않는다.
- 도구 이름은 `snake_case`, 동사는 `find_ / get_ / create_ / update_ / delete_`로 맞춘다.
- 도구는 새 로직을 갖지 않고 기존 서비스를 부른다. 화면과 MCP가 같은 규칙을 타게 하기 위해서다.
- 내부 전용 값(`Listing.privateMemo` 등)은 도구 응답에 넣지 않는다.

## 인증

- 외부 AI 클라이언트는 OAuth로 붙는다(Auth0 로그인, 클라이언트가 스스로 등록, MCP 전용 대상의 토큰).
- 자동화는 API 키(`Authorization: Bearer esk_…`, 만료 없음)를 쓴다.
- 데스크톱 앱의 로그인 토큰은 `/mcp`에서 받지 않는다(`audience-separation.spec.ts`).

## 변경 기록

- MCP로 바꾼 데이터도 `ActivityLog`에 남는다. `source = "mcp"`, `actor = "mcp:claude"`.
