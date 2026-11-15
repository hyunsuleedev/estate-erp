# 매물 상세 페이지 벤치마크: 다른 CRM·ERP·부동산 프로그램은 상세 화면을 어떻게 짰나

2026-11-13. `/properties/$id` 매물 상세 페이지(2026-11-12 새로 짬)를 다른 제품과 비교하려고 조사했다.

## 조사 방법과 근거 등급

- 세 갈래로 나눠 공식 도움말·디자인 가이드·제품 변경 기록을 읽었다.
  1. 일반 CRM: Salesforce, HubSpot, Pipedrive, Attio, Dynamics 365, Zoho, Twenty, Close, Copper, Folk
  2. 부동산 프로그램: 해외 중개(Rex, Reapit, Alto, VaultRE, AgentBox, Propertybase, BoldTrail, Follow Up Boss, Lofty), 임대관리(AppFolio, Buildium, Yardi), 국내(한방, 이실장, 중개왕, 부기사, 공실클럽, 핀덱스, 잇프로), 소비자 화면(네이버부동산, Zillow)
  3. ERP·디자인 가이드: SAP Fiori, Odoo, Shopify Polaris, Salesforce 디자인 시스템(SLDS), Microsoft Dynamics, Jira, Oracle Redwood, NetSuite, Linear, GitHub Primer
- Lazyweb 화면 캡처 DB에서 HubSpot·Zoho·Freshdesk·Mangomint 상세 화면을 직접 열어 봤다.
- 근거 표시: **[확인]** 원문을 읽음 · **[검색]** 원문이 막혀 검색 요약만 봄(직접 확인 전) · **[해석]** 조사자의 판단.
- 확인하지 못한 것: Reapit·AgentBox·AppFolio·Buildium·Yardi 도움말은 로그인이 필요했다. 한방·중개왕·부기사·공실클럽·부동산써브의 중개사용 매물 상세 화면은 공개 자료가 없어 기능 목록만 확인했다. Salesforce 관리자 블로그·디자인 블로그, HubSpot·Pipedrive 커뮤니티 글은 차단돼 [검색]으로만 남았다.

## 1. 대부분이 같은 방향으로 가는 원칙

### 머리는 작게, 핵심 값은 4~7개

