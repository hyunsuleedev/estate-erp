# CTI Bridge 구현 계획

> 한방(`Hanbang_setup.exe`)·마이스파이더 V2(`MySpiderII.exe`) 역해석 결과와 Estate ERP 현재 코드베이스를 대조해 `apps/cti-bridge`를 어떻게 구현할지 정리한 설계 문서.
> 근거 문서: [한방프로그램분석.md](한방프로그램분석.md) §10, [마이스파이더V2분석.md](마이스파이더V2분석.md) §9, [ARCHITECTURE.md](ARCHITECTURE.md) §5.
> 레퍼런스 파일: `docs/reference/hanbang/app/KTPCBiz.idl`, `docs/reference/hanbang/app/Config/cid.ini`, `docs/reference/hanbang/app/*.dll`.

---

## 0. 한 줄 요약

CTI Bridge는 **32비트 KT/LGU+/삼성 070 CTI SDK(COM/OCX)를 로드해 전화 수신 이벤트를 잡고, 로컬 WebSocket으로 같은 PC의 Electron 앱에 CID(발신번호)를 밀어주는 상주 프로세스**다. 발신번호 → Contact 매칭과 통화 팝업은 이미 있는 서버 API·Socket.io를 재사용하고, Bridge는 "전화가 울렸다"는 신호를 만드는 최소 책임만 진다.

---

## 1. 레퍼런스가 알려주는 핵심 사실

### 1.1 CTI는 벤더 SDK 로드가 본질이다 (한방 §10, KTPCBiz.idl)

한방이 배포하는 CTI 관련 바이너리:

| 파일 | 통신사 | 형태 |
|------|--------|------|
| `KTPSock.dll`, `KTPhoneManager.dll`, `OllehApi.dll`, `KTOpenAPI.dll` | KT OLLEH OpenAPI | COM/DLL |
| `LGUBaseOpenApi.ocx`, `LG070.bat` | LGU+ 070 | ActiveX OCX |
| `Samsung070.dll` | 삼성 070 | DLL |

`KTPCBiz.idl`에서 확인된 KT CTI COM 인터페이스(`IKTPCBizX`)의 실제 동작 모델:

**메서드 (앱 → SDK 호출):**
- `Login(nServer, sAuthKey, sLoginID, sLoginPwd)` — CTI 서버 로그인
- `SetRecvPhone(sRecvPhone)` — 수신 감지할 회선(내선/대표번호) 등록
- `SendCTC(sCaller, sCallee)` — 클릭투콜(발신)
- `SendSMS`, `SendReserveSMS` — 문자 발송
- `GetCallList`, `GetAbsenceCallList` — 부재중/통화 이력 폴링

**이벤트 (SDK → 앱 콜백, `dispinterface _IKTPCBizXEvents`) — 이게 핵심 seam:**
```
EventConnect(nResult)                             // CTI 서버 연결 상태
EventLogin(nResult)                               // 로그인 결과
EventCID(sCaller, sCallee, sResult, sClSeqno, sMiSeqno)   // ★ 전화 수신 — 발신번호(sCaller)
EventCTC(sCaller, sCallee, sResult, sMiSeqno)     // 클릭투콜 발신 결과
EventCallTerminate(sDBID, nMode, nTime)           // ★ 통화 종료 + 통화시간(nTime)
EventSMS / EventMMS                               // 문자 수신
```

> **결론**: Bridge의 존재 이유는 `EventCID`(수신) / `EventCallTerminate`(종료) 두 콜백이다. 나머지(발신, 문자, 이력)는 부가 기능. Phase 1 CTI는 이 두 이벤트를 잡아 Electron으로 넘기는 것만 하면 된다.

### 1.2 왜 서버가 아니라 로컬 별도 프로세스인가 (ARCHITECTURE §5, DECISIONS)

- CTI SDK가 **32비트 COM/OCX**다. Electron(64비트 Node)에서 in-process 로드 불가 → 별도 32비트 프로세스로 분리해야 한다.
- 전화는 사무실 회선/PC에 물리적으로 종속 → 클라우드 서버가 직접 못 받는다. 반드시 사무실 PC에서 SDK가 돈다.
- `cid.ini` 구조가 보여주듯 CTI 계정(KT `test2@kt.com` / 비번 / `CANTEL_YN`)은 **PC 로컬 설정**이다.

