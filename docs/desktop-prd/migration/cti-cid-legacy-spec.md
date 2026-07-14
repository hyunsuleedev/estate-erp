# CTI / CID 마이그레이션 스펙 — 레거시(MySpider V2) → Estate ERP CTI Bridge

- 작성 목적: 디컴파일된 C#/WinForms 레거시("MySpider V2 / MySpiderMgr")의 전화(CTI/CID) 서브시스템을 분석하고, Estate ERP 스택(NestJS + socket.io + Electron + 별도 `apps/cti-bridge` 프로세스)으로 재구축하기 위한 이관 명세.
- 레거시 루트: `MySpiderV2-decompiled-source-redacted/MySpiderII/MySpiderMgr`
- 대상 저장소: `C:\Users\run4i\estate-erp`
- 이 문서는 **분석(1~6장)** + **모던 설계(7~13장)** + **사용자 결정 목록(14장)** 으로 구성된다.
- ⚠️ 레거시 코드에는 재현하면 안 되는 심각한 보안 결함이 다수 있다. 6장과 8장을 반드시 먼저 읽을 것.

---

## 파트 A — 레거시 분석

## 1. CID 수신 흐름 (end-to-end)

레거시에서 착신(CID) 처리의 심장은 `Manager/frmMain.cs`의 `m_MyCallRecv(sCidNo, sRecvNo, sComp, sVerify)` (라인 2939) 이다. 모든 프로바이더(직렬장치/멀티CID OCX/KT/삼성Wyz/LGU)의 착신 이벤트가 결국 이 단일 콜백으로 수렴한다.

### 1.1 단계별 흐름

```
[1] 디바이스/프로바이더 착신 이벤트
      ├─ ucBaeDal.serialPort_DataReceived  (COM 직렬, "Number:..." 파싱)  → BaeDalCallEvent
      ├─ ucSunPo.axMulticid1_CidMsgRx      (multicid.ocx, Regex \D 제거)  → SunPoCallEvent
      ├─ ucWyz.WndProc(WM_070_CID=1109)    (Samsung070.dll COM, '\t' 파싱) → WzyCallEvent
      ├─ frmMain.KTOpenApi_EventCID        (KTPCBizX COM, sResult=="201")  → m_MyCallRecv
      └─ frmMain.axLGUBaseOpenApi_SendRingEvent (LGU ActiveX, '|' 파싱)    → m_MyCallRecv
                          │  각 핸들러가 델리게이트로 m_MyCallRecv(cid, recv, comp, verify) 호출
                          ▼
[2] m_MyCallRecv: 번호 정규화
      · sCidNo.Length < 3            → "Private" (사설/단축번호로 분류)
      · sCidNo[0..2] == "82"         → "0" + 나머지 (국제 → 국내 82 변환)
      · "Private"                    → 표시문자열 "발신표시제한", Encrypt("Private")
      · Encrypt(sCidNo)              → Calr_No (암호화 저장 컬럼)
                          ▼
[3] 중복 억제 (dedup)  — 프로바이더 핸들러 레벨에서 처리
      · KT:  sKTPreChannel  = caller|seqno[:-6] 비교 후 다르면만 통과 (라인 2589)
      · LGU: sLGUPreChannel = rechannel|uniqueid 비교 (라인 2845)
      · Wyz: array[3]=="1" && array[4]=="2" && text5=="0" (착신·링·미응답) 게이트
                          ▼
[4] MCLS002I01 (착신 이력 INSERT + 고객/타사무소 lookup)
      · setServiceID("MCLS002I01"), Call_Type="MC"
      · 요청: Offc_Id, Calr_No(enc), Tel_No(평문), EnTel_No(enc), Rcpt_Stat, Oper_Key, Call_Time
      · 응답 그리드[0]:
          - "Cust_Id" 컬럼 존재 → 우리 사무소 고객   → text4 = "C|{Cust_Name}|{CustGubun}"
          - 아니면 타 사무소 매칭                    → text4 = "O|{By_Name}|{Scal_Name}|{DongName}"
                          ▼
[5] 로컬 팝업 (본인 PC)
      · POPUP.MC != "0" && !CheckPopupOpen(mycall)  → sendMyspider("MC", ...)
        → frmMyCall 팝업 오픈 (착신 상세)
                          ▼
[6] 사무소 TCP 브로드캐스트 (다른 직원 PC로)
      · text5 = "MC:{Offc_Id}:{LoginID}:{OffcName}:{LoginName}:{sCidNo}:{Call_Time}:{text4}::{yyyyMMddHHmmss}"
      · MANAGER.MC != "0" → MsgFrm_Load(자기 PC 처리)
      · SendManagerUs(text5)  → 서버 릴레이 → 같은 office_id 의 다른 PC 들이 수신 → 각자 frmMyCall 팝업
                          ▼
[7] 통화 종료 / 팝업 닫힘
      · m_MyCallBack(comp, verify)  → MCDS001U01 : Rcpt_Stat 갱신 (수신완료/부재 등)
        - KT EventCID sResult=="407" → m_MyCallBack("KTP", seqno)
        - LGU SendChannelListEvent   → m_MyCallBack("LGU070", channel|uniqueid)
      · frmMyCall.MyCall_FormClosing → MCDS001U02 : Cust_Id/Calr_Name 매핑 확정 저장(부작용, 6장 참고)
```

### 1.2 발신(Dial) 흐름

