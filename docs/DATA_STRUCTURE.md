# Estate ERP - 데이터 구조

## 전체 ERD 요약

```
┌─────────────────────────────────────────────────────────────────┐
│  법정동 마스터 (공공데이터 import)                                 │
│  Province (시도) → District (시군구) → Ward (읍면동)               │
├─────────────────────────────────────────────────────────────────┤
│  Office (사무소)                                                 │
│  └── User (사용자)                                               │
├─────────────────────────────────────────────────────────────────┤
│  Site (장소) ── wardCode FK → Ward (법정동 코드 참조)              │
│  ├── SiteUnitType (평형 카탈로그: 84A, 59B 등 면적/방수 정의)     │
│  ├── Dong (동)                                                   │
│  └── Unit (호) ── siteUnitTypeId FK, floor, lineNo               │
│                                                                  │
│  OfficeSite (사무소별 관리 단지 구독)                              │
│  └── Office ↔ Site 연결 + isFavorite                             │
├─────────────────────────────────────────────────────────────────┤
│  Property (관리 단위) ── siteId(필수) + unitId(선택)               │
│  ├── PropertyContact (매물 관련인: 소유자, 대리인, 법무사...)       │
│  ├── Tenant (세입자 + 계약정보)                                   │
│  └── Listing (매물 = 거래 단위) ── propertyId FK                  │
│       ├── Match (매칭 파이프라인)                                  │
│       ├── Deal (거래 파이프라인)                                   │
│       └── PriceHistory (가격 변경 이력)                            │
├─────────────────────────────────────────────────────────────────┤
│  Contact (연락처 = 모든 사람)                                     │
│  ├── ContactRelation (사람 ↔ 사람 관계: 가족, 법무사...)           │
│  ├── BuyerRequirement (구매 희망조건)                              │
│  └── Consultation (상담 기록)                                     │
├─────────────────────────────────────────────────────────────────┤
│  Task (업무) / CalendarEvent (일정) / ActivityLog (감사)          │
├─────────────────────────────────────────────────────────────────┤
│  ServiceVendor (업체) ── officeId nullable (Site 패턴)            │
│  ├── VendorContact (담당자/연락처, 1:N)                          │
│  └── ServiceCategory (카테고리 마스터: 배관, 도배, 청소...)        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. 멀티테넌시

### Office (사무소)

| 필드                | 타입    | 설명                                                            |
| ------------------- | ------- | --------------------------------------------------------------- |
| id                  | UUID    | PK                                                              |
| name                | String  | 사무소명                                                        |
| licenseNo           | String? | 중개업 등록번호                                                 |
| ceoName             | String? | 대표자명                                                        |
| phone               | String? | 사무소 전화                                                     |
| address             | String? | 사무소 주소                                                     |
| naverVerificationId | String? | 네이버 부동산 광고 등록 시 사용하는 사무소 공통 실명인증 아이디 |
| subscription        | String  | basic / pro / premium                                           |
| maxUsers            | Int     | 최대 사용자 수 (기본 3)                                         |
| isActive            | Boolean | 활성 여부                                                       |

### User (사용자)

| 필드     | 타입    | 설명                                                      |
| -------- | ------- | --------------------------------------------------------- |
| id       | UUID    | PK                                                        |
| officeId | UUID    | FK → Office                                               |
| loginId  | String  | 로그인 ID (unique, owner/직원 모두 별도 아이디 사용 가능) |
| email    | String? | 이메일 (nullable, owner 필수, 직원 선택)                  |
| password | String  | 해시된 비밀번호                                           |
| name     | String  | 이름                                                      |
| phone    | String? | 전화번호                                                  |
| role     | String  | owner / manager / agent                                   |
| isActive | Boolean | 활성 여부                                                 |

---

## 2. 법정동 코드 마스터

공공데이터포털(data.go.kr)에서 import하는 읽기 전용 마스터 데이터. 주소 정규화의 근간.

```
Province (시도, 2자리) → District (시군구, 5자리) → Ward (읍면동, 10자리)
  "11" 서울특별시        "11740" 강동구             "1174010100" 고덕동
