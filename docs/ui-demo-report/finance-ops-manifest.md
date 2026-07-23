# Estate ERP 재무·운영 UI 데모 매니페스트

- 범위: route 27–39, 총 13개 화면
- 공통 기준: `master-estate-operational-system.png`의 warm-light shell, 216px sidebar, 48px header, 14px 본문, 고밀도 행, 1px 경계선, 6px radius, 최소 shadow
- 설계 원칙: Attio의 record clarity, Linear의 정렬·상태 완성도, 도메인별 검증된 workspace 패턴을 Estate ERP 데이터 모델에 맞게 재구성
- 상태 표현: 색상 단독 사용 금지. 아이콘·문구·선/배경을 함께 사용
- 이미지 생성: built-in ImageGen, 각 결과 직접 `view_image` QA. 34·35·39는 최종 16:10 프레이밍으로 재생성

## Route / 이미지 매핑

| 번호 | Route | 제목 | Recipe | 이미지 |
|---:|---|---|---|---|
| 27 | `/cashflow` | 캐시플로우 | Forecast + weekly ledger + event rail | `assets/screens/deals-ops/27-cashflow.png` |
| 28 | `/cashflow/ledger` | 수금 원장 | Receivable table + selected-row inspector | `assets/screens/deals-ops/28-ledger.png` |
| 29 | `/cashflow/partner-commissions` | 공동중개 수수료 | Partner settlement ledger + approval inspector | `assets/screens/deals-ops/29-partner-commissions.png` |
| 30 | `/cashflow/employee-settlements` | 직원 정산 | Employee roster + settlement worksheet + evidence rail | `assets/screens/deals-ops/30-employee-settlements.png` |
| 31 | `/cashflow/my-settlement` | 내 수수료 | Personal statement + payout timeline + calculation rail | `assets/screens/deals-ops/31-my-settlement.png` |
| 32 | `/cashflow/expenses` | 고정비 설정 | Recurring-cost ledger + inline configuration inspector | `assets/screens/deals-ops/32-expenses.png` |
| 33 | `/network` | 중개 네트워크 | Room list + conversation + shared-property context | `assets/screens/deals-ops/33-network.png` |
| 34 | `/partner-brokers` | 파트너 중개사 | Partner directory + relationship record | `assets/screens/deals-ops/34-partner-brokers.png` |
| 35 | `/employees` | 직원 관리 | Employee directory + access/operations record | `assets/screens/deals-ops/35-employees.png` |
| 36 | `/service-vendors` | 협력업체 | Service-vendor directory + compliance record | `assets/screens/deals-ops/36-service-vendors.png` |
| 37 | `/documents` | 자료실 | Document list + A4 preview + metadata inspector | `assets/screens/deals-ops/37-documents.png` |
| 38 | `/documents/photos` | 사진 자료 | Capture-date gallery + bulk toolbar + asset inspector | `assets/screens/deals-ops/38-photos.png` |
| 39 | `/settings` | 설정 | Category nav + 720px form + key/audit ledger | `assets/screens/deals-ops/39-settings.png` |

## 페이지별 구현 요약

