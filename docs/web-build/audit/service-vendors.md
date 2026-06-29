# 감사: service-vendors — partial (7/10)

협력업체 디렉토리의 핵심(카테고리+법정동 지역 필터, 검색, 즐겨찾기 토글/메모, 업체 등록·수정·삭제, 담당자 다중 연락처, 공용 풀/광고 티어/검증 뱃지, 플랫폼 관리자 전용 광고 설정)이 단일 라우트 파일에 모두 구현돼 있고, api-client 메서드와 서버 엔드포인트도 전부 존재한다. 낙관적 업데이트(즐겨찾기), 빈 상태/로딩, 내 업체 우선 정렬 등 품질이 양호하다. 다만 서비스 지역이 법정동 코드("11740") 그대로 노출되고, 지역 필터의 시군구/읍면동 레벨 불일치, 매물 상세→업체 검색 컨텍스트 점프 부재, 담당자 수정 UI 부재 등 실사용 갭이 남아 있다.

## 구현돼 있는 것 (건드리지 말고 유지/개선)
- 업체 목록 테이블 (DataTable 가상화, 행 클릭 상세, 56px 행)
- 검색 필터 (업체명/설명/단가메모/메모, 서버측 insensitive contains)
- 카테고리 필터 (shared SERVICE_CATEGORY_ORDER/LABEL 기반 Select)
- 지역 필터 (regions.search 자동완성 → 법정동 코드 선택, province 레벨 제외)
- 범위 필터 (전체/공용 풀만/내 업체만) + 활성 필터 카운트 + 초기화
- 즐겨찾기 토글 (낙관적 업데이트 + 에러 롤백) / 즐겨찾기만 보기 / 즐겨찾기 메모 저장
- 업체 등록/수정/삭제 CRUD (권한 분기: 내 사무소 업체 또는 공용+플랫폼 관리자만 수정·삭제 버튼 노출)
- 공용 풀 업체 등록 (isPlatformAdmin 전용 버튼) + 광고 티어(premium/basic)/우선순위/검증 뱃지 설정
- 담당자 다중 연락처: 등록 시 첫 담당자 입력, 상세 다이얼로그에서 추가/삭제, 목록에 대표 담당자 + 외 N명 표시
- 상세 다이얼로그 (카테고리/단가/지역/메모/즐겨찾기 메모/담당자 목록 → 수정 진입)
- 빈 상태 (필터 유무에 따라 다른 안내문) + 로딩 상태 + 폼 mutation 에러 메시지
- 서버 정렬: 내 사무소 업체 우선 → 광고 티어(premium→basic→none) → adPriority → 이름 (PRD 6.5 노출 규칙 부합)

## 갭 (이번 빌드에서 해결할 것, 중요도순)
- 서비스 지역이 raw 법정동 코드로 노출됨: 상세 다이얼로그(v.coverageDistricts.join(', ') → "11740, 11710")와 수정 다이얼로그(기존 지역 Badge 라벨이 코드 그대로, index.tsx 756행 label: c) 모두 코드→이름 변환 없음. api.regions.findDistricts/findWards로 코드→이름 매핑 훅을 만들어 "강동구, 송파구"로 표시해야 함
- 지역 필터/등록의 레벨 불일치: coverageDistricts는 스키마 주석상 districtCode(5자리) 기준인데 UI는 읍면동(ward, 10자리)도 선택 허용하고 서버는 has 완전일치 매칭 — 읍면동 코드로 필터하면 시군구로 등록된 업체가 안 잡힘. 필터 선택지를 시군구로 제한하거나 서버에서 ward→district 정규화 필요
- 매물→업체 컨텍스트 점프 부재: PRD 6.5의 "매물 주소에서 자동 지역 매칭 → 해당 지역 업체 리스트" 흐름 미구현. 라우트에 validateSearch(district/category search param)가 없어 딥링크 프리필터 불가하고 properties 상세에서 업체 검색 링크도 없음
- 담당자 수정 UI 없음: api.serviceVendors.updateContact 메서드가 존재하지만 UI는 추가/삭제만 지원 — 전화번호 오타를 고치려면 삭제 후 재등록. sortOrder 변경·담당자별 memo 입력 UI도 미구현
- 전화번호 click-to-call/복사 액션 없음: 담당자 전화에 tel: 링크나 복사 버튼이 없음 — 업체 디렉토리의 핵심 액션(빠른 연락) 누락
- 목록 조회 에러 상태 처리 없음: useQuery 실패 시 vendors=[]로 EmptyState("등록된 협력업체가 없습니다")가 표시돼 오인 유발. 에러 메시지 + 재시도 버튼 필요
- tags 필드 UI 미구현: 스키마/DTO에 tags(["단골","24시간"])가 있으나 입력·표시·필터 모두 없음
- 삭제가 window.confirm 사용 + 삭제 mutation onError 핸들러 없음(실패 시 무반응). shadcn AlertDialog + 에러 토스트로 교체 필요
- 공용 업체 광고 기간(adStartDate/adEndDate) 입력 UI 없음 — DTO에는 필드가 있으나 플랫폼 관리자 폼에 티어/우선순위/검증만 노출
- 페이지네이션/limit 없음: findAll이 전체 반환 — 공용 풀이 수백 건으로 커지면 응답 비대 (렌더링은 가상화로 버팀)

## API 갭
- ServiceVendor 응답에 지역 이름이 없음 — coverageDistricts 코드 배열만 반환하므로 표시용 이름(coverageDistrictNames) 포함 또는 코드 배열 일괄 해석 엔드포인트(예: GET /regions/resolve?codes=)가 있으면 클라이언트 N회 조회 없이 해결 가능 (기존 regions.findDistricts로 우회는 가능)
- 서버 findAll에 ward→district 정규화 없음 — district 파라미터가 읍면동 코드일 때 상위 시군구로 변환하는 처리 부재 (service-vendors.service.ts 66-68행 has 완전일치)
- (페이지 외) PRD 5.8/6.5의 MCP 도구 search_vendors가 apps/server/src/modules/mcp에 없음

## 파일
- /Users/hyunsulee/estate-erp/apps/web/src/routes/_authenticated/service-vendors/index.tsx

## 공유 의존성 (수정 금지 영역)
- @/components/data-table (DataTable)
- @/providers/auth-provider (useAuth — isPlatformAdmin, office.id)
- @/lib/api (api.serviceVendors, api.regions)
- @/lib/utils (cn)
- @/components/ui/* (badge, button, checkbox, input, label, textarea, dialog, select)
- @estate-erp/shared (SERVICE_CATEGORY_LABEL, SERVICE_CATEGORY_ORDER, ServiceCategory)
- @estate-erp/api-client (ServiceVendor/VendorContact/Filter/DTO 타입)
