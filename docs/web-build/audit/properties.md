# 감사: properties — partial (6/10)

매물장 5개 라우트(목록/상세/등록/외부매물/내광고)가 모두 존재한다. 목록(index)은 Property 단위 그룹핑된 엑셀형 테이블 + 인라인 편집(확인상태·가격·입주일) + 무한스크롤 + 빠른확인 시트(가격이력·광고·연락처·알림 포함)로 완성도가 높고, 외부매물(광고노트)도 스냅샷 세션·수동입력·낙관적 인라인 편집까지 갖춰 가장 견고하다. 반면 상세 페이지($id)는 수정/공유/매칭 생성/관련인·상담·거래 추가/사진 업로드 등 액션 버튼이 전부 죽어 있는 read-only 수준이고, ListingIntake(의뢰) 3단 구조는 api-client에 완비되어 있음에도 web UI에서 전혀 사용되지 않으며, naver-my-ads는 네비에도 연결되지 않은 자칭 '연동 전 단계' 스텁이다. 만원→억 표기(formatPrice)·평 환산·확인상태 파이프라인 등 한국 실무 표기는 잘 지켜졌다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 매물 목록: Property 단위 그룹핑(매매/전세/월세 스택) 엑셀형 DataTable(notion 변형), 무한스크롤 + 총건수 상태바, 거래유형 탭
- 목록 필터: 단지 자동완성(매물수 표시), 매물유형/확인상태 셀렉트, 가격·보증금·월세(만원)·전용면적(평→m² 환산) 범위, 활성 필터 칩, 정렬(가격/등록일/확인일), 디바운스 검색, Reset
- 인라인 편집(낙관적 업데이트): checkStatus 칩(unverified→verified→in_contract→hold→done 파이프라인), 가격/보증금/월세 숫자, 입주가능일(즉시/특정일/기간/협의 + 날짜 피커)
- 빠른확인 시트(상세 패널): 운영 알림(미확인 거래·공동중개·소유주 연락처 없음·확인일 30일 경과·임차 만기 45일), 거래 카드, 가격변경 이력(PriceHistory), 광고 목록(채널·상태·광고가), 소유주/임차인 tel: 전화, 최근 상담, 로딩 스켈레톤/404 처리
- 상세 페이지: 개요/매칭/상담/거래정보/관련인/사진/공적장부 7개 탭, 매칭·상담·임차인·거래 read 표시, 빈 상태 처리
- 공적장부 탭: 6종(등기부 700원 포함) 카드, 발급 요청 mutation + toast, 일괄 발급, 발급 이력·누적 비용 표시
- 사진 탭: 카테고리 필터 + 히어로/썸네일 갤러리 조회(read-only)
- 등록(new.tsx): 관리단지+중앙 단지 검색(자동 OfficeSite 추가), placeholder Dong 자동 스킵, 동→호실 체인 선택, Site/Unit 기존 Property find-or-create, 같은 거래유형 중복 충돌 차단, 공동중개 파트너 선택, 소유주/임차인 Contact 동시 생성, 만원→억 환산 힌트, 성공 시 상세로 이동
- 외부매물(광고노트): 거래유형 탭, 스냅샷 세션 시작/완료/취소(권한 체크 + 확인 다이얼로그 + 구데이터 버킷), 수동 입력 다이얼로그(batchUpsert, 단지/동/호/평형 자동 면적), 상태·추정호수·메모 인라인 편집(낙관적), 즐겨찾기 토글, 동/호/매물특징/세안고/집주인/광고O/가격범위 클라이언트 필터, 네이버 출처 링크, 빈 상태/에러 배너
- 한국 실무 표기: formatPrice 만원→억 변환, m²→평(0.3025) 표기, 도로명/지번 주소, 법정동 기반 단지 참조

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- ListingIntake(의뢰) UI 전무 — api.listingIntakes(findAll/confirm/updateStatus/addListing, nextConfirmAt, 확인결과 alive/price_changed/no_answer/unavailable)가 api-client·서버에 완비됐으나 web 어디서도 미사용. 목록은 listings.findAll 기반이라 의뢰 접수일·다음 확인일·컨펌 사이클을 표시/기록할 수 없음. 인덱스에 intake 기반 확인(컨펌) 액션 추가 필요
- 상세 페이지($id.tsx) 액션 버튼 전부 미연결: 수정/공유/매칭 생성/+관련인 추가/+상담 추가/+거래 추가/+임차인 추가/편집/빠른 액션 4종/이전·다음 매물 이동/사진 추가·순서편집·대표지정 — onClick 핸들러 없는 죽은 버튼. 최소한 거래 추가·상담 추가·관련인 추가는 다이얼로그로 연결 필요
- 매물→거래(Deal)→계약(Contract) 컨텍스트 점프 없음: 상세 페이지에 Deal 섹션/링크가 전혀 없고 checkStatus가 in_contract여도 해당 거래로 이동 불가. api.deals 존재하므로 listingId 기준 Deal 조회 탭 추가 필요
- 삭제 CRUD 미완: api.listings.remove / api.properties.remove가 API에 있으나 목록·상세 어디에도 UI 없음
- naver-my-ads(내광고관리) 스텁: 사이드바 네비 미등록 고아 라우트, officeAdvertisements/listingAdvertisements API 미사용, ERP 매물을 확인/광고 상태 기준으로 분류하지 못함. limit 200 단일 페이지 고정, 실제 네이버 광고 데이터 연동 없음
- 상세 페이지에 가격변동 이력(PriceHistory) 탭 없음 — 빠른확인 시트에는 있으나 전체 페이지에는 미노출
- 광고(ListingAdvertisement) 등록/수정 UI 없음: 목록·시트에 조회만 가능, api-client listing-advertisements 모듈 미사용 (광고 시작/종료/채널/광고가 기록 불가)
- 광고노트 호수는 내부 Unit과 연결하지 않고 `ho` 텍스트로만 기록한다. 그룹 내 형제 매물은 랭킹 셀에서 펼쳐볼 수 있다.
- 상세 매칭 조회 비효율: api.matches.findAll() 전체 조회 후 클라이언트 필터 (propertyId 서버 필터 없음)
- 사진 업로드 미구현: propertyPhotos.create/update/reorder/remove API 있으나 미사용, S3 presigned 업로드 엔드포인트 자체가 없음 (PRD상 Phase 2이나 버튼이 동작하는 척 노출됨)
- 쿼리 에러 상태 처리 없음: 5개 라우트 모두 isError/재시도 UI 부재 (로딩·빈 상태만 처리)
- 행 다중선택(enableRowSelection) 활성화돼 있으나 일괄 작업(상태 변경/삭제) 없음, 메모 컬럼 인라인 편집 불가
- 공적장부 ZIP 일괄 다운로드 버튼 미구현(핸들러 없음), 발급은 메타데이터 생성만(실 발급 API 연동은 PRD상 Phase 2 허용)