| 번호 | 목적 / 필수 요소 | 참고 제품 | 채택 구조 | 대안 A | 대안 B | 구현 유의점 |
|---:|---|---|---|---|---|---|
| 27 | 90일 현금 잔액과 계약금·중도금·잔금·수수료·고정비를 한 화면에서 예측. 예정/확정/수금/미수/지출/정산, Deal·Contract 링크, 주별 subtotal, 증빙 이벤트 필수 | Xero, Bigcapital, Attio | 상단 단일 KPI strip → stepped forecast chart → 주별 matrix ledger, 우측 현금 이벤트 rail | 월간 캘린더 cash events | Deal별 waterfall | 금액은 만원 저장값을 원화 표시로 변환. 확정 실선/예정 점선. 우측 이벤트와 표 행은 동일 ID를 공유하고 overdue 계산은 서버 기준일 사용 |
| 28 | 청구·수금·미수·환불의 원장과 분할 수금 근거 추적 | Bigcapital, Xero, Attio | 날짜별 subtotal을 갖는 receivable table + 350px 수금 상세 inspector | 고객별 계정 원장 | 월별 매트릭스 | `Deal`/`Contract`가 source of truth. 청구액−수금액=미수액 불변식, 증빙·세금계산서·변경 이력 연결. 부분수금은 별도 payment child row 권장 |
| 29 | 공동중개 파트너별 받을/지급 수수료, 배분·부가세·승인·세금계산서 관리 | Ramp, Xero, Attio | 파트너/거래 settlement ledger + 우측 commission equation·승인 timeline | 파트너별 grouped account | 거래 단위 split canvas | 매도측/매수측 수수료를 합치지 말 것. `isJointBrokerage`, partnerCommission, VAT, 세금계산서 상태 분리. 승인 후 계산식 version lock |
| 30 | 직원별 거래 참여 역할과 수수료 배분·조정·공제·정산 승인 | Bigcapital, Ramp, Attio | 좌측 직원 roster + 중앙 worksheet + 우측 계산 근거/감사 rail | 직원별 월간 payslip | Deal participant matrix | `DealParticipant` 역할/배분과 `Office.commissionConfig` version을 저장. 3.3% 원천징수 및 수동 조정은 사유·검토자 필수. 확정 후 append-only correction |
| 31 | 개인 중개사가 자신의 수익, 공제, 지급일과 계산 근거를 투명하게 확인 | Xero, Attio | 개인 statement KPI + payout timeline + 지급일별 deal rows + 우측 계산 상세 | 월별 compact payslip | 목표 대비 earnings dashboard | 관리자 화면보다 권한을 축소. 본인 데이터만 조회. 계산 문의는 원장 수정이 아니라 immutable inquiry/activity로 기록 |
| 32 | 반복 고정비를 설정하고 cashflow forecast에 자동 반영 | Ramp, Xero | 분류별 recurring-cost ledger + 우측 편집 form·3회 지급 preview | 월간 expense calendar | category budget tree | 반복 규칙, 다음 지급일, VAT, 자동 반영/승인 필요를 분리. 반복비 수정 시 과거 지출 변경 금지, 미래 schedule만 재계산 |
| 33 | 중개사 네트워크 방, 메시지, 공유 매물·문의 context를 동시에 처리 | Chatwoot, Intercom, Attio | 310px 방/문의 목록 + 620px 대화 + 410px 공유매물·문의 context | inquiry-first inbox | shared-property board + thread drawer | Socket.io optimistic message와 서버 ack 분리. 공유 만료/소유자 동의/출처 표기 필수. 원본 Property 접근권한과 NetworkSharedProperty 공개 필드 분리 |
| 34 | 파트너 중개사 관계, 지역, 공동중개, 응답, 정산·서류 상태 관리 | Ramp vendors, Attio records | 고밀도 partner directory + 우측 relationship inspector | 지역별 map directory | partner profile full page | 일반 협력업체와 모델·권한 분리. Network room, Deal, settlement를 직접 링크. 사업자 서류 갱신·응답 SLA는 계산 필드로 제공 |
| 35 | 직원 roster, RBAC, 담당 지역, 거래·업무·정산, 보안 상태 관리 | Linear administration, Attio | employee directory + selected record inspector | member cards + access drawer | role-first permissions matrix | `owner/manager/agent` RBAC를 route·action 단위로 표현. 로그인 ID 자동 생성 규칙 유지. MFA/JWT session, 자격증 만료, 권한 변경은 감사 로그 필수 |
| 36 | 법무·이사·청소·인테리어·사진·세무 등 서비스 협력업체와 의뢰·비용·계약·증빙 관리 | Ramp vendors, Attio | service-vendor directory + compliance/profile inspector | category marketplace grid | vendor full page + job tabs | 파트너 중개사와 혼동하지 않도록 업종·의뢰·비용 중심. 서비스 수수료 공개, 개인정보 최소화, 계약/보험/면허 만료 알림 필요 |
| 37 | 계약·매물·고객·정산 문서의 검색, preview, metadata, OCR, version, 보존·감사 | Paperless-ngx, Attio | 620px 문서 목록 + 520px A4 preview + 340px metadata inspector | full-width table + preview drawer | folder tree + preview | S3/R2 object와 DB metadata 분리. checksum/version/retention/permission 저장. 신분증은 마스킹·세밀 권한. Property/Deal/Contract 다중 연결 허용 |
| 38 | 촬영일·매물별 사진 정리, 대표사진·광고 사용, bulk tagging, EXIF/동의 추적 | Immich, Paperless | 촬영일 timeline gallery + sticky bulk toolbar + 우측 asset info | property album grid | map/photo hybrid | 원본/보정본/썸네일 파생 관계 저장. 광고 사용 중 삭제 방지. EXIF 위치는 법정동 주소와 별도 confidence. 대량 선택은 virtualized grid 권장 |
| 39 | 사무소/권한/업무규칙/데이터 연결 설정과 MCP/API 범위·승인·키·감사 관리 | Linear settings, Attio MCP | 좌측 category nav + 중앙 720px settings form + 우측 API key/audit ledger | category full-page form | command-palette settings | 쓰기 권한은 최소 범위, 계약·정산 write는 명시 승인. key secret은 1회만 표시하고 hash 저장. actor/source 규칙과 audit append-only 보장. form dirty-state 이탈 방지 |