```
PhoneDialPAD.btnCallSend_Click  또는  frmMyCall.lblPhneCall_Click
   → MyspiderMessage.SendMessage("FC", telNo, custId, custName)
   → frmMain.MessageTextLog: 마스터PC면 MakeACall, 워커PC면 SendManagerUs("FC:...")로 마스터에 위임
   → 마스터PC의 ReceiveMessage에서 "FC" 수신 → MakeACall(seq, com, sendNum, pwd, id, custId, custName)
   → 프로바이더별 발신:
       "50" Wyz  : MyCall.m_Wyz070OpenAPI(id, pw, "001", num)      → RP_No=="1001"/"SUCCESS"
       "70" LGU  : MyCall.m_LGU070RestAPI(id, pw, "clickdial", num) → SVC_MSG=="OK"
       "41" KT   : KTOpenApi.SendCTC(sendNum, num)                  → 200
       "20/30"   : ucSunPo1.PhoneCall(num)  (멀티CID OCX)
       "10"      : ucBaeDal1.PhoneCall(num) (직렬 "[C\r{num}\r]")
   → 성공 시 MyCall.m_MyCallDialResult → MCLS002I04 (발신 이력 INSERT, Rcpt_Stat="2")
```

---

## 2. 프로바이더 추상화 (프로바이더 코드 표)

프로바이더 식별자는 `Phne_Clsf` 코드다. `MyCallExecute()`(라인 2278)가 `MCDS004Q01`로 사무소 전화설정(`dtPhoneInfo`)을 로드하고 `Phne_Clsf` 값으로 분기한다. `MyCall.getMyCallComp(code)`가 표시명을 반환한다.

| 코드 | 이름 | 통합 방식 | CID 수신 경로 | 발신 방식 | 마스터 전용? |
|------|------|-----------|---------------|-----------|--------------|
| **10** | 배달(직렬 CID 박스) | `System.IO.Ports.SerialPort` (COM1~9, 9600 8N1) | `serialPort_DataReceived` → "Number:xxxx" 라인 파싱 → `BaeDalCallEvent` | `[C\r{num}\r]` 직렬 기록 | 워커 가능(각 PC 로컬 장치) |
| **20 / 30** | 선포/골드(멀티CID) | `AxMULTICIDLib.AxMulticid` (multicid.ocx ActiveX, 32bit) | `axMulticid1_CidMsgRx` → `Regex \D 제거`(len>4) → `SunPoCallEvent` | `axMulticid1.phoneCall(num)` (DialReady 대기) | 워커 가능(로컬 장치) |
| **40** | KT PC폰 | (레거시 표시명만; `getMyCallComp`에 "KT PC폰") | — (41로 대체된 것으로 보임) | — | — |
| **41** | KT OpenAPI (KTPCBizX) | `KTPCBizX` COM (`KTOpenApi`, 32bit ActiveX) | `KTOpenApi_EventCID` (sResult "201") → `m_MyCallRecv(comp="KTP")` | `KTOpenApi.SendCTC(sendNum, num)` | **마스터 전용** (`MyCallMasterClsf=="Y"`에서만 `KTPLogin()`) |
| **50** | 삼성 Wyz070 | ① `Samsung070.dll` P/Invoke(WndProc 메시지 1109/1124) + ② `palette.samsung070.com` HTTPS OpenAPI | `ucWyz.WndProc` WM_070_CID → '\t' 파싱 → `WzyCallEvent` | HTTPS `m_Wyz070OpenAPI(id,pw,"001",num)` | CID는 마스터에서 로그인(`Dlgt_Yn='Y'`), 발신 HTTPS는 워커도 가능 |
| **70** | LG U+ (Centrex) | ① `AxLGUBaseOpenApi` ActiveX(SendRingEvent) + ② `centrex.uplus.co.kr/RestApi` HTTPS | `axLGUBaseOpenApi_SendRingEvent` → '|' 파싱(ISDIAL/CALLERID/…) → `m_MyCallRecv` | HTTPS `m_LGU070RestAPI(id,pw,"clickdial",num)` | CID는 마스터에서 ActiveX 로그인, 발신 REST는 워커도 가능 |

### 2.1 마스터/워커 구분 로직

- `userInfo.getUserMasterClsf()` == "Y" 가 **마스터 PC**.
- 마스터만 KT(41) 로그인·CID, Wyz(50)·LGU(70) ActiveX 로그인·CID를 수행 (`MyCallExecute` 라인 2301 `if (MyCallMasterClsf=="Y")`).
- 직렬(10)·멀티CID(20/30)는 물리 장치가 꽂힌 PC(보통 워커도 가능)에서 로컬로 감지.
- 워커 PC가 발신하려면 자체 HTTPS 회선(50/70)이 없으면 마스터에 `FC` 메시지를 TCP로 위임한다 (`MessageTextLog` 라인 1990, `MyspiderMessage.checkMainConnect` → `CIDS003Q01`로 마스터 접속 확인).

---

## 3. 사무소 TCP 프로토콜

레거시는 자체 바이너리 TCP로 마스터/워커/서버가 조율한다. `Packet.cs` + `StateObject.cs` + `MSG_CODE.cs` + `frmMain.cs`의 소켓 코드가 핵심.

### 3.1 와이어 포맷 (`Packet.Encode/Decode`)

```
┌────────┬──────────────────┬───────────────────────┐
│ 1 byte │ 2 bytes (BE)     │ N bytes (UTF-8 body)  │
│ msg_code│ body length (int16, big-endian) │  msg  │
└────────┴──────────────────┴───────────────────────┘
```

- `msg_code`: `MSG_CODE` enum 1바이트.
- length: `int16` big-endian. `BitConverter.IsLittleEndian`이면 `Array.Reverse`로 뒤집어 BE로 송신/수신.
- body: UTF-8. 수신은 2단계 — 먼저 헤더 3바이트(코드1+길이2) 읽고(`READ_HEADER`), 길이만큼 본문 읽음(`READ_BODY`), `StateObject`가 상태 보관.
- 평문. **TLS 없음, MAC/서명 없음** (6장).

