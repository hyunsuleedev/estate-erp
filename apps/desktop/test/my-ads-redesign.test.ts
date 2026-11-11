import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const desktopPath = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/properties/naver-my-ads.tsx",
);
const apiPath = resolve(
  testDir,
  "../../../packages/api-client/src/modules/listing-advertisements.ts",
);
const taskRunnerPath = resolve(
  testDir,
  "../../../.agents/skills/estate-erp-ad-task-runner/SKILL.md",
);

describe("my ads Task-based workflow", () => {
  it("keeps the restored dense table page", () => {
    const desktop = readFileSync(desktopPath, "utf8");

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
    const source = readFileSync(desktopPath, "utf8");
    const columns = source.slice(
      source.indexOf("function buildColumns"),
      source.indexOf("function TableHeaderLabel"),
    );
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

    assert.match(source, /rowHeight=\{40\}/);
    assert.match(source, /pinnedColumns=\{\["site", "dong", "floor", "ho"\]\}/);
    assert.match(source, /anchorColumnId: "monthlyRent"/);
    assert.match(source, /label: "광고 정보"/);
    assert.match(columns, /id: "price"[\s\S]*InlinePriceCell/);
    assert.match(columns, /id: "monthlyRent"[\s\S]*InlineMonthlyRentCell/);
    assert.match(columns, /id: "verification"[\s\S]*VerificationMethodCell/);
    assert.match(columns, /id: "floorExposure"[\s\S]*FloorExposureCell/);
  });

  it("keeps the old filters, inline drafts, and comparison detail panel", () => {
    const source = readFileSync(desktopPath, "utf8");

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
    const source = readFileSync(desktopPath, "utf8");

    assert.match(source, /className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white"/);
    for (const part of [
      "ToolbarPillTabs",
      "ToolbarSearchBar",
      "ToolbarSelectChip",
      "NumericRangeFilterPanel",
      "AddFilterMenu",
    ]) {
      assert.match(source, new RegExp(`<${part}`));
    }
    // 좁은 창에서 필터가 잘리지 않게 자주 쓰는 것만 줄에 두고 나머지는 "+ 필터"로 옮긴다
    for (const key of ["verification", "floorExposure", "exposurePeriod"]) {
      assert.match(source, new RegExp(`"${key}",\\s*"[^"]+",\\s*<`));
    }
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
    const source = readFileSync(desktopPath, "utf8");

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
    const source = readFileSync(desktopPath, "utf8");
    const apiSource = readFileSync(apiPath, "utf8");

    assert.doesNotMatch(
      source,
      /agentAction|AgentAction|fullSync|requestFullSync/,
    );
    assert.doesNotMatch(apiSource, /full-sync|FullSync|MyAdvertisementsSync/);
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
