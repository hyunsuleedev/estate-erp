# Design QA — 계약서 관리 UI 3안

## 범위

- 프로토타입: `http://localhost:4173/`
- 구현: `src/App.jsx`, `src/styles.css`
- 원본 시각 기준:
  - `output/design-qa/source-direction-1.png`
  - `output/design-qa/source-direction-2.png`
  - `output/design-qa/source-direction-3.png`
- 구현 캡처:
  - `output/design-qa/direction-1.png`
  - `output/design-qa/direction-2.png`
  - `output/design-qa/direction-3.png`
- 나란히 비교한 증거:
  - `output/design-qa/comparison-direction-1.png`
  - `output/design-qa/comparison-direction-2.png`
  - `output/design-qa/comparison-direction-3.png`

## 검수 조건

- 브라우저: Orca 내장 브라우저
- 데스크톱 뷰포트: 1227 × 906 CSS px
- 비교용 구현 영역: 상단 시안 선택기 58px를 제외한 1227 × 848
- 상태:
  - 시안 1: 문서 허브 기본 상태
  - 시안 2: 계약 내용 섹션 + 미리보기
  - 시안 3: 기본 정보 1단계
- 반응형 확인: iPhone 12, 390 × 844 CSS px

## 필수 비교 표면

- 글꼴/타이포그래피: Noto Sans KR 계열, 제목·본문·라벨 위계와 줄바꿈 정상
- 간격/레이아웃: ERP 사이드바, 헤더, 진행 단계, 입력 영역, 보조 패널의 정렬과 밀도 일치
- 색상/표면: 웜 화이트 배경, 차콜 기본 액션, 파랑 완료 상태, 빨강 경고 상태 일치
- 이미지 품질: 별도 제품 이미지가 없는 업무 UI이며 래스터 대체물이나 CSS 삽화 없음
- 아이콘: Lucide 단일 아이콘 패밀리 사용, 크기·선 굵기·정렬 일관
- 카피/콘텐츠: 실제 계약 사례와 금액·일정·당사자 상태를 사용해 독립적으로 이해 가능
- 동작/상태: 시안 전환, 문서 작성 완료, 섹션 이동, 작성 점검, 저장, 단계 이동, 임시 저장 확인
- 접근성: 버튼/입력의 접근성 이름 확인, 비활성 이전 버튼 확인, 키보드 포커스 가능한 기본 요소 사용
- 반응형: 390px에서 세 시안 모두 문서 전체 가로 스크롤 폭이 뷰포트 폭과 동일함(`scrollWidth = 390`)

## 비교 이력

1. 첫 비교에서 시안 3 구현에 원본의 ERP 사이드바가 빠져 문맥과 전체 그리드가 달라지는 P2 레이아웃 불일치를 확인함.
2. 시안 3을 공통 ERP 사이드바 + 작업 영역 구조로 수정하고 진행 단계 패딩을 재조정함.
3. 수정 후 시안 3을 원본과 다시 나란히 비교해 사이드바, 진행 단계, 폼, 요약 패널의 구조적 일치를 확인함.
4. 최종 비교에서 P0/P1/P2 잔여 문제 없음.

## 기능 및 실행 검증

- `npm run build`: 통과
- 브라우저 콘솔: 오류 0, 경고 0
- 시안 1: 부동산 거래신고 `작성` 후 `작성 완료` 상태 변경 확인
- 시안 2: 대금 일정 이동, 작성 점검 탭, 저장 후 `저장됨` 상태 확인
- 시안 3: 다음 단계 이동, 이전/다음 활성 상태, 임시 저장 후 `저장됨` 상태 확인

final result: passed