### 3.2 MSG_CODE (enum 순서 = 바이트값)

| 값 | 이름 | 용도 |
|----|------|------|
| 0 | `HEART_BEAT` | 하트비트 (`SendHeartBeatReq`, 3회 실패 시 disconnect) |
| 1 | `MESSAGE` | 사무소 내 개별 메시지 (`SendManager`) |
| 2 | `CHAT` | 채팅 (미사용에 가까움) |
| 3 | `INFO` | 접속 시 신원 등록: `msg = "{Offc_Id}:{LoginID}"` |
| 4 | `CLOSED` | 종료 |
| 5 | `BACK` | 백그라운드 |
| 6 | `MESSAGEOFFC` | **사무소 브로드캐스트** (`SendManagerUs`) — CID/발신 릴레이의 핵심 |
| 7 | `MESSAGESPIDER` | 시스템 메시지 (`SendSystemMessage`) |

### 3.3 본문 필드 구분자 `:` 와 태스크 코드

`MESSAGE`/`MESSAGEOFFC` 본문은 `':'`로 split한 위치 필드다 (`ReceiveMessage` 라인 1463 `packet.msg.Split(':')`):

```
[0] TaskCd  [1] Offc_Id  [2] User_Id(LoginID)  [3] By_Name(OffcName)  [4] LoginName
[5] MainId  [6] SubId    [7] Msg               [8] rOffcId            [9] yyyyMMddHHmmss
```

주요 TaskCd (전화 관련):

| TaskCd | 의미 | 처리 |
|--------|------|------|
| **MC** | 착신 알림(MyCall) | 같은 office_id·다른 LoginID PC → `frmMyCall` 팝업 (라인 1583) |
| **FC** | 발신 요청(For Call) | 마스터 PC가 수신 → `MakeACall` (라인 1518) |
| MR | 녹음 폼 열기 | `openRecordForm` |
| MF | 착신전환 폼 | `openMyCallForward` |
| C1/C2/C4 | 고객 등록/수정 | 고객 팝업 |
| E1/E2/E4/ER | 매물 | 매물 상세 팝업 |
| OR/WR/RR/NR/DR | 신규매물/공동중개/노트/계약 알림 | 각 팝업 |
| SQ/SR/SM/SN… | 시스템 공지/강제로그아웃 | `frmSystemMessage`/`Notice` |

> 착신 시 마스터 PC가 `m_MyCallRecv`에서 `MC:` 문자열을 만들어 `SendManagerUs`로 서버에 올리고, 서버가 같은 office 세션들에 relay → 각 PC `ReceiveMessage`가 `MC`를 받아 팝업. 이것이 "한 대에서 감지 → 사무소 전체 팝업" 메커니즘이다.

---

## 4. 통화 이력 서비스 (레거시 서비스ID → 모던 매핑)

레거시는 `APClient.setServiceID(...)` 로 서버 트랜잭션을 호출한다. CTI 관련 서비스ID 전수:

| 레거시 서비스ID | 위치 | 역할 | 모던 REST 매핑 | DB 쓰기 |
|----------------|------|------|----------------|---------|
| `MCDS004Q01` | frmMain `MyCallExecute` | 사무소 전화회선 설정 로드(Phne_Clsf/Id/Pwd/Dlgt_Yn/Inter_No) | `GET /cti/lines` | (읽기) `CtiLine` |
| `MCLS002I01` | frmMain `m_MyCallRecv`, `m_MyCallSms` | **착신 이벤트 INSERT + 고객/타사무소 lookup** | `POST /cti/calls/incoming` | `CallEvent` INSERT + 조회 |
| `MCLS002I02` | frmMyCall `spbConsultAdd_Click` | 착신 팝업에서 상담 저장(신규고객+상담) | `POST /consultations` (+contact upsert) | `Contact`,`Consultation` |
| `MCLS002I04` | MyCall `m_MyCallDialResult` | **발신 이벤트 INSERT** | `POST /cti/calls/outgoing` | `CallEvent` INSERT |
| `MCDS001U01` | frmMain `m_MyCallBack` | 통화종료/수신상태(Rcpt_Stat) 갱신 | `PATCH /cti/calls/:id` | `CallEvent` UPDATE |
| `MCDS001U02` | frmMyCall `MyCall_FormClosing` | 팝업 닫힘 시 Cust_Id/Calr_Name 매핑 확정 | `PATCH /cti/calls/:id/link` (명시적 버튼) | `CallEvent` UPDATE ⚠️6장 |
| `MCDS001D01` | MCLS002Q1M `MycallDelete` | 통화이력 삭제 | `DELETE /cti/calls/:id` (soft-delete 권장) | `CallEvent` soft delete |
| `MCLS001Q01` | MCLS002Q1M `MycallSearch`/`getTaskData` | 통화이력 목록/기간 검색 | `GET /cti/calls` (page, from, to, q) | (읽기) |
| `MCDS001Q01` | frmMyCall `checkHappySend` | 행복문자 기발송 여부 조회 | (SMS 기능 제외 — 6장) | — |
| `MCDS001I01` | HappyAlert | 행복문자 발송 기록 INSERT | (SMS 기능 제외) | — |
| `MCLS002Q01` | frmMyCall `doSearch` | 착신번호로 고객/사무소/문서/통화/상담 통합조회(4 그리드) | `GET /cti/lookup?phone=` | (읽기) |
| `MCLS002Q02` | ucCust/ucMyEsta/ucOccu/… `roadDetailInfo` | 6개 상세탭 데이터(매물/고객알림/계약/입주/문서/고객) | `GET /cti/lookup/:type/:targetId` | (읽기) |
| `MCDS002Q05` | frmMain `getLguFullNumberCheck` | LGU 내선(Inter_No)→전체번호 매핑 | `GET /cti/lines/resolve-internal` | (읽기) |
| `MCDS002Q06` | ucPhoneHistory | 번호별 통화이력 미니뷰 | `GET /cti/calls?phone=` | (읽기) |
| `CIDS003Q01` | MyspiderMessage `checkMainConnect` | 마스터PC 접속 확인 | `GET /cti/master/status` | (읽기, Redis presence) |
| `CIDS002I01`/`CIDS003I01`/`CIDS005U01`/`CIDS006*`/`CIDS007*`/`CIDS008Q01`/`CIDS009~011*` | frmMain 각처 | 회선/세션/설정 등록·조회(관리성) | `/cti/lines`, `/cti/config` CRUD | `CtiLine`,`CtiConfig` |

