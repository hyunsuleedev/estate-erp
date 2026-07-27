import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  CheckSquare2,
  ChevronDown,
  Columns3,
  EllipsisVertical,
  Handshake,
  LayoutDashboard,
  List,
  Map,
  MapPinned,
  Megaphone,
  PanelLeft,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Tag,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

const transactionMeta = {
  sale: { label: "매매", className: "transaction-sale" },
  jeonse: { label: "전세", className: "transaction-jeonse" },
  monthly: { label: "월세", className: "transaction-monthly" },
};

const availabilityMeta = {
  available: { label: "가용", className: "status-available" },
  paused: { label: "보류", className: "status-paused" },
  in_contract: { label: "거래중", className: "status-in-contract" },
  closed: { label: "종료", className: "status-closed" },
};

const rows = [
  {
    id: "intake-01",
    site: "고덕그라시움",
    dong: "102",
    unit: "1804",
    type: "115C",
    area: "25.4평",
    checkedDate: "7. 27.",
    checkedAgo: "오늘",
    memo: "데모 물건 4 · 신규 미확인 의뢰",
    availability: "available",
    listings: [
      {
        id: "listing-01-sale",
        transactionType: "sale",
        price: "14억 8,000만",
        monthlyRent: "-",
        moveIn: "9. 1.~9. 30.",
        moveInTone: "warning",
      },
    ],
  },
  {
    id: "intake-02",
    site: "고덕그라시움",
    dong: "101",
    unit: "1001",
    type: "154C",
    area: "34.3평",
    checkedDate: "7. 25.",
    checkedAgo: "2일 전",
    memo: "데모 물건 1 · 소유주 직접 의뢰",
    availability: "in_contract",
    activeDeal: {
      id: "DEAL-260727-04",
      listingId: "listing-02-sale",
      stage: "계약 준비",
      customer: "김매수",
      price: "19억 3,000만",
    },
    listings: [
      {
        id: "listing-02-sale",
        transactionType: "sale",
        price: "19억 5,000만",
        monthlyRent: "-",
        moveIn: "즉시",
        moveInTone: "success",
      },
    ],
  },
  {
    id: "intake-03",
    site: "고덕그라시움",
    dong: "101",
    unit: "3501",
    type: "242B",
    area: "53.2평",
    checkedDate: "7. 27.",
    checkedAgo: "오늘",
    memo: "매매·전세 동시 의뢰",
    availability: "in_contract",
    activeDeal: {
      id: "DEAL-260727-11",
      listingId: "listing-03-sale",
      stage: "협상",
      customer: "한구매",
      price: "26억 2,000만",
    },
    listings: [
      {
        id: "listing-03-sale",
        transactionType: "sale",
        price: "26억 8,000만",
        monthlyRent: "-",
        moveIn: "즉시",
        moveInTone: "success",
      },
      {
        id: "listing-03-jeonse",
        transactionType: "jeonse",
        price: "12억",
        monthlyRent: "-",
        moveIn: "확인 필요",
        moveInTone: "neutral",
      },
    ],
  },
  {
    id: "intake-04",
    site: "고덕그라시움",
    dong: "102",
    unit: "3202",
    type: "172A",
    area: "38.6평",
    checkedDate: "7. 26.",
    checkedAgo: "1일 전",
    memo: "전세 협상 중 · 매매는 잠시 보류",
    availability: "in_contract",
    activeDeal: {
      id: "DEAL-260726-08",
      listingId: "listing-04-jeonse",
      stage: "집주인 연락",
      customer: "전세희",
      price: "10억 5,000만",
    },
    listings: [
      {
        id: "listing-04-sale",
        transactionType: "sale",
        price: "23억 5,000만",
        monthlyRent: "-",
        moveIn: "협의",
        moveInTone: "neutral",
      },
      {
        id: "listing-04-jeonse",
        transactionType: "jeonse",
        price: "10억 8,000만",
        monthlyRent: "-",
        moveIn: "8. 30. 이후",
        moveInTone: "info",
      },
    ],
  },
  {
    id: "intake-05",
    site: "고덕그라시움",
    dong: "101",
    unit: "3403",
    type: "155B",
    area: "34.2평",
    checkedDate: "7. 25.",
    checkedAgo: "2일 전",
    memo: "월세 의뢰",
    availability: "in_contract",
    activeDeal: {
      id: "DEAL-260725-03",
      listingId: "listing-05-monthly",
      stage: "가계약금",
      customer: "박임차",
      price: "5,000만 / 175만",
    },
    listings: [
      {
        id: "listing-05-monthly",
        transactionType: "monthly",
        price: "5,000만",
        monthlyRent: "180만",
        moveIn: "확인 필요",
        moveInTone: "neutral",
      },
    ],
  },
];

