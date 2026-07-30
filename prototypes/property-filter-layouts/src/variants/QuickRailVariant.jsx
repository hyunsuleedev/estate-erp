import { useState } from "react";
import {
  ChevronDown,
  CircleGauge,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  ActiveFilterChips,
  AdvancedFilterFields,
  AppShell,
  FilterScrim,
  LocationChain,
  PrimaryAction,
  ResultsSurface,
  SearchField,
  SegmentedTabs,
  SurfaceHeader,
  ViewSwitch,
  useNotice,
} from "../components.jsx";
import { properties } from "../data.js";
import { usePropertyFilters } from "../filter-model.js";

/*
Intent:     전화를 받으며 5초 안에 매물을 찾는 고빈도 사용자를 위한다.
Hierarchy:  검색·거래유형·주소 체인이 첫 줄을 이기고, 저빈도 조건은 한 버튼 뒤로 물러난다.
Palette:    기존 미색/흑연 팔레트에서 활성 조건에만 청사진 파랑을 쓴다.
Depth:      플랫한 툴바와 한 단계 뜨는 팝오버만 사용한다.
Surfaces:   64px command rail → 40px context rail → 결과 표다.
Typography: 검색과 결과 수는 600, 설명은 muted 12px로 분리한다.
Spacing:    4px 기반의 고밀도, 1200px에서도 주 도구가 한 덩어리로 남는다.
*/

export function QuickRailVariant() {
  const {
    activeFilters,
    clearFilter,
    filteredProperties,
    filters,
    resetFilters,
    setFilters,
    updateFilter,
  } = usePropertyFilters();
  const [view, setView] = useState("list");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [notice, notify] = useNotice();

  const advancedCount = activeFilters.filter(
    (item) => !["transaction", "search", "site", "dong", "unit"].includes(item.key),
  ).length;

  return (
    <AppShell variantId="quick-rail" notice={notice}>
      <div className="quick-rail-layout">
        <section className="quick-command-rail" aria-label="주요 매물 필터">
          <SegmentedTabs
            value={filters.transaction}
            onChange={(value) => updateFilter("transaction", value)}
            compact
          />
          <LocationChain filters={filters} updateFilter={updateFilter} condensed />
          <SearchField value={filters.search} onChange={(value) => updateFilter("search", value)} />
          <ViewSwitch value={view} onChange={setView} />
          <PrimaryAction onClick={() => notify("새 매물 등록 화면을 열었습니다.")} />
        </section>

        <section className="quick-context-rail" aria-label="추가 매물 필터">
          <div className="rail-result-count">
            <CircleGauge size={15} />
            <strong>{filteredProperties.length}</strong>
            <span>건</span>
          </div>

          <div className="quick-chip-viewport">
            <ActiveFilterChips
              activeFilters={activeFilters}
              clearFilter={clearFilter}
              resetFilters={resetFilters}
              compact
              emptyText="필요한 조건만 추가하세요"
            />
          </div>

          {activeFilters.length === 0 && (
            <div className="quick-suggestions" aria-label="빠른 조건">
              <span>
                <Sparkles size={13} />
                빠른 조건
              </span>
              <button
                type="button"
                onClick={() => setFilters((current) => ({ ...current, confirmation: "overdue" }))}
              >
                확인 필요
              </button>
              <button
                type="button"
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    availability: "available",
                    advertisement: "without",
                  }))
                }
              >
                광고 없는 가용
              </button>
            </div>
          )}

          <button
            type="button"
            className={`advanced-filter-trigger ${advancedCount ? "active" : ""}`}
            aria-expanded={isAdvancedOpen}
            onClick={() => setIsAdvancedOpen(true)}
          >
            <SlidersHorizontal size={15} />
            조건 추가
            {advancedCount > 0 && <span>{advancedCount}</span>}
            <ChevronDown size={14} />
          </button>
        </section>

        <ResultsSurface
          rows={filteredProperties}
          total={properties.length}
          activeCount={activeFilters.length}
          view={view}
          onReset={resetFilters}
          onNotify={notify}
        />

        {isAdvancedOpen && (
          <FilterScrim className="quick-filter-popover" onClose={() => setIsAdvancedOpen(false)}>
            <SurfaceHeader
              eyebrow="상세 조건"
              title="필요한 조건만 더하기"
              description="선택 즉시 결과에 반영되며, 적용된 조건은 위 레일에 남습니다."
              onClose={() => setIsAdvancedOpen(false)}
            />
            <AdvancedFilterFields filters={filters} updateFilter={updateFilter} />
            <footer className="surface-footer">
              <button type="button" className="text-button" onClick={resetFilters}>
                <X size={14} />
                전체 초기화
              </button>
              <button type="button" className="primary-button" onClick={() => setIsAdvancedOpen(false)}>
                {filteredProperties.length}건 보기
              </button>
            </footer>
          </FilterScrim>
        )}
      </div>
    </AppShell>
  );
}
