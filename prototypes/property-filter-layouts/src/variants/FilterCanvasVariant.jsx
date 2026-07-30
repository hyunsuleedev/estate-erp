import { useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  RotateCcw,
} from "lucide-react";
import {
  ActiveFilterChips,
  AdvancedFilterFields,
  AppShell,
  FilterSection,
  LocationChain,
  PrimaryAction,
  ResultsSurface,
  SearchField,
  SegmentedTabs,
  ViewSwitch,
  useNotice,
} from "../components.jsx";
import { availabilityOptions, properties } from "../data.js";
import { usePropertyFilters } from "../filter-model.js";

/*
Intent:     여러 조건을 번갈아 조정하는 중개사가 기억 부담 없이 전체 조건을 훑는다.
Hierarchy:  왼쪽 필터 캔버스가 조작 영역, 오른쪽 결과 표가 판단 영역으로 나뉜다.
Palette:    활성 선택만 파랑, 상태는 의미색, 나머지는 따뜻한 중성색으로 제한한다.
Depth:      분할선과 inset 입력만 쓰며 카드 남발을 피한다.
Surfaces:   앱 캔버스 안에 288px filter dock과 결과 영역을 동등한 작업면으로 둔다.
Typography: 섹션 라벨은 11px/600, 현재 선택과 결과 값은 13–20px/600이다.
Spacing:    dock 내부 16px, 필드 8px, 섹션 사이 22px의 대비 리듬이다.
*/

export function FilterCanvasVariant() {
  const {
    activeFilters,
    clearFilter,
    filteredProperties,
    filters,
    resetFilters,
    updateFilter,
  } = usePropertyFilters();
  const [view, setView] = useState("list");
  const [isDockOpen, setIsDockOpen] = useState(true);
  const [notice, notify] = useNotice();

  return (
    <AppShell variantId="filter-canvas" notice={notice}>
      <div className={`filter-canvas-layout ${isDockOpen ? "dock-open" : "dock-closed"}`}>
        <aside
          className="filter-dock"
          aria-label="매물 상세 필터"
          aria-hidden={!isDockOpen}
          inert={isDockOpen ? undefined : true}
        >
          <header className="filter-dock-header">
            <div>
              <span>FILTER CANVAS</span>
              <h2>매물 조건</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="필터 패널 접기"
              onClick={() => setIsDockOpen(false)}
            >
              <ChevronLeft size={17} />
            </button>
          </header>

          <div className="filter-dock-scroll">
            <FilterSection
              title="거래 유형"
              description="거래 조건을 먼저 선택"
            >
              <SegmentedTabs
                value={filters.transaction}
                onChange={(value) => updateFilter("transaction", value)}
                compact
              />
            </FilterSection>

            <FilterSection title="매물 위치" description="단지 → 동 → 호">
              <LocationChain filters={filters} updateFilter={updateFilter} />
              <label className="dock-search">
                <MapPin size={14} />
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter("search", event.target.value)}
                  placeholder="주소나 법정동 검색"
                />
              </label>
            </FilterSection>

            <FilterSection title="영업 상태" description="클릭 한 번으로 전환">
              <div className="availability-grid" role="group" aria-label="매물 상태">
                {availabilityOptions.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    className={filters.availability === option.value ? "active" : ""}
                    aria-pressed={filters.availability === option.value}
                    onClick={() => updateFilter("availability", option.value)}
                  >
                    {filters.availability === option.value && <Check size={12} />}
                    {option.label}
                  </button>
                ))}
              </div>
            </FilterSection>

            <AdvancedFilterFields
              filters={filters}
              updateFilter={updateFilter}
              layout="stack"
              hideAvailability
            />
          </div>

          <footer className="filter-dock-footer">
            <button type="button" className="secondary-button full" onClick={resetFilters}>
              <RotateCcw size={14} />
              전체 조건 초기화
            </button>
            <div>
              <strong>{filteredProperties.length}</strong>
              <span>건 표시 중</span>
            </div>
          </footer>
        </aside>

        <div className="canvas-results">
          <section className="canvas-toolbar">
            {!isDockOpen && (
              <button
                type="button"
                className="dock-open-button"
                aria-label="필터 패널 열기"
                onClick={() => setIsDockOpen(true)}
              >
                <Filter size={15} />
                필터
                {activeFilters.length > 0 && <span>{activeFilters.length}</span>}
                <ChevronRight size={14} />
              </button>
            )}
            <SearchField
              value={filters.search}
              onChange={(value) => updateFilter("search", value)}
              placeholder="단지, 동·호, 연락처, 메모 통합검색"
            />
            <ViewSwitch value={view} onChange={setView} />
            <PrimaryAction onClick={() => notify("새 매물 등록 화면을 열었습니다.")} />
          </section>

          <section className="canvas-active-strip">
            <ActiveFilterChips
              activeFilters={activeFilters}
              clearFilter={clearFilter}
              resetFilters={resetFilters}
              compact
              emptyText="왼쪽에서 조건을 선택하면 여기에 요약됩니다"
            />
          </section>

          <ResultsSurface
            rows={filteredProperties}
            total={properties.length}
            activeCount={activeFilters.length}
            view={view}
            onReset={resetFilters}
            onNotify={notify}
            summaryDescription={isDockOpen ? "필터를 보며 결과를 즉시 비교" : undefined}
          />
        </div>
      </div>
    </AppShell>
  );
}