> 핵심 4개: **착신 INSERT=MCLS002I01, 발신 INSERT=MCLS002I04, 상태 UPDATE=MCDS001U01, 목록=MCLS001Q01**.

---

## 5. 통화 → 업무(비즈니스) 연결

`MineCall/frmMyCall.cs`가 착신 팝업이며, 번호를 CRM 엔티티에 연결하는 허브다.

- **통합 조회(`doSearch`, MCLS002Q01)**: 착신번호(`Tel_No` 평문 + `EnTel_No` 암호화)로 4개 그리드 반환 — (0)타사무소 정보, (1)상담이력, (2)통화이력, (3)전화별칭. 결과에 따라 라벨을 "중개사무소 / 기존고객 / 신규고객"으로 분기.
- **6개 상세탭(`changeSelectInfo` + MCLS002Q02)**: 선택 고객의 `Gubun`에 따라 UserControl 로드 —
  - `E1` `ucMyEsta`(내 매물), `E2` `ucCustAlert`(고객알림/희망조건), `E3` `ucEstaCont`(계약), `E4` `ucOccu`(입주/거래), `DM` `ucDocu`(문서), default `ucCust`(고객). 각각 `roadDetailInfo(targetId, custId, cid)`로 `MCLS002Q02` 호출.
- **상담 추가(`spbConsultAdd_Click`, MCLS002I02)**: 팝업에서 바로 신규고객 생성 + 상담 저장 + `MyspiderMessage.SendMessage("C1"/"C2")`로 사무소에 전파.
- **매물/고객 등록 진입(`CustomePopup`)**: 매매/전세/월세/매수/투자/사무소 버튼 → `MEDS001Q1P`(매물) 또는 `CMLS001P1M`(고객) 폼으로 전환.
- **발신/문자(`lblPhneCall_Click`/`lblSMS_Click`)**: `Common.callDialForm` / `callMessageSendForm`.
- 모던 매핑: 착신 팝업은 `phoneNumber`로 `GET /cti/lookup` 한 번 호출 → Contact / BuyerRequirement / Property·Listing / Consultation / Deal 을 탭으로 표시. "상담 추가"는 기존 `POST /consultations` 재사용(`callRecordingId` 대신 `callEventId` 연결 필드 추가).

---

## 6. 보안 — 절대 재현하지 말 것 (정적분석 결과)

레거시의 다음 결함은 모던 설계에서 **명시적으로 제거/수정**한다.

1. **평문 TCP (TLS/MAC 없음)** — `Packet` 바이너리는 암호화·무결성·인증 태그가 전혀 없다. 임의 클라이언트가 `MESSAGEOFFC`로 `MC`/`FC`를 위조해 다른 사무소에 팝업을 띄우거나 임의 발신을 유발할 수 있다. → **모던: WSS/TLS + 사무소 스코프 토큰 + 서버측 office_id 강제.**
2. **하드코딩 공유 프로바이더 자격증명** — `MyCall.cs` 라인 50~52: Wyz OpenAPI `corpid="myspider"`, `corppwd="maker5000!"` 가 소스에 박제. 디컴파일로 그대로 노출. → **모던: 서버 보관(KMS/시크릿 매니저), 클라이언트로 절대 미전송.**
3. **복호화된 전화 비밀번호를 평문 DataTable에 상주** — `MyCallExecute`가 `Common.Decrypt(Phne_Pwd)`를 `dtPhone["PhonePassword"]`에 담아 메모리에 계속 보관하고, `MakeACall`/`CallForwarding`이 그대로 HTTP 파라미터로 사용. → **모던: 회선 비번은 서버만 보관, 발신은 서버가 프로바이더 호출(또는 브리지가 서버에서 단기 토큰 수령). 렌더러/DataTable에 비번 미보관.**
4. **팝업 표시가 SMS 자동발송 부작용** — `frmMyCall.MyCall_Shown` → `HappySMSSend()`가 착신 팝업이 뜨는 것만으로 조건 충족 시 "행복문자"(HappyAlert)를 자동 발송. 표시(read)와 발송(side-effect)이 결합. → **모던: 팝업은 순수 표시. 어떤 자동 발신/발송 부작용도 없음. SMS는 Phase 1 범위 밖(사용자 명시 액션만).**
5. **팝업 닫힘이 DB write** — `MyCall_FormClosing` → `MCDS001U02`로 Cust_Id/Calr_Name을 무조건 저장. 실수로 잘못된 고객이 포커스된 채 닫으면 오매핑 저장. → **모던: 링크는 명시적 "이 고객으로 연결" 버튼에서만. 닫기는 no-op.**
6. **번호 암호화가 조회 인덱스와 충돌** — `Calr_No`(enc)와 `Tel_No`(평문)를 동시 저장하는 우회는 평문 번호가 결국 평문 컬럼에 남음. → **모던: 번호는 정규화 저장 + DB 레벨 암호화/접근제어로 일원화, 조회는 정규화 값 인덱스.**
7. **KT/LGU 32bit ActiveX 프로세스 내장** — 신뢰경계 없이 렌더러 프로세스와 동일 권한. → **모던: 프로바이더 SDK는 격리된 브리지(또는 32bit helper)로 분리, IPC는 로컬 인증 채널.**

