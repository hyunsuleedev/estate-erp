# @estate-erp/cti-bridge

마스터 PC에 상주하는 CTI Bridge 프로세스. 사무소 전화 프로바이더의 착신(CID)을 감지해
서버로 릴레이하고, 서버가 위임한 발신을 실행한다.

```
전화 착신 → 프로바이더 어댑터 → 정규화/dedup → WSS(/cti-bridge) → NestJS
          → CallEvent 저장 + lookup → /realtime 'call.incoming' → 전 직원 앱 팝업
```

레거시(MySpider V2) 이관 스펙: `docs/desktop-prd/migration/cti-cid-legacy-spec.md`

## 실행

```bash
# 1. 서버에서 브리지 토큰 발급 (owner/manager 계정)
#    POST /cti/bridge/token  →  ctib_... 토큰 (1회만 노출)

# 2. 환경변수 설정 후 실행
CTI_BRIDGE_TOKEN=ctib_xxx CTI_SERVER_URL=http://localhost:3000 pnpm --filter @estate-erp/cti-bridge start
```

| 환경변수 | 필수 | 설명 |
|----------|------|------|
| `CTI_BRIDGE_TOKEN` | ✅ | `POST /cti/bridge/token`으로 발급한 ctib_ 토큰 |
| `CTI_SERVER_URL` | | 기본 `http://localhost:3000` |
| `CTI_ENABLED_PROVIDERS` | | 쉼표 구분 코드 필터 (예: `41,20,70`). 미설정 시 서버가 내려준 회선 전부 |
| `CTI_KT_HELPER_PATH` | KT 사용 시 | 32bit native-helper exe 경로 |
| `CTI_MULTICID_HELPER_PATH` | 멀티CID 사용 시 | 32bit native-helper exe 경로 |
| `CTI_LGU_BASE_URL` | | 기본 `https://centrex.uplus.co.kr/RestApi` |

## 프로바이더 현황 (Phase 1)

| 코드 | 이름 | 착신(CID) | 발신 | 방식 |
|------|------|-----------|------|------|
| 41 | KT OpenAPI | native-helper (COM TODO) | native-helper (COM TODO) | 32bit KTPCBizX |
| 20/30 | 멀티CID (선포/골드) | native-helper (OCX TODO) | native-helper (OCX TODO) | 32bit multicid.ocx |
| 70 | LG U+ Centrex | ❌ (ActiveX 대안 확인 중) | ✅ REST clickdial | HTTPS |
| 10 | 직렬 CID 박스 | 미구현 (어댑터 인터페이스 준비됨) | — | node-serialport |
| 50 | 삼성 Wyz070 | 미구현 | 미구현 | HTTPS + DLL |

- KT/멀티CID의 COM/OCX 실제 통합은 SDK 설치본이 필요하다 — `native-helper/README.md` 참고.
- LGU clickdial의 정확한 요청 파라미터명은 LGU Centrex OpenAPI 문서와 대조 확인 필요
  (`src/providers/lgu.adapter.ts`의 TODO).

## 보안 설계 (레거시 결함 제거 — 스펙 §6/§8)

- 평문 TCP → **WSS + ctib_ 토큰**. officeId는 서버가 토큰에서 확정.
- 자격증명 하드코딩 금지 — 회선 자격증명은 서버 DB에 AES-256-GCM 암호화 저장,
  브리지에는 접속 시(CID 로그인용) / 발신 위임 시에만 메모리 전용 전달.
- 착신 팝업 표시에 어떤 부작용(SMS 발송, DB write)도 없음.

## 테스트

```bash
pnpm --filter @estate-erp/cti-bridge test        # node:test (정규화/dedup)
pnpm --filter @estate-erp/cti-bridge typecheck
```
