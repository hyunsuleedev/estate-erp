import { useMemo, useState } from "react";
import {
  BookmarkPlus,
  ChevronDown,
  Filter,
  FolderClock,
  Plus,
  Save,
  Sparkles,
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
import {
  describeFilters,
  getLensCount,
  savedLenses,
  usePropertyFilters,
} from "../filter-model.js";

/*
Intent:     매일 같은 영업 목록을 반복 조회하는 중개사가 조건 조합 대신 업무 목적에서 시작한다.
Hierarchy:  저장된 보기 이름과 결과 수가 첫 번째 선택, 검색과 세부 조건은 두 번째다.
Palette:    선택한 lens만 파랑을 쓰고 나머지는 문서 탭 같은 중성색으로 남긴다.
Depth:      탭형 lens rail과 오른쪽 sheet만 한 단계 들어 올린다.
Surfaces:   saved lens rail → query composer → 자연어 조건 요약 → 결과다.
Typography: lens 이름은 13px/600, 설명은 11px, 결과 수는 tabular 12px/700이다.
Spacing:    4px 기반이지만 lens 사이 6px, 구역 사이 16px로 목적 전환을 드러낸다.
*/

export function SavedLensesVariant() {
  const {
    activeFilters,
    clearFilter,
    filteredProperties,
    filters,
    replaceFilters,
    resetFilters,
    updateFilter,
  } = usePropertyFilters();
  const [selectedLens, setSelectedLens] = useState("all");
  const [view, setView] = useState("list");
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [notice, notify] = useNotice();

  const lensCounts = useMemo(
    () => Object.fromEntries(savedLenses.map((lens) => [lens.id, getLensCount(lens)])),
    [],
  );

  const updateCustomFilter = (key, value) => {
    setSelectedLens("custom");
    updateFilter(key, value);
  };

  const chooseLens = (lens) => {
    setSelectedLens(lens.id);
    replaceFilters(lens.filters);
  };

  const clearCustomFilter = (key) => {
    setSelectedLens("custom");
    clearFilter(key);
  };

  const resetToAll = () => {
    setSelectedLens("all");
    resetFilters();
  };

  return (
    <AppShell variantId="saved-lenses" notice={notice}>
      <div className="saved-lenses-layout">
        <section className="lens-rail" aria-label="저장된 매물 보기">
          <div className="lens-rail-label">
            <FolderClock size={15} />
            <span>업무 보기</span>
          </div>
          <div className="lens-list" role="tablist" aria-label="저장된 보기">
            {savedLenses.map((lens) => (
              <button
                type="button"
                role="tab"
                aria-selected={selectedLens === lens.id}
                className={selectedLens === lens.id ? "active" : ""}
                key={lens.id}
                onClick={() => chooseLens(lens)}
                title={lens.description}
              >
                <span>{lens.label}</span>
                <strong>{lensCounts[lens.id]}</strong>
              </button>
            ))}
            {selectedLens === "custom" && (
              <button type="button" role="tab" aria-selected="true" className="active custom">
                <Sparkles size={13} />
                <span>사용자 지정</span>
                <strong>{filteredProperties.length}</strong>
              </button>
            )}
          </div>
          <button
            type="button"
            className="add-lens-button"
            onClick={() => notify("현재 조건을 새 업무 보기로 저장할 수 있습니다.")}
          >
            <BookmarkPlus size={15} />
            보기 추가
          </button>
        </section>

        <section className="lens-query-bar" aria-label="매물 보기 세부 검색">
          <SegmentedTabs
            value={filters.transaction}
            onChange={(value) => updateCustomFilter("transaction", value)}
            compact
          />
          <LocationChain filters={filters} updateFilter={updateCustomFilter} condensed />
          <SearchField
            value={filters.search}
            onChange={(value) => updateCustomFilter("search", value)}
            placeholder="현재 보기 안에서 검색"
          />
          <button
            type="button"
            className={`lens-filter-button ${activeFilters.length ? "active" : ""}`}
            aria-expanded={isFilterSheetOpen}
            onClick={() => setIsFilterSheetOpen(true)}
          >
            <Filter size={15} />
            세부 조건
            {activeFilters.length > 0 && <span>{activeFilters.length}</span>}
            <ChevronDown size={14} />
          </button>
          <ViewSwitch value={view} onChange={setView} />
          <PrimaryAction onClick={() => notify("새 매물 등록 화면을 열었습니다.")} />
        </section>

        <section className="lens-explanation">
          <div className="lens-description">
            <span>현재 보기</span>
            <strong>
              {selectedLens === "custom"
                ? "사용자 지정"
                : savedLenses.find((lens) => lens.id === selectedLens)?.label}
            </strong>
            <p>{describeFilters(filters)}</p>
          </div>
          <ActiveFilterChips
            activeFilters={activeFilters}
            clearFilter={clearCustomFilter}
            resetFilters={resetToAll}
            compact
            emptyText="모든 조건"
          />
          {selectedLens === "custom" && (
            <button
              type="button"
              className="save-lens-button"
              onClick={() => notify("‘나의 매물 보기’로 저장했습니다.")}
            >
              <Save size={14} />
              보기 저장
            </button>
          )}
        </section>

        <ResultsSurface
          rows={filteredProperties}
          total={properties.length}
          activeCount={activeFilters.length}
          view={view}
          onReset={resetToAll}
          onNotify={notify}
          summaryDescription={
            selectedLens === "all"
              ? "전체 의뢰"
              : `${selectedLens === "custom" ? "사용자 지정" : "저장된 보기"} 결과`
          }
        />

        {isFilterSheetOpen && (
          <FilterScrim className="lens-filter-sheet" onClose={() => setIsFilterSheetOpen(false)}>
            <SurfaceHeader
              eyebrow="현재 보기 다듬기"
              title="세부 조건"
              description="조건을 바꾸면 저장된 보기에서 분기해 ‘사용자 지정’으로 표시됩니다."
              onClose={() => setIsFilterSheetOpen(false)}
            />
            <div className="sheet-filter-content">
              <AdvancedFilterFields filters={filters} updateFilter={updateCustomFilter} layout="stack" />
            </div>
            <footer className="surface-footer">
              <button type="button" className="text-button" onClick={resetToAll}>
                전체 보기로
              </button>
              <button type="button" className="primary-button" onClick={() => setIsFilterSheetOpen(false)}>
                {filteredProperties.length}건 보기
              </button>
            </footer>
          </FilterScrim>
        )}
      </div>
    </AppShell>
  );
}
