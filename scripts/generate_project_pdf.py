"""Generate a detailed project PDF for Estate ERP."""

from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

KOREAN_FONT_PATH = "/System/Library/Fonts/Supplemental/AppleGothic.ttf"
pdfmetrics.registerFont(TTFont("AppleGothic", KOREAN_FONT_PATH))

BASE_DIR = Path("/Users/hyunsulee/estate-erp")
OUTPUT_PATH = BASE_DIR / "docs" / "Estate-ERP-Project-Overview.pdf"


def build_styles():
    styles = getSampleStyleSheet()
    base_font = "AppleGothic"

    styles.add(
        ParagraphStyle(
            name="KTitle",
            fontName=base_font,
            fontSize=26,
            leading=32,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#0F172A"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KSubtitle",
            fontName=base_font,
            fontSize=13,
            leading=18,
            alignment=TA_CENTER,
            textColor=colors.HexColor("#475569"),
            spaceAfter=24,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KH1",
            fontName=base_font,
            fontSize=18,
            leading=24,
            textColor=colors.HexColor("#0F172A"),
            spaceBefore=18,
            spaceAfter=10,
            borderPadding=0,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KH2",
            fontName=base_font,
            fontSize=14,
            leading=20,
            textColor=colors.HexColor("#1E293B"),
            spaceBefore=14,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KH3",
            fontName=base_font,
            fontSize=12,
            leading=18,
            textColor=colors.HexColor("#334155"),
            spaceBefore=10,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KBody",
            fontName=base_font,
            fontSize=10,
            leading=16,
            textColor=colors.HexColor("#1F2937"),
            alignment=TA_JUSTIFY,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KBullet",
            fontName=base_font,
            fontSize=10,
            leading=15,
            textColor=colors.HexColor("#1F2937"),
            leftIndent=14,
            bulletIndent=2,
            spaceAfter=3,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KCaption",
            fontName=base_font,
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#64748B"),
            alignment=TA_LEFT,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KCode",
            fontName=base_font,
            fontSize=9,
            leading=13,
            textColor=colors.HexColor("#0F172A"),
            backColor=colors.HexColor("#F1F5F9"),
            borderColor=colors.HexColor("#E2E8F0"),
            borderWidth=0.5,
            borderPadding=6,
            leftIndent=0,
            rightIndent=0,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KTableHead",
            fontName=base_font,
            fontSize=10,
            leading=13,
            textColor=colors.white,
            alignment=TA_CENTER,
        )
    )
    styles.add(
        ParagraphStyle(
            name="KTableCell",
            fontName=base_font,
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#111827"),
        )
    )
    return styles


def bullet(text, styles):
    return Paragraph(f"• {text}", styles["KBullet"])


def code_block(lines, styles):
    text = "<br/>".join(line.replace(" ", "&nbsp;") for line in lines)
    return Paragraph(text, styles["KCode"])


def make_table(data, col_widths, styles, header_bg="#0F172A"):
    wrapped = []
    for r, row in enumerate(data):
        wrapped_row = []
        for cell in row:
            style = styles["KTableHead"] if r == 0 else styles["KTableCell"]
            wrapped_row.append(Paragraph(str(cell), style))
        wrapped.append(wrapped_row)
    tbl = Table(wrapped, colWidths=col_widths, repeatRows=1)
    tbl.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor(header_bg)),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#CBD5E1")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
            ]
        )
    )
    return tbl


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("AppleGothic", 8)
    canvas.setFillColor(colors.HexColor("#94A3B8"))
    canvas.drawString(2 * cm, 1.2 * cm, "Estate ERP · Project Overview")
    canvas.drawRightString(
        A4[0] - 2 * cm, 1.2 * cm, f"Page {doc.page}"
    )
    canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, 1.6 * cm, A4[0] - 2 * cm, 1.6 * cm)
    canvas.restoreState()


