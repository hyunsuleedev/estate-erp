# CTI 두 구현 정밀 비교 — 신규 메인(C#) vs 내 브랜치(TS)

- 작성일: 2026-07-14 (read-only 조사 결과)
- **A안 = 신규 메인 (C#)**: `origin/main` 659ffdc. `apps/cti-bridge`(C# .NET 8) + 서버 `cti` 모듈 + Electron `ctiClient` + 착신 팝업 UI. 설계 문서 `docs/CTI_BRIDGE_PLAN.md`.
- **B안 = 내 브랜치 (TS)**: `feat/myspider-migration` fd9eddf. `apps/cti-bridge`(Node TS + 32bit native-helper) + 서버 `cti` 모듈(게이트웨이/토큰/회선) 기반. 설계 문서 `docs/desktop-prd/migration/cti-cid-legacy-spec.md`.
- 두 구현은 **같은 디렉토리(`apps/cti-bridge`, `apps/server/src/modules/cti`, `packages/api-client/src/modules/cti.ts`)를 서로 다른 내용으로 점유**하므로 병합 불가 — 하나를 선택하고 다른 쪽에서 조각을 흡수해야 한다.

---

## 1. 아키텍처 비교

| 항목 | A안 신규 메인 (C#) | B안 내 브랜치 (TS) |
|------|-------------------|-------------------|
| 브리지 언어/런타임 | C# .NET 8 콘솔 단일 프로세스. 개발 AnyCPU(`dotnet run`, macOS 포함), 운영 `win-x86` self-contained single-file (KT 32bit COM 제약) | 64bit Node TS 프로세스 + 32bit .NET Framework 4.8 `native-helper` 자식 프로세스(2-프로세스 구조). COM 크래시 격리 목적 |
| 브리지 ↔ 앱/서버 경로 | **로컬 우선**: Bridge → `ws://127.0.0.1:45332`(HttpListener, NuGet 0) → Electron main `ctiClient.ts`(WS 클라, 지수 backoff) → IPC `cti:event`/`cti:status` → renderer → **renderer가 사용자 JWT로 `POST /cti/call-events`** | **서버 우선**: Bridge → socket.io **`/cti-bridge` 네임스페이스 직접 WSS 업링크**(`transports:['websocket']`, `auth.token=ctib_`) → 서버가 `CallEvent` 저장 → `/realtime` `call.incoming` 브로드캐스트. Electron은 표시만(미구현) |
| 브리지 인증 | 없음(로컬 127.0.0.1 한정이 방어). 서버 쓰기는 Electron의 직원 JWT가 대신 — "브리지 인증 부담 0" 설계(`CTI_BRIDGE_PLAN.md` §4.5). 무인 수신 불가(로그인된 Electron 필요) | `CtiBridge` 모델 + `ctib_` 토큰(sha256 해시 저장, prefix 조회, 사무소당 1개, **last-wins** 재접속 시 기존 소켓 강제 절단). `officeId`는 토큰에서만 확정. **무인 수신 가능** |
| 타입/와이어 계약 | `packages/shared/src/cti.ts` ↔ `src/Models/Messages.cs` **수기 미러(SSOT 문서화)**. camelCase JSON | TS 단일 언어라 미러 불필요. 프로토콜은 socket.io 이벤트명(`cti.call.incoming` 등) + helper JSON-lines |
| 서버 → 앱 이벤트 | `/realtime` `cti.incoming`(officeId, callLogId, phoneNumber, lineNumber, contact 요약, startedAt) / `cti.call.updated`. lookup은 renderer가 별도 `GET /cti/lookup` | `/realtime` `call.incoming`(**lookup 결과 임베드** — 팝업이 추가 조회 없이 렌더 가능) / `call.updated` / `call.dial.result` / `call.line.status` |
| Electron 통합 | 완성: `main.ts`에서 `new CtiClient()` + `start()`, preload `electronBridge.cti`(getStatus/dial/onEvent/onStatus), `_authenticated.tsx`에 `CtiProvider enabled={windowKind==='main'}`(detached 창 중복 ingest 방지) + `<CallPopup />` | 없음 (Phase 2 예정으로 스펙 §11에 설계만) |
| 유실 대비 | 브리지 재전송 버퍼 **미구현**(계획의 `Queue/RetryBuffer.cs` 부재). 대신 서버가 ring 유실 시 terminate-only로도 CallLog 생성 + 번호+2h 시간창 fallback | `ServerLink` **오프라인 큐 200건**(미접속 중 착신/종료 큐잉 → `cti.bridge.ready` 후 flush). 상태 이벤트는 시점성이라 큐잉 제외 |
| 발신(클릭투콜) | 프로토콜/어댑터까지: renderer `cti:dial` IPC → Bridge `dial` → KT `SendCTC` → `ctc_result` 이벤트. 서버 기록·발신 UI는 후속(ingest는 `ctc_result` 무시) | **서버 경유 전체 구현**: `POST /cti/dial` → `CallEvent(outbound, dialing)` 생성 → `cti.dial.request`(회선 자격증명 일회성 복호화 동봉) → 브리지 `dial` → `cti.dial.result` → `dialed`/`dial_failed` 갱신 + 브로드캐스트. 워커 PC 발신도 서버 경유로 통일(레거시 FC 위임 승격) |
| 멀티 PC 모델 | KT 1회선→최대 4 PC 각자 브리지+Electron이 같은 통화를 중복 보고하는 것을 **정상 경로**로 보고 서버가 dedupe(P2002 원자 처리) | **사무소당 마스터 브리지 1개** 원칙(last-wins). 전 직원 팝업은 서버 브로드캐스트로 해결 — 직원 PC에는 브리지 불필요 |

## 2. 프로바이더 커버리지

레거시 `Phne_Clsf` 코드 기준. "구현"은 실제 동작 코드, "골격"은 컴파일되지만 런타임 미검증, "셸"은 인터페이스/TODO만.

| 프로바이더 | A안 신규 메인 (C#) | B안 내 브랜치 (TS) |
|-----------|-------------------|-------------------|
| **KT OpenAPI (41)** — 수신 CID | **풀 골격(컴파일 가능)**: `StaMessagePump`(전용 STA 스레드 + 실제 Win32 `GetMessage`/`DispatchMessage`/`PostThreadMessage` P/Invoke 펌프), `IKtPcBizClient` 심, `TlbImpKtPcBizClient`(`KT_INTEROP` 조건부 — tlbimp 산출물 `lib/Interop.KTPCBizLib.dll` 커밋 시 실바인딩 자동 활성). `EventCID`/`EventCallTerminate`/`EventCTC`/`EventLogin`/`EventConnect` 결선, `sDBID`↔`sClSeqno` 불일치 대비 activeCalls 맵 + 단일통화 폴백, 지수 백오프 재로그인. PoC 미지수 ⚠ 주석 명시. **실계정 대기 상태** | **셸**: `KtAdapter`는 `HelperBackedProvider` 상속 23줄. 실 COM 작업은 native-helper `Program.cs`의 `TODO(KT)` 블록(레거시 `KTPLogin`/`EventCID sResult=="201"/"407"`/`SendCTC` 이식 지점만 주석) — **미구현, 헬퍼는 "미구현" status만 방출** |
| KT (41) — 발신 | `SendCtc` 어댑터 경로 구현(골격) | helper `TODO(KT)` — 미구현 |
| **LGU Centrex (70)** — 발신 | 없음 (`Program.cs`: `lgu`는 `NotSupportedException`, "2순위") | **실구현**: `LguAdapter.dial` — `clickdial` REST, SHA-512 비번, `SVC_MSG=="OK"` 판정, JSON/텍스트 응답 양쪽 파싱. 파라미터명 검증 TODO 주석 |
| LGU (70) — 수신 CID | 없음 | 미지원 명시(레거시 `AxLGUBaseOpenApi` ActiveX 대안 확인 중 — status 메시지로 착신 기대 차단) |
| **멀티CID 선포/골드 (20/30)** | 없음 | **셸**: `MulticidAdapter`(20/30 별칭 라우팅) + helper `TODO(MULTICID)`(CidMsgRx, channelKey 규칙 `20:{cid}:{yyyyMMddHHmm}` 문서화) — 미구현 |
| 삼성 Wyz070 (50) | 없음 | 없음(어댑터 인터페이스만 — provider-manager가 null 반환) |
| 직렬 CID 박스 (10) | 없음 | 없음(스펙 §13에 `serialport` 계획만) |
| **mock (개발용)** | **완전 구현**: stdin REPL(`ring`/`end`/`status`/`quit`) + `autoRingIntervalSec` 타이머, 세션 고유 seqno 접두어(재시작 dedupe 충돌 방지). **SDK/계정 없이 브리지→Electron→서버→팝업 전 구간 E2E 가능** | 없음 — E2E 개발 하네스 부재 |
| **모바일 (vendor=mobile)** | **서버측 지원**: `CTI_VENDORS`에 `mobile`, `direction`(inbound/outbound), terminate-only 보고 시 번호+시간창 fallback 건너뜀(연속 통화 유실 방지, 커밋 9721e6d), `recordingId` 사후 연결 | 없음 |

**요약**: 1순위 통신사 KT는 A안이 압도적으로 깊고(실제 STA 펌프 + tlbimp 심 + 이벤트 시그니처 전부), B안은 프로바이더 **폭**(6코드 어댑터 프레임 + LGU 발신 실코드)이 넓지만 KT/멀티CID 코어는 TODO다. 양쪽 모두 실계정/실장비 검증은 안 됨.

## 3. 착신 팝업 UI

| 항목 | A안 | B안 |
|------|-----|-----|
| 팝업 | **완성** — `features/cti/call-popup.tsx`(454줄): 수신중(핑 애니메이션)/부재중/종료+통화시간 페이즈 헤더, 고객명+태그+신규 배지, 업체(`vendorContacts`)/최근상담/연결매물(동 placeholder 처리)/구하는조건 요약(억 단위 포맷)/미완료업무/최근통화 링크, **인라인 상담기록 폼**(Consultation 생성+`CallLog.consultationId` 연결), **인라인 신규 연락처 등록**(이름만 입력 → Contact+ContactPhone+CallLog 연결), 종료 60초 후 자동 닫힘, `data-testid` 부착 | 없음 (Phase 2 예정 — 스펙 §11에 `IncomingCallOverlay` 설계·금지사항만 문서화). 단 `call.incoming` payload에 lookup을 임베드해 팝업 데이터 소스는 준비됨 |
| 상태 관리 | `cti-provider.tsx`(268줄): ref+state 병행(`mutateActiveCall`)으로 이벤트 핸들러 동기 판단, key 기반 팝업 인스턴스 구분(같은 번호 연속 수신), 다른 통화의 늦은 terminate가 현재 팝업 못 덮음, ring 유실 시 terminate 응답의 callLog 채택 | — |
| 개발 하네스 | `/dev/cti-preview` 라우트 + `window.__ctiSimulate` (브라우저/Playwright에서 Bridge 없이 팝업 파이프라인 테스트, 프로덕션 리다이렉트) | — |
| 통화 이력 페이지 | `/calls/logs`(289줄): 방향/상태 필터, 번호 검색, 페이지네이션, `/calls`(녹음)와 상호 링크. `-convert-dialog.tsx`(통화→상담 전환), `-contact-dialogs.tsx`(연락처 검색/연결), `-detail-sheet.tsx` | 데스크톱 `/calls`는 기존 CallRecording 뷰어만. CTI 이력 UI 없음(REST `GET /cti/calls`는 있음) |

## 4. DB 모델

| 항목 | A안 `CallLog` (call-log.prisma) | B안 `CtiLine`+`CallEvent`+`CtiBridge` (cti.prisma) |
|------|-------------------------------|--------------------------------------------------|
| 테이블 수 | 1 (`call_logs`) | 3 (`cti_lines`, `call_events`, `cti_bridges`) |
| 통화 레코드 | `direction`, `phoneNumber`, `lineNumber`, `vendor`, `vendorSeqno`, `status`(ringing/answered/missed/ended), **`durationSec`**, **`consultationId`**, **`recordingId`**, **`memo`**, `startedAt`/`endedAt`, `userId`, `contactId` | `direction`, `phoneNumber`, **`isPrivate`**(발신표시제한), **`receivedNo`**, `providerCode`, `channelKey`, `status`(+ **dialing/dialed/dial_failed** 발신 상태), **`deletedAt`**(soft delete), `occurredAt`/`endedAt`, `userId`, `contactId` |
| dedupe 키 | `@@unique([officeId, vendor, vendorSeqno])` + **날짜 버킷**(`seqno#yyyymmdd`, 자정 넘김 전날 키 조회) + P2002 catch 원자 처리 + seqno 재사용 감지 시 `~` 접미사 신규행 | `@@unique([officeId, channelKey])` + upsert(`update:{}` — 최초 레코드 보존) + 브리지 1차 `ChannelDedup` TTL 30s |
| 회선 관리 | **없음** — 회선/계정은 PC 로컬 `appsettings.json`("CTI 계정은 PC 로컬 자산, 서버 미저장" 원칙) | **`CtiLine`**: providerCode/externalId/internalNo/isMasterOnly/isDelegate + **`credentialCipher`(AES-256-GCM)** 서버 보관, 응답 절대 미포함(`hasCredential`만), 로그인 필요 프로바이더(41/50/70)에 접속 시 복호화 전달 |
| 브리지 등록 | 없음 | **`CtiBridge`**: tokenHash/tokenPrefix/lastSeenAt(하트비트), 사무소당 1개 |
| CallRecording 연계 | `CallLog.recordingId` FK (1방향, `UpdateCallLogDto.recordingId`로 사후 연결 + 사무소 소유 검증) | `CallRecording.callEventId` FK 추가 (CallEvent 1:N recordings) |
| 부재중 판정 | `durationSec`(KT `nTime`) 기반: 0=missed, >0=ended. 발신은 0초여도 ended | `disposition`(answered/missed) 또는 ringing 상태에서 종료=missed |
| 상담 연결 | `consultationId` 컬럼 직결 | 컬럼 없음 — 스펙상 Consultation 쪽에 callEventId 추가 예정(미구현) |

## 5. 모바일 CTI

- **A안**: 있음. 커밋 429402e "Support mobile as CTI event source" — 모바일 앱이 직원 JWT로 `POST /cti/call-events`(vendor=`mobile`, `direction` 명시, ring 없이 terminate 1회 보고)를 쏘는 모델. 9721e6d에서 모바일 terminate의 번호+시간창 fallback을 건너뛰어 같은 번호 연속 통화 유실 방지. `recordingId`로 통화 녹음 업로드 사후 연결. 관련 단위 테스트 2건. (`apps/mobile` 앱 자체는 아직 없음 — 서버 수용 준비만)
- **B안**: 없음. `recordIncoming`은 `/cti-bridge` 게이트웨이 전용이라 모바일이 이벤트를 넣을 REST 경로 자체가 없다.

## 6. 보안 — 레거시 결함(스펙 6장) 대응 비교

| 레거시 결함 | A안 | B안 |
|------------|-----|-----|
| ① 평문 TCP·무인증(`Packet.cs`) | 로컬 `ws://127.0.0.1` 무인증(루프백 한정이 방어선, 클라 메시지 64KB 상한). 서버 구간은 Electron의 직원 JWT | **WSS + `ctib_` 해시 토큰 + officeId 서버 확정 + last-wins** — 레거시 `INFO` 위조 표면 직접 제거. 발신도 서버 RBAC 경유 |
| ② 하드코딩 자격증명(`corpid="myspider"`) | KT 계정이 **`appsettings.json` 평문**(DPAPI 암호화는 "검토" 문서화만). CP 키 서버 런타임 전달도 검토 단계 | 서버 `credentialCipher`(AES-256-GCM, iv+authTag) — 응답 절대 미포함, 발신/로그인 시 일회성 WSS 전달, 헬퍼는 메모리만. 단 `CTI_CREDENTIAL_KEY` 미설정 시 dev fallback 키 |
| ③ 복호화 비번 클라 상주 | 해당 없음(계정이 아예 로컬) | 명시 제거 — 렌더러/DataTable 미보관 원칙 |
| ④ 팝업 표시 = SMS 자동발송 | 팝업 순수 표시, 액션은 버튼만 | (팝업 미구현) 스펙에 금지사항 명문화 |
| ⑤ 팝업 닫힘 = DB write | dismiss는 상태만 clear (no-op) | `PATCH /cti/calls/:id/link` 명시 버튼 전용 + **ActivityLog 기록** |
| ⑥ 번호 암호화 vs 인덱스 충돌 | 정규화 평문 저장 + 인덱스 | 동일 + `isPrivate` 분리 |
| ⑦ ActiveX를 UI 프로세스에 내장 | 별도 C# 프로세스로 격리 | Node 브리지 + 32bit helper 이중 격리(크래시 시 백오프 재시작) |

**관전 포인트**: 자격증명 보관 철학이 정반대다. A안 = "PC 로컬 자산, 서버는 모른다"(유출 반경 최소, 대신 로컬 평문·사무소 온보딩 수작업), B안 = "서버 암호화 중앙 보관"(온보딩/회선 CRUD UI 가능, 대신 서버가 복호화 가능 주체). 무인 수신·워커 발신 요구가 있으면 B안 모델이 필요하다.

## 7. 테스트/문서 성숙도

| 항목 | A안 | B안 |
|------|-----|-----|
| 서버 테스트 | `cti.service.spec.ts` 497줄 **20 케이스** — ring dedupe, P2002 동시성, seqno 재사용, 자정 넘김, terminate-only 유실 보정, 모바일 연속통화, occurredAt 변형(주차 날짜), NaN 페이지 방어, lookup 3형 | `cti-phone.util.spec.ts` 8케이스(정규화/포맷만). 게이트웨이/서비스 테스트 없음 |
| 브리지 테스트 | 없음 (mock 어댑터가 수동 E2E 대체) | `dedup.test.ts` + `normalize.test.ts` |
| E2E 검증 기록 | Playwright 프리뷰로 팝업 풀 렌더/상담 폼/종료/부재중/신규 등록 확인(계획 문서 Step 4 체크) | 없음 |
| 설계 문서 | `CTI_BRIDGE_PLAN.md` 433줄 — 한방 역해석(`KTPCBiz.idl`), **KT 인증 리서치 완료**(c5a5deb "DLL은 오픈 — 게이트는 인증키뿐", 6ecafb9 "인증 2계층: CP 키 + 사무소 PC폰 계정", 9a312dc tlbimp 확정), Step 0~6 로드맵 | `cti-cid-legacy-spec.md` 440줄 — **MySpider V2 디컴파일 전수 분석**(프로바이더 코드표, `MCLS002I01` 등 서비스ID→REST 매핑, TCP 프로토콜, 보안 결함 7종), verbatim 식별자 색인 |

## 8. 총평 및 권고

### 성숙도 판정: **A안(신규 메인 C#)이 명확히 우세**

- A안은 mock 기준 **전 구간이 실제로 동작**한다: Bridge(mock) → Electron IPC → 팝업 → `POST /cti/call-events` → CallLog → `/calls/logs`. 여기에 20개 단위 테스트(동시성 엣지 포함), 완성된 팝업 UI + dev 하네스, 그리고 **1순위 통신사 KT의 가장 어려운 부분(STA 메시지 펌프 + tlbimp 심)** 이 이미 코드로 존재한다. 모바일 이벤트 소스까지 수용한다.
- B안은 서버측 인프라(토큰/회선/발신 위임)와 어댑터 프레임은 넓지만, **UI 0, Electron 통합 0, KT 코어 TODO, E2E 경로 부재**. 실제로 전화가 울려서 팝업이 뜨는 데까지 필요한 남은 작업량이 A안보다 훨씬 크다.
- 브리지 언어 선택도 A안이 옳다: B안의 "64bit Node + 32bit helper" 2-프로세스는 결국 helper가 C#이므로, 처음부터 C# 단일 x86 프로세스인 A안이 단순하다 (`CTI_BRIDGE_PLAN.md` §4.1의 Node 탈락 근거 — 32bit Node는 22 LTS가 마지막인데 프로젝트는 Node≥23, winax 이벤트는 Sleep 폴링).

### 권고: **"신규 메인 C#을 살리고 내 TS 브리지는 버린다" — 타당하다.** 단, 아래 조각은 흡수 가치가 있다.

B안에서 A안으로 가져갈 것 (우선순위순):

1. **`CtiBridge` 토큰(`ctib_`) + `/cti-bridge` WSS 직접 업링크** — A안 계획 §4.5가 "무인 수신 요구 확인 시 API Key 경로 추가"라고 남겨둔 바로 그 자리에 B안의 `cti-bridge-token.service.ts` + `cti-bridge.gateway.ts`(last-wins, officeId 토큰 확정, 하트비트/lastSeenAt)가 완성형으로 존재한다. 로그인 안 된 대표 PC의 수신 기록이 필요해지는 순간 그대로 이식 가능.
2. **발신 위임 플로우** — `POST /cti/dial` → `CallEvent(dialing)` → `cti.dial.request`/`cti.dial.result` → `dialed`/`dial_failed`. A안 Step 5(클릭투콜)의 서버측 절반이 이미 B안에 있다 (A안 CallLog에 발신 상태 추가 필요).
3. **`CtiLine` + `credentialCipher`(AES-256-GCM) + 회선 CRUD/`hasCredential` 패턴** — A안이 로컬 `appsettings.json` 평문의 한계(설정 UI 불가, 온보딩 수작업, 디스크 평문)를 해결하기로 결정하면 그대로 쓸 수 있다. 최소한 `cti-line-credential.util.ts`의 암호화 유틸은 재사용 가치가 있다.
4. **정규화의 `isPrivate` 규칙** — A안 `Normalize.Phone`은 발신표시제한(3자리 미만 → "Private")을 처리하지 않는다. B안 `normalizePhone`의 레거시 `m_MyCallRecv` 규칙(len<3 → isPrivate)을 C# 쪽과 서버 양쪽에 반영할 것.
5. **`LguAdapter.dial`** — LGU Centrex `clickdial`(SHA-512, `SVC_MSG=="OK"`)의 유일한 실코드. LGU 지원 시점에 C#으로 포팅하는 레퍼런스.
6. **오프라인 큐 개념** — A안 계획의 `RetryBuffer.cs`는 미구현. B안 `ServerLink`의 200건 큐 + ready 후 flush 패턴이 설계 참고가 된다 (A안 구조에서는 Electron `ctiClient` 또는 renderer 재시도 큐로 번역).
7. **레거시 스펙 문서 자체** — `cti-cid-legacy-spec.md`의 프로바이더 코드표(10/20/30/41/50/70), 서비스ID 매핑(`MCLS002I01`→착신 INSERT 등), 보안 결함 7종, verbatim 색인은 구현체와 무관하게 유일한 MySpider 측 분석 자료다. **docs로 보존할 것** (멀티CID/직렬/삼성 어댑터를 만들 때 필수).
8. (선택) `CallEvent`의 `deletedAt` soft delete + `linkContact`의 ActivityLog 기록 패턴 — A안 `CallLog`에 없는 감사/이력 보존 장치.

버릴 것: B안의 Node 브리지 본체(`index.ts`/`provider-manager.ts`/`helper-process.ts`), native-helper 스켈레톤(A안 `StaMessagePump`가 상위 호환), `KtAdapter`/`MulticidAdapter` 셸, B안 `cti.prisma`의 `CallEvent`(A안 `CallLog`와 역할 중복 — 발신 상태 컬럼만 CallLog에 얹는 쪽이 낫다).

### 병합 시 주의

- 두 브랜치가 `apps/server/src/modules/cti/*`, `packages/api-client/src/modules/cti.ts`, prisma 스키마 파일을 서로 다른 내용으로 점유 — 단순 머지 불가. B안 마이그레이션(`20260713200934_add_cti_lines_call_events_bridge`, `20260713201513_add_call_event_deleted_at`)은 A안의 `20260706030749_add_call_log`와 공존 시 테이블은 안 겹치지만 API 경로(`/cti/lookup`, `/cti/calls` vs `/cti/call-logs`)와 realtime 이벤트명(`cti.incoming` vs `call.incoming`)이 충돌한다.
- B안의 `CallRecording.callEventId` FK를 버릴 경우 해당 마이그레이션 롤백/정리가 필요하다.
