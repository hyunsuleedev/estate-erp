# Matching View Expansion Design

작성일: 2026-05-02
상태: approved design
대상: `apps/web/src/routes/_authenticated/matches/index.tsx`, `apps/desktop/src/renderer/routes/_authenticated/matches/index.tsx`

## 배경

현재 매칭 페이지는 `고객별`, `칸반`, `리스트` 3개 뷰를 제공한다. 이 구조는 구매고객 중심 진행 상황을 보기는 좋지만, 특정 매물에 어떤 고객들이 붙었는지 보는 공급 관점과, 업무 페이지의 `상태별` 뷰처럼 단계별 실행 대상을 빠르게 훑는 흐름이 부족하다.

사용자 확정안은 B안이다.

```text
고객별 / 매물별 / 단계별 / 칸반 / 전체
```

`단계별 리스트뷰`는 `단계별` 탭을 선택했을 때만 본문에 표시한다. `매물별` 뷰와 한 화면에 섞지 않는다.

## 목표

- 구매고객 관점, 매물 관점, 단계 실행 관점을 분리한다.
- 기존 `리스트` 뷰는 `전체`라는 이름으로 단일 표 역할을 유지한다.
- `단계별` 뷰는 업무 페이지의 상태별 뷰와 같은 정신 모델을 따른다.
- MVP에서는 `GET /matches` 결과를 클라이언트에서 그룹화하고, 새 서버 API는 만들지 않는다.

## 비목표

- 이번 범위에서 실제 Deal 생성 플로우를 새로 만들지 않는다. 기존 `stage = dealCreated` 전환만 사용한다.
- 이번 범위에서 drag-and-drop 단계 이동을 새로 만들지 않는다.
- 이번 범위에서 저장 가능한 사용자 커스텀 뷰를 만들지 않는다.
- 이번 범위에서 별도 소유자별 탭은 만들지 않는다. 소유자 정보는 매물별 뷰의 보조 정보로만 사용한다.

## 뷰 구조

뷰 스위처는 다음 순서로 둔다.

1. `고객별`
2. `매물별`
3. `단계별`
4. `칸반`
5. `전체`

내부 view mode 값은 다음처럼 잡는다.

```ts
type MatchViewMode = 'buyer' | 'property' | 'stage' | 'kanban' | 'list';
```

화면 라벨은 `list`를 `전체`로 표시한다. 기존 URL 라우팅은 유지하고, 탭 상태는 우선 로컬 state로 관리한다.

## 고객별 뷰

기존 `Contact -> BuyerRequirement -> Match` 구조를 유지한다.

사용 목적:

- 한 고객의 여러 구매조건을 분리해서 본다.
- 구매조건별 후보 매물을 비교한다.
- 기존 매칭 진행 lane과 상세 열기 동작을 유지한다.

변경 범위:

- 기존 구현을 크게 바꾸지 않는다.
- 뷰 이름은 `고객별`로 유지한다.

## 매물별 뷰

새로 추가할 뷰다. 구조는 `Listing -> Match[]`이다.

사용 목적:

- 한 매물에 몇 명의 구매고객이 붙었는지 본다.
- 같은 매물에 대한 고객 반응과 진행 단계를 비교한다.
- 소유자 컨택 전후에 어느 고객에게 우선 응대할지 판단한다.

그룹 헤더에 표시할 정보:

- 매물명 또는 호실명
- 주소
- 거래유형
- 가격
- check status
- 소유자/대표 연락처 요약, 데이터가 있으면 표시
- 전체 매칭 수, 진행 수, 거래 전환 수, 종료 수

그룹 내부 row에 표시할 정보:

- 단계 badge
- 구매고객 이름과 연락처
- 구매조건 요약
- 매칭 메모
- 최근 생성/수정일
- 단계 변경과 상세 열기 액션

데이터 규칙:

- 기본 그룹 키는 `match.listingId`이다.
- `listing`이 없는 비정상 데이터는 `매물 미지정` 그룹에 둔다.
- 소유자 정보는 `listing.property.propertyContacts` 중 `owner`, `co_owner`, `representative` 역할을 우선한다.
- 현재 API 응답에 property contacts가 없으면 MVP에서는 소유자 영역을 비워도 된다. 이후 include 확장으로 채운다.

## 단계별 뷰

새로 추가할 뷰다. 업무 페이지의 `상태별` 뷰처럼 stage별 접이식 리스트를 제공한다.

사용 목적:

- 오늘 처리할 매칭을 단계별로 빠르게 훑는다.
- `방문`, `판매자 동의`, `조건 협의` 같은 실행 단계의 병목을 표로 본다.
- 칸반보다 많은 정보를 한 화면에 조밀하게 보여준다.

그룹 순서:

1. `suggested`
2. `buyerContacted`
3. `viewing`
4. `ownerContacted`
5. `negotiating`
6. `dealCreated`
7. `closed`

그룹 라벨:

- `suggested`: 추천됨
- `buyerContacted`: 구매자 관심
- `viewing`: 방문
- `ownerContacted`: 판매자 동의
- `negotiating`: 조건 협의
- `dealCreated`: 거래 전환
- `closed`: 종료

각 그룹은 접고 펼칠 수 있다. MVP 기본값은 active stage 전체 펼침, `dealCreated`와 `closed`는 접힘으로 둔다.