```

### Province (시도)

| 필드 | 타입       | 설명                |
| ---- | ---------- | ------------------- |
| code | VarChar(2) | PK ("11" = 서울)    |
| name | String     | 시도명 (서울특별시) |

### District (시군구)

| 필드         | 타입       | 설명                  |
| ------------ | ---------- | --------------------- |
| code         | VarChar(5) | PK ("11740" = 강동구) |
| provinceCode | VarChar(2) | FK → Province         |
| name         | String     | 시군구명 (강동구)     |

### Ward (읍면동)

| 필드         | 타입        | 설명                       |
| ------------ | ----------- | -------------------------- |
| code         | VarChar(10) | PK ("1174010100" = 고덕동) |
| districtCode | VarChar(5)  | FK → District              |
| name         | String      | 읍면동명 (고덕동)          |

> 데이터 소스: 국토교통부 법정동코드 (data.go.kr/data/15123287)
> 주기적 동기화로 행정구역 변경 반영

---

## 3. 장소 계층 (Site → Dong → Unit)

### 공공 데이터 vs 사무소 데이터

```
officeId = null, isPublic = true   →  공공데이터 (래미안고덕 등, import)
officeId = UUID, isPublic = false  →  사무소가 등록한 비공개 단지 (소규모 빌라 등)
```

- 가시성 쿼리: `WHERE is_public = true OR office_id = ?`
- 공공데이터는 `isLocked = true`로 수정/삭제 보호
- 공공데이터 소스: 국토부 공공데이터, 네이버 부동산 (Phase 3)
- `OfficeSite`로 관리단지 구독 (공공이든 내가 만든 거든 통합 관리)
- 즐겨찾기는 구독 관계의 `isFavorite`로 별도 관리

### Site (장소)

아파트 단지, 오피스텔, 빌라, 단독주택, 상가, 토지 등 모든 부동산 위치.

| 필드             | 타입        | 설명                                                                       |
| ---------------- | ----------- | -------------------------------------------------------------------------- |
| id               | UUID        | PK (자체 고유 ID)                                                          |
| officeId         | UUID?       | null = 공공데이터 import                                                   |
| isPublic         | Boolean     | true = 모든 사무소 열람 가능                                               |
| isLocked         | Boolean     | 공공데이터 수정 보호                                                       |
| type             | String      | apartment, officetel, villa, house, commercial, land, living_accommodation |
| name             | String      | 단지명/건물명                                                              |
| wardCode         | VarChar(10) | FK → Ward (법정동 코드 참조)                                               |
| roadAddress      | String?     | 전체 도로명주소 (표시용)                                                   |
| jibunAddress     | String?     | 전체 지번주소 (표시용)                                                     |
| lat / lng        | Decimal?    | 좌표 (PostGIS geometry는 migration에서 추가)                               |
| kaptComplexCode  | String?     | K-apt 단지코드 (아파트만)                                                  |
| naverComplexCode | String?     | 네이버 부동산 단지코드 (아파트+오피스텔+빌라)                              |
| kbComplexCode    | String?     | KB 부동산 단지코드                                                         |
| builtYear        | Int?        | 준공년도                                                                   |
| totalUnits       | Int?        | 총세대수                                                                   |
| totalDongs       | Int?        | 총동수                                                                     |
| metadata         | JSONB?      | 타입별 가변 속성 (아래 참고)                                               |

> **주소 정규화**: 기존 sido/sigungu/eupmyeondong 자유텍스트 → wardCode FK 참조로 변경. Ward → District → Province 체인으로 시도/시군구/읍면동 조회.

> **외부 단지코드**: 자체 UUID가 PK이고, K-apt/네이버/KB 코드는 매핑용 필드. K-apt는 아파트만 커버, 네이버는 오피스텔/빌라도 포함, KB는 시세 연동용.

> **metadata JSONB**: 타입별로 다른 속성을 저장. parkingCount, heatingType 같은 아파트 전용 필드나 landUseZone 같은 토지 전용 필드는 여기에.

```
아파트:  { parkingCount, heatingType, floorAreaRatio, buildingCoverageRatio }
토지:    { landUseZone, landCategory, landArea }
상가:    { floorInfo, mainUse }
```

> **PostGIS**: lat/lng는 Prisma용 fallback. 공간 쿼리(반경 검색 등)는 migration SQL에서 추가하는 `geometry(Point, 5179)` 컬럼 + GIST 인덱스 사용. Prisma `$queryRaw`로 접근.

### SiteUnitType (평형 카탈로그)

단지별 평형 타입 정의. 네이버 부동산 `pyeongList` API와 1:1 대응.

| 필드            | 타입     | 설명                     |
| --------------- | -------- | ------------------------ |
| id              | UUID     | PK                       |
| officeId        | UUID?    | null = 공공데이터        |
| siteId          | UUID     | FK → Site                |
| name            | String   | 타입명 (84A, 59B, 133A)  |
| nameType        | String?  | 변형 문자 (A, B, C, D)   |
| exclusiveAreaM2 | Decimal? | 전용면적 (m²)            |
| supplyAreaM2    | Decimal? | 공급면적 (m²)            |
| contractAreaM2  | Decimal? | 계약면적 (m²)            |
| roomCount       | Int?     | 방 수                    |
| bathRoomCount   | Int?     | 욕실 수                  |
| householdCount  | Int?     | 해당 타입 총 세대수      |
| entranceType    | String?  | 주출입(10) / 부출입(20)  |
| direction       | String?  | 향 (SS=남남, ES=동남 등) |
| isDuplex        | Boolean  | 복층 여부                |
| naverPyeongNo   | String?  | 네이버 평형번호 (매핑용) |
| floorPlanUrls   | JSONB?   | 평면도 이미지 URL        |

> unique: [siteId, name]

> **네이버 대응**: `GET /api/complexes/{id}/pyeongList`의 각 항목이 SiteUnitType 1개에 대응. 같은 타입(84A)은 단지 내 어느 동이든 동일한 면적/방수를 가짐.
> 방/욕실 수는 면적만으로 추정하지 않고 `단지정보 → 단지 내 면적별 정보`의 타입별 값을 사용한다. 같은 전용면적대라도 타입별 구조가 다를 수 있다.

### Dong (동)

| 필드          | 타입    | 설명                                        |
| ------------- | ------- | ------------------------------------------- |
| id            | UUID    | PK                                          |
| officeId      | UUID?   | null = 중앙 데이터                          |
| siteId        | UUID    | FK → Site                                   |
| name          | String  | 동 이름 (101동, A동, 단일 동 건물은 "-" 등) |
| isPlaceholder | Boolean | true = 실제 동 구분 없음 (UI 숨김 처리)     |

> **Placeholder 규칙**: 단일 동 건물(빌라, 단일동 오피스텔·상가 등)도 반드시 Dong 하나를 생성한다. 이 경우 `isPlaceholder = true`로 마킹하고 `name`은 `"-"` 또는 `"본동"` 사용. `Site → Dong → Unit` 체인을 타입과 무관하게 통일해 쿼리·UI를 단순화하기 위함.
> **확장성**: 단일동으로 시작한 건물에 나중에 B동이 증축되면 → placeholder를 실제 이름(예: "A동")으로 rename하고 `isPlaceholder = false`, 새 Dong("B동") 추가.
> **층수 정보**는 Unit.floor에서 파생 (`SELECT MAX(floor) FROM units WHERE dong_id = ?`)

### Unit (호)

| 필드            | 타입     | 설명                                                                                                       |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| id              | UUID     | PK                                                                                                         |
| officeId        | UUID?    | null = 중앙 데이터                                                                                         |
| siteId          | UUID     | FK → Site                                                                                                  |
| dongId          | UUID     | FK → Dong (NOT NULL, 단일 동 건물은 placeholder Dong 참조)                                                 |
| siteUnitTypeId  | UUID?    | FK → SiteUnitType (평형 타입)                                                                              |
| name            | String   | 호수 (3501호)                                                                                              |
| floor           | Int?     | 층 (35)                                                                                                    |
| lineNo          | Int?     | 라인번호 (같은 타입 수직 스택, 그리드 컬럼)                                                                |
| exclusiveAreaM2 | Decimal? | 전용면적 (m², 타입 미지정 시 fallback)                                                                     |
| supplyAreaM2    | Decimal? | 공급면적 (m², 타입 미지정 시 fallback)                                                                     |
| roomCount       | Int?     | 호실별 방 수 override (null이면 SiteUnitType.roomCount 사용)                                               |
| bathRoomCount   | Int?     | 호실별 욕실 수 override (null이면 SiteUnitType.bathRoomCount 사용)                                         |
| isPiloti        | Boolean  | 필로티 여부                                                                                                |
| cellType        | String   | 호실 그리드 표시 타입 (`unit`, `empty`, `piloti`, `common_facility`, `commercial_facility`, `safety_area`) |

> 면적은 m² 기준 저장. 평 변환: m² × 0.3025
> 면적은 SiteUnitType에서 가져오는 것이 정석. Unit의 면적 필드는 타입이 미지정된 호실(빌라, 비정형 등)용 fallback.
> 방/욕실 수도 같은 규칙을 사용한다. 검색·표시는 `Unit 값 ?? SiteUnitType 값`으로 계산하며, 타입과 다른 호실만 Unit에 override를 저장한다.

> **네이버 대응**: `GET /api/complexes/{id}/buildings/pyeongtype?dongNo={dongNo}`의 각 호실(hoNo)이 Unit 1개에 대응. `pyeongNo` → `siteUnitTypeId`, `lineNo` → `lineNo`, `hoFloor` → `floor`. `existHo: "N"`인 셀은 기본적으로 Unit 레코드를 만들지 않되, 필로티/공용시설/상가/대피공간처럼 그리드에 표시해야 하는 칸은 `cellType`으로 구분해 Unit 레코드를 만든다.

> **그리드 UI**: Dong의 Unit 목록을 floor(행) × lineNo(열)로 배치하면 네이버와 동일한 동별 호실 그리드 구현 가능.

### OfficeSite (관리 단지)

사무소가 구독·관리하는 단지 목록. 즐겨찾기는 구독 관계의 별도 표시 속성이다.

| 필드       | 타입    | 설명                       |
| ---------- | ------- | -------------------------- |
| id         | UUID    | PK                         |
| officeId   | UUID    | FK → Office                |
| siteId     | UUID    | FK → Site                  |
| memo       | String? | 메모 ("주력 단지" 등)      |
| isFavorite | Boolean | 즐겨찾기 여부 (기본 false) |

> unique: [officeId, siteId]

**흐름:**

1. 중개사가 "래미안고덕" 검색 → 중앙 Site 목록에서 선택
2. OfficeSite 생성 → "관리 단지"에 추가
3. 매물 등록 시 → 관리 단지 목록에서 빠르게 선택

---

## 4. 인물 관계 체계

### Contact (연락처)

모든 사람의 기본 정보. 판매자/구매자/세입자/관련인 구분 없이 통합.

| 필드     | 타입     | 설명                            |
| -------- | -------- | ------------------------------- |
| id       | UUID     | PK                              |
| officeId | UUID     | FK → Office                     |
| name     | String   | 이름                            |
| email    | String?  | 이메일                          |
| tags     | String[] | 사용자 정의 태그 (VIP, 단골 등) |
| memo     | String?  | 메모                            |

전화번호는 `Contact`에 직접 두지 않고 `ContactPhone`으로 1:N 관리한다.

### ContactPhone (연락처 전화번호)

| 필드     | 타입    | 설명                                                        |
| -------- | ------- | ----------------------------------------------------------- |
| id       | UUID    | PK                                                          |
| officeId | UUID    | FK → Office                                                 |
| contactId | UUID    | FK → Contact                                               |
| phone    | String  | 숫자만 저장하는 canonical 번호. 하이픈 표시는 프론트엔드 담당 |
| label    | String  | mobile / home / work / office / fax / other                |
| isPrimary | Boolean | 연락처의 대표 번호 여부                                   |
| memo     | String? | 번호별 메모                                                 |

> unique: [officeId, phone] (같은 사무소에서 번호 하나는 하나의 ContactPhone만 소유)
> partial unique: [officeId, contactId] WHERE isPrimary = true (연락처당 대표 번호 최대 1개)

역할은 관계 테이블로 구분:

- **판매자/소유자** → PropertyContact
- **구매자** → BuyerRequirement
- **세입자** → Tenant
- **가족/전문가** → ContactRelation

### ContactRelation (사람 ↔ 사람 관계)

영구적인 인간관계. 거래와 무관하게 유지됨.

| 필드             | 타입    | 설명                                                     |
| ---------------- | ------- | -------------------------------------------------------- |
| id               | UUID    | PK                                                       |
| officeId         | UUID    | FK → Office                                              |
| contactId        | UUID    | FK → Contact (주체)                                      |
| relatedContactId | UUID    | FK → Contact (관련인)                                    |
| relationType     | String  | parent, spouse, child, sibling, lawyer, tax_agent, other |
| label            | String? | 보충 설명 ("큰어머니", "담당 법무사")                    |
| memo             | String? | 메모                                                     |

> unique: [contactId, relatedContactId]

**등록 UI:**

```
관계: [어머니] [아버지] [배우자] [자녀] [형제] [법무사] [세무사] [기타: ___]
+ [010-5555-6666] [어머니 ▼]  [추가]
→ Contact 자동 생성 + ContactRelation 연결
```

- 이름 모르면 관계명으로 Contact 자동 생성 ("어머니")
- 나중에 이름 알게 되면 Contact.name 수정

### PropertyContact (매물 ↔ 사람, 역할별)

매물에 관련된 사람들. 기존 Ownership을 확장 통합.

| 필드       | 타입     | 설명                                               |
| ---------- | -------- | -------------------------------------------------- |
| id         | UUID     | PK                                                 |
| officeId   | UUID     | FK → Office                                        |
| contactId  | UUID     | FK → Contact                                       |
| propertyId | UUID     | FK → Property                                      |
| role       | String   | owner, co_owner, representative, lawyer, tax_agent |
| shareRatio | Decimal? | 지분비율 % (owner/co_owner만)                      |
| isResident | Boolean  | 실거주 여부                                        |
| isPrimary  | Boolean  | 주 연락처 여부                                     |
| status     | String   | active, transferred, archived                      |
| memo       | String?  | 메모                                               |

> unique: [contactId, propertyId, role]

> 활성(`status=active`) 주 연락처는 Property당 최대 한 명이다. `isPrimary`는
> Contact 자체가 아니라 해당 Property에서의 대표 연락 창구를 뜻한다.

**소유권 이전 시:** status를 `transferred`로 변경 (삭제 안 함 → 이력 보존)

**예시: 공동소유 + 어머니**

```
PropertyContact: 김집주인 → 래미안101호 (role: owner, 50%, isPrimary)
PropertyContact: 박어머니 → 래미안101호 (role: co_owner, 50%)
ContactRelation: 김집주인 → 박어머니 (type: parent)
```

### Tenant (세입자 + 계약정보)

| 필드          | 타입      | 설명                        |
| ------------- | --------- | --------------------------- |
| id            | UUID      | PK                          |
| officeId      | UUID      | FK → Office                 |
| propertyId    | UUID      | FK → Property               |
| contactId     | UUID      | FK → Contact                |
| deposit       | Int?      | 보증금 (만원)               |
| monthlyRent   | Int?      | 월세 (만원)                 |
| contractStart | DateTime? | 계약 시작일                 |
| contractEnd   | DateTime? | 계약 만료일                 |
| moveOutDate   | DateTime? | 퇴거 예정일                 |
| status        | String    | residing, moving_out, moved |
| memo          | String?   | 메모                        |

---

## 5. 매물

### Property (관리 단위)

사무소가 관리하는 부동산 단위 레코드. 장소(Site/Unit)에 사무소 컨텍스트를 부여한 것. 거래 정보(가격, 거래유형)는 Listing에 분리.

| 필드     | 타입    | 설명                         |
| -------- | ------- | ---------------------------- |
| id       | UUID    | PK                           |
| officeId | UUID    | FK → Office                  |
| siteId   | UUID    | FK → Site (필수)             |
| unitId   | UUID?   | FK → Unit (토지/단독은 null) |
| memo     | String? | 메모                         |

> Property는 "이 호실/토지를 우리 사무소가 관리한다"는 의미. 거래 조건(매매/전세/월세, 가격)은 Listing으로 분리.
> 하나의 Property에 여러 Listing이 붙을 수 있음 (예: 같은 호실에 매매 매물 + 전세 매물 동시 등록).

**siteId + unitId 구조:**

- `siteId`는 항상 필수 → 쿼리에서 바로 JOIN 가능
- `unitId`는 아파트/오피스텔만 → 토지/단독은 null
- Unit이 있어도 siteId를 중복 저장 (의도적 denormalization, 성능)

**Property에 연결되는 것들:**

- PropertyContact (소유자, 대리인 등 — 호실 단위)
- Tenant (세입자 — 호실 단위)
- ListingIntake[] (의뢰/접수 이력 — 1:N, 단 non-closed는 하나)
- Listing[] (의뢰 안의 거래 옵션 — 1:N)

### ListingIntake (의뢰/접수 단위)

한 번 들어온 매도·임대 의뢰의 공통 정보와 확인 이력을 소유한다. 확인 여부와
거래 진행 상태를 한 상태 컬럼에 섞지 않는다.

| 필드               | 타입      | 설명                                                  |
| ------------------ | --------- | ----------------------------------------------------- |
| id                 | UUID      | PK                                                    |
| officeId           | UUID      | FK → Office                                           |
| propertyId         | UUID      | FK → Property                                         |
| lifecycleStatus    | String    | open, hold, closed                                    |
| lifecycleChangedAt | DateTime  | 마지막 생명주기 전이 시각                             |
| lifecycleChangedBy | String    | user, system:deal                                     |
| closedReason       | String?   | closed일 때 종결 사유                                 |
| lastCheckedAt      | DateTime? | 마지막 확인 시도 시각                                 |
| lastVerifiedAt     | DateTime? | alive/price_changed로 유효성을 확인한 마지막 시각     |
| lastCheckResult    | String?   | alive, price_changed, unavailable, no_answer, pending |
| nextConfirmAt      | DateTime? | 다음 확인 예정 시각                                   |

- 생명주기: `open ↔ hold`, `open/hold → closed`, 필요 시 `closed → open/hold`
- 확인 표시: `lastVerifiedAt`, `lastCheckResult`, `nextConfirmAt`에서
  `unverified | verified | overdue | no_answer`를 파생
- `unavailable` 확인은 의뢰를 `closed`로 종결한다.
- 같은 Property에는 `open | hold` 의뢰가 최대 하나만 존재한다.
- 의뢰를 처음 전달한 사람은 ListingIntake의 속성으로 저장하지 않는다. 통화·상담은
  `CallLog`/`Consultation`에 남기고, 지속적인 소유자·대리인·연락 담당 관계는
  `PropertyContact`가 소유한다.

### Listing (매물 = 거래 단위)

ListingIntake 안의 거래/가격 옵션. 하나의 의뢰에 여러 Listing이 있을 수 있다
(매매 + 전세 동시 등록 등).

| 필드            | 타입    | 설명                     |
| --------------- | ------- | ------------------------ |
| id              | UUID    | PK                       |
| officeId        | UUID    | FK → Office              |
| propertyId      | UUID    | FK → Property            |
| intakeId        | UUID    | FK → ListingIntake       |
| transactionType | String  | sale, jeonse, monthly    |
| price           | Int?    | 매매가/전세가 (만원)     |
| deposit         | Int?    | 보증금 (만원)            |
| monthlyRent     | Int?    | 월세 (만원)              |
| isPaused        | Boolean | 이 거래 옵션만 일시 중단 |
| memo            | String? | 메모                     |

> 가격은 모두 만원(10,000 KRW) 단위
> Listing은 Match, Deal, PriceHistory의 참조 대상

**Listing 가용 상태는 저장하지 않고 파생한다:**

- `available`: 의뢰 open + Listing 미중단 + 점유 Deal 없음
- `paused`: 의뢰 hold 또는 Listing.isPaused
- `in_contract`: 비취소 Deal이 preparing / preContract / contracted / settling
- `closed`: 의뢰가 closed이거나 비취소 Deal이 completed / closed

### ListingAdvertisement (실제 광고 게재 기록)

이실장·부동산뱅크 등 CP에서 가져온 실제 광고다. CP가 상세 주소를 제공하므로
생성 시점부터 하나의 `Listing`에 귀속되며 별도의 호실 연결 상태를 두지 않는다.
CP 조회 결과에는 현재 광고 중인 항목만 포함된다. 사용자의 광고 요청은 일반
`Task(category=advertisement)`가 소유하고 수집·실행의 세부 성공/실패는 로컬
Skill SQLite에 남기므로 개별 광고 row의 상태로 저장하지 않는다.
하나의 row는 특정 `Listing`을 한 CP에 연속해서 게재한 한 회차다. 광고가
내려가도 삭제하지 않고 관측 종료 시각을 남기며, 이후 재광고는 같은 Listing
아래 새 row로 생성한다. Listing의 거래유형과 CP `channel`이 각각 분리되어
있으므로 거래유형별·CP별 동시 광고가 가능하다.

저장 테이블에는 active와 ended 회차가 함께 있지만 조회 의미는 분리한다.
매물관리 목록은 `status=active`인 관계만 `activeAdvertisements`로 반환하고,
`activeAdvertisementCount`도 같은 조건으로 DB에서 계산한다. 전체
`advertisements` 관계는 상세의 광고 이력에서만 사용한다. 따라서 전체 관계의
배열 길이를 현재 광고 개수로 해석하지 않는다.

| 필드                                    | 타입      | 설명                                          |
| --------------------------------------- | --------- | --------------------------------------------- |
| id                                      | UUID      | PK                                            |
| officeId                                | UUID      | FK → Office                                   |
| listingId                               | UUID      | FK → Listing                                  |
| channel                                 | String    | CP사 slug (`esiljang`, `budongsanbank`)       |
| status                                  | String    | active / ended                                |
| source                                  | String    | manual / cp_sync                              |
| advertisedPrice / Deposit / MonthlyRent | Int?      | CP에 제출된 광고 조건 (만원)                  |
| startedAt                               | DateTime? | CP가 제공한 등록/게재 시작일                  |
| firstSeenAt / lastSeenAt                | DateTime  | ERP의 최초/마지막 관측 시각                   |
| endedAt                                 | DateTime? | 전체 스냅샷에서 사라진 관측 시각              |
| externalAdId                            | String?   | CP사 광고 ID                                  |
| url                                     | String?   | CP 광고 관리 URL                              |
| naverArticleNo                          | String?   | CP가 제공한 네이버 매물번호(광고노트 FK 아님) |
| naverUrl                                | String?   | 네이버 비교 기준 URL                          |
| providerStatus                          | String?   | CP 화면에서 관측한 상태                       |
| lastSyncedAt                            | DateTime? | 마지막 CP 동기화                              |
| lastCheckedAt                           | DateTime? | 마지막 네이버 비교                            |

`channel`은 게시 플랫폼이 아니라 CP사다. 게시 플랫폼은 현재 네이버로 고정하며
별도 `publicationPlatform` 필드를 두지 않는다.

완전한 CP 조회가 성공하면 반환된 row를 `active`로 갱신하고, 그 성공한 전체
조회에서 사라진 기존 row만 `ended`로 전환할 수 있다. 조회가 실패하거나
일부만 수집됐으면 마지막 성공 스냅샷을 그대로 유지하고 로컬 Skill run에
오류를 기록한다.

`endedAt`은 광고 종료 예정일이 아니라 관측 종료 시각이다. 기존의 종료된
externalAdId는 새 게재 row에서 다시 사용할 수 있지만, 활성 범위에서는
`(officeId, channel, externalAdId)`와 `(officeId, listingId, channel)`을 각각
유일하게 유지한다. CP의 `providerStatus=거래완료`는 현재 관측값만 저장하며
ListingIntake 자동 종료 정책은 아직 적용하지 않는다.

### ListingAdvertisementPriceHistory (광고 가격 관측 이력)

광고가 처음 발견됐을 때 최초 가격 상태를 하나 저장하고, 같은 게재 회차의
매매가·보증금·월세 중 하나라도 바뀌었을 때만 새 상태를 append한다. 단순한
반복 스냅샷은 이력을 만들지 않는다. `ListingAdvertisement → Listing` 조인으로
한 Listing의 모든 CP와 재광고 회차 가격을 시간순으로 조회한다. 이는 사무소
원장 가격 변경을 나타내는 `PriceHistory`와 별개다.

### OfficeAdvertisementGroup / OfficeAdvertisement (내 광고 네이버 비교)

`OfficeAdvertisementGroup`은 반드시 하나의 `ListingAdvertisement`에 1:1로
귀속된다. 현재 네이버 순위, 같은 호실 중복 수, 경쟁 최저·최고가를 저장하고
`OfficeAdvertisement` 자식 row로 내 광고와 비교 광고의 관측값을 보관한다.
단지·동·호 힌트, 수동 연결, 제외 상태는 두지 않으며 위치는
`ListingAdvertisement → Listing → Property → Unit`에서만 읽는다.

`OfficeAdvertisement.floorInfo`는 네이버에 실제로 노출된 값(`12/25`,
`중/25` 등)이며 내부 `Unit.floor`와 별개다. 서버는 이를
`floorExposureMode = exact | band | unknown`으로 분류하고 원본
`verificationTypeCode`도 선택적으로 보존한다. 현재 비교에서 활성 경쟁 광고
중 하나라도 내 광고보다 비교 가능한 가격 조건이 낮으면 순위와 무관하게
`더 싼 광고 있음` 경고를 낸다. 월세는 보증금과 월세가 모두 같거나 낮고 둘 중
하나 이상이 엄격히 낮은 경우만 더 싼 조건이며, 서로 반대 방향으로 움직이면
비교 불가로 둔다. CP 광고는 활성인데 네이버의 내 광고 관측값이 비활성이면
가격 비교보다 먼저 `내 광고 미노출` 경고를 낸다.

---

## 6. 구매고객

### BuyerIntake (구매 의뢰)

하나의 구매 프로젝트에 참여하는 여러 Contact와 여러 BuyerRequirement를 묶는다.
같은 Contact가 서로 다른 구매 프로젝트를 동시에 가질 수 있다.

- 참여자는 `BuyerIntakeContact`로 연결한다.
- `role`은 buyer, co_buyer, representative, supporter, advisor, other 중 하나다.
- `isPrimary`는 해당 구매 프로젝트의 주 연락 창구이며 Intake당 한 명만 허용한다.
- 최초 문의자는 관계 속성으로 저장하지 않고 `CallLog`와 `Consultation`에 기록한다.

### BuyerRequirement (구매 희망조건)

한 BuyerIntake가 여러 BuyerRequirement를 가질 수 있다. 각 행은 고객 자체가 아니라
매칭에 사용하는 하나의 독립적인 탐색 조건이다. 가격과 면적은 정규화된 숫자로,
그 밖의 자유 조건은 `memo`에 기록한다.

| 필드                    | 타입      | 설명                                |
| ----------------------- | --------- | ----------------------------------- |
| id                      | UUID      | PK                                  |
| officeId                | UUID      | FK → Office                         |
| buyerIntakeId           | UUID      | FK → BuyerIntake                    |
| priorityRank            | Int       | 같은 Intake 안의 조건 우선순위      |
| status                  | String    | active, hold, completed             |
| urgency                 | String    | urgent, normal, flexible            |
| transactionType         | String?   | sale, jeonse, monthly               |
| siteTypes               | String[]  | 희망 매물유형 (apartment, villa...) |
| priceMin / priceMax     | Int?      | 예산 범위 (만원)                    |
| depositMin / depositMax | Int?      | 보증금 범위 (만원)                  |
| monthlyRentMin / monthlyRentMax | Int? | 월세 범위 (만원)                  |
| areaMin / areaMax       | Decimal?  | 희망 공급면적 범위 (m² 저장, UI는 평) |
| moveInDate              | DateTime? | 입주 희망일                         |
| assignedToId            | UUID?     | FK → User (담당 중개사)             |
| lastContactDate         | DateTime? | 최근 연락일                         |
| nextContactDate         | DateTime? | 다음 연락 예정일                    |
| memo                    | String?   | 추가 조건과 상담 배경을 적는 요건 메모 |

- 희망 지역: `BuyerRequirementRegion`에서 법정동 코드로 관리
- 희망 단지: `BuyerRequirementSite`에서 Site FK와 우선순위로 관리

---

## 7. 상담

### Consultation (상담 메모)

순수 메모. 누구와 무슨 이야기를 했는지 기록. context FK로 맥락 자동 연결.

| 필드        | 타입   | 설명                                               |
| ----------- | ------ | -------------------------------------------------- |
| id          | UUID   | PK                                                 |
| officeId    | UUID   | FK → Office                                        |
| contactId   | UUID   | FK → Contact (상담 상대방)                         |
| createdById | UUID   | FK → User (기록자)                                 |
| type        | String | phone, visit, online                               |
| content     | String | 메모 내용                                          |
| propertyId  | UUID?  | FK → Property (호실 맥락 — 소유자 상담 등)         |
| listingId   | UUID?  | FK → Listing (매물 맥락 — 가격 협상, 매물 문의 등) |
| matchId     | UUID?  | FK → Match (매칭 탭에서 기록 시 자동 연결)         |
| buyerIntakeId | UUID? | FK → BuyerIntake (구매 프로젝트 전체 상담)         |
| buyerReqId  | UUID?  | FK → BuyerRequirement (구매조건 탭에서 자동 연결)  |

`buyerReqId`가 있으면 서버가 소속 `buyerIntakeId`를 자동으로 채운다. 두 값을 함께
보낼 때는 같은 구매 프로젝트를 가리켜야 하며, 상담 상대방은 해당 BuyerIntake의
참여자로 연결되어 있어야 한다.

> propertyId: 호실/부동산 단위 맥락 (소유자 연락, 세입자 관련 상담 등)
> listingId: 거래 매물 맥락 (가격 협상, 매물 확인 상담 등)
> 둘 다 설정 가능 — listingId가 있으면 propertyId는 listing.propertyId에서 유추 가능하지만, 편의상 직접 설정도 허용
> 상담에서 할 일이 생기면 → Task를 별도 생성 (Task.consultationId로 연결)
> Deal 과정 메모는 별도 설계 예정 (DealNote 등)

---

## 8. 파이프라인

### Match (매칭)

매물(Listing)과 구매 희망조건을 연결.

| 필드       | 타입    | 설명                  |
| ---------- | ------- | --------------------- |
| id         | UUID    | PK                    |
| officeId   | UUID    | FK → Office           |
| listingId  | UUID    | FK → Listing          |
| buyerReqId | UUID    | FK → BuyerRequirement |
| stage      | String  | 매칭 단계             |
| memo       | String? | 메모                  |

**매칭 파이프라인:**

```
suggested → buyerInterested → viewingConfirmed → viewing → negotiating → dealCreated → closed
```

### Deal (거래)

거래 진행 관리. Match에서 전환되어 생성. 중개사 입장의 비즈니스 관리 데이터.

| 필드                   | 타입     | 설명                      |
| ---------------------- | -------- | ------------------------- |
| id                     | UUID     | PK                        |
| officeId               | UUID     | FK → Office               |
| listingId              | UUID     | FK → Listing              |
| stage                  | String   | 거래 단계 (DealStage)     |
| price                  | Int?     | 최종 거래가 (만원)        |
| buyerContactId         | UUID?    | FK → Contact (매수인)     |
| sellerContactId        | UUID?    | FK → Contact (매도인)     |
| commissionSellerRate   | Decimal? | 매도측 수수료율 (%)       |
| commissionSellerAmount | Int?     | 매도측 수수료 (만원)      |
| commissionBuyerRate    | Decimal? | 매수측 수수료율 (%)       |
| commissionBuyerAmount  | Int?     | 매수측 수수료 (만원)      |
| commissionTotal        | Int?     | 수수료 총액 (만원)        |
| vat                    | Int?     | 부가세 (만원)             |
| isJointBrokerage       | Boolean  | 공동중개 여부             |
| partnerBrokerName      | String?  | 상대 중개사무소명         |
| partnerBrokerPhone     | String?  | 상대 중개사 연락처        |
| partnerCommission      | Int?     | 상대 중개사 수수료 (만원) |
| memo                   | String?  | 메모                      |

> 수수료는 단독중개든 공동중개든 항상 매도측/매수측으로 분리 기록
> `commissionTotal` = `commissionSellerAmount` + `commissionBuyerAmount`
> 공동중개 시 `partnerCommission`은 상대방이 가져가는 몫 (우리 수수료와 별도)

**거래 파이프라인:**

```
preparing → preContract(선택) → contracted → settling → completed → closed
```

Match가 매물 선정·임장·협상·거래 전환까지 담당한다. Deal은 거래 전환 후 계약
준비부터 시작하며, 가계약이 없는 거래는 `preparing`에서 `contracted`로 바로 이동한다.

### Contract (계약 상세, Deal 1:1)

Deal이 계약 단계에 도달하면 생성. 계약서에 기재되는 법적 내용.

| 필드                | 타입      | 설명                         |
| ------------------- | --------- | ---------------------------- |
| id                  | UUID      | PK                           |
| officeId            | UUID      | FK → Office                  |
| dealId              | UUID      | FK → Deal (unique, 1:1)      |
| transactionType     | String    | sale, jeonse, monthly        |
| buyerContactId      | UUID      | FK → Contact (매수인/임차인) |
| sellerContactId     | UUID      | FK → Contact (매도인/임대인) |
| totalPrice          | Int       | 총 거래금액 (만원)           |
| monthlyRent         | Int?      | 월세 (만원, monthly일 때만)  |
| status              | String    | 계약 상태                    |
| contractDate        | DateTime? | 계약일                       |
| contractDeposit     | Int?      | 계약금 (만원)                |
| contractDepositDate | DateTime? | 계약금 지급일                |
| contractDepositPaid | Boolean   | 계약금 입금 확인             |
| middlePayment       | Int?      | 중도금 (만원)                |
| middlePaymentDate   | DateTime? | 중도금 지급일                |
| middlePaymentPaid   | Boolean   | 중도금 입금 확인             |
| finalPayment        | Int?      | 잔금 (만원)                  |
| finalPaymentDate    | DateTime? | 잔금 지급일                  |
| finalPaymentPaid    | Boolean   | 잔금 입금 확인               |
| moveInDate          | DateTime? | 입주일                       |
| leaseStartDate      | DateTime? | 임대 시작일 (전세/월세)      |
| leaseEndDate        | DateTime? | 임대 종료일 (전세/월세)      |
| specialTerms        | String?   | 특약사항                     |
| attachments         | String[]  | 첨부파일 URL 목록            |
| memo                | String?   | 메모                         |

**계약 상태 파이프라인:**

```
draft → signed → depositPaid → balancePaid → registered → cancelled
```

> Deal과 Contract의 차이: Deal은 "사무소 내부 거래 관리용", Contract는 "계약서에 도장 찍히는 법적 내용"
> Contract의 당사자(buyerContactId/sellerContactId)는 계약서 기준이므로 Deal의 당사자와 다를 수 있음 (대리인 등)

### DealParticipant (거래 참여자 + 수수료 정산)

거래에 참여한 직원별 역할/수수료 배분/정산 상태. 직원 실적 관리의 핵심.

| 필드             | 타입      | 설명                              |
| ---------------- | --------- | --------------------------------- |
| id               | UUID      | PK                                |
| officeId         | UUID      | FK → Office                       |
| dealId           | UUID      | FK → Deal                         |
| userId           | UUID      | FK → User (참여 직원)             |
| role             | String    | 역할 (아래 참고)                  |
| side             | String    | seller, buyer, both — 수수료 출처 |
| commissionAmount | Int?      | 배분 금액 (만원)                  |
| commissionRate   | Decimal?  | 배분 비율 (%)                     |
| settlementStatus | String    | unsettled, settled                |
| settlementDate   | DateTime? | 정산일                            |
| memo             | String?   | 메모                              |

> unique: [dealId, userId, role]

**role 값:**

- `listing_agent` — 매도측 전담 (side: seller)
- `buying_agent` — 매수측 전담 (side: buyer)
- `dual_agent` — 단독중개 시 양측 모두 (side: both)
- `manager` — 사장님/팀장 참여 (side: both)
- `assistant` — 보조 (side: 해당 측)
- `closer` — 마감 담당 (side: 해당 측)

**Office.commissionConfig (JSONB):**
사장님이 설정하는 기본 수수료 배분 규칙. Deal 생성 시 자동 적용.

```json
{
  "distributionType": "percentage",
  "defaultAgentRate": 50,
  "listingAgentRate": 50,
  "buyingAgentRate": 50,
  "dualAgentRate": 70,
  "managerRate": 10,
  "closerBonus": 0
}
```

---

## 9. 업무/인사이트

### Task (업무)

| 필드           | 타입      | 설명                                          |
| -------------- | --------- | --------------------------------------------- |
| id             | UUID      | PK                                            |
| officeId       | UUID      | FK → Office                                   |
| title          | String    | 제목                                          |
| content        | String?   | 내용                                          |
| source         | String    | manual, system, ai                            |
| status         | String    | pending / in_progress / completed / cancelled |
| priority       | String    | urgent / high / medium / low                  |
| category       | String    | advertisement 등 업무 분류                    |
| assignedToId   | UUID?     | 실제 처리 담당 직원                           |
| dueDate        | DateTime? | 마감일                                        |
| contactId      | UUID?     | FK → Contact (관련 연락처)                    |
| propertyId     | UUID?     | FK → Property (관련 호실/부동산 단위)         |
| listingId      | UUID?     | FK → Listing (관련 매물/거래 단위)            |
| consultationId | UUID?     | FK → Consultation (상담에서 생성된 경우)      |

> 상담 후 "할 일 추가" → Task 생성 시 contactId, propertyId, listingId 자동 전달

광고 작업은 별도 agent queue 없이 위 `Task`를 그대로 사용한다. 외부 AI는
`find_tasks(category=advertisement, status=pending)`로 조회하고 `claim_task`로
원자적으로 `in_progress` 전환한다. CP 대상 확인·저장·재광고·최종 확인 단계와
시도 이력은 `estate-erp-ad-task-runner` 로컬 SQLite에만 저장한다.

서버에는 `AgentSession`, wakeup/run/activity, `AgentActionRequest`,
`AdvertisementSyncRun/Step`을 두지 않는다. provider 상태를 다시 읽어 확인하고
완전한 CP 스냅샷을 반영한 뒤에만 Task를 `completed`로 바꾼다.

네이버 수집 범위(ERP `siteId`와 Naver `complexNo` 매핑)는
`naver-complex-collector` 로컬 SQLite가 소유한다. ERP는 관리단지와 완전한
광고 관측 snapshot만 저장한다.

## 10. 가격 이력

### PriceHistory (가격 변경 이력)

매물(Listing)의 가격 변화를 자동으로 추적한다.

| 필드              | 타입     | 설명                             |
| ----------------- | -------- | -------------------------------- |
| id                | UUID     | PK                               |
| officeId          | UUID     | FK → Office                      |
| listingId         | UUID     | FK → Listing                     |
| changedBy         | UUID     | FK → User (변경을 기록한 사용자) |
| priceBefore       | Int?     | 변경 전 매매가 (만원)            |
| priceAfter        | Int?     | 변경 후 매매가 (만원)            |
| depositBefore     | Int?     | 변경 전 보증금 (만원)            |
| depositAfter      | Int?     | 변경 후 보증금 (만원)            |
| monthlyRentBefore | Int?     | 변경 전 월세 (만원)              |
| monthlyRentAfter  | Int?     | 변경 후 월세 (만원)              |
| reason            | String?  | 가격 변경 사유                   |
| createdAt         | DateTime | 변경 기록일                      |

> 자동 추적: Listing의 price/deposit/monthlyRent가 변경되면 middleware에서 PriceHistory 레코드 자동 생성

---

## 11. 활동 로그

### ActivityLog (활동 로그, 감사 추적)

모든 데이터 변경을 추적하는 감사 로그. HubSpot Audit Cards 패턴 참고.

| 필드       | 타입     | 설명                                                 |
| ---------- | -------- | ---------------------------------------------------- |
| id         | UUID     | PK                                                   |
| officeId   | UUID     | FK → Office                                          |
| userId     | UUID?    | FK → User (직원이 한 작업이면 FK, 시스템/MCP는 null) |
| actor      | String   | 행위자 ("user", "mcp:claude", "system:rule_engine")  |
| source     | String   | 출처 ("web" \| "mcp" \| "system")                    |
| action     | String   | 작업 유형 ("create" \| "update" \| "delete")         |
| entityType | String   | 엔티티 타입 (Property, Contact, Deal 등)             |
| entityId   | UUID     | 변경된 엔티티 ID                                     |
| changes    | JSONB?   | 변경 내용 ({"field": {"before": v1, "after": v2}})   |
| reason     | String?  | 변경 사유 (선택적, AI가 제공할 수 있음)              |
| createdAt  | DateTime | 기록 시간                                            |

> **목적**: 모든 데이터 변경 내역 추적. 누가(userId+actor), 어떤 출처(source)에서, 뭘(action+entityType), 언제(createdAt) 했는지 기록
> **활용**: 감사/컴플라이언스, AI 에이전트 동작 검증, 직원별 변경 이력 조회
> **추적 대상**: 핵심 비즈니스 엔티티 11개 — Property, Listing, Contact, PropertyContact, Tenant, BuyerRequirement, Match, Deal, Consultation, Task, NetworkSharedProperty (장소 마스터, 시스템 데이터, PriceHistory 등은 제외)
> **구현**: NestJS Prisma Middleware에서 create/update/delete 자동 가로채기 + AsyncLocalStorage로 요청 컨텍스트(사용자 정보) 전달

---

## 12. 공동 중개망

### NetworkRoom (중개방)

카카오톡 그룹방처럼 운영되는 매물 공유 방.

| 필드        | 타입    | 설명                                |
| ----------- | ------- | ----------------------------------- |
| id          | UUID    | PK                                  |
| name        | String  | 방 이름 ("강동구 공동중개")         |
| description | String? | 방 설명                             |
| type        | String  | public (공개방), private (비공개방) |
| createdBy   | UUID    | FK → Office (방 생성 사무소)        |
| region      | String? | 지역 태그                           |
| maxMembers  | Int?    | 최대 참여 사무소 수 (null = 무제한) |
| isActive    | Boolean | 활성 여부                           |

### NetworkRoomMember (방 참여자)

| 필드     | 타입      | 설명                              |
| -------- | --------- | --------------------------------- |
| id       | UUID      | PK                                |
| roomId   | UUID      | FK → NetworkRoom                  |
| officeId | UUID      | FK → Office                       |
| role     | String    | admin (방장), member              |
| status   | String    | pending, approved, rejected, left |
| joinedAt | DateTime? | 승인 시점                         |

> unique: [roomId, officeId]
> 방 생성자 → 자동으로 admin + approved

### NetworkSharedProperty (공유 매물)

내 매물장에서 선택하여 중개방에 공유. 공개 항목을 공유자가 직접 선택 (마스킹).

| 필드         | 타입    | 설명                        |
| ------------ | ------- | --------------------------- |
| id           | UUID    | PK                          |
| roomId       | UUID    | FK → NetworkRoom            |
| listingId    | UUID    | FK → Listing                |
| officeId     | UUID    | FK → Office (공유한 사무소) |
| sharedBy     | UUID    | FK → User (공유한 사용자)   |
| showSiteName | Boolean | 단지명 공개 (기본 true)     |
| showDong     | Boolean | 동 공개 (기본 false)        |
| showUnit     | Boolean | 호수 공개 (기본 false)      |
| showPrice    | Boolean | 가격 공개 (기본 true)       |
| showArea     | Boolean | 면적 공개 (기본 true)       |
| showFloor    | Boolean | 층수 공개 (기본 false)      |
| showMemo     | Boolean | 메모 공개 (기본 false)      |
| showPhotos   | Boolean | 사진 공개 (기본 false)      |
| contactName  | String? | 담당자명                    |
| contactPhone | String? | 담당자 전화                 |
| description  | String? | 공유 코멘트 ("급매" 등)     |
| isActive     | Boolean | 공유 활성 여부              |

> unique: [roomId, listingId]
> 같은 매물을 여러 방에 공유 가능 (방마다 공개 범위 다름)
> 마스킹 이유: 다른 사무소가 매물 추적해서 빼갈 수 있으므로

### NetworkInquiry (매물 문의)

| 필드             | 타입      | 설명                                 |
| ---------------- | --------- | ------------------------------------ |
| id               | UUID      | PK                                   |
| sharedPropertyId | UUID      | FK → NetworkSharedProperty           |
| fromOfficeId     | UUID      | FK → Office                          |
| fromUserId       | UUID      | FK → User                            |
| status           | String    | pending, accepted, rejected, expired |
| message          | String?   | 문의 내용                            |
| response         | String?   | 응답 내용                            |
| respondedAt      | DateTime? | 응답 시점                            |

### NetworkMessage (중개방 채팅)

| 필드             | 타입   | 설명                                        |
| ---------------- | ------ | ------------------------------------------- |
| id               | UUID   | PK                                          |
| roomId           | UUID   | FK → NetworkRoom                            |
| officeId         | UUID   | FK → Office                                 |
| userId           | UUID   | FK → User                                   |
| content          | String | 메시지 내용                                 |
| sharedPropertyId | UUID?  | FK → NetworkSharedProperty (매물 카드 첨부) |

---

## 13. 외부 시장 매물 (광고노트)

네이버 등 외부 플랫폼에서 수집한 매물 데이터를 사무소별로 저장하는 레이어. **Estate ERP 서버는 직접 크롤링하지 않는다** — 사무소가 자기 책임으로 로컬 크롤러·MCP·수동 입력을 통해 적재한다.

### 설계 원칙

1. **사무소별 귀속**: 모든 외부 매물은 `officeId` NOT NULL. 다른 사무소와 공유하지 않음 (법적 책임 격리).
2. **2단 구조**: `ExternalListingGroup`(동일주소 그룹) → `ExternalListing`(개별 매물). electron-estate의 `HouseProperty` / `Offer`에 1:1 대응.
3. **기억 보존**: 사용자가 확인한 `ho`, `memo`는 Group에 저장되며 **크롤러가 절대 덮어쓰지 않는다**.
4. **매칭 규칙** (electron-estate 방식):
   - 새 `articleNo`가 DB에 있으면 기존 그룹 재사용
   - 없으면 네이버 `sameAddr` 그룹 내 다른 `articleNo` 중 DB에 있는 것 찾아 그룹 병합
   - 둘 다 없으면 새 그룹 생성
5. **호수는 텍스트**: 호수는 내부 Unit과 연결하지 않고 사용자가 `ho`에 일반 문자열로 기록한다.
6. **ActivityLog 추적 대상 아님**: 매일 크롤러 upsert가 감사 로그를 오염시키지 않도록 분리.

### ExternalListingGroup (동일주소 외부 매물 그룹)

| 필드                  | 타입     | 설명                                           |
| --------------------- | -------- | ---------------------------------------------- |
| id                    | UUID     | PK                                             |
| officeId              | UUID     | FK → Office (NOT NULL)                         |
| siteId                | UUID     | FK → Site (단지 — 거의 항상 식별 가능)         |
| buildingName          | String?  | 네이버가 준 동명 원문 ("101동" 등)             |
| ho                    | String?  | 사용자가 기록한 호수 텍스트 ("1503호")         |
| areaName              | String?  | 평형명 ("84A")                                 |
| exclusiveAreaM2       | Decimal? | 전용면적                                       |
| transactionType       | String   | sale / jeonse / monthly                        |
| memo                  | String?  | 사용자 메모 — 크롤러 덮어쓰기 금지             |
| status                | String   | unmatched / verified / on_hold                 |
| mainExternalListingId | UUID?    | 대표 매물 FK (1:1, 네이버 representative 대응) |
| firstSeenAt           | DateTime | 최초 관측일                                    |
| lastSeenAt            | DateTime | 마지막 관측일                                  |

> **핵심 불변 조건**: 같은 Group의 모든 Listing이 사라져도 Group은 유지된다. 사용자가 기록한 `ho`·`memo`는 다음 크롤링에서 같은 동일주소 그룹이 다시 올라오면 자동 재사용된다.

### ExternalListing (개별 외부 매물 1건)

| 필드                            | 타입     | 설명                                     |
| ------------------------------- | -------- | ---------------------------------------- |
| id                              | UUID     | PK                                       |
| officeId                        | UUID     | FK → Office                              |
| groupId                         | UUID     | FK → ExternalListingGroup                |
| source                          | String   | naver / kb / manual 등 (기본 "naver")    |
| articleNo                       | String   | 네이버 매물번호                          |
| sourceUrl                       | String?  | 원본 URL                                 |
| cpName                          | String?  | 등록 채널명 (네이버/직방/부동산114)      |
| cpid                            | String?  | 채널 ID                                  |
| cpPcArticleUrl                  | String?  | PC 상세 URL                              |
| representativeArticleNo         | String?  | 네이버 sameAddr 대표 articleNo (매칭 키) |
| sameAddrCnt                     | Int?     | 같은 주소 매물 수                        |
| sameAddrDirectCnt               | Int?     | 같은 주소 직접거래 수                    |
| sameAddrMaxPrc / sameAddrMinPrc | String?  | 같은 주소 최고/최저가                    |
| transactionType                 | String   | sale / jeonse / monthly                  |
| price                           | Int?     | 매매가/전세가 (만원)                     |
| deposit                         | Int?     | 보증금 (만원)                            |
| monthlyRent                     | Int?     | 월세 (만원)                              |
| articleName                     | String?  | 네이버 매물명                            |
| articleFeatureDesc              | Text?    | 특징 설명                                |
| detailDescription               | Text?    | 상세 설명                                |
| articleConfirmYmd               | String?  | 네이버 매물 확인일                       |
| floorInfo                       | String?  | "저/중/고/23" 마스킹 원본                |
| exclusiveAreaM2                 | Decimal? | 전용면적                                 |
| supplyAreaM2                    | Decimal? | 공급면적                                 |
| direction                       | String?  | 향                                       |
| tagList                         | JSONB?   | 태그 배열                                |
| verificationTypeCode            | String?  | 소유주 확인 코드 (OWNER / NDOC1 등)      |
| realtorId                       | String?  | 등록 중개사 ID                           |
| realtorName                     | String?  | 등록 중개사명                            |
| originalRealtorName             | String?  | 원 등록 중개사명                         |
| representativeTelNo             | String?  | 대표 번호                                |
| cellPhoneNo                     | String?  | 휴대폰                                   |
| ranking                         | Int?     | 노출 순위                                |
| isSharedRank                    | Boolean  | 공유 순위 여부                           |
| sharedRank                      | Int?     | 공유 순위                                |
| sameRankNum                     | Int?     | 같은 순위 매물 수                        |
| seango                          | Boolean  | 선광고 (유료 상단 노출)                  |
| epju                            | Boolean  | e편주 (유료 광고)                        |
| exposeStartYmd / exposeEndYmd   | Int?     | 노출 기간                                |
| priceChangeState                | String?  | 가격 변동 상태                           |
| isPriceModification             | Boolean  | 가격 수정 여부                           |
| raw                             | JSONB?   | 원본 응답 전체 보존                      |
| firstSeenAt / lastSeenAt        | DateTime | 관측 메타                                |
| isActive                        | Boolean  | 최근 크롤링에서 살아있는지               |

> **unique**: `[officeId, source, articleNo]` — 같은 사무소가 같은 플랫폼의 같은 매물을 중복 등록 못 함.
> **매칭 키로 쓰이는 컬럼**: `articleNo`, `representativeArticleNo`. 새 매물을 upsert할 때 이 두 값으로 기존 그룹을 찾음.

### Upsert 로직 (의사 코드)

```typescript
async function upsertExternalListing(officeId, naverArticle, sameAddrSiblings) {
  // 1. 같은 articleNo가 있나?
  let existing = await db.externalListing.findUnique({
    where: {
      officeId_source_articleNo: {
        officeId,
        source: "naver",
        articleNo: naverArticle.articleNo,
      },
    },
    include: { group: true },
  });
  let group = existing?.group;

  // 2. 없으면 sameAddr 그룹의 다른 형제 매물이 DB에 있는지 확인
  if (!group) {
    for (const sibling of sameAddrSiblings) {
      const siblingExisting = await db.externalListing.findUnique({
        where: {
          officeId_source_articleNo: {
            officeId,
            source: "naver",
            articleNo: sibling.articleNo,
          },
        },
        include: { group: true },
      });
      if (siblingExisting?.group) {
        group = siblingExisting.group;
        break;
      }
    }
  }

  // 3. 그래도 없으면 새 그룹 생성
  if (!group) {
    group = await db.externalListingGroup.create({
      data: {
        officeId,
        siteId: resolvedSiteId,
        buildingName: naverArticle.buildingName,
        areaName: naverArticle.areaName,
        exclusiveAreaM2: naverArticle.area2,
        transactionType: mapTradeType(naverArticle.tradeTypeCode),
      },
    });
  }

  // 4. Listing upsert (group의 ho·memo는 절대 건드리지 않음)
  await db.externalListing.upsert({
    where: {
      officeId_source_articleNo: {
        officeId,
        source: "naver",
        articleNo: naverArticle.articleNo,
      },
    },
    create: { groupId: group.id, officeId, ...fieldsFromArticle },
    update: { price, ranking, lastSeenAt, ...updatableFields },
  });

  // 5. Group의 lastSeenAt만 갱신
  await db.externalListingGroup.update({
    where: { id: group.id },
    data: { lastSeenAt: new Date() },
  });
}
```

---

## 14. 업체 디렉토리

거래 후 하자/수리 이슈 발생 시 업체를 빠르게 찾을 수 있는 서비스 업체 관리. Contact(사람)와 별도 테이블로 분리.

### 공용 데이터 vs 사무소 데이터

```
officeId = null   →  공용 업체 풀 (플랫폼이 등록/관리)
officeId = UUID   →  사장님이 직접 등록한 단골 업체
```

- Site 테이블과 동일한 패턴
- 쿼리: `WHERE office_id = ? OR office_id IS NULL`
- 공용 업체 풀은 광고비 없음 (순수 편의 기능)

### ServiceCategory (서비스 카테고리 마스터)

읽기 전용 마스터 데이터. 대분류 → 세부 서비스 트리 구조.

| 필드      | 타입   | 설명                                  |
| --------- | ------ | ------------------------------------- |
| id        | UUID   | PK                                    |
| parentId  | UUID?  | FK → ServiceCategory (대분류면 null)  |
| name      | String | 카테고리명 ("배관/수도", "누수 수리") |
| slug      | String | 코드명 ("plumbing", "leak_repair")    |
| sortOrder | Int    | 정렬 순서                             |

> 대분류 예시: 배관/수도, 보일러/난방, 전기/조명, 도배/장판, 방수/방충, 타일/욕실, 잠금/보안, 청소, 인테리어, 이사, 전문가
> 세부 예시: 배관/수도 > 누수 수리, 배관 교체, 하수구 뚫음, 수전 교체, 동파 복구

### ServiceVendor (업체)

서비스 업체 정보. 1인 업체부터 법인까지.

| 필드              | 타입     | 설명                                                    |
| ----------------- | -------- | ------------------------------------------------------- |
| id                | UUID     | PK                                                      |
| officeId          | UUID?    | null = 공용 풀 / UUID = 사무소 개인 등록                |
| name              | String   | 업체명 ("김사장수리", "(주)한솔설비")                   |
| address           | String?  | 사무실/작업장 주소                                      |
| serviceCategories | String[] | 서비스 카테고리 slug 목록 (["plumbing", "leak_repair"]) |
| coverageDistricts | String[] | 서비스 가능 지역 districtCode 목록 (["11740", "11710"]) |
| priceNote         | String?  | 대략적 단가 메모 ("누수 15~25만, 출장비 별도")          |
| memo              | String?  | 메모 ("야간 긴급 가능, 작업 깔끔")                      |
| tags              | String[] | 사용자 정의 태그 (["단골", "저렴"])                     |
| isActive          | Boolean  | 활성 여부                                               |
| createdAt         | DateTime | 생성일                                                  |
| updatedAt         | DateTime | 수정일                                                  |

> index: [officeId]
> index: coverageDistricts GIN (지역 검색)
> index: serviceCategories GIN (카테고리 검색)

> **지역 커버리지**: districtCode(구 단위) 기반. "강동구, 송파구"처럼 선택. 읍면동 단위는 업체 등록이 번거롭고, 시 단위는 너무 넓음.

> **카테고리**: ServiceCategory 마스터의 slug를 String[]로 저장. 대분류와 세부 모두 포함 가능 ("plumbing" + "leak_repair").

### VendorContact (업체 담당자/연락처)

업체별 연락처 목록. 대표번호, 기사별 직통 등.

| 필드      | 타입     | 설명                                                    |
| --------- | -------- | ------------------------------------------------------- |
| id        | UUID     | PK                                                      |
| vendorId  | UUID     | FK → ServiceVendor                                      |
| name      | String   | 담당자명 또는 연락처명 ("김기사", "대표번호", "사무실") |
| phone     | String   | 전화번호                                                |
| role      | String?  | 역할 ("배관 담당", "대표", "야간 긴급")                 |
| memo      | String?  | 메모                                                    |
| createdAt | DateTime | 생성일                                                  |

> index: [vendorId]
> index: [phone] (CTI 검색용)
> 1인 업체: VendorContact 1개 (사장님 본인 번호)
> 법인 업체: VendorContact N개 (대표번호 + 기사별 + 사무실)

### 연락처 통합 검색

현재는 DB View 없이 `ContactPhone.phone`과 `VendorContact.normalizedPhone`을 병렬 조회한다.
사람 연락처의 `phone`은 이미 숫자만 저장되므로 별도 정규화 컬럼이 필요하지 않다.

### 업체 검색 흐름

```
매물 주소 → districtCode 추출 (강동구 = 11740)
카테고리 선택 (배관/수도 > 누수 수리)
    ↓
