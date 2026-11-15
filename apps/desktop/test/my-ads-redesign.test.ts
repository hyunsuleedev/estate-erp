import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopPath = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/properties/naver-my-ads.tsx",
);
const myAdsModuleDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/properties/-my-ads",
);
const columnsPath = resolve(myAdsModuleDir, "my-ads-columns.tsx");
const apiPath = resolve(
  testDir,
  "../../../packages/api-client/src/modules/listing-advertisements.ts",
);
const taskRunnerPath = resolve(
  testDir,
  "../../../.agents/skills/estate-erp-ad-task-runner/SKILL.md",
);

// 내광고관리 화면은 라우트 파일과 -my-ads/ 모듈로 나뉘어 있다. 화면 전체를 한 소스로 보고 검사한다.
function readMyAdsSource(): string {
  const moduleFiles = readdirSync(myAdsModuleDir)
    .filter((name) => /\.tsx?$/.test(name))
    .sort()
    .map((name) => resolve(myAdsModuleDir, name));
  return [desktopPath, ...moduleFiles]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

describe("my ads Task-based workflow", () => {
  it("keeps the restored dense table page", () => {
    const desktop = readMyAdsSource();

    assert.match(
      desktop,
      /data-canonical-advertisement-source="listing-advertisements"/,
    );
    assert.match(desktop, /data-my-ads-results-toolbar/);
    assert.match(desktop, /data-my-ads-filter-rail/);
    assert.match(desktop, /data-my-ads-table-style="property-list"/);
    assert.match(desktop, /api\.listingAdvertisements\.findAll\(/);
    assert.doesNotMatch(desktop, /<h1[\s\S]*내 광고 관리/);
    assert.doesNotMatch(desktop, /업무 보기|목록 새로고침/);
    assert.doesNotMatch(desktop, /automation-runs|자동화흐름|수집단지/);
  });

  it("restores the original property-list hierarchy and advertisement columns", () => {
    const source = readMyAdsSource();
    const columnsSource = readFileSync(columnsPath, "utf8");
    const buildColumnsStart = columnsSource.indexOf("function buildColumns");
    assert.ok(buildColumnsStart >= 0, "buildColumns should live in my-ads-columns.tsx");
    const columns = columnsSource.slice(buildColumnsStart);
    const orderedColumnIds = [
      "site",
      "dong",
      "floor",
      "ho",
      "type",
      "transaction",
      "price",
      "monthlyRent",
      "channel",
      "naver",
      "verification",
      "exposurePeriod",
      "ranking",
      "floorExposure",
      "checkedAt",
      "analysis",
    ];

    let previousIndex = -1;
    for (const columnId of orderedColumnIds) {
      const columnIndex = columns.indexOf(`id: "${columnId}"`);
      assert.ok(
        columnIndex > previousIndex,
        `${columnId} column should be in the original order`,
      );
      previousIndex = columnIndex;
    }

    // 매물관리 메인 표와 같은 밀도: 37px 행 + 매물관리 머리·본문 규격
    assert.match(source, /propertyListTone\s+rowHeight=\{37\}/);
    assert.match(source, /pinnedColumns=\{\["site", "dong", "floor", "ho"\]\}/);
    assert.match(source, /anchorColumnId: "monthlyRent"/);
    assert.match(source, /label: "광고 정보"/);
    assert.match(columns, /id: "price"[\s\S]*InlinePriceCell/);
    assert.match(columns, /id: "monthlyRent"[\s\S]*InlineMonthlyRentCell/);
    assert.match(columns, /id: "verification"[\s\S]*VerificationMethodCell/);
    assert.match(columns, /id: "floorExposure"[\s\S]*FloorExposureCell/);
  });

  it("keeps the old filters, inline drafts, and comparison detail panel", () => {
    const source = readMyAdsSource();

    for (const label of ["전체", "비교 대기", "검토 필요"]) {
      assert.match(source, new RegExp(`label: "${label}"`));
    }
    for (const label of [
      "거래 전체",
      "CP사 전체",
      "검증방식 전체",
      "층수노출 전체",
      "노출기간 전체",
      "경쟁 대비 전체",
    ]) {
      assert.match(source, new RegExp(label));
    }
    assert.match(source, /enableRowSelection/);
    assert.match(
      source,
      /변경 초안 \$\{dirtyAdvertisements\.length\}건 · 업무 등록 전/,
    );
    assert.match(source, /function InlineDraftResetButton/);
    assert.match(source, /renderExpandedRow=\{\(advertisement\) =>/);
    assert.match(source, /<AdvertisementAnalysisPanel/);
    assert.match(source, /가격 수정안 작성/);
  });

  it("uses the property page's two-row toolbar and filter chips", () => {
    const source = readMyAdsSource();

    assert.match(source, /className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"/);
    const toolbar = readFileSync(resolve(myAdsModuleDir, "my-ads-toolbar.tsx"), "utf8");
    for (const part of [
      "ToolbarPillTabs",
      "ToolbarSearchBar",
      "ToolbarFilterChip",
      "ToolbarSelectPanel",
      "NumericRangeFilterPanel",
    ]) {
      assert.match(toolbar, new RegExp(`<${part}`));
    }
    // 매물관리 필터 줄처럼 모든 필터가 아이콘 달린 soft 칩으로 줄에 늘 보인다.
    // "+ 필터" 메뉴 뒤에 숨기거나 테두리 있는 옛 칩(ToolbarSelectChip)을 쓰지 않는다.
    assert.doesNotMatch(source, /<AddFilterMenu|<ToolbarSelectChip/);
    const chipCount = toolbar.match(/<ToolbarFilterChip\b/g)?.length ?? 0;
    const softIconChipCount =
      toolbar.match(
        /<ToolbarFilterChip\s+label=(?:"[^"]+"|\{label\})\s+shape="soft"\s+icon=\{/g,
      )?.length ?? 0;
    assert.ok(chipCount >= 3, "price, monthly rent and the select chip wrapper");
    assert.equal(softIconChipCount, chipCount);
    // 하나만 고르는 필터 여섯 개가 각자 옵션·값·갱신 필드에 맞게 연결된다
    for (const [label, options, field] of [
      ["거래", "transactionFilterOptions", "transactionType"],
      ["CP사", "channelFilterOptions", "channel"],
      ["경쟁 대비", "comparisonFilterOptions", "comparison"],
      ["검증방식", "verificationFilterOptions", "verification"],
      ["층수노출", "floorExposureFilterOptions", "floorExposure"],
      ["노출기간", "exposurePeriodFilterOptions", "exposurePeriod"],
    ]) {
      assert.match(
        toolbar,
        new RegExp(
          `<MyAdsSelectFilterChip\\s+label="${label}"\\s+icon=\\{<\\w+ />\\}\\s+options=\\{${options}\\}\\s+value=\\{filters\\.${field}\\}\\s+onChange=\\{\\(value\\) => updateMyAdsFilter\\("${field}", value\\)\\}`,
        ),
        `${label} filter chip`,
      );
    }
    // 월세 칩은 매물관리와 같은 규칙(판정은 my-ads-filters.test.ts)으로 가격/보증금 바로 옆에 온다
    assert.match(
      toolbar,
      /label="가격\/보증금"[\s\S]*?<\/ToolbarFilterChip>\s*\{\/\*[\s\S]*?\*\/\}\s*\{shouldShowMonthlyRentFilter\(filters\) && \(\s*<ToolbarFilterChip\s+label="월세"/,
    );
    // 필터 줄은 기본 펼침이고, 접힌 채 조건이 걸려 있으면 필터 아이콘이 파랗다
    assert.match(toolbar, /const \[isFilterRowOpen, setIsFilterRowOpen\] = useState\(true\)/);
    assert.match(toolbar, /!isFilterRowOpen && hasActiveFilters\s*\?\s*"text-\[#2383e2\]"/);
    // 1행 오른쪽 끝(매물관리 등록 버튼 자리)에 페이지가 trailingActions로 버튼을 꽂는다
    assert.match(toolbar, /trailingActions\?: ReactNode;/);
    assert.match(
      toolbar,
      /<div className="ml-auto flex shrink-0 items-center gap-2">\s*\{!isFilterRowOpen && filterRowActions\}\s*\{trailingActions\}\s*<\/div>/,
    );
    assert.doesNotMatch(toolbar, /행에는 마지막으로 확인된/);
    assert.doesNotMatch(source, /MyAdsFilterSelect|MyAdsFilterTextInput|MyAdsAmountRangeFilter/);
    assert.doesNotMatch(source, /min-w-max items-center gap-1\.5/);
    // 눈금 사이 값(보증금 3,000만, 월세 55만)도 만원 단위로 직접 넣을 수 있어야 한다
    assert.match(source, /unit: "만원",\s*scale: 10000,\s*initialMin: filters\.primaryAmountMin/);
    assert.match(source, /unit: "만원",\s*scale: 1,\s*initialMin: filters\.monthlyRentMin/);
    assert.match(source, /updateMyAdsRangeFilter\("primary", minValue, maxValue\)/);
    assert.match(source, /updateMyAdsRangeFilter\("monthlyRent", minValue, maxValue\)/);
    const panel = readFileSync(
      fileURLToPath(
        new URL(
          "../src/renderer/routes/_authenticated/properties/-components/numeric-range-filter.tsx",
          import.meta.url,
        ),
      ),
      "utf8",
    );
    assert.match(panel, /disabled=\{hasInvalidExactRange\}/);
    // 슬라이더는 움직인 쪽 입력칸만 바꾼다. 반대쪽에 직접 넣은 금액 제한을 지우면 안 된다
    assert.match(
      panel,
      /if \(nextRange\[0\] !== draftRange\[0\]\) setExactMin\(toExactMin\(nextRange\[0\]\)\);\s*if \(nextRange\[1\] !== draftRange\[1\]\) setExactMax\(toExactMax\(nextRange\[1\]\)\);/,
    );
    assert.match(panel, /최대값은 최소값보다 크거나 같아야 합니다\./);
    assert.match(panel, /exactInput\.onApply\(exactMin\.trim\(\), exactMax\.trim\(\)\)/);
  });

  it("creates an ordinary advertisement Task with stable advertisement identifiers", () => {
    const source = readMyAdsSource();

    assert.match(source, /api\.tasks\.create\(/);
    assert.match(source, /category: "advertisement"/);
    assert.match(source, /status: "pending"/);
    assert.match(source, /listingAdvertisementId=/);
    assert.match(source, /externalAdId=/);
    assert.match(source, /naverArticleNo=/);
    assert.match(source, /재광고=\$\{draft\.republishAfterSave/);
    assert.match(source, /선택한 광고는 하나의 일반 업무로 등록됩니다/);
    assert.match(source, /광고 작업을 업무에 등록했습니다/);
  });

  it("does not expose a server sync or AgentAction API", () => {
    const source = readMyAdsSource();
    const apiSource = readFileSync(apiPath, "utf8");

    assert.doesNotMatch(
      source,
      /agentAction|AgentAction|fullSync|requestFullSync/,
    );
    assert.doesNotMatch(apiSource, /full-sync|FullSync|MyAdvertisementsSync/);
  });

  it("loads every page, scrolls one list, and keeps table state across filter changes", () => {
    const page = readFileSync(desktopPath, "utf8");

    // 100건 한 번이 아니라 전체 건수까지 이어 받고, 30건 페이지 버튼은 없다
    assert.match(page, /loadAllAdvertisementPages\(\(page\) =>\s*api\.listingAdvertisements\.findAll\(/);
    assert.doesNotMatch(page, /page: 1,/);
    assert.doesNotMatch(page, /PAGE_SIZE|이전 페이지|다음 페이지|currentPage/);
    assert.match(page, /표시 \{sortedAdvertisements\.length\.toLocaleString\(\)\} \/ 전체/);
    assert.match(page, /data\.truncated/);
    // 표를 key로 다시 만들지 않는다 — 열 너비가 초기화되지 않고 스크롤만 맨 위로
    assert.doesNotMatch(page, /key=\{myAdsTableFilterScopeKey/);
    assert.match(page, /scrollResetKey=\{myAdsTableFilterScopeKey\(/);
    assert.match(page, /columnSizing=\{preferences\.widths\}/);
    assert.match(page, /onColumnSizingChange=\{handleColumnSizingChange\}/);
    assert.match(page, /useMyAdsTablePreferences\(\s*user\?\.office\?\.id \?\? "local",\s*user\?\.id \?\? "guest",?\s*\)/);
    // 업무 등록 뒤 표 안의 선택도 함께 비워지도록 선택을 제어형으로 넘긴다
    assert.match(page, /selectedRowIds=\{selectedRowIds\}/);
    // 검색어는 잠시 기다렸다가 보내고, 새로 받는 동안 이전 결과를 유지한다
    assert.match(page, /useDebouncedValue\(search\.trim\(\), SEARCH_DEBOUNCE_MS\)/);
    assert.match(page, /placeholderData: keepPreviousData/);
    // 필터·검색·탭 중 하나라도 걸려 있으면 "조건에 맞는 광고가 없습니다."
    assert.match(page, /hasNarrowingConditions\s*\?\s*"조건에 맞는 광고가 없습니다\."/);
    // 빈 <> 래퍼 없이 툴바가 바로 온다
    assert.match(page, /className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"\s*>\s*<MyAdsToolbar/);
  });

  it("keeps inline inputs, row names, expansion and floor exposure accessible", () => {
    const page = readFileSync(desktopPath, "utf8");
    const cells = readFileSync(resolve(myAdsModuleDir, "my-ads-cells.tsx"), "utf8");
    const columns = readFileSync(columnsPath, "utf8");

    // 입력칸 안의 키는 입력칸이 처리한다 (표의 화살표 이동·Esc 선택 해제로 올라가지 않음)
    assert.match(cells, /onKeyDown=\{stopTableHandling\}/);
    assert.match(cells, /if \(transactionType === "jeonse"\) return "전세가";/);
    const monthlyRentCell = cells.slice(
      cells.indexOf("export function InlineMonthlyRentCell"),
      cells.indexOf("function InlineDraftResetButton"),
    );
    assert.equal(monthlyRentCell.match(/inlineEditBase\(advertisement\)/g)?.length, 1);
    // 층수노출은 읽기 정보 — 비활성 스위치가 아니다
    assert.doesNotMatch(cells, /<Switch|components\/ui\/switch/);
    // 행 체크박스는 위치로 읽히고, 펼침 버튼은 펼친 패널을 가리킨다
    assert.match(page, /getRowSelectionLabel=\{\(advertisement\) =>\s*`\$\{advertisementLocationLabel\(advertisement\)\} 선택`/);
    assert.match(columns, /aria-expanded=\{expanded\}\s*aria-controls=\{\s*expanded \? myAdsAnalysisPanelId\(advertisement\.id\) : undefined\s*\}/);
    assert.match(page, /<div id=\{myAdsAnalysisPanelId\(advertisement\.id\)\}>/);
    // 머리글 아이콘 16px #8e8b86, 13px 라벨
    assert.match(cells, /\[&>svg\]:size-4 \[&>svg\]:text-\[#8e8b86\]/);
    assert.match(cells, /text-\[13px\] font-normal leading-\[21px\] text-inherit/);
  });

  it("keeps the manual-ad form scrollable, app-validated and the filter chips keyboard-selectable", () => {
    const dialog = readFileSync(resolve(myAdsModuleDir, "my-ads-manual-ad-dialog.tsx"), "utf8");
    const toolbar = readFileSync(resolve(myAdsModuleDir, "my-ads-toolbar.tsx"), "utf8");
    const sharedToolbar = readFileSync(
      resolve(testDir, "../src/renderer/routes/_authenticated/properties/-components/property-toolbar.tsx"),
      "utf8",
    );
    // Chromium은 flex로 크기가 정해진 fieldset을 스크롤하지 않는다 — 스크롤 상자는 div, fieldset은 그 안
    assert.match(
      dialog,
      /<div\s+data-manual-ad-form-scroll\s+className="min-h-0 flex-1[^"]*overflow-y-auto[^"]*"[\s\S]*?>\s*<fieldset/,
    );
    assert.doesNotMatch(dialog, /<fieldset[^>]*overflow-y-auto/);
    // 브라우저 말풍선 대신 앱 검증 문구
    assert.match(dialog, /<form\s+(?:\/\/[^\n]*\n\s*)*noValidate/);
    // 1단계 결과 영역은 높이를 고정해 입력 중 다이얼로그가 다시 가운데로 맞춰지지 않는다
    assert.match(dialog, /data-manual-ad-results\s+className="flex h-\[320px\]/);
    // 하나만 고르는 필터 패널은 열리면 목록에 포커스를 둔다(↑↓·Enter·Space)
    assert.match(sharedToolbar, /searchable=\{false\}\s+autoFocusList\s+\/>/);
    assert.match(toolbar, /<ToolbarSelectPanel/);
  });

  it("delegates detailed execution state to the local Task runner Skill", () => {
    const skill = readFileSync(taskRunnerPath, "utf8");

    assert.match(skill, /claim_task/);
    assert.match(skill, /local SQLite/i);
    assert.match(skill, /one active local run per Task/i);
    assert.match(skill, /status="completed"/);
    assert.match(skill, /provider persistence is re-read and verified/i);
  });
});