---

## 파트 B — 모던 설계 (Estate ERP)

목표 구조(`docs/ARCHITECTURE.md` §5):
```
전화 수신 → 프로바이더 → CTI Bridge(apps/cti-bridge) → (보안 채널) → NestJS(/cti) → socket.io → 전 직원 앱
```

## 7. (a) cti-bridge 프로세스 설계 (`apps/cti-bridge`, 신규)

현재 비어있음. TypeScript/Node 단일 실행형(마스터 PC 상주). 32bit COM/ActiveX 프로바이더는 별도 helper로 분리.

```
apps/cti-bridge/
  src/
    index.ts                 # 부트스트랩, 설정 로드, 서버 연결
    config.ts                # 브리지 토큰, serverUrl, officeId, 활성 프로바이더 목록
    server-link.ts           # 서버로의 보안 업링크 (WSS + 토큰) — 레거시 TCP 대체
    normalize.ts             # 번호 정규화 (82→0, <3자리 Private, - 제거) — 레거시 m_MyCallRecv 규칙
    dedup.ts                 # 채널/시퀀스 기반 중복 억제 (레거시 sKTPreChannel/sLGUPreChannel)
    provider-manager.ts      # 어댑터 로드/생명주기/상태 브로드캐스트
    providers/
      provider.interface.ts  # CtiProvider 인터페이스 (11장)
      serial.adapter.ts      # 코드 10: node-serialport 직접 (Node 네이티브 가능)
      lgu.adapter.ts         # 코드 70: Centrex REST(clickdial) 직접 + CID는 native-helper 필요
      samsung.adapter.ts     # 코드 50: palette HTTPS 직접 + CID는 native-helper 필요
      kt.adapter.ts          # 코드 41: KTPCBizX → 32bit helper 필수
      multicid.adapter.ts    # 코드 20/30: multicid.ocx → 32bit helper 필수
    native-helper/           # 32bit COM/ActiveX 브릿지 (별도 프로세스)
      README.md              # C#/.NET 32bit 또는 edge-js. stdin/stdout JSON-lines IPC
```

- **로컬 배치**: 마스터 PC에서 상주. Electron 메인이 자식 프로세스로 스폰하거나 독립 Windows 서비스. Electron 메인과는 로컬 IPC(선택), 서버와는 직접 WSS 업링크.
- **직접 서버 업링크 권장**: 레거시는 "브리지→Electron→서버" 였으나, 모던은 브리지가 서버에 직접 WSS로 붙는다(브리지 자체가 인증 클라이언트). Electron은 표시만 담당 → 결합도↓, 위조표면↓.
- **상태 관리**: 각 어댑터 연결 상태를 `cti.line.status` 이벤트로 서버에 보고(레거시 `m_MyCallMessage`의 회선 상태 라벨 대체).

## 8. (b) 브리지 ↔ 서버 프로토콜 (평문 TCP 대체)

- **전송**: `wss://` (TLS 필수). 레거시 커스텀 바이너리 프레이밍 폐기.
- **인증**: 브리지 전용 시크릿 토큰. 재사용 가능한 API Key 패턴 확장(`apps/server/src/modules/mcp/api-key.service.ts`의 `esk_` 해시 방식) — 신규 접두사 `ctib_`, 스코프 `cti:bridge`, `officeId` 바인딩. 토큰은 서버가 발급, 마스터 PC 설정에만 저장.
- **네임스페이스**: 새 socket.io 네임스페이스 `/cti-bridge` (기존 `/realtime`과 분리; 후자는 브라우저 뷰어용). 핸드셰이크 `auth.token` 검증 → `officeId` 확정, 클라이언트가 보낸 officeId는 신뢰하지 않음.
- **메시지(브리지→서버)**:
  - `cti.call.incoming` `{ providerCode, rawCid, recvNo, channelKey, occurredAt }`
  - `cti.call.answered` / `cti.call.ended` `{ channelKey, endedAt, disposition }`
  - `cti.dial.result` `{ requestId, phoneNumber, success, providerRef }`
  - `cti.line.status` `{ providerCode, connected, message }`
  - `cti.heartbeat` (앱레벨 keepalive; socket.io ping 위에 추가 감시)
- **메시지(서버→브리지)**:
  - `cti.dial.request` `{ requestId, phoneNumber, lineId }` (발신 위임; 회선 자격증명은 서버가 프로바이더에 직접 넣거나 단기 토큰만 전달)
  - `cti.line.reconnect` `{ providerCode }`
- **정규화·dedup은 브리지에서 1차, 서버에서 2차** (idempotency key = `officeId+channelKey`).

## 9. (c) 신규 서버 모듈 `cti` (REST + socket.io 이벤트)

`apps/server/src/modules/cti/` (rules/server.md에 `cti/` 이미 예정됨).

- **Controller/Service (REST)** — 4장 매핑대로:
  - `GET  /cti/lines` (MCDS004Q01), `POST/PATCH/DELETE /cti/lines` (CIDS* 회선관리)
  - `POST /cti/calls/incoming` (MCLS002I01: CallEvent INSERT + lookup 반환) — **브리지 게이트웨이 내부에서 호출**, 사용자 앱에는 미노출
  - `POST /cti/calls/outgoing` (MCLS002I04)
  - `PATCH /cti/calls/:id` (MCDS001U01 상태), `PATCH /cti/calls/:id/link` (명시적 고객연결, MCDS001U02 대체·부작용 제거)
  - `DELETE /cti/calls/:id` (MCDS001D01, soft delete)
  - `GET  /cti/calls` (MCLS001Q01 목록/기간), `GET /cti/lookup?phone=` (MCLS002Q01), `GET /cti/lookup/:type/:id` (MCLS002Q02)
  - `GET  /cti/master/status` (CIDS003Q01, Redis presence)
  - `POST /cti/dial` (사용자 발신요청 → 서버가 브리지에 `cti.dial.request` emit; RBAC 검사)
