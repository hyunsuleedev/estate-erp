import { useEffect, useRef, useState } from "react";
import {
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
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
  RotateCcw,
  Search,
  Settings,
  SlidersHorizontal,
  Tag,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  advertisementOptions,
  areaOptions,
  availabilityMeta,
  availabilityOptions,
  confirmationOptions,
  moveInOptions,
  priceOptions,
  regionOptions,
  rentOptions,
  siteOptions,
  siteTypeOptions,
  transactionMeta,
  transactionOptions,
} from "./data.js";

/*
Intent:     전화와 상담 사이에 매물을 즉시 찾는 중개사가 결과 표를 중심으로 일한다.
Hierarchy:  필터 결과와 표가 주인공이며 앱 크롬은 익숙한 위치감만 제공한다.
Palette:    등기 서류의 미색, 흑연색, 청사진 파랑과 기존 상태색을 그대로 쓴다.
Depth:      테두리 중심의 조용한 업무 도구로 유지한다.
Surfaces:   캔버스 → 툴바 → 팝오버/시트의 세 단계만 둔다.
Typography: Pretendard 계열, 12–14px의 조밀한 위계와 tabular 숫자를 쓴다.
Spacing:    4px 기반, 제어 높이 36–40px의 데스크톱 밀도다.
*/

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
      { label: "상담기록", icon: SlidersHorizontal },
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