### 1.3 KT OpenAPI가 1순위 타깃 (한방 §10)

- 한방 기본값이 `CIDKind=OPENAPI` (KT OpenAPI).
- 1회선 → 최대 4대 PC 동시 수신 (KT).
- **KT DLL은 오픈(자유 배포 가능)** — Bridge 설치본에 동봉하고 설치 시 레지스트리 등록(마이스파이더 `OpenAPI 레지스트리 등록.bat` 방식)까지 자동화하면 됨. (2026-07-07 확인)
- **게이트는 인증키**: 사무소(사용자)가 KT OpenAPI **사용자 등록**을 하고 받은 인증키+계정을 Bridge 설정에 입력 — `Login(nServer, sAuthKey, sLoginID, sLoginPwd)`. 회선 가입 절차 참고: KT 100 → 1 → 4 → `#` (한방은 협회 CP 코드 `70229` 사용, 매뉴얼 `001.rtf`).
- LGU+/삼성은 2순위. Bridge는 **어댑터 패턴**으로 통신사 교체 가능하게.

### 1.4 통화 팝업이 보여줘야 하는 정보 (마이스파이더 §9)

전화 수신 팝업 = 발신번호만으로 부족. 다음을 한 화면에:
- 고객명 / 신규·기존 구분
- 최근 상담 내역, 최종 상담일
- 연결된 매물(Property/Listing)
- 구하는 조건(BuyerRequirement)
- 미완료 업무(Task)
- 최근 통화 이력

→ 이 조회는 **전부 서버 API의 몫**. Bridge는 발신번호만 넘긴다.

### 1.5 로컬 캐시 DB 패턴 (마이스파이더 §4)

마이스파이더는 `KPA_API.dat`(주소록), `KPD_API.dat`(통화/문자/일정)를 로컬 SQLite로 캐시. 통화 목록 `call_list`, 녹취 메타 `call_reco`, 통화 메모 `call_memo` 등.

→ Estate ERP는 서버 중심이므로 로컬 SQLite 캐시는 **최소화**. 단, Bridge는 서버 연결이 끊겨도 이벤트를 잃지 않도록 **작은 로컬 큐(재전송 버퍼)**만 둔다.

---

## 2. 현재 코드베이스 상태 (실측)

| 항목 | 상태 |
|------|------|
| `apps/cti-bridge/` | **빈 디렉토리** (구현 0) |
| `apps/server/src/modules/cti/` | **빈 디렉토리** (서버측 CTI 모듈 미구현) |
| `CallRecording` 모델 (`prisma/schema/call-recording.prisma`) | 존재. 녹음 파일 + STT + LLM 분석 중심. `direction`, `phoneNumber`, `durationSec`, `contactId`, `userId`, `calledAt` 있음 |
| **`CallLog` 모델** | **없음** — 마이스파이더 §4가 지적한 "녹음 없는 통화 이벤트" 모델 부재 |
| 실시간 인프라 | `apps/server/src/realtime/realtime.gateway.ts` — Socket.io `/realtime` 네임스페이스, `officeRoom(officeId)` 방 구조, Redis 어댑터 |
| 소켓 인증 | `ClerkAuthService.authenticateBearerToken` (Bearer JWT) |
| API Key 인프라 | `apps/server/src/modules/mcp/api-key.service.ts` — User별 `apiKeyHash`/`apiKeyPrefix`, `X-API-Key` 검증. **Bridge 인증에 재사용 가능** |
| 데스크톱 | `apps/desktop` = Electron Forge. `src/main/`(windowManager, updaterService), `src/preload.ts`(contextBridge), `src/renderer/` |
| 연락처 통합검색 | `all_contacts_view`(Contact + VendorContact) 설계는 DATA_STRUCTURE에 있음 (구현 확인 필요) |

**GAP 정리:**
1. `apps/cti-bridge` 프로세스 자체가 없음 → **신규 구축**
2. 서버 `CallLog` 모델 없음 → **신규 추가** (CallRecording과 분리)
3. 서버 `cti` 모듈 없음 → **CID 조회 API + 통화 이벤트 수집 API 신규**
4. Electron ↔ Bridge 로컬 채널 없음 → **로컬 WebSocket + preload 브릿지 신규**
5. 통화 팝업 UI 없음 (Phase 1 PRD 제외 범위지만 CTI Phase에서 필요)