## API 갭
- GET /matches에 propertyId/listingId 쿼리 필터 없음 — api-client matches.findAll()이 파라미터를 받지 않아 상세 페이지가 사무소 전체 매칭을 받아 클라이언트 필터링
- 매물 사진 S3 presigned URL 업로드 엔드포인트 없음 — propertyPhotos.create는 이미 존재하는 fileUrl 문자열만 수신 (사진 탭 업로드 기능 구현 불가)
- 공적장부 ZIP 일괄 다운로드 엔드포인트 없음 (버튼만 존재)
- 외부매물 그룹 → ERP Property/Listing 전환(promote) 엔드포인트 없음 — 광고노트에서 확인한 매물을 내 매물장으로 올리는 브리지 부재
- (참고) listingIntakes / listingAdvertisements / officeAdvertisements API는 서버·api-client에 존재하나 web properties 페이지가 전혀 사용하지 않음 — API 갭이 아니라 UI 갭

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/properties/index.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/properties/$id.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/properties/new.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/properties/external-listings.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/properties/naver-my-ads.tsx
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/properties/-property-list-view-utils.ts

## 공유 의존성 (수정 금지 영역)
- @/components/data-table (DataTable, PriceCell, DateCell, CellEditProvider, EditableCell, SortDefinition, ChipOption)
- @/components/quick-sheet (SheetSection, SheetEmptyState, SheetNoticeRow, 날짜 헬퍼)
- @/components/ui/* (button, input, sheet, tabs, dropdown-menu, select, skeleton, badge, dialog, popover, command, checkbox, textarea, switch, label, separator, multi-select)
- @/lib/api (api 싱글턴), @/lib/utils (cn)
- @/providers/auth-provider (useAuth — external-listings 세션 권한 체크)
- @estate-erp/api-client (Listing, Property, PropertyListing, ExternalListingGroup 등 타입)
- @estate-erp/shared (formatPrice, sqmToPyeong)
- sonner (toast — $id.tsx 공적장부)