export function useNotice() {
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return undefined;
    const timeout = window.setTimeout(() => setNotice(""), 2200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  return [notice, setNotice];
}

export function AppShell({ children, notice, variantId }) {
  return (
    <div className="app-shell" data-variant={variantId}>
      <header className="titlebar">
        <div className="brand">Estaitt</div>
        <div className="titlebar-panel-icon" aria-hidden="true">
          <PanelLeft size={18} />
        </div>
        <div className="open-tab" aria-current="page">
          <Building2 size={16} />
          <span>매물관리</span>
          <X size={14} aria-hidden="true" />
        </div>
        <div className="new-tab-symbol" aria-hidden="true">
          <Plus size={17} />
        </div>
        <div className="titlebar-spacer" />
        <div className="titlebar-bell" aria-hidden="true">
          <Bell size={17} />
        </div>
      </header>

      <aside className="sidebar" aria-label="현재 앱 탐색">
        <div className="sidebar-scroll">
          {sidebarGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label}>
                    <div className={`nav-item ${item.active ? "active parent" : ""}`}>
                      <Icon size={17} />
                      <span>{item.label}</span>
                      {item.active && <ChevronDown className="nav-chevron" size={14} />}
                    </div>
                    {item.active && (
                      <div className="subnav">
                        <div className="subnav-item active">매물 목록</div>
                        <div className="subnav-item">광고노트</div>
                        <div className="subnav-item">내광고관리</div>
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
          <ChevronDown size={14} aria-hidden="true" />
        </div>
      </aside>

      <main className="workspace">{children}</main>
      {notice && (
        <div className="app-toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
    </div>
  );
}

export function SegmentedTabs({ value, onChange, compact = false }) {
  return (
    <div className={`segmented-tabs ${compact ? "compact" : ""}`} role="tablist" aria-label="거래 유형">
      {transactionOptions.map((option) => (
        <button
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? "active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = "주소, 연락처, 메모 검색", autoFocus = false }) {
  return (
    <label className="search-field">
      <Search size={16} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {value && (
        <button type="button" className="clear-input" aria-label="검색어 지우기" onClick={() => onChange("")}>
          <X size={14} />
        </button>
      )}
    </label>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  className = "",
  hideLabel = false,
}) {
  return (
    <label className={`select-field ${className}`}>
      {!hideLabel && <span>{label}</span>}
      <span className="select-control">
        <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </span>
    </label>
  );
}

export function LocationChain({ filters, updateFilter, condensed = false }) {
  return (
    <div className={`location-chain ${condensed ? "condensed" : ""}`} aria-label="주소 체인 필터">
      <SelectField
        label="단지"
        value={filters.site}
        onChange={(value) => updateFilter("site", value)}
        options={siteOptions}
        hideLabel
        className="site-select"
      />
      <label className="short-field">
        <span className="sr-only">동</span>
        <input
          value={filters.dong}
          onChange={(event) => updateFilter("dong", event.target.value)}
          placeholder="동"
        />
      </label>
      <ChevronRight className="chain-separator" size={13} aria-hidden="true" />
      <label className="short-field">
        <span className="sr-only">호</span>
        <input
          value={filters.unit}
          onChange={(event) => updateFilter("unit", event.target.value)}
          placeholder="호"
        />
      </label>
    </div>
  );
}

export function ViewSwitch({ value, onChange }) {
  return (
    <div className="view-switch" role="group" aria-label="보기 방식">
      <button
        type="button"
        className={value === "list" ? "active" : ""}
        aria-pressed={value === "list"}
        onClick={() => onChange("list")}
      >
        <List size={15} />
        목록
      </button>
      <button
        type="button"
        className={value === "map" ? "active" : ""}
        aria-pressed={value === "map"}
        onClick={() => onChange("map")}
      >
        <Map size={15} />
        지도
      </button>
    </div>
  );
}

export function ActiveFilterChips({
  activeFilters,
  clearFilter,
  resetFilters,
  emptyText = "추가 조건 없음",
  compact = false,
}) {
  if (activeFilters.length === 0) {
    return <span className="no-filter-label">{emptyText}</span>;
  }

  return (
    <div className={`active-filter-chips ${compact ? "compact" : ""}`} aria-label="적용된 필터">
      {activeFilters.map((filter) => (
        <button
          type="button"
          key={filter.key}
          className="active-filter-chip"
          onClick={() => clearFilter(filter.key)}
          aria-label={`${filter.label} ${filter.value} 필터 해제`}
        >
          <span>{filter.label}</span>
          <strong>{filter.value}</strong>
          <X size={12} />
        </button>
      ))}
      <button type="button" className="reset-inline" onClick={resetFilters}>
        전체 초기화
      </button>
    </div>
  );
}

export function AdvancedFilterFields({
  filters,
  updateFilter,
  layout = "grid",
  hideAvailability = false,
}) {
  return (
    <div className={`advanced-filter-fields ${layout}`}>
      <FilterSection title="위치와 종류" description="법정동과 건물 유형">
        <SelectField
          label="지역"
          value={filters.region}
          onChange={(value) => updateFilter("region", value)}
          options={regionOptions}
        />
        <SelectField
          label="건물 유형"
          value={filters.siteType}
          onChange={(value) => updateFilter("siteType", value)}
          options={siteTypeOptions}
        />
      </FilterSection>

      <FilterSection title="상태와 확인" description="현재 영업 가능 여부">
        {!hideAvailability && (
          <SelectField
            label="매물 상태"
            value={filters.availability}
            onChange={(value) => updateFilter("availability", value)}
            options={availabilityOptions}
          />
        )}
        <SelectField
          label="확인 상태"
          value={filters.confirmation}
          onChange={(value) => updateFilter("confirmation", value)}
          options={confirmationOptions}
        />
      </FilterSection>

      <FilterSection title="금액과 면적" description="만원·전용 평 기준">
        <SelectField
          label="가격/보증금"
          value={filters.price}
          onChange={(value) => updateFilter("price", value)}
          options={priceOptions}
        />
        <SelectField
          label="월세"
          value={filters.rent}
          onChange={(value) => updateFilter("rent", value)}
          options={rentOptions}
        />
        <SelectField
          label="전용면적"
          value={filters.area}
          onChange={(value) => updateFilter("area", value)}
          options={areaOptions}
        />
      </FilterSection>

      <FilterSection title="입주와 광고" description="후속 작업 기준">
        <SelectField
          label="입주 가능일"
          value={filters.moveIn}
          onChange={(value) => updateFilter("moveIn", value)}
          options={moveInOptions}
        />
        <SelectField
          label="광고"
          value={filters.advertisement}
          onChange={(value) => updateFilter("advertisement", value)}
          options={advertisementOptions}
        />
      </FilterSection>
    </div>
  );
}

export function FilterSection({ title, description, children, action }) {
  return (
    <section className="filter-section">
      <div className="filter-section-heading">
        <div>
          <h3>{title}</h3>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      <div className="filter-section-body">{children}</div>
    </section>
  );
}

export function FilterScrim({ children, onClose, className = "" }) {
  const surfaceRef = useRef(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    const firstFocusable = surface?.querySelector("button, input, select");
    firstFocusable?.focus();

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className={`filter-scrim ${className}`} onMouseDown={onClose}>
      <div
        ref={surfaceRef}
        className="filter-surface"
        role="dialog"
        aria-modal="true"
        aria-label="상세 필터"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function SurfaceHeader({ eyebrow, title, description, onClose }) {
  return (
    <header className="surface-header">
      <div>
        {eyebrow && <span>{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <button type="button" className="icon-button" onClick={onClose} aria-label="상세 필터 닫기">
        <X size={17} />
      </button>
    </header>
  );
}

export function ResultSummary({
  count,
  total,
  activeCount,
  description,
  onColumns,
  leading,
}) {
  return (
    <div className="result-summary">
      <div className="result-copy">
        {leading}
        <strong>
          {count.toLocaleString()}
          <span>건</span>
        </strong>
        <p>{description ?? (activeCount ? `${activeCount}개 조건 적용 중` : `전체 ${total}건`)}</p>
      </div>
      <button type="button" className="column-button" onClick={onColumns}>
        <Columns3 size={15} />
        컬럼
      </button>
    </div>
  );
}

function TransactionBadge({ value }) {
  const meta = transactionMeta[value];
  return <span className={`data-badge ${meta.className}`}>{meta.label}</span>;
}

function AvailabilityBadge({ value }) {
  const meta = availabilityMeta[value];
  return (
    <span className={`status-badge ${meta.className}`}>
      <span className="status-dot" />
      {meta.label}
    </span>
  );
}

export function ResultsSurface({
  rows,
  total,
  activeCount,
  view,
  onReset,
  onNotify,
  summaryDescription,
  summaryLeading,
}) {
  if (view === "map") {
    return (
      <section className="results-surface">
        <ResultSummary
          count={rows.length}
          total={total}
          activeCount={activeCount}
          description={summaryDescription}
          leading={summaryLeading}
          onColumns={() => onNotify("표시 컬럼 설정을 열었습니다.")}
        />
        <div className="map-view">
          <div className="map-canvas" aria-label="매물 지도 데모">
            <span className="river-band" />
            {rows.slice(0, 8).map((row, index) => (
              <button
                type="button"
                className="map-pin"
                key={row.id}
                style={{
                  "--pin-x": `${18 + ((index * 19) % 68)}%`,
                  "--pin-y": `${16 + ((index * 23) % 66)}%`,
                }}
                onClick={() => onNotify(`${row.site} ${row.dong}동 ${row.unit}호를 선택했습니다.`)}
              >
                {row.priceLabel}
              </button>
            ))}
          </div>
          <div className="map-list">
            <div className="map-list-heading">
              <strong>지도 안 매물</strong>
              <span>{rows.length}건</span>
            </div>
            {rows.slice(0, 7).map((row) => (
              <button
                type="button"
                key={row.id}
                className="map-list-item"
                onClick={() => onNotify(`${row.site} ${row.dong}동 ${row.unit}호를 열었습니다.`)}
              >
                <span>{row.site}</span>
                <strong>{row.priceLabel}</strong>
                <small>
                  {row.dong}동 {row.unit}호 · {row.area}평
                </small>
              </button>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="results-surface">
      <ResultSummary
        count={rows.length}
        total={total}
        activeCount={activeCount}
        description={summaryDescription}
        leading={summaryLeading}
        onColumns={() => onNotify("표시 컬럼 설정을 열었습니다.")}
      />
      <div className="table-scroll">
        <div className="property-table" role="table" aria-label="매물 검색 결과">
          <div className="property-table-header" role="row">
            <div role="columnheader" className="select-column">
              <input type="checkbox" aria-label="전체 매물 선택" />
            </div>
            <div role="columnheader">
              <Tag size={13} />
              거래
            </div>
            <div role="columnheader">단지</div>
            <div role="columnheader">동</div>
            <div role="columnheader">호</div>
            <div role="columnheader">상태</div>
            <div role="columnheader">가격/보증금</div>
            <div role="columnheader">월세</div>
            <div role="columnheader">전용</div>
            <div role="columnheader">
              <CalendarDays size={13} />
              입주
            </div>
            <div role="columnheader">
              <Megaphone size={13} />
              광고
            </div>
            <div role="columnheader">의뢰 메모</div>
            <div role="columnheader" aria-label="작업" />
          </div>

          {rows.map((row) => (
            <div className="property-table-row" role="row" key={row.id}>
              <div role="cell" className="select-column">
                <input
                  type="checkbox"
                  aria-label={`${row.site} ${row.dong}동 ${row.unit}호 선택`}
                />
              </div>
              <div role="cell">
                <TransactionBadge value={row.transaction} />
              </div>
              <div role="cell" className="site-name">
                <strong>{row.site}</strong>
                <span>{row.ward}</span>
              </div>
              <div role="cell" className="numeric-cell">{row.dong}</div>
              <div role="cell" className="numeric-cell">{row.unit}</div>
              <div role="cell">
                <AvailabilityBadge value={row.availability} />
              </div>
              <div role="cell" className="price-cell">{row.priceLabel}</div>
              <div role="cell" className="numeric-cell muted-value">
                {row.monthlyRent ? `${row.monthlyRent}만` : "–"}
              </div>
              <div role="cell" className="numeric-cell muted-value">{row.area}평</div>
              <div role="cell">
                <span className={`move-in-badge tone-${row.moveIn}`}>{row.moveInLabel}</span>
              </div>
              <div role="cell">
                <span className={`ad-state ${row.advertised ? "on" : "off"}`}>
                  {row.advertised ? "광고중" : "미등록"}
                </span>
              </div>
              <div role="cell" className="memo-cell">
                <span>{row.memo}</span>
              </div>
              <div role="cell" className="row-action-cell">
                <button
                  type="button"
                  className="icon-button small"
                  aria-label={`${row.site} 행 작업`}
                  onClick={() => onNotify(`${row.site} ${row.dong}동 ${row.unit}호 작업 메뉴를 열었습니다.`)}
                >
                  <EllipsisVertical size={15} />
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="empty-results">
              <Search size={21} />
              <strong>조건에 맞는 매물이 없습니다</strong>
              <p>검색어를 줄이거나 적용한 조건을 초기화해 보세요.</p>
              <button type="button" className="secondary-button" onClick={onReset}>
                <RotateCcw size={14} />
                필터 초기화
              </button>
            </div>
          )}
        </div>
      </div>
      <footer className="table-statusbar">
        의뢰 {rows.length}건 표시
        <span>· 결과는 조건 변경과 동시에 갱신됩니다</span>
      </footer>
    </section>
  );
}

export function PrimaryAction({ onClick }) {
  return (
    <button type="button" className="primary-action" onClick={onClick}>
      <Plus size={16} />
      새 매물 등록
    </button>
  );
}
