# 데이터 구조

영역별로 무엇이 무엇에 달려 있는지와, 코드만 읽어서는 놓치기 쉬운 불변 조건을 적는다.

표와 칸의 목록은 여기 적지 않는다. `prisma/schema/*.prisma`가 기준이고, 칸마다의 이유는 그 파일의 주석에 있다. 이 문서와 스키마가 다르면 스키마가 맞다.

용어의 뜻은 `CONTEXT.md`, 단계 값은 `packages/shared/src/enums.ts`.

## 전체 그림

```
법정동           Province → District → Ward
                                        │ wardCode
장소 (공공/사무소) Site → Dong → Unit
                                  │
매물 쪽           Property → ListingIntake → Listing ─┐
                     │            │                   │
                 PropertyContact  │                 Match → Deal → Contract
                     │            │                   │       ├ DealPayment
사람              Contact ────────┼──────────┐        │       └ CommissionPayment → CommissionDistribution
                     │            │          │        │
손님 쪽           BuyerIntakeContact → BuyerIntake → BuyerRequirement
                                  │          │
묶기 (선택)       BrokerageCase → BrokerageCaseStep (매물 의뢰 | 구매 의뢰 | 거래 | 없음)
```

## 스키마 파일

| 파일 | 담긴 것 |
| --- | --- |
| `master.prisma` | 법정동 (시도·시군구·읍면동) |
| `office.prisma` | 사무소, 직원 |
| `site.prisma` | 단지·동·호, 평형, 사무소 관리 단지 |
| `contact.prisma` | 사람, 전화번호, 그룹, 사람 간 관계, 매물과의 관계, 세입자 |
| `property.prisma` | 매물, 매물 의뢰, 거래 조건, 광고 게재 회차, 가격 이력 |
| `crm.prisma` | 구매 의뢰·희망조건, 상담, 매칭, 거래, 대금, 계약·계약서 문서 |
| `brokerage-case.prisma` | 중개 건, 진행 계획 |
| `finance.prisma` | 수수료 청구·분배·조정, 사무소 고정비 |
| `task.prisma` | 업무, 일정, 변경 기록 |
| `notification.prisma` | 알림 |
| `network.prisma` | 공동 중개망 (방, 공유 매물, 문의, 대화) |
| `partner-broker.prisma` | 공동중개 상대 사무소 주소록 |
| `external-listing.prisma` | 광고노트 (다른 사무소의 외부 광고) |
| `listing-advertisement-snapshot.prisma` | 우리 광고를 CP에서 읽어 와 반영하는 회차 |
| `office-advertisement.prisma` | 우리 광고의 네이버 노출 순위·중복 |
| `call-log.prisma`, `call-recording.prisma` | 통화 사실, 녹음·받아쓰기·제안 |
| `public-document.prisma`, `photo.prisma` | 공적장부, 매물 사진 (파일은 저장소에, DB에는 정보만) |
| `service-vendor.prisma` | 협력업체 |
| `public-listing.prisma`, `consumer-request.prisma` | 소비자 사이트에 내보내는 매물, 소비자 요청 |

## 사무소와 직원

- 법정동을 뺀 모든 업무 데이터는 `office_id`로 사무소에 묶인다. 격리 대상 목록은 `apps/server/src/prisma/prisma.service.ts`.
- `User.auth0Id`가 Auth0 계정과의 유일한 연결이다. `loginId`는 표시와 검색용이다.
- `User.officeId`는 비어 있을 수 있다. 가입만 하고 사무소를 아직 만들지 않은 사장님이다.
- `User.tokensValidAfter`: 이 시각 이전에 로그인한 세션과 그 전에 발급된 토큰을 받지 않는다. 비밀번호 변경, 비활성화, 재설정 때 지금 시각으로 올리고, 뒤로 돌리지 않는다.

## 장소

- Site·Dong·Unit은 `office_id`가 비어 있으면 공공 데이터(모든 사무소가 봄), 값이 있으면 그 사무소만의 데이터다.
- 건물형은 반드시 Site → Dong → Unit이다. 동 구분이 없는 건물은 `isPlaceholder = true`인 Dong 하나를 두어 체인을 통일한다. 단독주택과 토지만 Site에 Property가 바로 붙는다.
- 주소는 `Site.wardCode`로 법정동을 가리킨다. 좌표는 PostGIS(EPSG:5179)다.
- 외부 식별자(국토부 단지 코드, 네이버 단지 번호 등)는 Site의 별도 칸이다. PK로 쓰지 않는다.

## 사람

- Contact에는 역할이 없다. 같은 사람이 한 건에서는 소유자, 다른 건에서는 매수인일 수 있다.
- 역할은 관계 표에 있다: 매물과의 관계는 `PropertyContact`, 구매 의뢰와의 관계는 `BuyerIntakeContact`, 사람끼리는 `ContactRelation`, 계약서의 당사자는 `ContractParty`.
- 전화번호는 `ContactPhone`에 여러 개. 전화가 오면 Contact와 협력업체 담당자(`VendorContact`)를 함께 찾는다.

## 매물과 의뢰

- **Property**: 우리 사무소가 관리하는 호실 하나. 의뢰가 끝나도 남는다.
- **ListingIntake**: 한 번 들어온 의뢰. 한 Property에 닫히지 않은 의뢰는 하나뿐이다.
- **Listing**: 의뢰 안의 거래 조건 하나(매매·전세·월세). 가격은 여기에 있다.
- 저장하는 상태는 의뢰의 생명주기(`open | hold | closed`)뿐이다. 확인 상태는 확인 이력에서, 거래 중·완료는 Deal에서 계산한다. 상세는 `.claude/rules/pipelines.md`.
- 가격이 바뀌면 `PriceHistory`에 남는다.
- **ListingAdvertisement**는 한 Listing을 한 채널에 끊김 없이 올린 한 회차다. 내렸다가 다시 올리면 새 회차다.

