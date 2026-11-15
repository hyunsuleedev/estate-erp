---
paths:
  - "apps/server/src/modules/matches/**"
  - "apps/server/src/modules/deals/**"
  - "apps/server/src/modules/listing-intakes/**"
  - "apps/server/src/modules/listings/**"
  - "apps/server/src/modules/brokerage-cases/**"
  - "packages/shared/src/enums.ts"
---

# 단계와 상태 규칙

값의 기준은 `packages/shared/src/enums.ts`다. 아래는 값이 아니라 그 뜻과 경계다.

## 의뢰 (ListingIntake)

- 저장하는 것은 생명주기 하나뿐이다: `open ↔ hold`, `open/hold → closed`. 닫을 때는 사유(`closedReason`)를 남긴다.
- 한 Property에 닫히지 않은 의뢰는 하나만 있을 수 있다(DB의 partial unique index).
- **확인 상태**(미확인·확인됨·기한 지남·부재)는 저장하지 않는다. `lastVerifiedAt`, `lastCheckResult`, `nextConfirmAt`에서 계산한다.
- **거래 중·완료**도 저장하지 않는다. 그 의뢰의 취소되지 않은 Deal 단계에서 계산한다.
- 거래 조건 하나만 잠깐 내릴 때는 `Listing.isPaused`, 의뢰 전체를 보류할 때는 `hold`.

## 매칭 (Match)

```
suggested → buyerInterested → viewingConfirmed → viewing → negotiating → dealCreated → closed
```

- 매물을 제안하고 관심 확인, 임장, 협상을 거쳐 거래로 넘길지 판단하는 데까지가 매칭이다. 거래로 넘어가면 매칭의 일은 끝난다.
- 시스템이 자동으로 닫은 매칭(다른 손님이 계약함 등)은 닫은 이유와 그 거래를 기록해 둔다. 그 거래가 취소되면 되살리기 위해서다.

## 거래 (Deal)

```
preparing → preContract(선택) → contracted → settling → completed → closed
```

- 가계약이 없는 거래는 `preparing`에서 `contracted`로 바로 간다.
- 취소는 단계가 아니다. `isCancelled`로 따로 기록하고 단계는 취소 시점 값 그대로 둔다.
- `contracted`에서 Contract를 쓰고, `settling` 이상으로 가려면 Contract가 있어야 한다.
- 실제로 오간 돈은 `DealPayment`(가계약금·계약금·중도금·잔금·환불)의 행으로 남긴다. 계약서에 적힌 명목 금액(`Contract.stated*`)과는 별개다.
- 수수료는 `CommissionPayment`(청구)와 `CommissionDistribution`(사무소 간 분배)이 기준이다. Deal에 합계를 따로 저장하지 않는다.
- 한 의뢰에 진행 중인 거래는 하나만 둔다.
- `Deal.buyerIntakeId`: 매칭에서 넘어온 거래는 서버가 채운다. 매칭 없이 만든 거래(공동중개로 다른 사무소 매물을 살 때)는 사용자가 고르고, 구매 의뢰 없이 바로 계약한 거래는 비운다.

## 중개 건 (BrokerageCase)

- 선택 사항이다. 사용자가 의뢰를 골라 묶을 때만 생기고, 서버가 당사자를 보고 묶지 않는다.
- 건에 담긴 의뢰는 진행 계획에 단계가 하나씩 있다. 담으면 단계가 생기고, 그 단계를 지우면 건에서 빠진다.
- 단계는 매물 의뢰·구매 의뢰·거래 중 하나를 가리키거나 아무것도 가리키지 않는다. 가리키는 대상의 진행 상태와 잔금일은 저장하지 않고 읽어 온다.
- 순서는 사람이 정한다. 순서를 계산하거나 자금 흐름을 계산하지 않는다(사용자 결정, 2026-11-15).
- 단계의 FK는 `(office_id, brokerage_case_id, 의뢰 id)` 조합을 가리킨다. 의뢰의 건을 바꾸면 그 단계가 따라 움직이므로, 의뢰를 건에서 빼거나 옮길 때는 단계의 연결을 먼저 끊거나 지운다.