---

## 3. 목표 아키텍처

### 3.1 데이터/이벤트 흐름

```
[전화 수신]
   │
   ▼
KT/LGU+/삼성 070 CTI 서버
   │  (통신사 SDK 프로토콜)
   ▼
┌─────────────────────────────────────────────┐
│  CTI Bridge  (32비트 상주 프로세스, 사무실 PC)  │
│  ┌────────────────────────────────────────┐  │
│  │ VendorAdapter (KT / LGU+ / Samsung)     │  │
│  │  - SDK 로드, Login, SetRecvPhone        │  │
│  │  - EventCID → 정규화된 CallEvent 생성    │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ Local WebSocket Server (ws://127.0.0.1) │  │
│  │  - 같은 PC의 Electron 클라이언트에 push  │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │ Retry Buffer (SQLite/파일 큐)            │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
   │ ws://127.0.0.1:{port}  (CallEvent: ring/terminate)
   ▼
┌─────────────────────────────────────────────┐
│  Electron 메인 (main process)                 │
│  - 로컬 WS 클라이언트로 Bridge 이벤트 수신     │
│  - preload → renderer 로 IPC 전달             │
└─────────────────────────────────────────────┘
   │ IPC (cti:ring / cti:terminate)
   ▼
┌─────────────────────────────────────────────┐
│  Renderer (React)                            │
│  1) GET /cti/lookup?phone=...  → 발신번호 매칭 │
│  2) 통화 팝업 렌더 (고객/상담/매물/업무)        │
│  3) POST /cti/call-events      → CallLog 기록  │
└─────────────────────────────────────────────┘
   │ HTTPS
   ▼
NestJS 서버
  - CallLog 저장
  - Socket.io로 사무소 전 직원에게 브로드캐스트
    (officeRoom → "cti.incoming")
```

### 3.2 두 개의 브로드캐스트 경로 (중요 구분)

- **로컬 경로 (Bridge → 그 PC Electron)**: 물리적으로 전화를 받은 PC에서 즉시 팝업. 지연 최소, 서버 왕복 없이 뜬다.
- **서버 경로 (서버 → officeRoom 전 직원)**: "지금 대표번호로 전화 왔다"를 다른 직원 화면에도 표시(선택). 이미 있는 `RealtimeGateway` + `officeRoom` 재사용.

Phase 1 CTI는 **로컬 경로만** 필수. 서버 브로드캐스트는 CallLog 저장의 부수 효과로 자연히 얻어진다.

---

## 4. 컴포넌트별 구현 계획

### 4.1 `apps/cti-bridge` — 신규 프로세스

**런타임/언어 결정 → C#(.NET) 확정** (DECISIONS §44 대응, 2026-07-06 사용자 결정)