테이블 컬럼:

- `No`
- `고객`
- `매물`
- `거래유형/가격`
- `구매조건`
- `메모`
- `최근 수정`
- `액션`

액션:

- 상세 열기
- 다음 단계 이동
- 종료
- 거래 전환

이번 범위에서는 드래그로 stage를 바꾸지 않는다. 액션 메뉴 또는 기존 단계 변경 컴포넌트를 재사용한다.

## 칸반 뷰

기존 `suggested`, `buyerContacted`, `viewing`, `ownerContacted`, `negotiating` 컬럼 구조를 유지한다.

사용 목적:

- 진행 파이프라인의 병목을 본다.
- active stage 중심으로 업무량을 비교한다.

변경 범위:

- `dealCreated`와 `closed` 결과 패널은 기존처럼 칸반 하단에 둔다.
- 단계별 뷰가 추가되더라도 칸반은 카드형 진행 관리 역할을 유지한다.

## 전체 뷰

기존 `리스트` 뷰를 `전체`로 이름만 바꾼다.

사용 목적:

- 전체 Match를 단일 표로 검색하고 확인한다.
- 특정 고객/매물/메모를 빠르게 찾는다.
- 상세 다이얼로그로 진입한다.

변경 범위:

- 기존 컬럼은 유지하되 라벨만 `리스트`에서 `전체`로 바꾼다.
- 단계별로 묶어 보여주는 동작은 `전체`가 아니라 `단계별` 뷰에서만 제공한다.

## 필터와 검색

기존 검색과 stage multi-select filter를 유지한다.

검색 대상:

- 고객명
- 연락처
- 매물명
- 주소
- 메모

필터:

- stage filter는 모든 뷰에 동일하게 적용한다.
- stage filter가 켜져 있으면 매물별/고객별 그룹에서도 해당 stage의 Match만 남긴다.
- 빈 그룹은 렌더링하지 않는다.

## 데이터 흐름

초기 진입:

1. `api.matches.findAll()`로 Match 목록을 가져온다.
2. 검색어와 stage filter로 `filteredMatches`를 만든다.
3. 뷰별 memoized grouped data를 만든다.

뷰별 파생 데이터:

- `groupedBuyerMatches`: 기존 `buyerReqId` 기준
- `groupedPropertyMatches`: `listingId` 기준
- `stageGroupedMatches`: `stage` 기준
- `activeMatches`, `convertedMatches`, `closedMatches`: 기존 칸반용 분류 유지

서버/API:

- MVP에서는 새 endpoint를 만들지 않는다.
- `GET /matches` 응답에 `listing -> property -> site/unit`은 계속 필요하다.
- 소유자 표시를 완성하려면 이후 `listing.property.propertyContacts.contact` include가 필요하다.

## 컴포넌트 경계

`MatchesPage` 안에 모든 로직을 더 키우기보다, 다음 컴포넌트로 분리한다.

- `MatchViewSwitcher`
- `PropertyMatchGroup`
- `PropertyMatchRow`
- `StageMatchView`
- `StageMatchGroup`
- `StageMatchTableRow`

기존 컴포넌트 중 유지/재사용할 것:

- `BuyerMatchGroup`
- `BuyerMatchLane`
- `MatchColumn`
- `MatchCard`
- `MatchActionsMenu`
- `MatchDetailDialog`
- `MetricTile`

web과 desktop 양쪽에 같은 화면 파일이 있으므로 동일 변경을 양쪽에 반영한다.

## 빈 상태와 오류 상태

공통:

- 필터 결과가 없으면 선택한 뷰 기준의 빈 상태 문구를 보여준다.
- stage update 실패 시 기존 mutation 오류 처리 패턴을 따른다.

매물별 빈 상태:

```text
매물별로 묶어 보여줄 매칭이 없습니다.
```

단계별 빈 상태:

```text
조건에 맞는 단계별 매칭이 없습니다.
```

개별 stage 그룹 안이 비어 있으면 그룹을 숨긴다. 단, 모든 그룹이 비면 전체 빈 상태를 표시한다.

## 테스트 계획

단위 테스트:

- `groupMatchesByListing(matches)`가 listing별로 Match를 묶는다.
- `groupMatchesByStage(matches)`가 stage order를 유지한다.
- stage filter 후 빈 그룹을 제외한다.

UI 확인:

- `고객별 / 매물별 / 단계별 / 칸반 / 전체` 탭이 한 번에 하나의 본문만 보여준다.
- 단계별 뷰 선택 시 stage 그룹 테이블만 보인다.
- 매물별 뷰 선택 시 listing 그룹만 보인다.
- 기존 상세 다이얼로그와 stage 변경 액션이 새 뷰에서도 동작한다.

수동 검증:

- `pnpm typecheck`
- 가능하면 web dev server에서 Matches 페이지를 열어 브라우저 스크린샷으로 확인한다.

## 구현 순서 제안

1. 공통 group helper를 추가한다.
2. view mode 타입과 스위처 라벨을 확장한다.
3. web Matches에 매물별 뷰를 추가한다.
4. web Matches에 단계별 뷰를 추가한다.
5. desktop Matches에 동일 변경을 반영한다.
6. 타입체크와 브라우저 확인을 수행한다.
