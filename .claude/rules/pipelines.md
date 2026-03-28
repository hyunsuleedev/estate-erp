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
selection   매물 선정
→ deposit   계약금 입금
→ contract  계약 체결
→ completed 잔금/이전 완료
→ closed    거래 종료
```

- Deal 생성 시 `matchId` 연결 필수
- contract 단계에서 Contract 레코드 생성
- completed 시 Property.checkStatus → 'done'

## 매물 확인 상태 (Property.checkStatus)

```
unverified   미확인 (기본값)
→ verified   확인 완료 (직접 확인)
→ in_contract 계약 진행 중
→ hold       보류
→ done       완료/거래종료
```

- `isHidden = true`이면 목록에서 미표시 (삭제 대신 숨김)
