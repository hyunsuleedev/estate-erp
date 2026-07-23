# Spatial · Customer · Deal UI manifest

최종 보고서의 `/sites`–`/contracts` 구간에 사용하는 데스크톱 데모 화면 목록이다. 모든 이미지는 1586×992 전후의 16:10 랜드스케이프이며, 공통 기준 화면 `assets/reference/master-estate-operational-system.png`의 셸과 토큰을 유지했다.

## 공통 채택 원칙

- 216px 사이드바, 48px 글로벌 헤더, 14px 본문, 약 40px 데이터 행
- `#F7F6F3` 배경, 흰 작업면, `#2F2D2A` 본문, 절제된 `#3F63D8` 주요 강조
- 6px radius, 1px 경계선, 거의 없는 그림자, 색상과 텍스트를 함께 쓰는 상태 표현
- 목록 화면은 저장된 보기 + 고밀도 테이블 + 우측 빠른 보기, 상세 화면은 사실/활동/관계의 다중 패널 구조
- 한국 부동산의 동·호, 만원·억, m²·평, 당사자, 지급 일정과 수수료를 일반 CRM 필드보다 우선

## Route / image 매핑

| # | Route | 제목 | Recipe | 상대 이미지 | 목적 | 필수 요소 | 참고 제품 | 채택 구조 | 대안 A · B | 구현 유의점 |
|---:|---|---|---|---|---|---|---|---|---|---|
| 14 | `/sites` | 관리단지 · 동호수 | Spatial unit matrix | `assets/screens/spatial-customer/14-sites.png` | 단지에서 호실 상태를 빠르게 조회하고 바로 매물·상담 작업으로 연결 | 단지 목록, 동 탭, 층×라인 격자, 호실 상태 범례, 선택 호실 상세 | BDS Easy, Attio | 단지 / 호실 격자 / 상세의 3패널 | A: 격자+하단 시트 · B: 지도+동 목록 | `Site → Dong → Unit` 체인을 유지하고 placeholder 동도 동일 격자로 처리. 셀 가상화와 키보드 이동 필요 |
| 15 | `/contacts` | 연락처 | Relationship directory | `assets/screens/spatial-customer/15-contacts.png` | 소유자·구매고객·임차인을 연결 기록과 다음 행동 기준으로 검색 | 역할별 저장 보기, 전화, 보유·관심 연결, 최근 상담, 담당자, 다음 행동, 우측 미리보기 | Attio, HubSpot | 역할 속성 테이블 + 선택 연락처 quick view | A: 역할별 칸반 · B: 양쪽 목록/상세 split | 한 연락처에 여러 역할 허용. 전화번호 정규화와 중복 병합을 목록 핵심 동작으로 제공 |
| 16 | `/contacts/$id` | 연락처 상세 | Relationship record | `assets/screens/spatial-customer/16-contact-detail.png` | 사람을 중심으로 부동산·상담·통화·업무 관계를 한 화면에서 판단 | 편집 가능한 사실, 하이라이트, 활동 타임라인, 관계 그래프, 보유 매물, 다음 최적 행동 | Attio, Frappe CRM | 좌측 사실 / 중앙 활동 / 우측 관계·행동 | A: 전체 폭 탭형 · B: 접이식 우측 drawer | ContactRelation과 PropertyContact를 별개로 노출. ActivityLog 원본과 업무용 요약을 혼동하지 않도록 구분 |
| 17 | `/contacts/new` | 연락처 추가 | Contextual intake form | `assets/screens/spatial-customer/17-contact-new.png` | 통화 중에도 연락처·역할·부동산 연결을 한 번에 등록 | 실시간 중복 확인, 기본 정보, 복수 역할, 부동산 연결, 초기 상담, 동의, 미리보기 | Frappe CRM, Attio | 전체 페이지 2열 폼 + 우측 실시간 미리보기 | A: 단계형 wizard · B: 빠른 등록 drawer | 저장 전 전화번호 중복 검사. 필수 동의와 선택 동의를 분리하고, 연결 매물은 검색 후 명시적 관계 지정 |
| 18 | `/buyer-requirements` | 구매고객 | Demand pipeline table | `assets/screens/spatial-customer/18-buyer-requirements.png` | 수요를 지역·예산·면적·입주·매칭 준비도 기준으로 운영 | 저장 보기, 조건 열, 매칭 수, 단계, 다음 행동, 상위 후보 3건 | Attio, Airtable | 고밀도 요구사항 테이블 + 우측 조건/후보 quick view | A: 단계 칸반 · B: 고객×조건 카드 | BuyerRequirement의 필수/유연 조건을 필터 가능한 구조화 필드로 저장. 숫자 범위와 자유 메모를 분리 |
| 19 | `/buyer-requirements/$id` | 구매고객 상세 | Bilateral match record | `assets/screens/spatial-customer/19-buyer-requirement-detail.png` | 한 구매조건에 대한 후보 순위, 매칭 근거, 고객 반응을 투명하게 검토 | 필수·선호·제외 조건, 후보 점수, 가중 근거, 선택 매물, 활동, 제안/집보기 동작 | Attio, Linear | 좌측 조건 / 중앙 후보+근거 / 우측 선택 매물 | A: 비교표 중심 · B: 지도+목록 | 점수는 계산 결과만 표시하지 말고 구성 점수와 불일치를 보존. Match 레코드의 상태 이력을 별도 기록 |
| 20 | `/buyer-requirements/new` | 구매조건 등록 | Live-match intake | `assets/screens/spatial-customer/20-buyer-requirement-new.png` | 상담 중 구조화 조건을 입력하면서 후보 수 변화를 즉시 확인 | 고객 연결, 거래·예산, 법정동/단지, 면적·주거, 우선순위, 실시간 후보, 검증 | Frappe CRM, Attio | 한 화면 단계 rail + 구조화 폼 + sticky 매칭 미리보기 | A: 4-step wizard · B: 대화형 조건 builder | Ward FK를 사용하고 자유 주소 입력을 막음. m² 저장과 평 환산, 만원 단위 저장을 UI에서 명시 |
| 21 | `/buyer-requirements/$id/edit` | 구매조건 편집 | Change impact review | `assets/screens/spatial-customer/21-buyer-requirement-edit.png` | 조건 변경이 후보·기존 제안·자동 업무에 미치는 영향을 저장 전에 확인 | 변경 내역, before→after, 후보 증감, 기존 제안 영향, 자동 업무, 변경 사유·감사 | Linear, Attio | 좌측 변경 탐색+폼 / 우측 영향 분석 / 하단 diff 요약 | A: inline diff drawer · B: 저장 후 결과 화면 | 기존 값 snapshot과 변경 사유를 함께 저장. 영향 계산은 debounce하고 저장 시 서버에서 재검증 |
| 22 | `/consultations` | 상담기록 | Conversation journal | `assets/screens/spatial-customer/22-consultations.png` | 오늘 상담을 스캔하고 내용을 정리해 즉시 후속 작업으로 연결 | 시간순 상담 목록, 구조화 요약, 통화 내용, 내부 메모, 연락처·매물 맥락, 후속 결과 | Attio Activity, Gong | 상담 stream / 선택 상담 / 연락처·후속 3패널 | A: 일자별 timeline · B: 대화 inbox | Consultation 원문, 요약, 내부 메모를 분리. 후속 결과는 Task와 연결하되 상담 상태와 중복 저장하지 않음 |
| 23 | `/calls` | 통화 관리 | CTI transcript workspace | `assets/screens/spatial-customer/23-calls.png` | 녹음 재생·전사 확인·연락처 맥락·후속 조치를 한 화면에서 수행 | 통화 로그, 파형 플레이어, 화자/타임스탬프 전사, 요약, 연락처·매물, 녹음 동의, 후속 업무 | Gong, Frappe CRM | 통화 목록 / 플레이어·전사 / 연락처·업무 3패널 | A: 전사 중심 full-width · B: 연락처 상세 내 통화 탭 | 녹음 파일과 전사 처리 상태를 분리. 화자 수정, 구간 링크, 동의/보존기간, 모바일 출처를 감사 가능하게 저장 |
| 24 | `/matches` | 매칭 | Evidence matching desk | `assets/screens/spatial-customer/24-matches.png` | 구매조건과 매물을 양쪽에서 선택하고 근거·불일치를 확인한 뒤 제안 | 조건 큐, 추천 매물, 점수·근거, 단계 rail, 소유자 최신성, 고객 전송 | Attio, Linear | 조건 / 후보·근거 / 양측 맥락 3패널 | A: 비교 matrix · B: 지도+점수 목록 | 필수 조건 미충족은 높은 총점이어도 명확히 경고. MatchStage 전이는 서버 규칙과 활동 로그에 기록 |
| 25 | `/deals` | 거래관리 | Deal pipeline board | `assets/screens/spatial-customer/25-deals.png` | 거래 단계를 이동하면서 수수료·당사자·마감 위험을 동시에 관리 | 단계 보드, 거래금액, 양측 수수료, 공동중개, 참여자 배분, 마일스톤, 위험, 다음 작업 | Attio, Pipedrive, Linear | 고밀도 4단 보드 + 우측 거래 workbench | A: 행 기반 파이프라인 · B: 마감 캘린더 | DealStage와 ContractStatus를 혼용하지 않음. seller/buyer commission, partner commission, participant split을 별도 필드로 계산 |
| 26 | `/contracts` | 계약서 관리 | Contract operations hub | `assets/screens/spatial-customer/26-contracts.png` | 계약 상태·지급 예정·서류 완성도를 한 번에 감시하고 편집기로 진입 | 상태별 저장 보기, 14일 지급 rail, 계약 테이블, 지급 일정, 서류 checklist, 최근 활동, 계약서/지급 진입 | Paperless-ngx, Juro, Linear | 일정 rail + 계약 테이블 + 우측 contract preview | A: 계약 폴더 grid · B: 지급 calendar first | Contract 1:1 Deal 연결 유지. 지급 회차와 문서 checklist를 독립 엔터티로 다루고 상태 전이 권한·감사를 적용 |

## 시각 QA

- 13/13 파일을 생성 후 다시 열어 레이아웃, 잘림, 한글 가독성, 패널 구분, 상태 색상과 텍스트 병기를 확인했다.
- 모든 화면은 고유 업무 구조를 가진다. 제목만 바꾼 반복 화면은 없다.
- `/sites`, `/calls`, `/matches`는 요청된 3패널 구조를 충족한다.
- 연락처/구매조건 상세는 record facts, activity, relations, next action을 포함한다.
- `/deals`는 수수료·참여자 배분·마감 체크, `/contracts`는 지급 일정·서류 completeness와 편집 진입을 포함한다.
- 이미지 내 데이터는 디자인 검토용 예시이며 프로덕션 계산·법적 문구의 source of truth가 아니다.

## 생성 방식과 참조

Built-in ImageGen을 화면당 한 번씩 순차 사용했다. 공통 기준 이미지 외에 Attio table/record/activity, BDS Easy unit grid, Frappe CRM contact/call, Gong transcript, Pipedrive deal detail, Juro contract views, Paperless-ngx document table을 기능 참조로 사용했으며, 각 제품의 로고·브랜드 장식은 복제하지 않았다.
