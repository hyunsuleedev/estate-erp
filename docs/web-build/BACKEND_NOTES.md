# 백엔드 P0 변경 사항 — UI 구현 시 반영할 것 (2026-06-10)

## 새 Listing 필드 (DB·서버·MCP 반영 완료, api-client 타입은 properties 담당 에이전트가 추가)
- `maintenanceFee Int?` — 관리비 (만원). 목록/상세/폼에 노출.
- `maintenanceFeeIncludes String[]` — 포함 항목 slug 8종. 라벨: shared `MAINTENANCE_FEE_INCLUDE_LABELS` (수도/전기/가스/인터넷/TV/청소/주차/난방). 칩 멀티선택 UI.
- `loanAmount Int?` — 융자금/근저당 (만원). 전세 매물에서 중요 (깡통 위험).
- `premium Int?` — 권리금 (만원). 상가(commercial) 매물에서만 폼 노출.
- `privateMemo String?` — 내부 전용 메모. **네트워크 공유·외부 노출 절대 금지** (서버가 MCP에서 redact). UI에서 자물쇠 아이콘 + "내부 전용" 표시.

## 거래유형 yearly_rent (연세) 추가
- shared `TransactionType.YEARLY_RENT` + `TRANSACTION_TYPE_LABELS` 사용.
- 연세는 `price` 필드에 **연간 임대료 총액(만원)** 저장. 폼 라벨: "연세 (연간 총액)".
- status-config.ts에 이미 등록됨 (연세=violet).
- Deal.agreedPrice = 연세액. 수수료 환산: 보증금 + (연세/12)×100.

## User.licenseType / licenseNo
- shared `UserLicenseType` + `USER_LICENSE_TYPE_LABELS`: broker_owner=개업공인중개사, broker_associate=소속공인중개사, assistant=중개보조원.
- 직원 관리·설정 페이지에서 입력/표시. 중개보조원은 계약서 서명 불가 신분임을 직원 카드에 표시.

## 수수료 계산 (packages/shared/src/commission.ts)
- `calculateCommissionAmount(transactionType, baseAmount, propertyKind?)` — propertyKind: 'housing'|'officetel'|'non_housing' (기본 housing).
- `siteTypeToCommissionKind(siteType)` 헬퍼로 Site.type→kind 자동 추론.
- **업무용 오피스텔은 자동 판별 불가** — 수수료 계산기 UI에 propertyKind 수동 토글(주택 요율/오피스텔/주택외 0.9% 협의) 필요.
- `getLegalMaxRate`는 {rate, cap} 반환 — UI에서 "법정 상한 0.4% (상한 80만원)" 안내 표시.
- 서버는 Deal 생성 시 CommissionPayment를 자동 생성함 (siteType 기반 kind 자동 적용).

## 다가구(house) 호실 허용
- house 타입 Site도 이제 Dong/Unit 생성·연결 가능 (land만 금지). house는 통건물 Property와 호실 Property 둘 다 허용.
- 단지/호실 UI에서 house 타입에도 호실 그리드·동/호 추가 버튼 활성화.
- placeholder Dong 자동 생성은 서버에 없음 — 빌라 등록과 동일한 클라이언트 경로 사용.

## Property.memo는 DB에서 제거됨
- `property.memo` 참조 금지. 의뢰 메모는 ListingIntake의 viewingMemo/rightsMemo/fieldMemo/memo 사용.

## 새 Rule: transaction_report_deadline (거래신고 기한 알림)
- Proposal type `transaction_report_deadline` 생성됨 (D+20 normal, D+25/기한경과 urgent, create_task 액션).
- 업무함(inbox)/AI운영 페이지에서 이 type 카드 렌더링 + Rule 목록 표시 필요.