- **Gateway (socket.io, 기존 `/realtime` 재사용)** — 사용자 앱 브로드캐스트:
  - 서버가 브리지 `cti.call.incoming` 수신 → `CallEvent` 저장 + lookup → `officeRoom(officeId)`에 **`call.incoming`** emit
  - `call.answered`, `call.ended`, `call.dial.result`, `call.line.status`
  - `RealtimeService`에 `emitCallIncoming/emitCallEnded` 추가 (기존 `emitListingUpdated` 패턴).
- **멀티테넌시**: 모든 쓰기 `officeId` 강제, `activity_logs`는 CTI 대량 이벤트로 오염 방지 위해 통화 이벤트 자체는 제외(레거시 광고노트 제외 정책과 동일 취지), 고객 연결 확정만 로깅.

## 10. (d) DB 스키마 추가 (녹음뿐 아니라 착신 이벤트)

기존 `CallRecording`(prisma/schema/call-recording.prisma)은 녹음/STT 중심이라 착신 이벤트를 담지 못한다. 신규 파일 `prisma/schema/cti.prisma`:

```prisma
/// 사무소 전화 회선 (레거시 MCDS004Q01 / Phne_Clsf)
model CtiLine {
  id            String  @id @default(uuid()) @db.Uuid
  officeId      String  @map("office_id") @db.Uuid
  providerCode  String  @map("provider_code")   // "10" "20" "30" "41" "50" "70"
  displayName   String  @map("display_name")
  externalId    String? @map("external_id")     // Phne_Id (회선 계정) — 비번은 저장 안 함(별도 시크릿)
  internalNo    String? @map("internal_no")     // Inter_No
  isDelegate    Boolean @default(false) @map("is_delegate") // Dlgt_Yn
  isMasterOnly  Boolean @default(false) @map("is_master_only")
  isActive      Boolean @default(true)  @map("is_active")
  office        Office  @relation(fields: [officeId], references: [id])
  @@unique([officeId, providerCode, externalId])
  @@map("cti_lines")
}

/// 착신/발신 통화 이벤트 (레거시 MCLS002I01 / I04, MCDS001U01)
model CallEvent {
  id            String   @id @default(uuid()) @db.Uuid
  officeId      String   @map("office_id") @db.Uuid
  direction     String                               // inbound / outbound
  phoneNumber   String   @map("phone_number")        // 정규화된 번호 (82→0, - 제거)
  isPrivate     Boolean  @default(false) @map("is_private") // 발신표시제한
  providerCode  String   @map("provider_code")
  channelKey    String?  @map("channel_key")         // dedup/idempotency (프로바이더 채널|시퀀스)
  status        String   @default("ringing")         // ringing / answered / missed / ended
  detectedByPc  String?  @map("detected_by_pc")      // 감지 PC(마스터) 식별
  contactId     String?  @map("contact_id") @db.Uuid // 명시적 연결 시에만 (MCDS001U02 대체)
  userId        String?  @map("user_id") @db.Uuid    // 응대 직원
  recordingId   String?  @map("recording_id") @db.Uuid // CallRecording 연결(선택)
  occurredAt    DateTime @map("occurred_at")
  endedAt       DateTime? @map("ended_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")
  office        Office   @relation(fields: [officeId], references: [id])
  contact       Contact? @relation(fields: [contactId], references: [id])
  @@index([officeId, occurredAt])
  @@index([officeId, phoneNumber])
  @@unique([officeId, channelKey])   // 중복 착신 억제
  @@map("call_events")
}
```

- `CallRecording.callEventId` (nullable) 추가로 이벤트↔녹음 링크. 회선 비밀번호는 스키마에 두지 않고 별도 시크릿 저장소(또는 `CtiLineSecret` 암호화 컬럼 + 서버 전용 접근).

## 11. (e) Electron 렌더러 착신 팝업 (레거시 부작용 제거)

- 현재 `apps/desktop/.../calls/index.tsx`는 **읽기 전용 뷰어**. 여기에 실시간 착신 오버레이를 추가.
- `RealtimeProvider`(renderer)에 `socket.on('call.incoming', ...)` 추가 → 전역 `IncomingCallOverlay` 컴포넌트 표시(shadcn Dialog/Sheet, 항상 위).
- 오버레이 내용: 번호(표시제한이면 "발신표시제한"), lookup 결과(고객/타사무소/신규), 최근 통화·상담. 액션 버튼: [상담 추가](→`POST /consultations`), [고객으로 연결](→`PATCH /cti/calls/:id/link` 명시적), [발신](→`POST /cti/dial`).
- **금지(6장)**: 팝업이 뜨는 것만으로 SMS/발신/DB write 하지 않음. 닫기는 no-op. 고객 연결은 버튼 클릭에만. 회선 비밀번호 렌더러 미보관.
- `call.ended` 수신 시 오버레이 자동 정리 + `['cti','calls']` 쿼리 invalidate.

## 12. (f) 마스터/워커 PC 역할 처리

