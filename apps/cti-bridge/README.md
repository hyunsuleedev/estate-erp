# CTI Bridge

32비트 통신사 CTI SDK(COM/OCX)를 로드해 전화 수신 이벤트를 잡아, 같은 PC의 Electron 앱에
로컬 WebSocket(`ws://127.0.0.1:45332`)으로 밀어주는 상주 프로세스.

설계 문서: [docs/CTI_BRIDGE_PLAN.md](../../docs/CTI_BRIDGE_PLAN.md)
와이어 계약(SSOT): [packages/shared/src/cti.ts](../../packages/shared/src/cti.ts) ↔ [src/Models/Messages.cs](src/Models/Messages.cs) 수기 미러

## 왜 C#인가

- 32비트 Node는 22 LTS가 마지막(23부터 폐기) → 프로젝트 요구 `Node>=23`과 충돌
- winax의 COM 이벤트는 `WScript.Sleep()` 폴링 — `EventCID` 실시간 수신에 부적합
- .NET은 x86 정식 지원 + COM 커넥션 포인트를 네이티브 sink로 즉시 수신

## 실행 (개발 — mock, 모든 OS)

```bash
# .NET 8 SDK 필요 (macOS: brew install --cask dotnet-sdk / winget install Microsoft.DotNet.SDK.8)
cd apps/cti-bridge
dotnet run

# stdin 명령으로 가짜 전화 발생
ring 01012345678   # 수신 (EventCID 대응)
end 42             # 42초 통화 후 종료 (EventCallTerminate 대응)
end 0              # 부재중
status             # 현재 상태 JSON
quit
```

`appsettings.json`의 `mock.autoRingIntervalSec > 0`이면 N초마다 자동으로 ring/end를 반복한다.

## 배포 (운영 — Windows 32비트)

KT COM이 32비트이므로 반드시 win-x86으로 publish:

```bash
dotnet publish -c Release -r win-x86 --self-contained -p:PublishSingleFile=true
# → bin/Release/net8.0/win-x86/publish/cti-bridge.exe
```

## 프로토콜

Bridge → 클라이언트 (JSON, camelCase):

```jsonc
// 수신
{ "type": "ring", "vendor": "mock", "caller": "01012345678", "callee": "07000000000", "seqno": "mock-1", "occurredAt": "..." }
// 종료 (durationSec 0 = 부재중)
{ "type": "terminate", "vendor": "mock", "caller": "01012345678", "callee": "...", "seqno": "mock-1", "durationSec": 42, "occurredAt": "..." }
// 상태 (연결 직후 + 변화 시)
{ "type": "status", "vendor": "mock", "connected": true, "loggedIn": true, "lines": ["07000000000"], "bridgeVersion": "0.1.0" }
```

클라이언트 → Bridge:

```jsonc
// 클릭투콜 (KT SendCTC)
{ "type": "dial", "callee": "01012345678" }
```

## KT 어댑터 (Step 5, 실계정 확보 후)

[src/Adapters/KtOpenApiAdapter.cs](src/Adapters/KtOpenApiAdapter.cs)의 구현 가이드 주석 참고.
COM 인터페이스 정의: `docs/reference/hanbang/app/KTPCBiz.idl`