| 제품 | 머리에 두는 핵심 값 | 근거 |
| --- | --- | --- |
| Dynamics 365 | 읽기 전용 4개, 더 보려면 펼침 | [확인] [Microsoft Learn](https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/design-productive-forms) |
| SLDS | 제목 빼고 4개(세로형은 7개까지) | [확인] [page headers](https://v1.lightningdesignsystem.com/components/page-headers/) |
| HubSpot(2026 새 배치) | 관리자가 고른 5개 | [확인] [KB](https://knowledge.hubspot.com/records/understand-the-default-record-layout) |
| Attio | 강조 위젯 6개 | [확인] [help](https://attio.com/help/reference/managing-your-data/records/configure-record-pages) |
| Salesforce 하이라이트 | 앞 7개 필드 | [확인] [Trailhead](https://trailhead.salesforce.com/content/learn/modules/lex_migration_customization/lex_migration_customization_layouts_ui) |
| SAP Fiori | 한 묶음에 이름-값 5개 이하, "정보가 많으면 목적을 해친다" | [확인] [Object Page](https://www.sap.com/design-system/fiori-design-web/v1-136/page-types/floorplans/object-page/usage) |

- 머리는 스크롤하면 줄어들되 사라지지 않고, 버튼은 줄어든 상태에서도 쓸 수 있다(SLDS, SAP "Do not remove or disable the actions when collapsed"). [확인]
- 모든 탭·구역에서 필요한 값은 머리에 둔다(Microsoft). [확인]

### 주된 정보는 숨기지 않는다: 탭보다 한 장 스크롤이 기본

- Microsoft: 주된 정보는 "첫 탭에 두고 숨기지 말 것". [확인]
- SAP: 기본은 한 장 스크롤 + 구역 이동 막대(anchor bar). 긴 표가 4개를 넘거나 주제가 완전히 다를 때만 탭. [확인]
- Salesforce 관리자 블로그: 기록 화면이 '관련 기록' 탭으로 열리면 사용자가 헤맸다. 사용자는 "스크롤은 싫어하지만 클릭이 하나 더 느는 건 괜찮다". [검색]
- 다만 탭을 쓰는 제품도 많다(Salesforce, HubSpot, Attio, Dynamics, Rex, VaultRE). 탭 쪽 근거는 대부분 "덜 쓰는 무거운 목록을 늦게 불러 빠르게" 하는 성능 이유다(Microsoft: 다른 탭의 부품은 열 때 불러온다). [확인]

### 본문 ⅔ + 옆 열 ⅓, 옆 열은 보조 정보

- Polaris: 본문 ⅔에는 "그 물건을 정의하는 정보", 옆 ⅓에는 "상태·메타데이터·요약" 같은 덜 쓰지만 맥락에 필요한 정보. 화면이 좁으면 쌓인다. [확인] [Polaris 원본](https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/patterns/resource-details-layout/variants/default.mdx)
- SLDS: 본문 ⅔, 옆 열 나머지이며 최소 400px. [확인] [layout](https://v1.lightningdesignsystem.com/guidelines/layout/)
- Jira: 설명은 왼쪽, 맥락 필드는 오른쪽에 고정·상세·더보기 묶음. 비어 있는 '더보기' 필드는 숨긴다. [확인] [Atlassian](https://support.atlassian.com/jira-software-cloud/docs/configure-field-layout-in-the-issue-view/)
- SAP는 반대로 "옆 패널에 물건 정보를 두지 말라"고 한다. 옆 패널은 맥락용이다. [확인]

### "지금 챙길 것"을 기록 위에 둔다

- Salesforce: 활동 기록 맨 위에 '예정·기한 지남', 그 아래 지난 활동을 월별로. [확인]
- HubSpot: 기한 지난 업무를 모은 '예정' 칸을 추가했다(2021 재설계). [확인]
- Pipedrive: '주목(Focus)' 칸에 챙길 활동·임시 메일·고정 메모, 그 아래 '이력'. [확인] [Pipedrive](https://support.pipedrive.com/en/article/deal-detail-view)
- Alto(영국 중개): 상태에 따라 다음 할 일을 알려 주는 'Prepare Property' 띠. [확인]
- Follow Up Boss: 옆 칸을 접어도 '배정된 업무·다가오는 약속·진행 중 계획'은 표시가 남는다. "마지막 1:1 연락 후 며칠"을 보여 준다. [확인]

### 기록은 한 줄기, 종류별로 거르고, 중요한 건 고정

- 종류별 거르기: Alto(사건 종류), VaultRE(연락처 역할: 소유주·매수인·임대인·임차인), Follow Up Boss(전체·메일·문자·통화·메모·활동), Dynamics, Mangomint(전체·예약·판매·메모). [확인]
- 고정: Alto는 스티커 메모가 "타임라인 메모보다 눈에 잘 띄어 놓치지 않는다"고 설명한다. Follow Up Boss 별표, Dynamics 15개 고정, Close 5개 고정, Rex 고정 메모. [확인]
- 쌓이면 접는다: Linear는 비슷한 연속 사건을 묶고 오래된 활동을 접는다. Attio는 자동 생성 사건을 기본으로 접는다. [확인] [Linear](https://linear.app/changelog/2025-04-03-collapsed-issue-history) · [Attio](https://attio.com/changelog/2026/record-page-redesign)
- 값 변경을 어디에 두는지는 갈린다: Attio는 기록에 섞고, Pipedrive는 별도 '변경 이력', HubSpot은 작업 메뉴의 '속성 이력', NetSuite는 'System Notes' 탭. [확인]

### 기록 남기기는 그 자리에서

- HubSpot: 이름 아래 메모·이메일·통화·업무·미팅 버튼. [확인]
- Copper: 활동 기록 위에 기록·메모·이메일 버튼. [확인]
- Odoo: 오른쪽 대화창(chatter)에서 메모·메시지·예정 활동을 바로 쓴다. [확인]
- Mangomint·Zoho(캡처): 기록 위에 바로 쓰는 입력칸이 있다.
- SAP: 보기 상태에서도 "댓글 달기·파일 올리기" 같은 가벼운 수정은 허용하고, 영향이 큰 수정만 편집 모드로. [확인]

### HubSpot이 재설계하며 공개한 숫자

[확인] [HubSpot Product 블로그](https://product.hubspot.com/blog/rethinking-hubspots-record-design-with-usability-in-mind)

- 일반 노트북 화면에서 활동 기록이 평균 1~3건밖에 안 보였다.
- 연결 기록 카드에서 전화·메일을 시작한 사람은 4% 이하였다.
- 옆 칸 접기·펼치기를 쓴 사람은 2%였다.
- 그래서 활동을 기본으로 접고, 여백을 줄이고, '예정' 칸을 넣었다.

## 2. 부동산 프로그램에만 있는 패턴

1. **호실은 영구, 매물은 회차.** Rex는 물리적 '부동산' 기록과 '매물(광고)' 기록을 나누고, 부동산 기록에 최근 4개 상태(감정·매물·매도·임대)를 이력으로 남긴다. Propertybase도 매물은 항상 부동산에 속한다. [확인] [Rex](https://support.rexsoftware.com/hc/en-us/articles/360026575353)
2. **소유·임차는 기간이 있는 관계.** Rex는 매도 완료 시 지금 소유주를 '이전 소유주'로 옮기라고 묻는다. Alto는 매도인 최대 4명, VaultRE는 여러 소유주를 머리에서 전환. [확인]
3. **머리의 핵심 날짜 띠.** VaultRE '스냅샷'은 담당자, 매매/임대 표시, 주요 날짜(최종 수정·예상 매도·전속 기간), 내부 가격(마우스 올리면)을 머리에 둔다. [확인] [VaultRE](https://support.vaultre.com.au/hc/en-au/articles/14492682842383)
4. **광고는 포털별로 매물 안에서 추적, 끝나도 남긴다.** Rex 게시 상태, Alto 'Sent To Portals' + 기록 남김, Propertybase '게시된 포털' 목록, 이실장 네이버 노출 순위 모니터링. [확인]
5. **가격 두 개와 가격 변경 사건.** Rex는 '광고 표시 가격'과 '매칭용 가격'을 따로 둔다. 게시 뒤 가격을 바꾸면 "그냥 바꾸기" 또는 "가격 인하 알리기"(매수 고객 알림)를 고른다. [확인] [Rex](https://support.rexsoftware.com/hc/en-us/articles/360030751314)
6. **매물에서 바로 매칭.** Rex 역매칭, Alto 매칭 목록(행마다 거절·문자·통화 메모), Propertybase 매칭 버튼. [확인]
7. **확인 날짜 배지(국내 특유).** 네이버 매물 상세는 가격·면적·층·향 바로 아래 "집주인확인매물 2026.11.13"을 둔다. 이실장 자료 기준 확인 방식별 노출 순위가 있다(현장확인 > 모바일확인 > 로켓 > 홍보확인서). [확인] [네이버 매물](https://fin.land.naver.com/articles/2661767809) · [entpmkt](https://entpmkt.com/20)
8. **가격 옆에 시장.** 네이버는 같은 면적 매물 가격 분포·실거래가(갱신 표시)·같은 호실을 몇 개 중개사가 올렸는지("중개사 18곳에서 등록했어요")를 보여 준다. [확인]
9. **소유주에게 보여 줄 기록 고르기.** BoldTrail은 기록마다 '매도인 보고서에 포함' 스위치가 있다(동시에 5개 이하 권장). [확인] [BoldTrail](https://help.insiderealestate.com/en/articles/4413542-boldtrail-listing-timeline-overview)
10. **국내 프로그램:** 중개왕은 전화가 오면 받기 전에 지난 상담을 띄운다. 핀덱스는 빠진 값을 '확인 필요'로 표시하고 만기 임박 매물을 대시보드·달력에 자동으로 올린다. 잇프로는 건물 → 소유주 연락처·메모 → 호실 → 매물을 "한 줄기"로 보여 주고, 소유주와 연락이 닿은 건물에 체크를 단다. [확인] [중개왕](https://www.jgwang.co.kr/) · [핀덱스](https://pindex.kr/) · [잇프로](https://itpromap.com/about/product/real-estate-agent)

배치는 둘로 갈린다. 중개 매물 프로그램(Rex, Propertybase, VaultRE)은 탭 + 늘 보이는 옆 칸이고, 사람 중심 CRM(Follow Up Boss, Lofty)은 가운데 기록 + 양옆 칸이다. [확인]

## 3. 갈리는 지점과 우리에게 맞는 선택 [해석]

| 지점 | 갈리는 방식 | 우리 선택과 이유 |
| --- | --- | --- |
| 탭 vs 한 장 | SAP·Microsoft 원칙은 한 장(주 정보 숨기지 않기). Salesforce·HubSpot·Rex는 탭 | **한 장 유지.** 거래 조건·확인·사람·기록을 함께 보며 전화하는 화면이다. 긴 목록(지난 기록 전체 등)만 '더 보기'로 늦게 연다 |
| 기록 위치 | Odoo는 1400px 이상이면 오른쪽, 아니면 아래. SLDS 작업형은 기록이 본문 | **본문 아래 유지.** 옆 열은 확인·사람·메모가 차지한다. 다만 기록에 바로 쓰는 입력칸이 필요하다(아래 후보 C) |
| 편집 방식 | SAP 편집 모드+하단 저장, Odoo 늘 편집·자동 저장, Polaris 저장 막대 | **지금 방식 유지.** 메모는 그 자리에서 바로 저장, 가격처럼 가격 이력이 남는 값은 대화상자에서 명시 저장(SAP "영향이 큰 수정" 기준) |
| 페이지 폭 | Polaris는 기본 폭 고정, SAP는 넓으면 다 씀 | **최대 1320px 유지.** 표·기록 글줄이 너무 길어지지 않게 |
| 옆 열 폭 | SLDS 최소 400px | 지금 340px. 넓은 창에서 360~400px로 넓힐지 검토 |

## 4. 우리 화면과 비교

### 이미 맞는 것

- 탭 없는 한 장 스크롤, 본문 + 옆 열(340px) 구성.
- 머리: 단지·동·호, 주소·타입, 상태 배지(매물상태·확인·공동중개)와 그 아래 사양 줄(공급·전용·층·구조·향·준공·단지). SAP의 '핵심 값 묶음'과 같은 역할이다.
- 기록 한 줄기(상담·확인·가격·광고·거래·의뢰)와 종류별 거르기.
- 가격 변경을 사유와 함께 사건으로 기록(Rex와 같은 방향).
- 거래 조건마다 CP 광고 상태와 '광고가 다름' 표시(Rex·Alto 게시 상태와 같은 방향).
- 지난 의뢰 목록(Rex의 상태 이력과 같은 방향), 거래가 끝나도 매칭·거래 이력이 남음.
- 메모는 그 자리에서 편집, 가격은 대화상자에서 저장.
- 접수 며칠째·확인 며칠 전·만기 D-day 같은 경과일 표시(Pipedrive 단계별 머문 날짜, Follow Up Boss 마지막 연락 후 며칠).

### 다르거나 빠진 것

| # | 내용 | 근거 제품 | 필요한 작업 |
| --- | --- | --- | --- |
| A | **"지금 챙길 것" 묶음이 없다.** 재확인 기한 지남, 소유주 번호 없음, 광고가 다름, 입주일 확인 필요, 임대 만기 임박이 화면 여기저기 흩어져 있다. 목록 옆 상세 패널에는 '지금 할 일'이 있는데 전체 페이지에는 없다 | Salesforce, HubSpot, Pipedrive Focus, Alto 띠 | 화면만(데이터 있음) |
| B | **머리에 가격이 없다.** 네이버·VaultRE는 거래 종류와 가격을 머리에 둔다. 우리는 사양 줄 아래 표에서야 보이고, 스크롤하면 머리도 사라진다 | 네이버, VaultRE 스냅샷, SLDS·SAP 고정 머리 | 화면만 |
| C | **상담을 남기려면 대화상자를 거쳐야 한다.** 다른 제품은 기록 위 입력칸이나 한 번 클릭 버튼으로 바로 쓴다 | HubSpot, Copper, Odoo, Mangomint, Zoho | 화면만(기존 상담 생성 API) |
| D | **긴 상담이 전부 펼쳐진다.** HubSpot은 노트북에서 기록이 1~3건만 보이는 문제로 기본 접기로 바꿨다 | HubSpot, Linear, Attio | 화면만 |
| E | **이전 소유주·퇴거한 세입자가 아예 안 보인다.** 다른 제품은 현재/이전을 나눠 보여 준다 | Rex, VaultRE | 화면만(응답에 상태별로 이미 옴) |
| F | **같은 호실 경쟁 광고를 안 보여 준다.** 우리는 네이버 비교(같은 호실 광고 수·경쟁 최저가·'더 싼 광고 있음')를 이미 저장하는데 상세에 연결하지 않았다 | 네이버 "중개사 N곳", 이실장 노출 순위 | 조회 연결 확인 필요 |
| G | **기록 고정이 없다.** "평일 저녁 7시 이후 통화" 같은 메모가 기록에 묻힌다 | Alto 스티커 메모, Follow Up Boss, Dynamics, Close | 서버(고정 필드) |
| H | **거래 완료 뒤 소유주 정리 흐름이 없다.** 매도 완료 시 '이전 소유주로 옮기기' 제안 | Rex | 서버·흐름 |
| I | 실거래가·같은 평형 시세 | 네이버 | 데이터 출처 없음, 나중 |
| J | 소유주 보고서에 넣을 기록 고르기 | BoldTrail, VaultRE | 기능 기획부터 |

## 5. 적용 후보 (우선순위)

화면만 바꾸면 되는 것부터:

1. **A. 지금 챙길 것** — 머리 바로 아래 또는 옆 열 맨 위에 최대 4줄. 각 줄에 바로 처리 버튼(확인 완료, 연락처 등록, 가격 수정, 광고 확인).
2. **B. 가격을 머리로 + 스크롤 시 줄어드는 고정 머리** — 줄어든 머리: 단지·동·호 + 거래별 가격 칩 + 확인 배지 + 상담 기록·확인 완료 버튼.
3. **C. 기록 위 바로 쓰는 상담 입력칸** — 상대 기본값은 대표 소유주, 종류는 전화·방문·문자, Enter로 저장. 연락처를 새로 만들 때만 기존 대화상자.
4. **D. 긴 상담 3줄 접기 + 펼치기**, **E. 이전 소유주·퇴거 세입자 접어서 보기.**

서버나 조회 연결이 필요한 것:

5. **F. 네이버 비교 연결** — 거래 조건 표의 광고 칸에 '같은 호실 N건 · 최저 15.5억 · 더 싼 광고 있음'.
6. **G. 기록 고정**, **H. 거래 완료 후 소유주 정리 제안.**

## 출처 모음

- SAP Fiori Object Page / Dynamic Page: https://www.sap.com/design-system/fiori-design-web/v1-136/page-types/floorplans/object-page/usage · https://www.sap.com/design-system/fiori-design-web/v1-136/page-types/page-layouts/dynamic-page-layout/usage
- Odoo: https://www.odoo.com/documentation/18.0/developer/reference/user_interface/view_architectures.html · https://www.odoo.com/documentation/18.0/applications/productivity/discuss/chatter.html · 대화창 위치 기준(1400px): https://github.com/odoo/odoo/blob/master/addons/mail/static/src/chatter/web/form_renderer.js
- Shopify Polaris: https://github.com/Shopify/polaris/blob/main/polaris.shopify.com/content/patterns/resource-details-layout/variants/default.mdx · https://shopify.dev/docs/apps/design-guidelines/layout
- Salesforce: https://v1.lightningdesignsystem.com/guidelines/layout/ · https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_recordpage · [검색] https://admin.salesforce.com/blog/2018/how-to-configure-lightning-pages-that-work-for-your-users
- HubSpot: https://knowledge.hubspot.com/records/work-with-records · https://knowledge.hubspot.com/records/understand-the-default-record-layout · https://product.hubspot.com/blog/rethinking-hubspots-record-design-with-usability-in-mind
- Pipedrive: https://support.pipedrive.com/en/article/deal-detail-view · https://support.pipedrive.com/en/article/detail-view-sidebar
- Attio: https://attio.com/changelog/2026/record-page-redesign · https://attio.com/help/reference/managing-your-data/records/configure-record-pages
- Microsoft Dynamics: https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/design-productive-forms · https://learn.microsoft.com/en-us/power-apps/maker/model-driven-apps/design-performant-forms · https://learn.microsoft.com/en-us/power-automate/business-process-flows-overview
- Rex: https://support.rexsoftware.com/hc/en-us/articles/10888495160473 · https://support.rexsoftware.com/hc/en-us/articles/360030751314
- Alto: https://support.altosoftware.co.uk/hc/en-gb/articles/5048141378335 · https://support.altosoftware.co.uk/hc/en-gb/articles/5039136410655
- VaultRE: https://support.vaultre.com.au/hc/en-au/articles/14492682842383 · https://support.vaultre.com.au/hc/en-au/articles/4926791195919
- Propertybase: https://help.propertybase.com/hc/en-us/articles/360005560211
- Follow Up Boss: https://help.followupboss.com/hc/en-us/articles/9538400649495
- 네이버부동산 매물 상세(2026-11-13 확인): https://fin.land.naver.com/articles/2661767809
- 이실장: https://play.google.com/store/apps/details?id=kr.co.aipartner · 중개왕: https://www.jgwang.co.kr/ · 부기사: https://bugisa.com/ · 핀덱스: https://pindex.kr/ · 잇프로: https://itpromap.com/about/product/real-estate-agent
