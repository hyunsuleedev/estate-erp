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