SELECT sv.*, vc.*
FROM service_vendors sv
LEFT JOIN vendor_contacts vc ON vc.vendor_id = sv.id
WHERE '11740' = ANY(sv.coverage_districts)
  AND 'leak_repair' = ANY(sv.service_categories)
  AND (sv.office_id = ? OR sv.office_id IS NULL)
ORDER BY
  CASE WHEN sv.office_id IS NOT NULL THEN 0 ELSE 1 END,  -- 내 업체 우선
  sv.name;
```

> 내 사무소 업체가 먼저, 공용 풀 업체가 보조로 노출

---

## 테이블 목록 (총 39개)

| #   | 테이블                                | DB명                      | 설명                                                            |
| --- | ------------------------------------- | ------------------------- | --------------------------------------------------------------- |
| —   | **법정동 마스터 (공공데이터 import)** |                           |                                                                 |
| 1   | Province                              | provinces                 | 시도 (서울특별시 등)                                            |
| 2   | District                              | districts                 | 시군구 (강동구 등)                                              |
| 3   | Ward                                  | wards                     | 읍면동 (고덕동 등)                                              |
| —   | **멀티테넌시**                        |                           |                                                                 |
| 4   | Office                                | offices                   | 사무소 (멀티테넌시, commissionConfig JSONB)                     |
| 5   | User                                  | users                     | 사용자/인증                                                     |
| —   | **장소/매물**                         |                           |                                                                 |
| 6   | Site                                  | sites                     | 장소 (wardCode FK → Ward)                                       |
| 7   | SiteUnitType                          | site_unit_types           | 평형 카탈로그 (84A, 59B 등 타입별 면적/방수)                    |
| 8   | Dong                                  | dongs                     | 동                                                              |
| 9   | Unit                                  | units                     | 호 (floor, lineNo, siteUnitTypeId FK)                           |
| 10  | OfficeSite                            | office_sites              | 사무소별 관리 단지 구독 + 즐겨찾기                              |
| 11  | Property                              | properties                | 관리 단위 (사무소가 관리하는 부동산 단위)                       |
| 12  | Listing                               | listings                  | 매물 (거래 단위 — 가격, 거래유형, 확인상태)                     |
| 13  | PriceHistory                          | price_histories           | 가격 변경 이력 (Listing 참조)                                   |
| —   | **연락처**                            |                           |                                                                 |
| 14  | Contact                               | contacts                  | 연락처 (모든 사람)                                              |
| 15  | ContactRelation                       | contact_relations         | 사람 간 관계 (가족, 전문가)                                     |
| 16  | PropertyContact                       | property_contacts         | 매물 관련인 (소유자, 대리인)                                    |
| 17  | Tenant                                | tenants                   | 세입자 + 계약정보                                               |
| —   | **CRM 핵심**                          |                           |                                                                 |
| 18  | BuyerRequirement                      | buyer_requirements        | 구매 희망조건                                                   |
| 19  | Consultation                          | consultations             | 상담 기록                                                       |
| 20  | Match                                 | matches                   | 매칭 파이프라인 (Listing 참조)                                  |
| 21  | Deal                                  | deals                     | 거래 (Listing 참조, 수수료 매도측/매수측 분리, 공동중개)        |
| 22  | Contract                              | contracts                 | 계약 상세 (Deal 1:1, 금액 스케줄, 임대기간)                     |
| 23  | DealParticipant                       | deal_participants         | 거래 참여자 (직원별 역할/수수료/정산)                           |
| —   | **업무**                              |                           |                                                                 |
| 24  | Task                                  | tasks                     | 업무                                                            |
| 25  | CalendarEvent                         | calendar_events           | 캘린더                                                          |
| 26  | ActivityLog                           | activity_logs             | 활동 로그 (감사 추적)                                           |
| —   | **알림**                              |                           |                                                                 |
| 27  | Notification                          | notifications             | 인앱 알림 (WebSocket + DB)                                      |
| —   | **공동 중개망**                       |                           |                                                                 |
| 28  | NetworkRoom                           | network_rooms             | 중개방                                                          |
| 29  | NetworkRoomMember                     | network_room_members      | 중개방 참여자                                                   |
| 30  | NetworkSharedProperty                 | network_shared_properties | 공유 매물 (Listing 참조, 마스킹)                                |
| 31  | NetworkInquiry                        | network_inquiries         | 공유 매물 문의                                                  |
| 32  | NetworkMessage                        | network_messages          | 중개방 채팅                                                     |
| —   | **외부 시장 매물 (광고노트)**         |                           |                                                                 |
| 33  | ExternalListingGroup                  | external_listing_groups   | 호실 단위 외부 매물 그룹 (HouseProperty 대응, 사용자 기억 보존) |
| 34  | ExternalListing                       | external_listings         | 개별 외부 매물 1건 (Offer 대응, articleNo 기준 unique)          |
| —   | **업체 디렉토리**                     |                           |                                                                 |
| 35  | ServiceCategory                       | service_categories        | 서비스 카테고리 마스터 (대분류→세부)                            |
| 36  | ServiceVendor                         | service_vendors           | 업체 (officeId nullable, 공용 풀 + 사무소별)                    |
| 37  | VendorContact                         | vendor_contacts           | 업체 담당자/연락처 (1:N)                                        |
