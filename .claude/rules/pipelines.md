---
paths:
  - "apps/server/src/modules/matches/**"
  - "apps/server/src/modules/deals/**"
  - "apps/server/src/modules/properties/**"
---

# Pipeline Rules

## 매칭 파이프라인 (Match)

구매고객 조건 ↔ 매물 매칭 프로세스.

```
suggested        매칭 제안 (자동/수동)
→ buyerContacted 매수자에게 연락
→ viewing        임장/방문
→ ownerContacted 소유주에게 연락
→ negotiating    가격 협상
→ dealCreated    거래 생성
→ closed         완료
```

- Match 생성 시 반드시 `buyerRequirementId` + `propertyId` 필요
- stage 변경은 순서대로만 진행 (역방향 금지, closed 제외)
- dealCreated 진입 시 Deal 자동 생성

## 거래 파이프라인 (Deal)

```
selection    매물 선정/임장
→ negotiating 조건 협상 (가격/특약 변동)
→ preContract 가계약금 수령 (Contract 아직 없음)
→ contracted  본계약 체결 (Contract 생성 — 계약서 작성 자체가 트리거)
→ settling    중도금/잔금 진행
→ completed   잔금 완료 + 등기이전
→ closed      수수료 정산까지 종료
```

- 취소는 stage 와 직교하는 `isCancelled` flag 로 추적 (stage 는 취소 시점 값 유지)
- `contracted` 이상 stage 는 Contract 레코드가 반드시 존재해야 함 (service layer 강제)
- Deal 합의 조건은 `agreedPrice`/`agreedDeposit`/`agreedMonthlyRent` 에 저장, 변동 이력은 ActivityLog 가 담당
- 실제 돈 흐름(가계약금/계약금/중도금/잔금/환불)은 `DealPayment[]` 의 row 단위 이벤트로 기록
- 계약서 상 명목 금액(`Contract.statedDeposit` / `statedInterimPayment` / `statedBalance`)과 실제 입금(`DealPayment`)은 분리 — 계약서 문구 ≠ 실제 현금 흐름
- 가계약금이 계약금으로 승계되면 `Deal.preContractCarriedOver = true`, 본계약 시점에 `DealPayment(kind='contract')` 생성 안 함
- Deal 생성 시 `matchId` 연결 권장 (실적 역추적)
- completed 진입 시 Listing.checkStatus → 'done'

## 매물 확인 상태 (Property.checkStatus)

```
unverified   미확인 (기본값)
→ verified   확인 완료 (직접 확인)
→ in_contract 계약 진행 중
→ hold       보류
→ done       완료/거래종료
```

- `isHidden = true`이면 목록에서 미표시 (삭제 대신 숨김)