const sidebarGroups = [
  {
    label: "시작",
    items: [{ label: "대시보드", icon: LayoutDashboard }],
  },
  {
    label: "매물·공간",
    items: [
      { label: "매물관리", icon: Building2, active: true },
      { label: "관리단지", icon: MapPinned },
    ],
  },
  {
    label: "고객·상담",
    items: [
      { label: "연락처", icon: UserRound },
      { label: "구매고객", icon: UsersRound },
    ],
  },
  {
    label: "거래·계약",
    items: [
      { label: "매칭", icon: SlidersHorizontal },
      { label: "거래관리", icon: Handshake },
    ],
  },
  {
    label: "업무·운영",
    items: [
      { label: "업무", icon: CheckSquare2 },
      { label: "설정", icon: Settings },
    ],
  },
];

function TransactionBadge({ type, compact = false }) {
  const meta = transactionMeta[type] ?? { label: type, className: "" };
  return (
    <span className={`transaction-badge ${compact ? "compact" : ""} ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function IntakeStatusChip({ row, onSelect }) {
  const status = availabilityMeta[row.availability];
  const activeListing = row.listings.find((listing) => listing.id === row.activeDeal?.listingId);
  const activeTransaction = activeListing ? transactionMeta[activeListing.transactionType] : null;
  const activeDescription =
    row.availability === "in_contract" && activeTransaction
      ? `, ${activeTransaction.label} listing에 활성 Deal 연결`
      : "";

  return (
    <button
      type="button"
      className={`status-chip intake-status-chip ${status.className}`}
      aria-label={`의뢰 상태 ${status.label}${activeDescription}`}
      onClick={() => onSelect(row)}
    >
      <span className="status-dot" aria-hidden="true" />
      <span>{status.label}</span>
    </button>
  );
}

function ActiveDealConnector({ listingCount, targetIndex }) {
  const height = listingCount * 44;
  const startY = height / 2;
  const targetY = targetIndex * 44 + 22;
  const path = `M 0 ${startY} C 30 ${startY}, 38 ${targetY}, 91 ${targetY}`;

  return (
    <svg
      className="deal-connector"
      viewBox={`0 0 94 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={path} vectorEffect="non-scaling-stroke" />
      <circle className="deal-connector-node-halo" cx="91" cy={targetY} r="4.5" />
      <circle className="deal-connector-node" cx="91" cy={targetY} r="2.5" />
    </svg>
  );
}

function FilterButton({ children, strong }) {
  return (
    <button type="button" className="filter-button">
      <span>{children}</span>
      {strong && <strong>{strong}</strong>}
      <ChevronDown size={15} aria-hidden="true" />
    </button>
  );
}

function ListingStack({ listings, children, className = "", itemClassName }) {
  return (
    <div className={`listing-stack ${className}`}>
      {listings.map((listing, index) => (
        <div
          className={`listing-stack-item ${
            typeof itemClassName === "function" ? itemClassName(listing, index) : itemClassName ?? ""
          }`}
          key={listing.id}
        >
          {children(listing, index)}
        </div>
      ))}
    </div>
  );
}

function PropertyRow({ row, onSelectListing }) {
  const multiple = row.listings.length > 1;
  const rowHeight = row.listings.length * 44;
  const activeListingIndex = row.listings.findIndex((listing) => listing.id === row.activeDeal?.listingId);
  const hasConnectedDeal =
    multiple && row.availability === "in_contract" && row.activeDeal && activeListingIndex >= 0;

  return (
    <div
      className={`property-row ${multiple ? "is-multiple" : ""} ${hasConnectedDeal ? "has-connected-deal" : ""}`}
      style={{ "--row-height": `${rowHeight}px` }}
    >
      <div className="grid-cell select-cell">
        <input type="checkbox" aria-label={`${row.site} ${row.dong}동 ${row.unit}호 선택`} />
      </div>
      <div className="grid-cell stack-wrap">
        <ListingStack listings={row.listings}>
          {(listing) => <TransactionBadge type={listing.transactionType} />}
        </ListingStack>
      </div>
      <div className="grid-cell site-cell">
        <span className="site-name">{row.site}</span>
      </div>
      <div className="grid-cell numeric-cell">{row.dong}</div>
      <div className="grid-cell numeric-cell">{row.unit}</div>
      <div className="grid-cell action-cell">
        <button type="button" className="icon-button" aria-label={`${row.site} 행 작업 메뉴`}>
          <EllipsisVertical size={16} />
        </button>
      </div>
      <div className="grid-cell type-cell">{row.type}</div>
      <div className="grid-cell area-cell">{row.area}</div>
      <div className="grid-cell check-cell">
        <span className="fresh-dot" />
        <span>
          <strong>{row.checkedDate}</strong>
          <small>{row.checkedAgo}</small>
        </span>
      </div>
      <div className="grid-cell status-cell">
        <div className="intake-status">
          <IntakeStatusChip row={row} onSelect={onSelectListing} />
          {hasConnectedDeal && (
            <ActiveDealConnector listingCount={row.listings.length} targetIndex={activeListingIndex} />
          )}
        </div>
      </div>
      <div className="grid-cell stack-wrap price-cell">
        <ListingStack
          listings={row.listings}
          itemClassName={(listing) =>
            hasConnectedDeal && listing.id === row.activeDeal.listingId ? "active-listing-target" : ""
          }
        >
          {(listing) => (
            hasConnectedDeal && listing.id === row.activeDeal.listingId ? (
              <button
                type="button"
                className="price-pair deal-target-button"
                data-testid="active-deal-listing"
                aria-label={`${transactionMeta[listing.transactionType].label} listing, 활성 Deal ${row.activeDeal.id}`}
                onClick={() => onSelectListing(row)}
              >
                <TransactionBadge type={listing.transactionType} compact />
                <strong>{listing.price}</strong>
                <span className="sr-only">활성 Deal 연결 대상</span>
              </button>
            ) : (
              <div className="price-pair">
                {multiple && <TransactionBadge type={listing.transactionType} compact />}
                <strong>{listing.price}</strong>
              </div>
            )
          )}
        </ListingStack>
      </div>
      <div className="grid-cell stack-wrap rent-cell">
        <ListingStack listings={row.listings}>
          {(listing) => <span>{listing.monthlyRent}</span>}
        </ListingStack>
      </div>
      <div className="grid-cell stack-wrap move-in-cell">
        <ListingStack listings={row.listings}>
          {(listing) => <span className={`move-in-badge ${listing.moveInTone}`}>{listing.moveIn}</span>}
        </ListingStack>
      </div>
      <div className="grid-cell memo-cell">
        <span>{row.memo}</span>
      </div>
    </div>
  );
}

function IntakeStatusDrawer({ row, onClose, onAction }) {
  const closeButtonRef = useRef(null);
  const status = availabilityMeta[row.availability];
  const activeListing = row.listings.find((listing) => listing.id === row.activeDeal?.listingId) ?? null;
  const activeTransaction = activeListing ? transactionMeta[activeListing.transactionType] : null;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        className="listing-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="listing-drawer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-header">
          <div>
            <div className="drawer-kicker">Intake 상태</div>
            <h2 id="listing-drawer-title">{row.site} {row.dong}동 {row.unit}호</h2>
          </div>
          <button ref={closeButtonRef} type="button" className="icon-button large" onClick={onClose} aria-label="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="drawer-summary">
          <span className={`status-chip static ${status.className}`}>
            <span className="status-dot" />
            <span>{status.label}</span>
          </span>
          <span className="drawer-summary-label">의뢰 단위 통합 상태</span>
        </div>

        {row.activeDeal && activeListing ? (
          <>
            <section className="drawer-section">
              <div className="section-label">활성 Deal 대상 listing</div>
              <div className="drawer-listing-target">
                <TransactionBadge type={activeListing.transactionType} />
                <strong>{activeListing.price}</strong>
                {activeListing.transactionType === "monthly" && <span>월 {activeListing.monthlyRent}</span>}
              </div>
              <div className="deal-card">
                <div className="deal-card-top">
                  <strong>{row.activeDeal.id}</strong>
                  <span>{row.activeDeal.stage}</span>
                </div>
                <dl>
                  <div>
                    <dt>고객</dt>
                    <dd>{row.activeDeal.customer}</dd>
                  </div>
                  <div>
                    <dt>합의 조건</dt>
                    <dd>{row.activeDeal.price}</dd>
                  </div>
                </dl>
              </div>
            </section>
            <p className="drawer-note">
              거래중은 intake 전체에 한 번만 표시됩니다. 표의 연결선은 이 활성 Deal의 listing만 가리킵니다.
            </p>
            <button type="button" className="primary-button" onClick={() => onAction("거래관리에서 열었습니다.")}>
              <Handshake size={16} />
              거래관리에서 열기
            </button>
          </>
        ) : (
          <>
            <section className="drawer-section empty-deal">
              <div className="empty-icon">
                <Tag size={20} />
              </div>
              <strong>진행 중인 거래가 없습니다</strong>
              <p>이 intake는 현재 {status.label} 상태입니다.</p>
            </section>
            <button type="button" className="primary-button" onClick={() => onAction("이 intake에서 거래를 시작합니다.")}>
              <Plus size={16} />
              거래 시작
            </button>
          </>
        )}
      </aside>
    </div>
  );
}