- **마스터 지정**: `CtiLine.isMasterOnly`(KT/삼성/LGU ActiveX) 회선은 마스터 PC의 cti-bridge에서만 로그인·CID. 서버는 office당 활성 브리지를 Redis presence로 1개만 인정(레거시 `checkMainConnect`/CIDS003Q01 대체 = `GET /cti/master/status`).
- **워커 발신**: 워커 앱은 항상 `POST /cti/dial` → 서버 → (활성 브리지)`cti.dial.request`. 레거시의 "워커→마스터 FC 위임"을 서버 경유로 승격(위조 불가, RBAC 적용).
- **로컬장치(직렬/멀티CID)**: 물리 장치가 꽂힌 PC의 브리지 인스턴스가 해당 어댑터만 활성화. office당 브리지 1개 원칙이면 마스터 PC에 장치 집중 권장.
- **장애 대응**: 마스터 브리지 끊김 → 서버가 office에 `call.line.status{connected:false}` 브로드캐스트, 앱은 배너 표시(레거시 `frmMyCallMessage` 재연결 UX의 안전한 대체).

## 13. (g) 프로바이더 어댑터 인터페이스 + 통합 방식 평가

```typescript
export interface CtiProvider {
  readonly code: '10' | '20' | '30' | '41' | '50' | '70';
  readonly displayName: string;
  start(lines: CtiLineConfig[]): Promise<void>;   // 로그인/포트 오픈
  stop(): Promise<void>;
  dial(req: { phoneNumber: string; lineId: string; requestId: string }): Promise<DialResult>;
  onIncoming(cb: (e: RawIncoming) => void): void;  // { rawCid, recvNo, channelKey }
  onStatus(cb: (s: { connected: boolean; message?: string }) => void): void;
}
```

- 브리지 코어는 정규화/dedup/업링크만 알고, 어댑터가 프로바이더 세부를 캡슐화.

**Node.js 직접 통합 가능 여부 (프로바이더별):**

| 코드 | Node 직접? | 근거 / 필요 조치 |
|------|-----------|------------------|
| **10 직렬** | ✅ 가능 | `serialport` npm으로 COM 직접 오픈. 레거시 파싱("Number:", `[C\r{num}\r]`)을 JS로 이식. **크리덴셜 불필요.** |
| **70 LGU U+** | 발신 ✅ / CID ⚠️ | 발신·착신전환은 `centrex.uplus.co.kr/RestApi/{clickdial,setforward}`가 순수 HTTPS(SHA-512 비번) → Node `fetch` 직접. **하지만 실시간 CID는 레거시가 `AxLGUBaseOpenApi` ActiveX(SendRingEvent) 사용** → REST 폴링/웹훅 대안 여부를 LGU에 확인 필요; 없으면 **32bit native-helper 필요.** |
| **50 삼성 Wyz070** | 발신·착신전환 ✅ / CID ⚠️ | 발신·전환은 `palette.samsung070.com` HTTPS → Node 직접. **CID는 `Samsung070.dll` P/Invoke(WndProc)** → 삼성이 서버푸시/웹훅 CID 채널을 제공하면 Node 직접, 아니면 **32bit native-helper 필요.** |
| **41 KT OpenAPI** | ❌ | `KTPCBizX` 32bit COM ActiveX 전용(로그인·CID·SendCTC 모두). Node 직접 불가 → **32bit native-helper(예: .NET Framework 32bit 호스트 + JSON-lines IPC 또는 edge-js) 필수.** |
| **20/30 멀티CID** | ❌ | `multicid.ocx` 32bit ActiveX. Node 직접 불가 → **32bit native-helper 필수.** |

- **native-helper 패턴**: 32bit .NET 콘솔이 COM 이벤트를 받아 `stdout`으로 JSON-lines(`{type:"incoming",rawCid,...}`) 방출, `stdin`으로 dial 명령 수신. 브리지(64bit Node)가 자식 프로세스로 관리. 프로세스 분리로 크래시 격리 + 32/64bit 경계 해결.

---

## 14. 사용자가 결정/제공해야 할 것 (구현 전 필수)

구현을 시작하기 전에 **사용자(사무소/개발 오너)** 가 아래를 결정·제공해야 한다.

1. **어떤 프로바이더를 지원할지** — 실제 사무소가 쓰는 회선(KT 41 / LGU 70 / 삼성 Wyz 50 / 직렬 10 / 멀티CID 20·30) 중 무엇을 Phase 1에 넣을지. 권장 시작: **직렬(10) + LGU/삼성 REST 발신**(Node 직접, 크리덴셜 리스크 낮음).
2. **프로바이더 계정 자격증명** — 각 회선의 계정ID/비밀번호/인증키. ⚠️ 레거시의 하드코딩 공용 자격(`corpid=myspider`)은 사용 불가/불법 소지 → **사무소 자체 계약 계정** 필요:
   - KT: OpenAPI 인증키(`sKTPAuthKey`)·서버타입, KTPCBizX SDK 라이선스.
   - 삼성 Wyz: `corpid/corppwd`(사무소 발급) + 회선 `userid/userpwd`. CID 실시간 채널(웹훅/서버푸시) 제공 여부 확인.
   - LGU U+: Centrex 계정 + CID 실시간 채널(ActiveX 외 대안) 제공 여부 확인.