## 공통 구현 결정

1. 레이아웃은 `AppShell → PageHeader → SavedViewTabs → Toolbar → MainWorkspace → ContextInspector`로 표준화한다.
2. 표의 선택 상태와 inspector는 URL query 또는 row ID로 연결해 새로고침·딥링크가 가능해야 한다.
3. 금액·기한·승인·증빙·감사 상태는 색상과 별개로 아이콘·명시적 라벨·보조 문구를 제공한다.
4. 복잡한 화면은 카드 중첩 대신 section divider와 column rhythm으로 구분한다.
5. 표·대화·갤러리는 virtualized rendering을 사용하고 inspector data는 선택 후 지연 로딩한다.
6. 모든 고위험 수정은 `ActivityLog.actor`와 `ActivityLog.source`를 기록하고 원천 Deal/Contract/Property 링크를 보존한다.
7. 데스크톱 1440×900을 주 기준으로 하되 1280px 이하에서는 inspector를 drawer로 전환한다.

## QA 결과

| 파일 | 치수 | 비율 | 결과 |
|---|---:|---:|---|
| `27-cashflow.png` | 1586×992 | 1.5988 | 통과 |
| `28-ledger.png` | 1586×992 | 1.5988 | 통과 |
| `29-partner-commissions.png` | 1586×992 | 1.5988 | 통과 |
| `30-employee-settlements.png` | 1586×992 | 1.5988 | 통과 |
| `31-my-settlement.png` | 1586×992 | 1.5988 | 통과 |
| `32-expenses.png` | 1586×992 | 1.5988 | 통과 |
| `33-network.png` | 1586×992 | 1.5988 | 통과 |
| `34-partner-brokers.png` | 1586×992 | 1.5988 | 통과 · 16:10 재생성 |
| `35-employees.png` | 1586×992 | 1.5988 | 통과 · 16:10 재생성 |
| `36-service-vendors.png` | 1586×992 | 1.5988 | 통과 |
| `37-documents.png` | 1586×992 | 1.5988 | 통과 |
| `38-photos.png` | 1586×992 | 1.5988 | 통과 |
| `39-settings.png` | 1586×992 | 1.5988 | 통과 · 16:10 재생성 |