export function App() {
  const [transactionFilter, setTransactionFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIntake, setSelectedIntake] = useState(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") setSelectedIntake(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2400);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase("ko");
    return rows.filter((row) => {
      const matchesTransaction =
        transactionFilter === "all" ||
        row.listings.some((listing) => listing.transactionType === transactionFilter);
      const matchesAvailability =
        availabilityFilter === "all" || row.availability === availabilityFilter;
      const matchesSearch =
        !query ||
        [row.site, row.dong, row.unit, row.memo].some((value) => value.toLocaleLowerCase("ko").includes(query));
      return matchesTransaction && matchesAvailability && matchesSearch;
    });
  }, [availabilityFilter, searchQuery, transactionFilter]);

  return (
    <div className="prototype-shell" data-testid="status-stack-demo">
      <header className="titlebar">
        <div className="brand">Estaitt</div>
        <button className="titlebar-icon" type="button" aria-label="사이드바 토글">
          <PanelLeft size={20} />
        </button>
        <div className="open-tab">
          <Building2 size={17} />
          <span>매물관리</span>
          <X size={15} />
        </div>
        <button className="new-tab" type="button" aria-label="새 탭">
          <Plus size={18} />
        </button>
        <button className="notification-button" type="button" aria-label="알림">
          <Bell size={18} />
        </button>
      </header>

      <aside className="sidebar" aria-label="주 메뉴">
        <div className="sidebar-scroll">
          {sidebarGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    <button type="button" className={`nav-item ${item.active ? "active parent" : ""}`}>
                      <Icon size={17} />
                      <span>{item.label}</span>
                      {item.active && <ChevronDown className="nav-chevron" size={15} />}
                    </button>
                    {item.active && (
                      <div className="subnav">
                        <button type="button" className="subnav-item active">
                          매물 목록
                        </button>
                        <button type="button" className="subnav-item">
                          광고노트
                        </button>
                        <button type="button" className="subnav-item">
                          내광고관리
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <div className="profile">
          <span className="avatar">k</span>
          <strong>kimyoung</strong>
          <ChevronDown size={15} />
        </div>
      </aside>

      <main className="workspace">
        <section className="primary-toolbar">
          <div className="transaction-tabs" role="tablist" aria-label="거래유형">
            {[
              ["all", "전체"],
              ["sale", "매매"],
              ["jeonse", "전세"],
              ["monthly", "월세"],
            ].map(([value, label]) => (
              <button
                type="button"
                role="tab"
                aria-selected={transactionFilter === value}
                className={transactionFilter === value ? "active" : ""}
                key={value}
                onClick={() => setTransactionFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <button className="complex-select" type="button">
            <span>단지 전체</span>
            <ChevronDown size={15} />
          </button>
          <input className="short-input" aria-label="동" placeholder="동" />
          <input className="short-input" aria-label="호" placeholder="호" />
          <label className="search-field">
            <Search size={17} />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="주소, 연락처, 메모"
            />
          </label>
          <div className="view-switch" role="group" aria-label="매물 보기 방식">
            <button type="button" className="active">
              <List size={16} />
              목록
            </button>
            <button type="button" aria-disabled="true">
              <Map size={16} />
              지도
            </button>
          </div>
          <button className="add-property-button" type="button" onClick={() => setNotice("새 매물 등록 화면을 열었습니다.")}>
            <Plus size={17} />
            새 매물 등록
          </button>
        </section>

        <section className="secondary-toolbar">
          <FilterButton strong="전체">지역</FilterButton>
          <FilterButton strong="전체">유형</FilterButton>
          <label className="status-filter">
            <span className="sr-only">매물상태 필터</span>
            <select value={availabilityFilter} onChange={(event) => setAvailabilityFilter(event.target.value)}>
              <option value="all">매물상태 전체</option>
              <option value="available">가용</option>
              <option value="paused">보류</option>
              <option value="in_contract">거래중</option>
              <option value="closed">종료</option>
            </select>
            <ChevronDown size={15} aria-hidden="true" />
          </label>
          <FilterButton strong="전체">가격/보증금</FilterButton>
          <FilterButton strong="전체">월세</FilterButton>
          <FilterButton strong="전체">면적</FilterButton>
          <FilterButton strong="전체">입주일</FilterButton>
          <FilterButton strong="전체">
            <Megaphone size={14} />
            광고
          </FilterButton>
          <div className="toolbar-spacer" />
          <span className="display-label">표시</span>
          <button className="column-button" type="button">
            <Columns3 size={15} />
            컬럼
          </button>
        </section>

        <section className="table-section">
          <div className="table-scroll">
            <div className="property-grid">
              <div className="grid-header">
                <div className="grid-head select-cell">
                  <input type="checkbox" aria-label="모두 선택" />
                </div>
                <div className="grid-head">거래</div>
                <div className="grid-head">단지</div>
                <div className="grid-head">동</div>
                <div className="grid-head">호</div>
                <div className="grid-head">작업</div>
                <div className="grid-head">타입</div>
                <div className="grid-head">전용면적</div>
                <div className="grid-head">
                  <CalendarDays size={14} />
                  확인
                </div>
                <div className="grid-head">
                  <Tag size={14} />
                  매물상태
                </div>
                <div className="grid-head">가격/보증금</div>
                <div className="grid-head">월세</div>
                <div className="grid-head">입주가능일</div>
                <div className="grid-head">의뢰 메모</div>
              </div>
              {filteredRows.map((row) => (
                <PropertyRow key={row.id} row={row} onSelectListing={setSelectedIntake} />
              ))}
              {filteredRows.length === 0 && (
                <div className="empty-state">
                  <Search size={20} />
                  <strong>조건에 맞는 매물이 없습니다</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setTransactionFilter("all");
                      setAvailabilityFilter("all");
                      setSearchQuery("");
                    }}
                  >
                    필터 초기화
                  </button>
                </div>
              )}
            </div>
          </div>
          <footer className="statusbar">
            <span>의뢰 {filteredRows.length}건 표시</span>
            <span className="statusbar-hint">
              거래중은 intake 통합 상태이며, 연결선은 활성 Deal의 listing을 가리킵니다.
            </span>
          </footer>
        </section>
      </main>

      {selectedIntake && (
        <IntakeStatusDrawer
          row={selectedIntake}
          onClose={() => setSelectedIntake(null)}
          onAction={(message) => {
            setNotice(message);
            setSelectedIntake(null);
          }}
        />
      )}
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}