3. **CID 실시간 수신 채널(50/70)** — 삼성·LGU가 ActiveX 없이 서버푸시/웹훅으로 CID를 주는지. 없으면 32bit native-helper 개발 범위 확정.
4. **마스터 PC 지정** — office별 어느 PC를 상시 상주 마스터(브리지 호스트)로 할지. 물리 CID 장치(직렬/멀티CID) 연결 위치.
5. **32bit native-helper 개발 언어** — .NET Framework 32bit 콘솔(권장, 레거시 COM 재사용) vs edge-js. KT/멀티CID 지원 시 필수.
6. **브리지 인증/배포** — 브리지 토큰 발급·저장 방식(Electron 설정 vs Windows 자격증명 관리자), 자동시작(서비스 vs Electron 자식 프로세스), 자동 업데이트 포함 여부.
7. **회선 비밀번호 저장 위치** — 서버 시크릿 매니저(권장) vs 암호화 DB 컬럼. 발신을 서버가 대행할지 브리지가 단기 토큰으로 할지.
8. **SMS/행복문자 범위** — Phase 1에서 SMS 자동발송은 제외 확정(6장). 필요 시 별도 명시적 기능으로 후속.
9. **통화 녹음 연계** — 착신 이벤트(`CallEvent`)와 기존 `CallRecording`/STT 파이프라인 연결 시점(Phase 1 링크만 vs Phase 2 자동 녹음업로드).

---

## 15. 단계별 작업 분해 (Phased Plan)

**Phase 0 — 기반 (서버·스키마)**
- `prisma/schema/cti.prisma` 추가(`CtiLine`, `CallEvent`) + `CallRecording.callEventId` + migration.
- `apps/server/src/modules/cti/` 모듈: REST(4장 매핑) + `RealtimeService.emitCallIncoming/emitCallEnded`.
- 브리지 인증: `ctib_` 토큰(api-key.service 확장) + `/cti-bridge` 게이트웨이(WSS, officeId 강제).
- `packages/api-client`에 `cti` 모듈(calls list/lookup/dial/link 타입) 추가.

**Phase 1 — 브리지 스켈레톤 + 직렬(10)**
- `apps/cti-bridge` 스캐폴드(config, server-link WSS, normalize, dedup, provider-manager).
- `serial.adapter.ts`(serialport) — Node 직접, 크리덴셜 불필요로 E2E 검증 최적.
- 브리지→서버 `cti.call.incoming` → `CallEvent` 저장 → `/realtime` `call.incoming` 브로드캐스트.

**Phase 2 — 렌더러 착신 팝업**
- `IncomingCallOverlay` + `RealtimeProvider`에 `call.incoming/ended` 구독.
- `GET /cti/lookup` 연동, [상담추가]/[고객연결]/[발신] 버튼(부작용 없는 안전 설계).
- `calls/index.tsx`에 `CallEvent` 목록 통합(기존 녹음뷰와 병합).

**Phase 3 — REST 프로바이더(발신) + 마스터/워커**
- `lgu.adapter`/`samsung.adapter` 발신(HTTPS 직접) + 착신전환.
- `POST /cti/dial` → 브리지 위임, `GET /cti/master/status`(Redis presence), 워커 발신 경로.

**Phase 4 — 32bit native-helper (KT/멀티CID, 필요 시)**
- native-helper 프로세스(.NET 32bit) + JSON-lines IPC, `kt.adapter`/`multicid.adapter`.
- 삼성/LGU CID 실시간 채널 확정 후 CID 경로 완성.

**Phase 5 — 마감**
- 회선 상태 배너(`frmMyCallMessage` 대체), 감사로깅(고객연결만), 통화↔녹음 연계, 자동업데이트/서비스 등록.

---

## 부록 — 레거시 식별자 색인 (verbatim)

- 오케스트레이터: `frmMain.cs` — `MyCallExecute`, `m_MyCallRecv`, `m_MyCallBack`, `MakeACall`, `m_MyCallMessage`, `m_MyCallSms`, `sendMyspider`, `SendManagerUs`, `ReceiveMessage`, `MessageTextLog`, `checkMainConnect`.
- 프로바이더 UC: `ucBaeDal.cs`(`serialPort_DataReceived`,`BaeDalCallEvent`), `ucSunPo.cs`(`axMulticid1_CidMsgRx`,`SunPoCallEvent`,`AxMulticid`), `ucWyz.cs`/`ucWyz2.cs`(`WndProc` `WM_070_CID` 1109/1124, `Samsung070.dll`), `WyzCallEventHandler`/`WyzStateEventHandler`/`WyzSmsEventHandler`.
- LGU/KT(frmMain 내): `axLGUBaseOpenApi_SendRingEvent`/`SendChannelListEvent`/`SendLoginResultEvent`, `KTOpenApi_EventCID`(sResult "201"/"407"), `KTOpenApi.SendCTC`, `getLguFullNumberCheck`.
- 통신 프로토콜: `Packet.cs`(Encode/Decode, int16 BE len), `StateObject.cs`, `MSG_CODE.cs`(HEART_BEAT/MESSAGE/INFO/MESSAGEOFFC/MESSAGESPIDER…), `READ_MODE`.
- 프로바이더 API: `CommModule/MyCall.cs` — `m_Wyz070OpenAPI`(palette.samsung070.com), `m_LGU070RestAPI`(centrex.uplus.co.kr, SHA-512), `m_MyCallDialResult`(MCLS002I04), `getMyCallComp`, 하드코딩 `corpid="myspider"/corppwd="maker5000!"`.
- 착신 팝업: `MineCall/frmMyCall.cs` — `doSearch`(MCLS002Q01), `changeSelectInfo`(6탭, MCLS002Q02), `spbConsultAdd_Click`(MCLS002I02), `HappySMSSend`⚠️, `MyCall_FormClosing`(MCLS002U02)⚠️, `CustomePopup`.
- 이력 화면: `MineCall/MCLS002Q1M.cs` — `MycallSearch`(MCLS001Q01), `MycallDelete`(MCDS001D01), `MycallView`.
- 발신 UI: `CommModule/popup/PhoneDialPAD.cs`(`btnCallSend_Click` → `SendMessage("FC",...)`).
- 착신전환: `Manager/CallForwarding.cs`(`m_Wyz070OpenAPI` "003/005", `m_LGU070RestAPI` "setforward/stopforward").
