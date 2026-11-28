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
                     ├ PropertyContact             │
                     └ PropertyLease ─┐            │
                                      │            Match → Deal → Contract (ContractParty)
사람              Contact ────────────┴──────┐             ├ DealPayment
                  (Party / PartyMember)      │             └ CommissionPayment → CommissionDistribution
                                             │
손님 쪽           BuyerIntakeContact → BuyerIntake → BuyerRequirement
                                  │          │
묶기 (선택)       Project → ProjectStep (매물 의뢰 | 구매 의뢰 | 거래 | 없음)
```

## 스키마 파일

| 파일 | 담긴 것 |
| --- | --- |
| `master.prisma` | 법정동 (시도·시군구·읍면동) |
| `office.prisma` | 사무소, 직원 |
| `site.prisma` | 단지·동·호, 평형, 사무소 관리 단지 |
| `contact.prisma` | 사람·법인(`Contact`), 전화번호, 태그(꼬리표)와 그룹(명단), 세대·법인 소속(`Party`·`PartyMember`), 매물과의 관계, 임대차·세입자(`PropertyLease`·`PropertyLeaseTenant`) |
| `property.prisma` | 매물, 매물 의뢰, 거래 조건, 광고, 광고 이력, 광고 변경 요청, 가격 이력 |
| `crm.prisma` | 구매 의뢰·희망조건, 상담, 매칭, 거래, 대금, 계약·계약서 문서 |
| `project.prisma` | 프로젝트, 진행 계획 |
| `finance.prisma` | 수수료 청구·분배·조정, 사무소 고정비 |
| `task.prisma` | 업무, 일정, 변경 기록 |
| `notification.prisma` | 알림 |
| `network.prisma` | 공동 중개망 (방, 공유 매물, 문의, 대화) |
| `partner-broker.prisma` | 공동중개 상대 사무소 주소록과 담당자 |
| `external-listing.prisma` | 광고노트 (다른 사무소의 외부 광고) |
| `listing-advertisement-snapshot.prisma` | 우리 광고를 CP에서 읽어 와 반영하는 회차 |
| `office-advertisement.prisma` | 우리 광고의 네이버 비교 (지금 보이는 광고들, 읽을 때마다의 요약 기록) |
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
- 세 층의 뜻: **Site**는 대지·단지(지번 쪽), **Dong**은 건물 한 채(도로명 쪽, 대장 표제부), **Unit**은 거래 단위 공간이다. Unit은 호일 수도, 호 없이 층일 수도(상가건물 2층), 층의 일부일 수도(2층 좌측), 여러 층일 수도(1~2층) 있다. 그래서 `Unit.name`은 비울 수 있고, 이름이나 층 중 하나는 있어야 한다.
- 층은 정수로 저장한다. 지하는 음수(-2 = B2)이고 0은 없다. 숫자로 안 떨어지는 층(반지하, 옥탑)은 `floorLabel`에 적는다. 표기는 `packages/shared/src/place.ts`의 함수만 쓴다.
- 공공 단지·동 아래에도 사무소가 Unit을 만들 수 있다(대장에 호가 없는 건물의 층). 그 Unit은 그 사무소만 본다. 같은 이름의 공공 호가 있으면 만들지 못한다.
- 주소는 두 가지다. 지번(`pnu`, `jibunAddress`)은 Site에, 도로명(`roadBuildingMgmtNo`, 건물번호)은 Dong에 붙는다. `pnu`는 찾는 데만 쓰고 열쇠로 쓰지 않는다(합필·분필로 바뀐다).
- 건물형은 반드시 Site → Dong → Unit이다. 동 구분이 없는 건물은 `isPlaceholder = true`인 Dong 하나를 두어 체인을 통일한다. 단독주택과 토지만 Site에 Property가 바로 붙는다.
- 주소는 `Site.wardCode`로 법정동을 가리킨다. 좌표는 PostGIS(EPSG:5179)다.
- 외부 식별자(국토부 단지 코드, 네이버 단지 번호 등)는 Site의 별도 칸이다. PK로 쓰지 않는다.

## 사람

- Contact는 개인(`person`)과 법인·단체(`organization`)를 같은 표(`kind`)로 다룬다(`businessRegNo`, 소개자 `referredByContactId` 포함). Contact 자체에는 역할이 없다. 같은 주체가 한 건에서는 소유자, 다른 건에서는 매수인일 수 있다.
- 역할은 관계 표에 있다: 매물과의 소유·관련 관계는 `PropertyContact`(`startedAt`·`endedAt`·`sourceDealId` 이력 포함), 임대차 세입자는 `PropertyLease` · `PropertyLeaseTenant`(공동임차인 지원), 구매 의뢰와의 관계는 `BuyerIntakeContact`, 세대·법인 소속은 `Party` · `PartyMember`(옛 `ContactRelation` 대체), 계약서의 당사자는 `ContractParty`.
- 전화번호는 `ContactPhone`에 여러 개 둔다(`label = 'mobile'`일 때만 사무소 안에서 유일). 전화가 오면 Contact, 협력업체 담당자(`VendorContact`), 공동중개 파트너 담당자(`PartnerBrokerContact`)를 함께 찾고, 세대에 속해 있으면 세대 구성원 요약도 함께 묶어 본다.
- 주요 업무 테이블의 연락처·계약·의뢰 참조는 `(office_id, contact_id)` 등 복합 외래키를 두어 사무소 경계를 DB 차원에서 보장한다.

## 매물과 의뢰

- **Property**: 우리 사무소가 관리하는 호실 하나. 의뢰가 끝나도 남는다.
- **ListingIntake**: 한 번 들어온 의뢰. 한 Property에 닫히지 않은 의뢰는 하나뿐이다. 누가 내놓았는지는 따로 적지 않는다 — 연락할 사람은 호실에 연결된 소유자·대리인(PropertyContact)이다(의뢰인 칸은 쓰는 곳이 없어 2026-11-28에 뺐다).
- **Listing**: 의뢰 안의 거래 조건 하나(매매·전세·월세). 가격은 여기에 있다.
- 저장하는 상태는 의뢰의 생명주기(`open | hold | closed`)뿐이다. 확인 상태는 확인 이력에서, 거래 중·완료는 Deal에서 계산한다. 상세는 `.claude/rules/pipelines.md`.
- 가격이 바뀌면 `PriceHistory`에 남는다.
- **OfficeCpAccount**는 사무소의 CP(이실장, 부동산뱅크 등) 로그인 계정이다. `accountKey`는 로그인 아이디(비밀번호는 서버에 저장하지 않음), `accountName`은 선택 별칭이며 직원 개인 소유가 아니라 사무소 공용이다. 한 사무소가 같은 채널에 계정을 여러 개 등록해 같은 매물을 계정별로 광고할 수 있다.
- **ListingAdvertisement**는 한 집을 한 채널·계정에 내는 광고 하나다(2026-11-18 이전에는 "게재 한 회차"였다). 같은 광고인지는 열쇠로 가른다: 매물이 있으면 사무소 + 매물 + 채널 + CP 계정(`cpAccountId`), 매물 없이 호실까지면 사무소 + 관리 공간 + 채널 + CP 계정 + 거래유형. 열쇠가 없으면 같은 채널의 CP 광고 번호(`externalAdId`)가 같을 때만 같은 광고다. 재광고(네이버 번호가 바뀜)와 내려갔다 다시 올라온 것은 새 줄이 아니라 같은 줄의 변화다.
  - 지나간 상태는 **ListingAdvertisementHistory**에 쌓인다(가격 · 게재/종료 · 네이버 번호가 바뀔 때마다 바뀐 뒤의 상태 한 줄).
  - 두 줄이 같은 광고였음이 드러나면(연결 안 된 광고를 매물에 이었더니 그 매물 · 채널 · 계정의 광고가 이미 있음) 한 줄로 합친다. 둘 다 게재 중이면 합치지 않고 거절한다.
  - 매물 없이도 저장된다. 연결은 세 단계(`siteId` → `propertyId` → `listingId`)이고 아래 단계가 채워지면 위 단계도 채워진다. 어디까지 이어졌는지(`linkLevel`)는 저장하지 않고 세 칸에서 계산한다.
  - 공공 Unit에 직접 걸지 않는다. 호실까지 찾았으면 우리 사무소의 Property를 만들어(없으면) 거기에 건다.
  - CP가 적은 위치 글(`raw*`)을 그대로 둔다. 층과 가격이 비슷하다는 이유로 같은 집이라고 추정하지 않는다.
  - `source` 칸은 두지 않고 `lastSyncedAt`(마지막 CP 스냅샷 확인 시각)과 `manualEditedAt`(직접 고친 시각)으로 동기화 상태(`manual` / `synced` / `manual_override`)를 계산한다. 금액은 매매 `advertisedPrice`, 전세·월세 보증금 `advertisedDeposit`, 월세 `advertisedMonthlyRent`에 둔다.
  - 광고를 바꿔 달라는 요청은 **AdvertisementChangeRequest**(`publish` 신규 게재 · `update` 조건 변경 · `readvertise` 재광고 · `takedown` 내리기)다. 요청 시점 스냅샷(`baseSnapshot`)과 목표 조건(`targetValue`), CP 계정(`cpAccountId`)을 담으며 여러 요청이 묶음 **Task** 하나(N:1)를 가리킬 수 있다. 상태는 `requested → in_progress → executed → verified | failed | cancelled`로 흐르며 `verified`는 완료 스냅샷의 실제 관측값으로 자동 검증된다. 요청 자체는 광고 값을 바꾸지 않고, 이미 CP에서 바꾼 값을 기록에 맞추는 것은 광고 수정(직접 변경)이다.

## 손님

- **BuyerIntake**(구매 의뢰) 아래에 **BuyerRequirement**(희망조건)가 여러 개 있고, 우선순위는 의뢰 안에서 겹치지 않는다. 참여 손님은 `BuyerIntakeContact`로 여러 명을 둘 수 있고, 마지막 희망조건을 삭제해 의뢰에 조건이 하나도 남지 않으면 서버가 빈 구매 의뢰도 정리한다.
- 희망 지역과 희망 단지는 각각 `BuyerRequirementRegion`, `BuyerRequirementSite`.

## 매칭 · 거래 · 계약

- **Match**는 희망조건 하나와 Listing 하나의 짝이다. 거래로 넘어가면 매칭은 끝난다.
- 매칭 단계는 순서를 강제하지 않는다. 임장 없이 계약으로 가는 경우처럼 실제 업무가 단계를 건너뛰기 때문이다. 서버가 막는 것은 확인되지 않은 매물을 고객 관심 이후 단계로 넘기는 일뿐이다.
- 협상하며 정한 합의 조건(가격·보증금·월세·입주일)은 매칭에 적어 둘 수 있다(모두 선택). 거래로 전환할 때 Deal로 넘기고, 그 뒤에는 Deal의 값이 기준이다. 전환한 매칭의 합의 조건은 서버가 수정을 막는다.
- **Deal**은 계약 실행이다. 취소는 단계가 아니라 `isCancelled`다. 완료·종료된 거래에서는 매물 소유자(`PropertyContact`)·임대차(`PropertyLease`) 전환을 미리 보고 `sourceDealId` 기준으로 멱등 반영할 수 있다.
- `Deal.buyerIntakeId`는 매칭에서 넘어온 거래면 서버가 채우고, 매칭 없이 만든 거래면 사용자가 고르거나 비워 둔다.
- **Contract**는 Deal과 1:1이다. `dealId`가 없는 Contract는 거래와 무관하게 만든 서식 묶음이다. 계약 당사자는 `ContractParty` 한 곳을 기준(SSOT)으로 삼고 응답의 대표 매도인·매수인 요약은 거기서 계산한다.
- 돈은 세 군데에 나뉘어 있고 서로 대신하지 않는다:
  - `Contract.stated*` — 계약서에 적힌 금액
  - `DealPayment` — 실제로 오간 거래 대금
  - `CommissionPayment` / `CommissionDistribution` — 중개보수의 청구·수금과 사무소 간 분배

## 프로젝트

- 의뢰는 프로젝트 없이 존재한다(`projectId`는 비어 있을 수 있다). 프로젝트는 사용자가 직접 열 때만 생긴다: 대표 고객만 정해 열거나 의뢰를 골라 연다(의뢰 하나로도 연다). 옛 이름은 중개 건(BrokerageCase)이고 2026-11-21에 바꿨다.
- 프로젝트에는 대표 고객(`primaryContactId`)과 담당 직원(`assignedToId`)을 둘 수 있다. 대표 고객은 사용자가 정한 값이고, 그 밖의 사람은 담긴 의뢰(구매 의뢰의 참여자, 매물 의뢰 집의 소유자)에서 읽는다.
- **ProjectComment**(`comments` 표)는 직원이 프로젝트에 적는 글이다. 손님과 나눈 대화인 상담(Consultation)과 다르다. 지금은 프로젝트만 가리킨다.
- **업무(Task)**는 `projectId`로 프로젝트에 직접 달 수 있다(빈 프로젝트에서도 할 일을 적기 위해서). 프로젝트를 풀면 업무는 남고 연결만 끊긴다.
- **ProjectStep**은 프로젝트 안의 순서 있는 단계다. 매물 의뢰·구매 의뢰·거래 중 하나를 가리키거나 아무것도 가리키지 않는다(둘 이상은 CHECK로 막는다).
- 프로젝트에 담긴 의뢰마다 단계가 하나씩 있다. 한 의뢰·한 거래는 한 프로젝트 안에서 한 번만 나온다(조건부 unique index).
- 단계의 FK는 `(office_id, project_id, 의뢰 id)`를 가리킨다. 그래서 다른 프로젝트의 의뢰를 단계로 걸 수 없고, 의뢰를 다른 프로젝트로 옮기려면 먼저 단계의 연결을 끊어야 한다.
- 단계에는 진행 상태와 금액을 저장하지 않는다. 대상의 상태는 대상에서 읽는다. 순서와 목표일은 사람이 적는다.
- **고객 원장**(고객 화면의 한 줄)은 저장된 것이 아니다. 조회할 때 같은 당사자의 의뢰를 모으고, 프로젝트에 담긴 의뢰는 프로젝트 단위로 보여 준다. 보관된 프로젝트의 의뢰는 담기지 않은 의뢰처럼 보인다.

## 업무와 기록

- **Task**는 사람이 만든 것, 시스템이 만든 것, 외부 AI가 만든 것을 함께 담는다. 광고 업무도 Task다. 매물 의뢰·구매 의뢰(`buyerIntakeId`)·거래·프로젝트 등 관련 문맥을 직접 가리킬 수 있다.
- **CalendarEvent**는 `buyerIntakeId`·`projectId` 등 관련 업무 문맥을 직접 연결할 수 있다.
- **ActivityLog**는 `PrismaService`가 자동으로 남긴다. 누가(`actor`), 어디서(`source`) 했는지가 함께 남는다.
- **Consultation**은 상담 기록이다. `dealId`·`projectId`를 직접 연결할 수 있고, 연락처 조회 시 `scope`로 본인(`self`) 또는 세대·법인 전체(`party`) 범위를 선택할 수 있다. 통화 분석 결과는 `CallActionSuggestion`으로 제안만 하고, 사람이 확인한 뒤에야 업무·일정에 반영한다.

## 외부 광고

- **광고노트**(`ExternalListing*`)는 사무소가 자기 책임으로 넣은 다른 사무소의 광고다. 서버는 수집하지 않는다.
  - 입력은 스냅샷 회차 단위다. 회차를 닫으면 이번에 들어오지 않은 광고가 비활성으로 바뀌고 직전 회차와의 비교가 나온다.
  - 사용자가 확인한 호수와 메모는 그룹(`ExternalListingGroup`)에 있고, 수집 결과가 덮어쓰지 못한다. 그룹은 지우지 않는다.
  - 호수는 추정하지 않는다. 사람이 적는다.
- **네이버 비교**: 사용자의 에이전트가 내 광고 한 건마다 네이버에서 같은 집으로 보이는 광고 전체 목록을 통째로 넣는다. 서버는 스스로 묶지 않는다(묶음 표는 2026-11-18에 없앴다).
  - `AdvertisementComparison`은 지금 네이버에 보이는 광고들이고 읽을 때마다 덮어쓴다. `ownAdvertisement`(`ownAdvertisementId`)가 마지막 네이버 수집 당시 이 내 광고 행이며(`isMain` 같은 별도 플래그는 저장하지 않는다), 같은 사무소의 다른 활성 광고(`naverArticleNo`)가 목록에 있으면 자동으로 `isMine = true`로 표시한다. `AdvertisementComparisonRecord`는 읽을 때마다의 요약(내 순위, 같은 집 광고 수, 경쟁 최저가, 그때의 판단, 직전과 달라진 것) 한 줄이고 쌓인다.
  - 한 광고의 저장은 한 트랜잭션이다. 절반만 읽은 목록을 넣으면 안 들어온 경쟁 광고가 내려간 것으로 기록된다(`totalCount`를 주면 서버가 모자란 목록을 거절한다).
  - 화면의 "경쟁 대비"는 저장된 요약이 아니라 최신 비교 줄과 마지막 네이버 수집 당시 내 광고 가격(`ownAdvertisement`, 없을 때만 광고 원장 가격)으로 볼 때 계산한다. 판단 규칙은 `packages/shared/src/advertisement-comparison.ts` 하나를 서버와 화면이 함께 쓴다.
  - 알림은 직전 기록과 달라진 것(더 싼 광고가 생김 · 내 광고 미노출 · 경쟁이 정확한 층 공개)만, 올리기 한 번이 끝날 때 묶어서 보낸다.
- **우리 광고 반영**(`ListingAdvertisementSnapshot*`)은 CP 로그인 계정(`accountKey` → `cpAccountId`) 단위로 세션을 열어 CP에서 읽은 우리 광고를 Listing에 연결해 제출하는 회차다. 다중 계정 사무소는 해당 계정 광고만, 단일 계정 사무소는 계정이 비어 있는 채널 광고까지 함께 누락 종료한다. 연결하지 못한 항목도 연결 없는 광고로 반영한다(읽기에 실패한 항목이 있으면 반영하지 않는다).

## 공동 중개망과 협력업체

- 공유 매물(`NetworkSharedProperty`)은 우리 Property 중에서 골라 올리고, 어떤 칸을 보여 줄지 칸마다 정한다.
- 협력업체는 `officeId`가 비어 있으면 플랫폼 공용, 값이 있으면 그 사무소의 단골이다. 공용 업체는 플랫폼 운영자(`User.isPlatformAdmin`)만 고친다.

## 소비자 사이트

- `PublicListing`은 밖에 내보내려고 따로 적은 내용이다. 내부 메모와 사진이 자동으로 복사되지 않는다.
- `ConsumerRequest`는 플랫폼이 가진 소비자 요청이고 직원 API로 노출하지 않는다. 사무소에는 Task로 전달된다.

## 아직 정리되지 않은 것 (2026-11-15 점검)

- 직원 정산: 수수료가 들어온 일은 `CommissionReceipt` 한 줄씩이고(원 단위, 고치지 않고 취소·환불 줄을 더한다), 청구의 받은 금액·입금일·상태는 거기서 다시 계산한 값이다. 거래를 누가 얼마나 맡았는지는 `DealParticipant.sharePercent`(합 100)로 정하고, 한 달 치를 확정하면 `Settlement`·`SettlementLine`에 그때의 금액과 직원 조건을 굳힌다. 계산 규칙은 `apps/server/src/modules/finance/settlement-calc.ts` 한 곳에 있다.
- Contract의 상태·금액 칸 일부가 Deal 단계, DealPayment와 뜻이 겹친다.
- 쓰는 곳이 없는 칸: `Deal.externalListingId`, `Unit.isPiloti`, 의뢰의 메모 칸 일부, `ContractDocumentTemplate`.

지우거나 고치면 이 목록에서 뺀다.