| 방식 | 32비트 COM 로드 | 배포 | 결정 |
|------|----------------|------|------|
| Node 32비트 + `winax`/`node-activex` | ActiveX/COM을 JS에서 | pkg/nexe로 단일 exe | ❌ **아래 2가지 사실로 탈락** |
| **.NET (C#) 32비트 콘솔** | **COM interop 네이티브** | **self-contained exe** | ✅ **채택** |
| Delphi/C++ | 가장 낮은 레벨 | native | ❌ 유지보수 부담 |

**Node 32비트가 탈락한 사실 근거 (2026-07-06 검증):**
1. **32비트 Node는 곧 없어진다.** ia32(32비트 Windows) 빌드는 **Node 22 LTS가 마지막**이고 **Node 23부터 폐기**됨. 그런데 이 프로젝트 요구사항은 `Node.js >= 23.0.0`(CLAUDE.md) → Bridge만 EOL 궤도의 Node 22에 고정해야 하므로 "모노레포 TS 일관성" 명분이 무너짐.
2. **winax 이벤트 모델이 CTI에 부적합.** `node-activex`(winax)의 COM 이벤트는 `WScript.ConnectObject`로 붙지만 **`WScript.Sleep()` 실행 시에만 이벤트를 체크**한다(상시 메시지 펌프 없음). CTI의 핵심인 `EventCID` 같은 dispinterface sink를 실시간 수신하려면 Sleep 폴링 루프가 필요하고 지연·유실 리스크가 있음. 라이브러리 문서도 "정교한 이벤트 드리븐엔 커스텀 구현 필요"라고 명시.
- 반면 **C#(.NET x86)** 은 x86 타깃 정식 지원(런타임 EOL 무관) + COM 커넥션 포인트를 네이티브 sink→C# 이벤트로 즉시 수신(STA 스레드+메시지 펌프 표준) + 벤더 예제가 C#/Delphi.

**채택: C# (.NET) 32비트 콘솔 프로세스**
- 이유: KT COM(`IKTPCBizX`)의 `_IKTPCBizXEvents` dispinterface 이벤트 콜백을 **네이티브 COM interop**으로 안정 수신. 벤더 배포물에 `KTOpenAPIDelphiSample.exe`(참고 가능한 공식 예제)가 있고 SDK 문서/샘플이 C#/Delphi 기준.
- 타깃: **.NET 8** `<PlatformTarget>x86</PlatformTarget>` self-contained single-file exe. COM 아키텍처(32비트)와 프로세스 아키텍처 일치 보장.
- COM interop: KT `KTOpenAPI.dll` / `KTPCBiz` 타입 라이브러리를 `tlbimp` 또는 `dynamic` + `Type.GetTypeFromProgID`로 바인딩. 이벤트는 sink 인터페이스(`_IKTPCBizXEvents`)를 C# 이벤트 핸들러로 연결.
- **모노레포 타입 공유 트레이드오프**: C#이라 `packages/shared`의 TS 타입을 직접 import 못 함. → `CtiCallEvent` **JSON 스키마를 단일 소스(문서 §4.1)로 고정**하고, TS(`packages/shared/src/cti.ts`)와 C#(`CtiCallEvent.cs` record)에 **양쪽 수기 미러링**. WebSocket으로 넘기는 페이로드는 JSON이므로 런타임 계약만 맞으면 됨. 스키마는 이 문서가 SSOT.

**디렉토리 구조 (안, C# 프로젝트):**
```
apps/cti-bridge/
  CtiBridge.csproj      # net8.0, PlatformTarget x86, PublishSingleFile
  src/
    Program.cs          # 부트스트랩: 설정 로드 → 어댑터 선택 → WS 서버 기동
    Config.cs           # cid.ini 대응 로컬 설정 (통신사, 계정, 수신회선, WS 포트)
    Adapters/
      IVendorAdapter.cs   # Login(); Watch(); event OnCallEvent
      KtOpenApiAdapter.cs # KT COM interop, EventCID/EventCallTerminate 바인딩
      LguAdapter.cs       # (2순위, stub)
      SamsungAdapter.cs   # (2순위, stub)
      MockAdapter.cs      # ★ SDK/계정 없이 개발·테스트 — 가짜 ring/terminate 발생
    Ws/
      LocalWsServer.cs    # ws://127.0.0.1:{port} (System.Net.WebSockets), Electron 클라 관리
    Queue/
      RetryBuffer.cs      # 서버 CallLog POST 실패 시 재전송 (선택, SQLite/파일)
    Normalize.cs          # 통신사별 raw → 공통 CtiCallEvent, 번호 정규화(+82 등)
    Models/
      CtiCallEvent.cs     # ★ TS packages/shared/src/cti.ts 와 미러링 (JSON 계약)
  test/
    KtAdapterTests.cs
```

**공통 CallEvent 타입 — SSOT (TS·C# 양쪽 미러링):**
```ts
// packages/shared/src/cti.ts
export type CtiVendor = 'kt' | 'lgu' | 'samsung';

export interface CtiCallEvent {
  type: 'ring' | 'terminate' | 'ctc_result';
  vendor: CtiVendor;
  caller: string;        // 발신번호 (정규화: 01012345678)
  callee: string;        // 착신번호 (수신 회선)
  lineId?: string;       // 내선/회선 식별
  seqno?: string;        // 통신사 통화 시퀀스 (EventCID sClSeqno)
  durationSec?: number;  // terminate 시 (EventCallTerminate nTime)
  occurredAt: string;    // ISO
}
```

**Bridge의 책임 경계 (의도적 최소화):**
- ✅ SDK 로드/로그인/회선등록, 이벤트 정규화, 로컬 WS push
- ✅ (선택) 서버로 CallLog 직접 POST — API Key 인증
- ❌ 발신번호 → 고객 매칭 (서버가)
- ❌ 팝업 렌더 (Electron renderer가)
- ❌ 녹음 파일 처리 (별도, 마이스파이더는 070 자체 녹취 → CallRecording으로)

### 4.2 Electron 측 — 로컬 WS 클라이언트 + IPC

**main process (`apps/desktop/src/main/ctiClient.ts` 신규):**
- 앱 시작 시 `ws://127.0.0.1:{port}` 로 Bridge에 연결 (재연결 백오프).
- Bridge 미실행이면 조용히 대기(에러 토스트 X). 상태를 `cti:status` IPC로 노출.
- `CtiCallEvent` 수신 → `mainWindow.webContents.send('cti:event', event)`.
- (배포 옵션) Bridge exe 생명주기 관리: Electron이 Bridge를 child_process로 spawn할지, 독립 설치/자동시작으로 둘지 결정 필요. **초기엔 독립 프로세스 + 수동/윈도우 시작프로그램 등록** 권장(권한/충돌 단순).

**preload (`apps/desktop/src/preload.ts` 확장):**
```ts
cti: {
  onEvent: (cb) => { ipcRenderer.on('cti:event', h); return () => ...; },
  getStatus: () => ipcRenderer.invoke('cti:getStatus'),
  // 발신(클릭투콜)은 renderer → main → Bridge WS로 역방향 전송
  dial: (payload) => ipcRenderer.invoke('cti:dial', payload),
}
```

> `contextBridge` 패턴은 이미 `electronBridge`(updater, tabs)로 확립돼 있으니 그 컨벤션 그대로 따른다.

### 4.3 서버 측 — `apps/server/src/modules/cti/` 신규 모듈

**엔드포인트:**

| 메서드 | 경로 | 역할 | 인증 |
|--------|------|------|------|
| GET | `/cti/lookup?phone=010...` | 발신번호 → 고객 카드(고객/상담/매물/구하는조건/미완료업무/최근통화) | JWT (직원) |
| POST | `/cti/call-events` | 통화 이벤트 → CallLog upsert. ring 시 생성, terminate 시 duration 갱신 | JWT 또는 API Key(Bridge 직접) |
| GET | `/cti/call-logs` | 통화 이력 목록 (수신/발신/부재중 필터, 마이스파이더 §9) | JWT |
| PATCH | `/cti/call-logs/:id` | 상담 전환(consultationId 연결), 메모 | JWT |

**`/cti/lookup` 응답 형태 (통화 팝업이 필요로 하는 것 전부):**
```ts
{
  phone: "01012345678",
  isNew: false,
  contact: { id, name, tags, grade },
  recentConsultations: [{ id, content, createdAt }],   // 최근 3
  properties: [{ propertyId, siteName, unit }],         // PropertyContact/Tenant 경유
  buyerRequirement: { regions, priceMax, ... } | null,
  openTasks: [{ id, title, dueDate }],
  recentCalls: [{ direction, calledAt, durationSec }],  // CallLog 최근
}
```
- 구현: `all_contacts_view`(Contact+VendorContact) 활용해 업체 전화도 매칭. phone 인덱스 기준 조회.
- 멀티테넌시: `officeId`로 격리 (표준 미들웨어).

**브로드캐스트:**
- CallLog 생성 시 `RealtimeService`로 `officeRoom(officeId)`에 `cti.incoming` emit → 다른 직원 화면 동기화(선택 UI).

### 4.4 DB — `CallLog` 모델 신규 (`prisma/schema/call-log.prisma`)

마이스파이더 §4·§9가 명시한 "녹음과 분리된 통화 이벤트" 모델. `CallRecording`은 그대로 두고 신설.

```prisma
model CallLog {
  id       String @id @default(uuid()) @db.Uuid
  officeId String @map("office_id") @db.Uuid

  /// 착신 처리한 직원 (수신 팝업을 연 사람 / 발신자). null = 미배정 수신
  userId    String? @map("user_id") @db.Uuid
  /// 매칭된 연락처 (null = 미등록 번호)
  contactId String? @map("contact_id") @db.Uuid

  /// inbound / outbound / missed
  direction   String
  phoneNumber String  @map("phone_number")   // 정규화 저장
  /// 착신 회선 (대표번호/내선)
  lineNumber  String? @map("line_number")

  vendor      String?                          // kt / lgu / samsung
  vendorSeqno String? @map("vendor_seqno")     // 통신사 통화 시퀀스 (dedupe 키)

  status      String @default("ringing")       // ringing / answered / missed / ended
  durationSec Int    @default(0) @map("duration_sec")

  /// 이 통화가 상담으로 전환됐으면 연결
  consultationId String? @map("consultation_id") @db.Uuid
  /// 녹음이 붙었으면 연결 (070 자체 녹취 → 후속 업로드)
  recordingId    String? @map("recording_id") @db.Uuid

  memo      String?
  startedAt DateTime  @map("started_at")
  endedAt   DateTime? @map("ended_at")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  office       Office        @relation(fields: [officeId], references: [id])
  user         User?         @relation(fields: [userId], references: [id])
  contact      Contact?      @relation(fields: [contactId], references: [id])
  consultation Consultation? @relation(fields: [consultationId], references: [id])
  recording    CallRecording? @relation(fields: [recordingId], references: [id])

  @@unique([officeId, vendor, vendorSeqno])   // 이벤트 dedupe
  @@index([officeId, startedAt])
  @@index([officeId, phoneNumber])
  @@index([contactId])
  @@map("call_logs")
}
```

**CallLog vs CallRecording 역할 분리:**
- `CallLog` = 전화 이벤트 사실(누가/언제/얼마나/방향). 녹음 없어도 항상 남는다. CTI Bridge가 만든다.
- `CallRecording` = 녹음 파일 + STT + AI 분석. 070 녹취나 모바일 업로드로 생긴다. `CallLog.recordingId`로 사후 연결.

> 마이스파이더 §4 지적 그대로: "녹음 파일이 없거나 아직 업로드되지 않은 전화 이벤트도 남겨야 한다."

### 4.5 인증 — Bridge는 어떻게 서버에 쓰나

**두 옵션:**
- **(권장) Bridge는 서버에 직접 안 쓴다.** Bridge → 로컬 WS → Electron(로그인된 직원 JWT 보유) → 서버. CallLog 생성 주체는 Electron. Bridge는 인증 부담 0. 가장 단순하고 안전.
- **(선택) Bridge가 서버에 직접 POST**: 무인 상주(대표 PC가 로그인 안 된 상태에서도 수신 기록)가 필요하면, `mcp/api-key.service.ts`의 User API Key를 Bridge 설정에 넣어 `X-API-Key`로 `/cti/call-events` 호출. 이때 그 PC를 "대표 수신 계정"에 귀속.

Phase 1은 **첫 번째(Electron 경유)** 로 시작. 무인 수신 요구가 확인되면 API Key 경로 추가.

---

## 5. 단계별 구현 로드맵

### Step 0 — C# COM interop PoC (KT 인증키 등록 후 실행, 병렬 대기)
- [ ] 개발용 KT OpenAPI **사용자 등록** → 테스트 인증키/계정 확보. (DLL 자체는 오픈이라 입수 절차 없음 — 등록만 하면 됨)
- [ ] **바인딩 = tlbimp 방식 확정 (2026-07-07)**: Windows에서 KT DLL 레지스트리 등록 → `tlbimp`로 `Interop.KTPCBizLib.dll` 생성 → **리포에 커밋** (IL이라 이후 macOS 컴파일도 됨. 마이스파이더와 동일 방식. 단, 마이스파이더의 Interop DLL 재사용 금지 — KT DLL에서 직접 생성). 수기 `[ComImport]`는 tlbimp 산출물이 .NET 8에서 문제일 때의 폴백.
- [ ] .NET 8 x86 콘솔에서 `Login` → `_IKTPCBizXEvents.EventCID` 콜백 수신 확인 (전용 STA 스레드 + GetMessage/DispatchMessage 펌프 필수 — 콘솔은 기본 펌프가 없어 펌프 없이는 이벤트 안 옴).
- [ ] PoC에서 해소할 미지수: ① `EventCallTerminate`의 `sDBID` ↔ `EventCID`의 `sClSeqno` 대응 (다르면 `GetCall(sDBID)` 역조회; 서버는 번호+시간창 fallback 있음), ② 실제 ProgID, ③ `InitApi` 필요 여부(Delphi 샘플 호출 순서), ④ `LoginKickOut` 중복 로그인 정책.
- [ ] 참고: `KTOpenAPIDelphiSample.exe`, `KTPCBiz.idl`(인터페이스 정의), 레지스트리 등록 `OpenAPI 레지스트리 등록.bat`, 가입 매뉴얼 `001.rtf`.
- [x] 그동안 Step 1~4는 mock으로 병렬 진행. (완료)

### Step 1 — Bridge 골격 (mock 우선, KT 계정 불요) ✅ 완료 (2026-07-06)
- [x] `apps/cti-bridge` C# 프로젝트 스캐폴딩 (net8.0, 배포 시 win-x86 publish).
- [x] `MockAdapter`로 가짜 ring/terminate 이벤트 발생 (stdin 명령 `ring`/`end` + autoRingIntervalSec 타이머).
- [x] `LocalWsServer` (HttpListener + AcceptWebSocketAsync, NuGet 의존성 0) + `CtiCallEvent` JSON 계약.
- [x] `Config.cs` (cid.ini 대응: 통신사/포트/수신회선). 초기값 `vendor=mock`.
- [x] TS 미러 타입 `packages/shared/src/cti.ts` 동시 작성.
- [x] E2E 스모크 검증: mock ring/terminate → WS 클라이언트가 camelCase JSON 수신 확인.

### Step 2 — Electron 연결 ✅ 완료 (2026-07-06, renderer 팝업 제외)
- [x] `main/ctiClient.ts` 로컬 WS 클라이언트 + 지수 backoff 재연결 (Bridge 미실행은 조용히 대기).
- [x] `preload` `cti` 브릿지 (getStatus/dial/onEvent/onStatus) + `cti:event`/`cti:status` IPC.
- [ ] renderer: mock 이벤트로 팝업 뜨는 것까지 E2E. (Step 4 팝업 UI와 함께)

### Step 3 — 서버 CTI 모듈 ✅ 완료 (2026-07-06)
- [x] `CallLog` prisma 모델 + 마이그레이션 (`20260706030749_add_call_log`).
      direction은 inbound/outbound만, missed는 status로 (계획 §4.4에서 정제).
- [x] `cti` 모듈: `GET /cti/lookup`, `POST /cti/call-events`, `GET/PATCH /cti/call-logs`.
- [x] 발신번호 매칭: `ContactPhone.normalizedPhone` + `VendorContact.phone` 병렬 조회
      (`all_contacts_view` 대신 — view가 아직 없고 Prisma 쿼리로 충분).
- [x] `RealtimeService`로 `cti.incoming`/`cti.call.updated` 브로드캐스트.
- [x] 단위 테스트 6개 (ring dedupe, terminate missed/ended, ring 유실 대비, lookup isNew).

### Step 4 — 통화 팝업 UI (마이스파이더 §9 레이아웃) ✅ 완료 (2026-07-06)
- [x] 수신 팝업 (`apps/desktop/src/renderer/features/cti/`): 고객명+태그/신규 배지/최근상담/연결매물/구하는조건/미완료업무/최근통화. ring→종료(통화시간)/부재중 전환, 종료 60초 후 자동 닫힘.
- [x] "상담 기록" → Consultation 생성 + `CallLog.consultationId` 연결. 신규 번호는 "연락처 등록" 인라인 폼(이름만 입력 → Contact+ContactPhone 생성 + CallLog 연결).
- [x] 통화 이력 페이지 `/calls/logs` (방향/상태 필터, 번호 검색, 페이지네이션). 기존 `/calls`(녹음)와 상호 링크.
- [x] `packages/api-client` `cti` 모듈 (lookup/ingestCallEvent/listCallLogs/updateCallLog).
- [x] DEV 하네스 `/dev/cti-preview`: Bridge/로그인 없이 브라우저에서 팝업 파이프라인 확인 (`window.__ctiSimulate`).
- 검증: Playwright(Chromium) 프리뷰로 수신 카드 풀 렌더/상담 폼/종료/부재중/신규 등록 흐름 확인, 콘솔 에러 0, typecheck 클린.

### Step 5 — 실제 KT 어댑터 결선
- [ ] Step 0 PoC 결과를 `kt-openapi.adapter`로 정식화.
- [ ] 클릭투콜(`SendCTC`) 역방향 경로 (renderer → main → Bridge WS → SDK).

### Step 6 — 배포/운영
- [ ] Bridge를 win-x86 self-contained exe로 패키징 (`dotnet publish -r win-x86`).
- [ ] **KT DLL 동봉 + 설치 시 레지스트리 등록 자동화** (DLL은 오픈 — `OpenAPI 레지스트리 등록.bat` 방식).
- [ ] 사무소 온보딩: KT OpenAPI 사용자 등록 안내 + 인증키를 `appsettings.json`(또는 설정 UI)에 입력하는 절차 문서화.
- [ ] 윈도우 시작프로그램 자동 등록, 트레이 상태.
- [ ] LGU+/삼성 어댑터(2순위)는 수요 확인 후.

---

## 6. 핵심 설계 결정 (요약)

| 결정 | 선택 | 근거 |
|------|------|------|
| Bridge 실행 형태 | 32비트 독립 상주 프로세스 | 32비트 COM/OCX 제약 (ARCHITECTURE §5) |
| Bridge 언어 | **C# (.NET 8, x86)** — 확정 | 네이티브 COM interop으로 dispinterface 이벤트 안정 수신, 벤더 예제 C#/Delphi |
| 타입 공유 | JSON 계약 SSOT + TS/C# 수기 미러 | C#이라 packages/shared 직접 import 불가; 런타임 계약만 일치시키면 됨 |
| 개발 전략 | **mock 어댑터 우선** (KT 계정 대기) | 실계정 없음 → Step 1~4 mock 병렬, Step 0/5만 계정 대기 |
| Bridge ↔ Electron | 로컬 WebSocket `127.0.0.1` | 저지연, 같은 PC 한정, 방화벽 단순 |
| Bridge 책임 | 이벤트 캡처+push만 (매칭/UI/DB 제외) | 벤더 결합 최소화, 교체 용이 |
| 발신번호 매칭 | 서버 `/cti/lookup` (`all_contacts_view`) | 멀티테넌시·기존 데이터 재사용 |
| 통화 이벤트 저장 | 신규 `CallLog` (CallRecording과 분리) | 녹음 없는 이벤트 보존 (마이스파이더 §4) |
| Bridge 인증 | 기본은 Electron(JWT) 경유, 무인 시 API Key | 단순·안전, 필요 시 확장 |
| 1순위 통신사 | KT OpenAPI | 업계 표준 통로 (한방 기본값) |
| 통신사 확장 | VendorAdapter 인터페이스 | LGU+/삼성 어댑터 추가만 |

---

## 7. 결정 완료 / 남은 질문

**결정 완료 (2026-07-06):**
- ✅ **Bridge 언어 = C# (.NET 8, x86)** — 네이티브 COM interop.
- ✅ **KT 실계정 없음 → mock 우선 개발.** Step 1~4를 mock으로 진행, Step 0/5(실 SDK 결선)만 계정 확보 시점까지 대기.

**남은 질문:**
1. **무인 수신 기록** 요구 있나? (대표 PC가 로그인 안 돼도 CallLog 남겨야 하면 §4.5의 API Key 경로 필수. 없으면 Electron/JWT 경유로 단순화)
2. **녹음**: 070 자체 녹취 파일 접근 경로가 있나, 아니면 녹음은 모바일(Phase 4)로만? (`CallLog.recordingId` 연결 시점에 영향)
3. 이 작업이 **Phase 3(로컬 MCP/CTI)** 로 미뤄진 범위인지, 지금 당길지. (PRD상 CTI는 Phase 2~3 — 지금은 계획 확정 + 서버측 `CallLog` 준비까지가 자연스러운 선행 작업)