## 손님

- **BuyerIntake**(구매 의뢰) 아래에 **BuyerRequirement**(희망조건)가 여러 개 있고, 우선순위는 의뢰 안에서 겹치지 않는다.
- 희망 지역과 희망 단지는 각각 `BuyerRequirementRegion`, `BuyerRequirementSite`.

## 매칭 · 거래 · 계약

- **Match**는 희망조건 하나와 Listing 하나의 짝이다. 거래로 넘어가면 매칭은 끝난다.
- **Deal**은 계약 실행이다. 취소는 단계가 아니라 `isCancelled`다.
- `Deal.buyerIntakeId`는 매칭에서 넘어온 거래면 서버가 채우고, 매칭 없이 만든 거래면 사용자가 고르거나 비워 둔다.
- **Contract**는 Deal과 1:1이다. `dealId`가 없는 Contract는 거래와 무관하게 만든 서식 묶음이다.
- 돈은 세 군데에 나뉘어 있고 서로 대신하지 않는다:
  - `Contract.stated*` — 계약서에 적힌 금액
  - `DealPayment` — 실제로 오간 거래 대금
  - `CommissionPayment` / `CommissionDistribution` — 중개보수의 청구·수금과 사무소 간 분배

## 중개 건

- 의뢰는 건 없이 존재한다(`brokerageCaseId`는 비어 있을 수 있다). 건은 사용자가 여러 의뢰를 직접 묶을 때만 생긴다.
- **BrokerageCaseStep**은 건 안의 순서 있는 단계다. 매물 의뢰·구매 의뢰·거래 중 하나를 가리키거나 아무것도 가리키지 않는다(둘 이상은 CHECK로 막는다).
- 건에 담긴 의뢰마다 단계가 하나씩 있다. 한 의뢰·한 거래는 한 건 안에서 한 번만 나온다(조건부 unique index).
- 단계의 FK는 `(office_id, brokerage_case_id, 의뢰 id)`를 가리킨다. 그래서 다른 건의 의뢰를 단계로 걸 수 없고, 의뢰를 다른 건으로 옮기려면 먼저 단계의 연결을 끊어야 한다.
- 단계에는 진행 상태와 금액을 저장하지 않는다. 대상의 상태는 대상에서 읽는다. 순서와 목표일은 사람이 적는다.
- **고객 원장**(고객 화면의 한 줄)은 저장된 것이 아니다. 조회할 때 같은 당사자의 의뢰를 모으고, 건으로 묶인 의뢰는 건 단위로 보여 준다. 보관된 건의 의뢰는 묶이지 않은 의뢰처럼 보인다.

## 업무와 기록

- **Task**는 사람이 만든 것, 시스템이 만든 것, 외부 AI가 만든 것을 함께 담는다. 광고 업무도 Task다.
- **ActivityLog**는 `PrismaService`가 자동으로 남긴다. 누가(`actor`), 어디서(`source`) 했는지가 함께 남는다.
- **Consultation**은 상담 기록이다. 통화 분석 결과는 `CallActionSuggestion`으로 제안만 하고, 사람이 확인한 뒤에야 업무·일정에 반영한다.

## 외부 광고

- **광고노트**(`ExternalListing*`)는 사무소가 자기 책임으로 넣은 다른 사무소의 광고다. 서버는 수집하지 않는다.
  - 입력은 스냅샷 회차 단위다. 회차를 닫으면 이번에 들어오지 않은 광고가 비활성으로 바뀌고 직전 회차와의 비교가 나온다.
  - 사용자가 확인한 호수와 메모는 그룹(`ExternalListingGroup`)에 있고, 수집 결과가 덮어쓰지 못한다. 그룹은 지우지 않는다.
  - 호수는 추정하지 않는다. 사람이 적는다.
- **우리 광고 반영**(`ListingAdvertisementSnapshot*`)은 CP에서 읽은 우리 광고를 Listing에 연결해 제출하는 회차다. 모든 항목이 연결됐을 때만 `ListingAdvertisement`에 반영한다.

## 공동 중개망과 협력업체

- 공유 매물(`NetworkSharedProperty`)은 우리 Property 중에서 골라 올리고, 어떤 칸을 보여 줄지 칸마다 정한다. `Listing.privateMemo`는 어떤 경로로도 밖에 나가지 않는다.
- 협력업체는 `officeId`가 비어 있으면 플랫폼 공용, 값이 있으면 그 사무소의 단골이다. 공용 업체는 플랫폼 운영자(`User.isPlatformAdmin`)만 고친다.

## 소비자 사이트

- `PublicListing`은 밖에 내보내려고 따로 적은 내용이다. 내부 메모와 사진이 자동으로 복사되지 않는다.
- `ConsumerRequest`는 플랫폼이 가진 소비자 요청이고 직원 API로 노출하지 않는다. 사무소에는 Task로 전달된다.

## 아직 정리되지 않은 것 (2026-11-15 점검)

- `DealParticipant`(직원별 수수료 배분) 표는 있지만 행을 만드는 코드가 없다.
- Contract의 상태·금액 칸 일부가 Deal 단계, DealPayment와 뜻이 겹친다.
- 쓰는 곳이 없는 칸: `Deal.externalListingId`, `Unit.isPiloti`, 의뢰의 메모 칸 일부, `ContractDocumentTemplate`.

지우거나 고치면 이 목록에서 뺀다.
