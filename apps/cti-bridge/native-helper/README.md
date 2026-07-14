# CTI native-helper (32bit)

KT OpenAPI(`KTPCBizX` COM)와 멀티CID(`multicid.ocx` ActiveX)는 **32bit 전용**이라
64bit Node 프로세스(cti-bridge)에 직접 로드할 수 없다. 이 헬퍼는 32bit .NET Framework
콘솔로 COM 이벤트를 받아 **stdin/stdout JSON-lines**로 브리지와 통신한다.

```
cti-bridge (64bit Node)
   │  spawn + JSON-lines (stdin/stdout)
   ▼
EstateCtiHelper.exe (32bit .NET, --provider kt|multicid)
   │  COM interop
   ▼
KTPCBizX COM  /  multicid.ocx
```

프로세스 분리 이유 (스펙 §13):
- 32/64bit 경계 해결
- COM 크래시 격리 — 헬퍼가 죽어도 브리지가 백오프 재시작 (`helper-process.ts`)
- 레거시처럼 UI 프로세스에 ActiveX를 내장하지 않음 (스펙 §6-7 신뢰경계 결함 제거)

## 프로토콜 (한 줄 = JSON 1건)

### helper → bridge (stdout)

| type | 필드 | 의미 |
|------|------|------|
| `incoming` | `rawCid`, `recvNo?`, `channelKey`, `occurredAt?` | 착신 감지 |
| `callEnded` | `channelKey`, `disposition?` (`answered`/`missed`) | 통화 종료 |
| `dialResult` | `requestId`, `success`, `message?` | 발신 결과 |
| `status` | `connected`, `message?` | 로그인/연결 상태 |

### bridge → helper (stdin)

| type | 필드 | 의미 |
|------|------|------|
| `start` | `lines[]` (`loginId`/`password`/`authKey` 포함) | 로그인/포트 오픈. 자격증명은 메모리에만 보관 — 디스크 저장 금지 |
| `dial` | `requestId`, `phoneNumber`, `sendNo?`, `loginId?`, `password?`, `authKey?` | 발신 |
| `stop` | — | graceful 종료 |

`channelKey` 규칙 (레거시 dedup 문자열 대응):
- KT: `41:{caller}|{seqno}` (레거시 `sKTPreChannel` = caller|seqno)
- 멀티CID: `20:{cid}:{yyyyMMddHHmm}` (장치가 시퀀스를 안 주므로 분 단위 합성)

## 레거시 이관 포인트 (부록 색인 참조)

- **KT (코드 41)** — `Manager/frmMain.cs`:
  - 로그인: `KTPLogin()` — `sKTPAuthKey` 인증키, 마스터 PC 전용
  - 착신: `KTOpenApi_EventCID` `sResult=="201"` → `incoming` 방출
  - 종료: `EventCID` `sResult=="407"` → `callEnded` 방출
  - 발신: `KTOpenApi.SendCTC(sendNum, num)` → HTTP 200 → `dialResult`
- **멀티CID (코드 20/30)** — `ucSunPo.cs`:
  - 착신: `axMulticid1_CidMsgRx` → 숫자 외 제거(len>4) → `incoming`
  - 발신: `axMulticid1.phoneCall(num)` — `DialReady` 상태 대기 후 호출

## 빌드

```
# Visual Studio 또는 dotnet CLI (.NET Framework 4.8, x86 필수)
msbuild dotnet/EstateCtiHelper.csproj /p:Configuration=Release /p:Platform=x86
```

- KT: `KTPCBizX` SDK 등록 필요 (`regsvr32` / KT 제공 설치본). COM 참조 추가 후
  `Program.cs`의 `TODO(KT)` 블록 구현.
- 멀티CID: `multicid.ocx` 등록 필요. `AxHost` 대신 콘솔에서는 CLSID로
  `Activator.CreateInstance` + 이벤트 싱크 또는 STA 메시지 루프 사용.
  `Program.cs`의 `TODO(MULTICID)` 블록 구현.

빌드된 exe 경로를 브리지 환경변수로 지정:

```
CTI_KT_HELPER_PATH=C:\estate\EstateCtiHelper.exe
CTI_MULTICID_HELPER_PATH=C:\estate\EstateCtiHelper.exe
```