def build_story(styles):
    story = []

    # ===== Cover =====
    story.append(Spacer(1, 4 * cm))
    story.append(Paragraph("Estate ERP", styles["KTitle"]))
    story.append(
        Paragraph(
            "대한민국 부동산 중개사무소를 위한 통합 ERP · 프로젝트 개요",
            styles["KSubtitle"],
        )
    )
    story.append(Spacer(1, 2 * cm))

    cover_info = [
        ["문서 제목", "Estate ERP Project Overview"],
        ["작성 일자", "2026-04-20"],
        ["현재 Phase", "Phase 1 — NestJS 서버 + CRM MCP Server"],
        ["기술 스택", "NestJS · Prisma · PostgreSQL + PostGIS · Electron · React 19 · TanStack · Tailwind v4"],
        ["배포 환경", "AWS ECS Fargate + ALB + RDS + ElastiCache + S3"],
        ["패키지 매니저", "pnpm (monorepo workspaces)"],
    ]
    story.append(make_table(cover_info, [4.5 * cm, 11.5 * cm], styles, header_bg="#1E293B"))

    story.append(Spacer(1, 2 * cm))
    story.append(
        Paragraph(
            "이 문서는 Estate ERP의 제품 비전, 아키텍처, 데이터 구조, 핵심 기능, "
            "개발 로드맵을 한 번에 파악할 수 있도록 정리한 프로젝트 개요서다. "
            "상세 설계는 /docs 폴더의 개별 문서에서 관리된다.",
            styles["KBody"],
        )
    )
    story.append(PageBreak())

    # ===== 1. 제품 요약 =====
    story.append(Paragraph("1. 제품 요약", styles["KH1"]))
    story.append(
        Paragraph(
            "Estate ERP는 대한민국 부동산 중개사무소를 위한 통합 ERP다. "
            "매물 관리, 고객/상담, 매칭, 거래/계약, 일정/업무, 네트워크 매물 공유를 "
            "하나의 시스템에서 운영하는 것을 목표로 한다. 기존 estate-crm을 NestJS 기반으로 재구축한 제품이다.",
            styles["KBody"],
        )
    )

    story.append(Paragraph("핵심 제품 전략", styles["KH3"]))
    for item in [
        "CRM 본체를 먼저 완성한다 — AI 챗이나 추가 기능은 CRM이 탄탄해진 다음.",
        "AI는 제품에 내장하지 않고 MCP(Model Context Protocol)를 통해 외부 AI와 연결한다.",
        "사무소 간 매물 공유 네트워크를 킬러 피처로 만들어 네트워크 효과를 설계한다.",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("대상 사용자", styles["KH3"]))
    for item in [
        "Primary — 여러 명이 일하는 중개법인/팀 (오너 + 매니저 + 에이전트).",
        "Secondary — 1인 중개사.",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("해결하려는 핵심 Job", styles["KH3"]))
    for item in [
        "매물을 구조화해 계속 관리하고 상태를 추적한다.",
        "고객 조건과 매물을 연결해 상담과 거래로 이어지게 한다.",
        "팀 단위로 업무/일정을 공유하고 담당자를 분명히 한다.",
        "전화 — 상담 — 거래 흐름이 끊기지 않게 연결한다.",
        "외부 AI가 CRM 데이터를 읽고 실제 업무를 수행할 수 있게 한다.",
    ]:
        story.append(bullet(item, styles))

    # ===== 2. 제품 원칙 =====
    story.append(Paragraph("2. 제품 원칙", styles["KH1"]))

    story.append(Paragraph("2.1 데스크톱이 메인 제품이다", styles["KH2"]))
    story.append(
        Paragraph(
            "웹앱은 보조 접근 채널이고 메인 사용 환경은 Electron 데스크톱 앱이다. "
            "한국 시장에서 설치형 프로그램에 대한 신뢰가 여전히 강하고, CTI Bridge · 로컬 MCP · "
            "시스템 트레이 · OS 알림 같은 로컬 기능이 필요하기 때문이다.",
            styles["KBody"],
        )
    )

    story.append(Paragraph("2.2 CRM이 먼저, AI는 두 계층으로 연결", styles["KH2"]))
    for item in [
        "Phase 1 — CRM 서버를 MCP 서버로 설계해 외부 AI(Claude Desktop·ChatGPT)가 직접 연결.",
        "Phase 2 — 앱 내부에 AI 챗 도입. Claude API를 호출하되 MCP와 동일한 도구를 재사용.",
        "AI 비용은 외부 API 기반(건당 약 20원). 자체 LLM 호스팅은 사무소 1,000개 이상부터 검토.",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("2.3 멀티테넌시는 기본 전제", styles["KH2"]))
    story.append(
        Paragraph(
            "모든 비즈니스 데이터는 office_id 기준으로 분리된다. Prisma middleware로 테넌트 격리를 "
            "강제하며, 사용자·권한·감사 로그·네트워크 액션이 모두 사무소 단위로 동작한다.",
            styles["KBody"],
        )
    )

    story.append(Paragraph("2.4 네트워크 효과를 제품 본체에 넣는다", styles["KH2"]))
    story.append(
        Paragraph(
            "단순 CRM으로 끝내지 않고 사무소 간 공동 중개 네트워크를 핵심 차별점으로 둔다. "
            "네트워크 공유 매물이 쌓일수록 구독 가치가 커지는 구조다.",
            styles["KBody"],
        )
    )

    story.append(PageBreak())

    # ===== 3. 기술 스택 =====
    story.append(Paragraph("3. 기술 스택", styles["KH1"]))

    tech_rows = [
        ["레이어", "스택"],
        ["Backend", "NestJS + TypeScript, Prisma, PostgreSQL + PostGIS + pgvector"],
        ["Cache / Queue", "Redis + BullMQ"],
        ["Realtime", "Socket.io (Redis Adapter)"],
        ["Auth", "Passport.js + JWT, @Roles 데코레이터 기반 RBAC"],
        ["Email", "Resend + React Email"],
        ["File Storage", "S3 / Cloudflare R2"],
        ["Desktop", "Electron + React 19 + TanStack + Tailwind v4 + shadcn/ui"],
        ["Web", "Vite SPA (React 19 + TanStack + Tailwind v4 + shadcn/ui)"],
        ["Mobile", "React Native (Android only — 전화 오버레이 + 녹음)"],
        ["Build", "Vite + electron-builder"],
        ["Package Manager", "pnpm (monorepo workspaces)"],
    ]
    story.append(make_table(tech_rows, [3.8 * cm, 12.2 * cm], styles))

    story.append(Paragraph("3.1 모노레포 구조", styles["KH2"]))
    story.append(
        code_block(
            [
                "apps/",
                "  server/          NestJS 백엔드 (src/modules/*)",
                "  desktop/         Electron (main / preload / renderer)",
                "  web/             Vite SPA (사장님용 웹 버전, CTI 없음)",
                "  mobile/          React Native (Android only)",
                "  cti-bridge/      CTI Bridge (32비트)",
                "packages/",
                "  shared/          공유 타입, 유틸리티, Enum",
                "  api-client/      API 클라이언트 (desktop + web + mobile 공유)",
                "  mcp-server/      CRM MCP Server 정의",
                "prisma/",
                "  schema.prisma    DB 스키마 (source of truth)",
            ],
            styles,
        )
    )

    story.append(Paragraph("3.2 주요 컨벤션", styles["KH2"]))
    for item in [
        "<b>네이밍</b> — TypeScript camelCase, DB/Prisma schema snake_case, Prisma model PascalCase.",
        "<b>가격</b> — 만원 단위(10,000 KRW). 예: 15.8억 = 158000.",
        "<b>면적</b> — m² 기준 저장. 평 = m² × 0.3025.",
        "<b>주소</b> — 법정동 마스터 3단(Province → District → Ward), Site는 wardCode FK 참조.",
        "<b>단지 코드</b> — kaptComplexCode · naverComplexCode · kbComplexCode (nullable).",
        "<b>공간 쿼리</b> — PostGIS geometry(Point, 5179). Prisma $queryRaw로 접근.",
    ]:
        story.append(bullet(item, styles))

    story.append(PageBreak())

    # ===== 4. 아키텍처 =====
    story.append(Paragraph("4. 시스템 아키텍처", styles["KH1"]))

    story.append(Paragraph("4.1 전체 구성", styles["KH2"]))
    story.append(
        code_block(
            [
                "[GitHub Actions] → Docker 빌드 → [ECR] → [ECS Fargate] 배포",
                "                                            │",
                "[ALB] ← HTTPS + 도메인                      │",
                "  │                                         │",
                "  ├── /api/*    REST API (데스크톱/웹 앱용)  │",
                "  ├── /mcp/*    MCP SSE (외부 AI 연결)       │",
                "  └── /ai/*     내부 AI 챗 (Phase 2)         │",
                "                                            │",
                "  ├──→ [RDS PostgreSQL 15 + PostGIS + pgvector]  (Private)",
                "  ├──→ [ElastiCache Redis 7]                     (Private)",
                "  └──→ [S3]  공적장부 PDF / 매물 사진 / Electron 업데이트",
            ],
            styles,
        )
    )

    story.append(Paragraph("4.2 제품 패키지", styles["KH2"]))
    pkg_rows = [
        ["제품", "대상", "역할"],
        ["Electron 데스크톱 앱", "모든 직원 PC", "메인 제품 · CTI · 로컬 MCP · 트레이"],
        ["웹 앱 (Vite SPA)", "브라우저 사용자", "CTI 제외 CRM 접근 (사장님·외근용)"],
        ["CTI Bridge", "사무실 메인 PC", "전화 시스템 연동 (32비트)"],
        ["Android 모바일 앱", "직원 폰", "전화 오버레이 · 통화 후 상담 기록"],
    ]
    story.append(make_table(pkg_rows, [4.5 * cm, 4.5 * cm, 7 * cm], styles))

    story.append(Paragraph("4.3 MCP 전략 (CRM = MCP Server)", styles["KH2"]))
    for item in [
        "<b>리모트 MCP</b> — NestJS SSE 엔드포인트 /mcp/sse. JWT 또는 API Key 인증.",
        "<b>크롤러 MCP</b> — 네이버 부동산 HTML 파싱 전용, 별도 패키지 @estate-erp/mcp-crawler.",
        "<b>로컬 MCP (Phase 3)</b> — Electron 호스팅, 크롤러 MCP 통합 등 로컬 전용 기능.",
        "<b>도구 예시</b> — search_listings, get_property, create_task, create_consultation, search_buyers, get_deal, upsert_external_listings.",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("4.4 AWS 비용 추정", styles["KH2"]))
    cost_rows = [
        ["사무소 수", "월 서버 비용", "사무소당"],
        ["10개", "~ $15 (프리티어)", "~ $1.5"],
        ["50개", "~ $60", "~ $1.2"],
        ["200개", "~ $150", "~ $0.75"],
        ["1,000개", "~ $600", "~ $0.6"],
    ]
    story.append(make_table(cost_rows, [4 * cm, 6 * cm, 6 * cm], styles))

    story.append(PageBreak())

    # ===== 5. 데이터 구조 =====
    story.append(Paragraph("5. 데이터 구조 (39 테이블)", styles["KH1"]))

    story.append(
        Paragraph(
            "Prisma schema가 source of truth다. 멀티테넌시를 전제로 모든 비즈니스 테이블은 officeId를 가진다 "
            "(법정동 마스터 제외). 아래는 주요 도메인별 테이블 목록이다.",
            styles["KBody"],
        )
    )

    domain_rows = [
        ["도메인", "테이블 수", "대표 테이블"],
        ["법정동 마스터", "3", "Province, District, Ward"],
        ["멀티테넌시", "2", "Office, User"],
        ["장소 (Place)", "5", "Site, SiteUnitType, Dong, Unit, OfficeSite"],
        ["매물 (Property)", "3", "Property, Listing, PriceHistory"],
        ["연락처 (Contact)", "4", "Contact, ContactRelation, PropertyContact, Tenant"],
        ["CRM 파이프라인", "6", "BuyerRequirement, Consultation, Match, Deal, Contract, DealParticipant"],
        ["업무", "3", "Task, CalendarEvent, ActivityLog"],
        ["알림", "1", "Notification"],
        ["네트워크 (공동중개)", "5", "NetworkRoom, NetworkRoomMember, NetworkSharedProperty, NetworkInquiry, NetworkMessage"],
        ["외부 매물 (광고노트)", "2", "ExternalListingGroup, ExternalListing"],
        ["업체 디렉토리", "3", "ServiceCategory, ServiceVendor, VendorContact"],
    ]
    story.append(make_table(domain_rows, [4.5 * cm, 2 * cm, 9.5 * cm], styles))

    story.append(Paragraph("5.1 Site → Dong → Unit → Property → Listing 체인", styles["KH2"]))
    story.append(
        Paragraph(
            "모든 건물형(아파트·오피스텔·빌라·상가·지식산업센터)은 Site → Dong → Unit → Property → Listing 체인을 "
            "따른다. 단독주택·토지는 Unit이 없어 Site → Property → Listing으로 단순화된다. "
            "단일 동 건물은 isPlaceholder=true인 Dong을 자동 생성해 쿼리/UI를 통일한다.",
            styles["KBody"],
        )
    )
    for item in [
        "<b>Property</b> — 사무소가 관리하는 부동산 단위. 소유자·세입자·메모를 보관.",
        "<b>Listing</b> — 거래 단위. 매매/전세/월세 · 가격 · 옵션 일시중단.",
        "<b>1 Property : N Listing</b> — 같은 호실을 매매·전세로 동시 등록 가능.",
        "<b>SiteUnitType</b> — 평형 카탈로그(84A, 59B). 네이버 pyeongList 1:1 대응.",
        "<b>Unit.floor + lineNo</b> — 동별 호실 그리드(네이버 스타일) 구현.",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("5.2 인물 관계 체계", styles["KH2"]))
    story.append(
        Paragraph(
            "Contact(연락처)는 모든 사람의 기본 레코드다. 역할은 관계 테이블로 구분해 한 사람이 "
            "판매자·구매자·세입자·관련인 역할을 동시에 수행할 수 있다.",
            styles["KBody"],
        )
    )
    for item in [
        "판매자 / 소유자 → PropertyContact (role: owner, co_owner, representative, lawyer, tax_agent)",
        "구매자 → BuyerRequirement (조건·예산·지역·우선순위)",
        "세입자 → Tenant (보증금·월세·계약기간·moveOutDate)",
        "가족 / 전문가 → ContactRelation (parent, spouse, child, lawyer, tax_agent 등)",
    ]:
        story.append(bullet(item, styles))

    story.append(PageBreak())

    # ===== 6. 핵심 기능 =====
    story.append(Paragraph("6. 핵심 기능", styles["KH1"]))

    story.append(Paragraph("6.1 CRM 코어", styles["KH2"]))
    for item in [
        "매물 관리 (Site·Unit·Property·Listing 4단 구조)",
        "연락처·소유주·고객 통합 관리 + 사람 간 관계 그래프",
        "상담 기록 (type=phone/visit/online, propertyId·listingId·matchId·buyerReqId 자동 연결)",
        "구매 고객 조건 관리 (BuyerRequirement — 예산·지역·면적·mustConditions)",
        "매칭 파이프라인 + 거래 / 계약 관리 (Deal · Contract · DealParticipant)",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("6.2 업무 운영", styles["KH2"]))
    for item in [
        "Task (업무) · CalendarEvent (일정) · Notification (실시간 알림)",
        "ActivityLog — 11개 핵심 엔티티의 모든 변경을 actor/source와 함께 감사 추적",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("6.3 수수료 / 캐시플로우", styles["KH2"]))
    for item in [
        "CommissionPayment — 매도측·매수측·공동중개 분리 수금 추적",
        "수금 파이프라인 — pending → collected / overdue / partial / waived",
        "OfficeExpenseTemplate — 사무소 고정비 템플릿(한번 등록 → 매월 자동 반영)",
        "대시보드 3뷰 — 타임라인(월별) · 칸반(단계별) · 리스트(테이블)",
        "수금 캘린더 · 순이익 추정(수금 완료 − 고정비)",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("6.4 공동 중개 네트워크", styles["KH2"]))
    for item in [
        "NetworkRoom — 카카오톡 그룹방처럼 동작하는 매물 공유 방(public / private)",
        "NetworkSharedProperty — 내 Listing을 방에 공유. show* 플래그로 필드별 마스킹",
        "NetworkInquiry — 다른 사무소의 매물 문의 · 수락/거절 흐름",
        "NetworkMessage — 중개방 채팅 (매물 카드 첨부 가능)",
        "공동 중개 시 Deal.isJointBrokerage + partnerBroker* + partnerCommission으로 수수료 분리",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("6.5 외부 매물(광고노트) · 업체 디렉토리", styles["KH2"]))
    for item in [
        "<b>광고노트</b> — ExternalListingGroup(호실 단위) + ExternalListing(개별 매물). 크롤러는 사용자 확정한 unitId/memo/inferredHo를 절대 덮어쓰지 않음.",
        "<b>업체 디렉토리</b> — ServiceVendor (officeId nullable, 공용 풀 + 사무소별), VendorContact(담당자 1:N), ServiceCategory(배관·도배·청소 등).",
        "<b>통합 검색</b> — all_contacts_view(Contact ∪ VendorContact)로 CTI 전화 팝업 단일 쿼리 2-3ms.",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("6.6 공적장부 발급", styles["KH2"]))
    story.append(
        Paragraph(
            "등기부등본(유료 700원), 건축물대장, 토지/임야대장, 지적도, 토지이용계획확인서, 대지권등록부 6종. "
            "Phase 1은 UI 스캐폴딩 + 유료 API 업체(틸코·코리아크레딧뷰로) 연동 구조만. "
            "결과는 S3 저장, PublicDocument 메타데이터로 이력 통합 조회.",
            styles["KBody"],
        )
    )

    story.append(PageBreak())

    # ===== 7. 파이프라인 =====
    story.append(Paragraph("7. 핵심 파이프라인", styles["KH1"]))

    pipe_rows = [
        ["파이프라인", "단계"],
        ["Listing.checkStatus", "unverified → verified → in_contract → hold → done"],
        ["Match.stage", "suggested → buyerContacted → viewing → ownerContacted → negotiating → dealCreated → closed"],
        ["Deal.stage", "selection → deposit → contract → completed → closed"],
        ["Contract.status", "draft → signed → depositPaid → balancePaid → registered → cancelled"],
        ["CommissionPayment", "pending → collected / overdue / partial / waived"],
        ["TaskSource", "manual / system / ai"],
    ]
    story.append(make_table(pipe_rows, [4 * cm, 12 * cm], styles))

    story.append(Paragraph("7.1 매물 관리 흐름", styles["KH2"]))
    story.append(
        code_block(
            [
                "Site / Unit 등록",
                "  → Property 생성",
                "    → Listing 생성",
                "      → 확인 상태 추적 (unverified → verified → in_contract → done)",
                "        → 상담 / 매칭 / 거래로 연결",
            ],
            styles,
        )
    )

    story.append(Paragraph("7.2 공동 중개 흐름", styles["KH2"]))
    story.append(
        code_block(
            [
                "중개방 생성",
                "  → 참여 승인 (NetworkRoomMember.status = approved)",
                "    → Listing 공유 (NetworkSharedProperty + show* 마스킹)",
                "      → 다른 사무소 문의 (NetworkInquiry)",
                "        → 수락 / 거절",
                "          → 공동 중개 Deal 진행 (isJointBrokerage + partnerCommission)",
            ],
            styles,
        )
    )

    story.append(PageBreak())

    # ===== 8. 로드맵 =====
    story.append(Paragraph("8. Phase별 로드맵", styles["KH1"]))

    story.append(Paragraph("Phase 1 (현재) — NestJS 서버 + Electron 데스크톱 + AWS 배포", styles["KH2"]))
    for item in [
        "인증 · 사무소 · 사용자 · 역할 · 멀티테넌시 격리",
        "매물 / 연락처 / 상담 / 매칭 / 거래 / 태스크 / 일정 CRUD + Listing 중심 파이프라인",
        "ActivityLog 기반 감사 추적 (AsyncLocalStorage + Prisma Middleware)",
        "수수료 / 캐시플로우 — CommissionPayment + 3뷰 대시보드 + 수금 캘린더",
        "고정비 관리 — OfficeExpenseTemplate",
        "공적장부 발급 UI 스캐폴딩 + 유료 API 연동",
        "리모트 MCP Server (/mcp/sse, JWT 인증)",
        "AWS 인프라 (ECS Fargate + ALB + RDS + ElastiCache + S3 + ECR) + GitHub Actions CI/CD",
        "Electron 자동 업데이트 (electron-updater + S3 + 커스텀 알림 UI)",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("Phase 2 — 내부 AI 챗 · 웹 앱 · 실시간 · Call Workspace", styles["KH2"]))
    for item in [
        "내부 AI 챗 — Claude API + 도구 호출 + 대화 기억(ChatSession·ChatMessage)",
        "pgvector 의미 매칭 — SQL 필터 + 벡터 검색 + LLM 판단 3단계",
        "웹 앱(Vite SPA) 본격 고도화",
        "사진 업로드(S3 presigned URL + drag & drop), 공적장부 실제 API",
        "알림 + 실시간 동기화(Socket.io + Redis Adapter) + 시스템 트레이",
        "Call Workspace — 전화 응대 UI + CTI 진입 흐름",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("Phase 3 — 로컬 MCP · 외부 데이터 · CTI Bridge", styles["KH2"]))
    for item in [
        "로컬 MCP 서버(Electron 호스팅)",
        "네이버 / 외부 데이터 연동 (크롤러 MCP 통합)",
        "CTI Bridge · Electron ↔ CTI 로컬 통신",
    ]:
        story.append(bullet(item, styles))

    story.append(Paragraph("Phase 4 — Android 모바일 앱", styles["KH2"]))
    for item in [
        "Flutter 기반 Android 앱 + 네이티브 전화 플러그인",
        "ROLE_CALL_SCREENING 기반 전화 수신 감지",
        "통화 중 오버레이 팝업 + 통화 후 녹음 파일 업로드 + 서버 STT",
        "초기에는 READ_CALL_LOG 제외 (Play 정책 리스크)",
    ]:
        story.append(bullet(item, styles))

    story.append(PageBreak())

    # ===== 9. 가격 / 리스크 =====
    story.append(Paragraph("9. 가격 & 사업 모델", styles["KH1"]))
    story.append(
        Paragraph(
            "SaaS 구독형 모델. 광고 노출 없는 업무 효율화 도구이므로 경쟁사(중개왕·부기사 3만원) 대비 "
            "낮은 진입 가격으로 시작하고 기능 추가에 따라 인상한다. Phase 1은 기본(9,900원) 플랜으로 출시.",
            styles["KBody"],
        )
    )

    plan_rows = [
        ["플랜", "월 가격", "광고노트 단지", "핵심 기능"],
        ["무료", "0원", "2개", "CRM 기본 (매물·고객·상담·거래)"],
        ["기본", "9,900원", "20개", "수수료 정산 + 광고노트 + 공적장부"],
        ["프로", "29,900원", "무제한", "직원관리 + 내부 AI 챗 + MCP"],
    ]
    story.append(make_table(plan_rows, [2.5 * cm, 2.5 * cm, 3 * cm, 8 * cm], styles))

    story.append(Paragraph("10. 주요 리스크 & 대응", styles["KH1"]))
    risk_rows = [
        ["리스크", "대응 방향"],
        ["외부 스크래핑 차단", "로컬 실행(크롤러 MCP) · 대체 데이터 소스 준비"],
        ["CTI 특정 벤더 의존", "CTI Bridge 추상화"],
        ["Android Play 정책 제약", "ROLE_CALL_SCREENING 중심, READ_CALL_LOG는 후순위"],
        ["제조사별 통화앱 차이", "앱별 딥링크 + 일반 설정 fallback + 사용자 가이드"],
        ["Electron 보안 / 운영", "자동 업데이트 파이프라인 · 보안 기준 유지"],
        ["개발 범위 과대", "Phase별 축소 · 코어 흐름 우선"],
        ["단순 CRM 차별화 실패", "네트워크 공유 + MCP 연결에 집중"],
        ["AI API 비용 증가", "사무소당 월 약 3만원 추정 · 플랜 가격에 반영"],
        ["광고노트 서버 부하", "단지 수 제한(무료 2 / 기본 20) · 30일 비활성 매물 자동 삭제"],
    ]
    story.append(make_table(risk_rows, [5 * cm, 11 * cm], styles))

    story.append(Paragraph("11. 성공 조건", styles["KH1"]))
    for item in [
        "매물·고객·상담·거래·태스크가 한 흐름으로 이어진다.",
        "사무소 단위 데이터 격리가 안정적으로 동작한다.",
        "외부 AI가 MCP를 통해 읽기/쓰기 액션을 수행할 수 있다.",
        "데스크톱 앱이 일상 업무의 메인 진입점이 된다.",
        "공동 중개 네트워크가 부가 기능이 아니라 실제 사용되는 업무 채널이 된다.",
        "수수료 캐시플로우가 사장님의 월간 재무 파악 도구가 된다.",
        "(Phase 2) 내부 AI 챗이 매물 검색 / 매칭 제안을 정확히 수행한다.",
    ]:
        story.append(bullet(item, styles))

    story.append(PageBreak())

    # ===== 12. 참고 문서 =====
    story.append(Paragraph("12. 참고 문서 (docs/)", styles["KH1"]))
    ref_rows = [
        ["문서", "설명"],
        ["prd.md", "제품 요구사항 (현재 문서의 출처)"],
        ["ARCHITECTURE.md", "시스템 구조 · MCP/CTI 전략 · 모노레포 구성"],
        ["DATA_STRUCTURE.md", "ERD · 엔터티 설명 · 필드 규칙 (37 테이블)"],
        ["PRODUCT_STRATEGY.md", "시장 · 경쟁 · AI · MCP 전략"],
        ["DECISIONS.md", "핵심 결정 · 미결정 사항 · 후속 과제"],
        ["LOCAL_INFRA.md", "로컬 개발 인프라 실행 방법"],
        ["desktop-prd/", "desktop 페이지별 상세 PRD 하네스"],
        ["prisma/schema.prisma", "DB 스키마 (source of truth)"],
    ]
    story.append(make_table(ref_rows, [5 * cm, 11 * cm], styles))

    story.append(Spacer(1, 0.8 * cm))
    story.append(
        Paragraph(
            "상세 설계 · 의사결정 · 페이지 스펙은 위 개별 문서에서 관리된다. 본 PDF는 프로젝트의 스냅샷 "
            "개요이며, 제품 방향이 바뀌면 docs/ 내용이 먼저 갱신되고 이 문서는 그에 맞춰 재생성된다.",
            styles["KBody"],
        )
    )

    return story


def main():
    styles = build_styles()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT_PATH),
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title="Estate ERP Project Overview",
        author="Estate ERP Team",
    )
    story = build_story(styles)
    doc.build(story, onFirstPage=header_footer, onLaterPages=header_footer)
    print(f"Generated: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
