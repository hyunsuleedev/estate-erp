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
const webPath = resolve(
  testDir,
  "../../web/src/routes/_authenticated/properties/naver-my-ads.tsx",
);
const aiRequestsPath = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/ai-requests/index.tsx",
);
const servicePath = resolve(
  testDir,
  "../../server/src/modules/listing-advertisements/listing-advertisements.service.ts",
);
const mainPath = resolve(testDir, "../src/main.ts");
const preloadPath = resolve(testDir, "../src/preload.ts");
const localMcpPath = resolve(testDir, "../src/main/localCpMcpServer.ts");

function workflowSource(path: string): string {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("<section\n        data-my-ads-workflow");
  const end = source.indexOf("</section>", start);
  return source.slice(start, end);
}

function analysisSignalSource(path: string): string {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("type AnalysisSignal =");
  const end = source.indexOf("function competitorRowPresentation", start);
  return source.slice(start, end);
}

function inlineDraftSource(path: string): string {
  const source = readFileSync(path, "utf8");
  const start = source.indexOf("function InlinePriceCell");
  const end = source.indexOf("function inlineEditBase", start);
  return source.slice(start, end);
}

function myAdsFilterSource(path: string): string {
  const source = readFileSync(path, "utf8");
  const stateStart = source.indexOf("type MyAdsTransactionFilter");
  const stateEnd = source.indexOf("const ACTION_EVIDENCE_TTL_MS", stateStart);
  const toolbarStart = source.indexOf(
    "<section\n            data-my-ads-results-toolbar",
  );
  const toolbarEnd = source.indexOf(
    "<section\n            data-my-ads-results",
    toolbarStart + 1,
  );
  const matchingStart = source.indexOf("function myAdsTableFilterScopeKey");
  const matchingEnd = source.indexOf(
    "function advertisementMatchesView",
    matchingStart,
  );
  return [
    source.slice(stateStart, stateEnd),
    source.slice(toolbarStart, toolbarEnd),
    source.slice(matchingStart, matchingEnd),
  ].join("\n");
}

describe("my ads canonical CP redesign", () => {
  it("keeps the desktop and web workflow run ledgers identical", () => {
    assert.equal(workflowSource(desktopPath), workflowSource(webPath));
  });

  it("uses ListingAdvertisement as the only page source", () => {
    const source = readFileSync(desktopPath, "utf8");

    assert.match(source, /api\.listingAdvertisements\.findAll\(/);
    assert.match(
      source,
      /data-canonical-advertisement-source="listing-advertisements"/,
    );
    assert.doesNotMatch(source, /officeAdvertisements\.findAllGroups/);
    assert.doesNotMatch(source, /LinkAdGroupDialog/);
    assert.doesNotMatch(source, /linkGroupToListingAdvertisement/);
    assert.doesNotMatch(source, /needs_unit_confirmation|["']ignored["']/);
    assert.doesNotMatch(source, /연결 확인|연결 완료/);
  });

  it("presents the full closed-loop CP and Naver workflow", () => {
    const source = readFileSync(desktopPath, "utf8");
    const workflowStart = source.indexOf("data-my-ads-workflow");
    const workflowEnd = source.indexOf("</section>", workflowStart);
    const workflow = source.slice(workflowStart, workflowEnd);
    const steps = [
      "CP 전체 가져오기",
      "매물·호실 확정",
      "전체 네이버 비교",
      "수정안 검토·승인",
      "CP 수정·재광고",
    ];

    let previousIndex = -1;
    for (const step of steps) {
      const stepIndex = workflow.indexOf(step);
      assert.ok(
        stepIndex > previousIndex,
        `${step} should be in workflow order`,
      );
      previousIndex = stepIndex;
    }

    assert.match(source, /가져온 광고 전부/);
    assert.match(source, /전체 광고 동기화/);
    assert.match(source, /동기화 실패는 상단에 표시/);
    assert.doesNotMatch(source, /publicationPlatform/);
  });

  it("always compares every advertisement imported from every CP", () => {
    const source = readFileSync(desktopPath, "utf8");
    const service = readFileSync(servicePath, "utf8");

    assert.match(source, /api\.listingAdvertisements\.requestFullSync\(/);
    assert.match(service, /scope: "all_cp_advertisements"/);
    assert.match(service, /compareEveryImportedAdvertisement: true/);
    assert.match(service, /scope: "every_imported_advertisement"/);
    assert.match(service, /ListingAdvertisementChannel\.ESILJANG/);
    assert.match(service, /ListingAdvertisementChannel\.BUDONGSANBANK/);
  });

  it("keeps CP passwords in the local OS vault and binds reader wakeups to this device", () => {
    const source = readFileSync(desktopPath, "utf8");
    const service = readFileSync(servicePath, "utf8");
    const main = readFileSync(mainPath, "utf8");
    const preload = readFileSync(preloadPath, "utf8");
    const localMcp = readFileSync(localMcpPath, "utf8");

    assert.match(source, /CP 자동 로그인 계정/);
    assert.match(source, /bridge\.save\(/);
    assert.match(source, /bridge\.prepareSession\(/);
    assert.match(source, /executionTarget: "local"/);
    assert.match(source, /runnerDeviceId: vaultStatus\.deviceId/);
    assert.match(main, /safeStorage\.encryptString/);
    assert.match(main, /app\.getPath\('userData'\)/);
    assert.match(preload, /cp-auth:save/);
    assert.doesNotMatch(preload, /cp-auth:get-credentials/);
    assert.match(localMcp, /name: 'cp_auth_prepare_session'/);
    assert.doesNotMatch(localMcp, /cp_auth_get_credentials/);
    assert.doesNotMatch(localMcp, /credentials\.password/);
    assert.match(service, /credentialSource: "electron_safe_storage"/);
    assert.match(
      service,
      /adapter: localRunnerDeviceId \? "local_mcp" : "mcp"/,
    );
    assert.match(service, /runnerDeviceId: localRunnerDeviceId/);
  });

  it("renders a Paperclip-style run ledger with persisted timing and retry", () => {
    const source = readFileSync(desktopPath, "utf8");

    assert.match(source, /syncStatusQuery\.data\?\.run\?\.status/);
    assert.match(source, /status\?\.run\?\.steps/);
    assert.match(source, /data-workflow-style="run-ledger"/);
    assert.match(source, /광고 자동화 실행/);
    assert.match(source, /Run \{workflowRun\.id\.slice\(0, 8\)\}/);
    assert.match(source, />\s*Live\s*</);
    assert.match(source, /aria-label="작업 흐름 단계"/);
    assert.match(source, /data-workflow-state=\{state\}/);
    assert.match(source, /data-workflow-owner=\{owner\}/);
    assert.match(source, /data-workflow-current=\{current \? "true"/);
    assert.match(source, /aria-current=\{current \? "step" : undefined\}/);
    assert.match(source, /getWorkflowTimingPresentation/);
    assert.match(source, /formatWorkflowDuration/);
    assert.match(source, /startedAt=\{syncWorkflow\.cp\.startedAt\}/);
    assert.match(source, /finishedAt=\{syncWorkflow\.cp\.finishedAt\}/);
    assert.match(source, /label: "Agent 실행"/);
    assert.match(source, /kind === "approval" \? "직원 승인" : "직원 확인"/);
    assert.match(source, /pendingReviewCount > 0[\s\S]*"needs_input"/);
    assert.match(source, /executionNeedsInputCount > 0[\s\S]*"human"/);
    assert.match(source, /if \(state === "needs_input"\) return "승인 대기"/);
    assert.match(source, /if \(state === "running"\) return "적용 중"/);
    assert.match(
      source,
      /api\.listingAdvertisements\.retryFullSyncStep\(stepId\)/,
    );
    assert.match(source, /이실장[\s\S]*부동산뱅크/);
  });

  it("shows only the workflow until CP import, unit resolution, and Naver comparison succeed", () => {
    const source = readFileSync(desktopPath, "utf8");

    assert.match(
      source,
      /syncWorkflow\.cp\.state === "succeeded" &&[\s\S]*syncWorkflow\.resolve\.state === "succeeded" &&[\s\S]*syncWorkflow\.compare\.state === "succeeded"/,
    );
    assert.match(source, /data-advertisement-results-ready=/);
    assert.match(
      source,
      /\{advertisementResultsReady && \([\s\S]*data-my-ads-results-toolbar[\s\S]*data-my-ads-results/,
    );
    assert.match(
      source,
      /\{advertisementResultsReady && \([\s\S]*aria-label="목록 새로고침"/,
    );
  });

  it("collapses the completed run and routes advertisement decisions to the separate AI approval screen", () => {
    const source = readFileSync(desktopPath, "utf8");
    const aiRequests = readFileSync(aiRequestsPath, "utf8");

    assert.match(
      source,
      /const showWorkflowDetails =\s*!advertisementResultsReady \|\| workflowDetailsOpen/,
    );
    assert.match(source, /\{showWorkflowDetails && \(\s*<ol/);
    assert.match(source, /aria-controls="my-ads-workflow-steps"/);
    assert.match(source, /data-workflow-review-link/);
    assert.match(
      source,
      /<WorkflowReviewLink[\s\S]*requestId=\{pendingReviewRequest\.id\}/,
    );
    assert.match(source, /search=\{\{ requestId, origin: "my-ads" \}\}/);
    assert.match(source, /수정안 \{count\}건 검토/);

    assert.match(aiRequests, /origin\?: "my-ads"/);
    assert.match(aiRequests, /data-advertisement-approval-screen=/);
    assert.match(aiRequests, /광고 수정안 검토/);
    assert.match(
      aiRequests,
      /backTo=\{origin === "my-ads" \? "\/properties\/naver-my-ads"/,
    );
    assert.match(aiRequests, /data-advertisement-approval-detail/);
    assert.match(aiRequests, /변경안 승인/);
    assert.match(aiRequests, /반려/);
  });

  it("uses operational views instead of connection exception states", () => {
    const source = readFileSync(desktopPath, "utf8");
    for (const label of ["전체", "비교 대기", "검토 필요"]) {
      assert.match(source, new RegExp(`label: "${label}"`));
    }
    assert.match(source, /status: "active"/);
    assert.doesNotMatch(source, /cpStatusMeta/);
    assert.doesNotMatch(source, /advertisement\.status === "error"/);
    assert.doesNotMatch(source, /\["paused", "ended"\]/);
    assert.doesNotMatch(source, /label: "중지·종료"/);
  });

  it("uses the shared dense table and canonical Unit location", () => {
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
        `${columnId} column should be in order`,
      );
      previousIndex = columnIndex;
    }

    assert.equal(
      (columns.match(/<TableHeaderLabel/g) ?? []).length,
      orderedColumnIds.length,
    );
    assert.match(
      columns,
      /id: "price"[\s\S]*label="가격\/보증금"[\s\S]*InlinePriceCell/,
    );
    assert.match(
      columns,
      /id: "monthlyRent"[\s\S]*label="월세"[\s\S]*InlineMonthlyRentCell/,
    );
    assert.match(
      columns,
      /id: "verification"[\s\S]*label="검증방식"[\s\S]*VerificationMethodCell/,
    );
    assert.match(
      columns,
      /id: "exposurePeriod"[\s\S]*label="노출기간"[\s\S]*AdvertisementExposurePeriodCell/,
    );
    assert.match(
      columns,
      /id: "floorExposure"[\s\S]*label="층수노출"[\s\S]*FloorExposureCell/,
    );
    assert.match(source, /rowHeight=\{40\}/);
    assert.match(source, /pinnedColumns=\{\["site", "dong", "floor", "ho"\]\}/);
    assert.match(
      source,
      /const property = advertisement\.listing\?\.property;[\s\S]*property\?\.unit[\s\S]*unit\?\.dong\?\.name[\s\S]*unit\?\.floor[\s\S]*unit\?\.name[\s\S]*unit\?\.siteUnitType\?\.name/,
    );
  });

  it("mirrors the property-list table hierarchy for advertisement work", () => {
    const source = readFileSync(desktopPath, "utf8");
    const webSource = readFileSync(webPath, "utf8");
    const desktopColumns = source.slice(
      source.indexOf("function buildColumns"),
      source.indexOf("function CellText"),
    );
    const webColumns = webSource.slice(
      webSource.indexOf("function buildColumns"),
      webSource.indexOf("function CellText"),
    );

    assert.equal(desktopColumns, webColumns);
    assert.match(source, /data-my-ads-table-style="property-list"/);
    assert.match(source, /areAdvertisementSourceColumnsCollapsed/);
    assert.match(source, /anchorColumnId: "monthlyRent"/);
    assert.match(
      source,
      /columnIds: \[[\s\S]*"channel"[\s\S]*"naver"[\s\S]*"verification"[\s\S]*"exposurePeriod"/,
    );
    assert.match(source, /label: "광고 정보"/);
    assert.match(
      desktopColumns,
      /\[&>svg\]:size-3 \[&>svg\]:text-muted-foreground\/70/,
    );
    assert.match(source, /text-sm font-medium tabular-nums text-slate-950/);
    assert.match(
      source,
      /PROPERTY_TABLE_PILL_CLASS_NAME =[\s\S]*rounded-\[4px\][\s\S]*px-1\.5 py-0\.5 text-\[12px\] font-medium leading-5/,
    );
    assert.match(
      source,
      /sale: \{ label: "매매", className: PROPERTY_TABLE_PILL_TONES\.danger \}[\s\S]*jeonse: \{ label: "전세", className: PROPERTY_TABLE_PILL_TONES\.info \}[\s\S]*monthly: \{ label: "월세", className: PROPERTY_TABLE_PILL_TONES\.warning \}/,
    );
    assert.match(
      source,
      /function PropertyTableTransactionBadge[\s\S]*PROPERTY_TABLE_PILL_CLASS_NAME/,
    );
    assert.match(
      source,
      /PROPERTY_TABLE_COMPACT_PILL_CLASS_NAME =[\s\S]*rounded-\[4px\]/,
    );
    assert.match(
      desktopColumns,
      /id: "analysis",[\s\S]*size: 152,[\s\S]*minSize: 152,[\s\S]*enableResizing: false,[\s\S]*meta: \{ fill: true \}/,
    );
  });

  it("keeps CP terms separate and shows observed Naver verification and floor evidence", () => {
    const source = readFileSync(desktopPath, "utf8");
    const webSource = readFileSync(webPath, "utf8");
    const desktopColumns = source.slice(
      source.indexOf("function buildColumns"),
      source.indexOf("function TableHeaderLabel"),
    );
    const webColumns = webSource.slice(
      webSource.indexOf("function buildColumns"),
      webSource.indexOf("function TableHeaderLabel"),
    );
    const floorExposureCell = source.slice(
      source.indexOf("function FloorExposureCell"),
      source.indexOf("function AdvertisementAnalysisPanel"),
    );

    assert.equal(desktopColumns, webColumns);
    assert.match(source, /advertisement\.advertisedDeposit/);
    assert.match(source, /advertisement\.advertisedMonthlyRent/);
    assert.match(source, /advertisement\.startedAt/);
    assert.match(source, /advertisement\.endedAt/);
    assert.match(
      source,
      /officeAdvertisementGroup\?\.mainAdvertisement[\s\S]*verificationTypeCode/,
    );
    assert.match(
      floorExposureCell,
      /exposureMode === "band" &&[\s\S]*comparison\.exactFloorCompetitorCount > 0/,
    );
    assert.match(floorExposureCell, /<Switch[\s\S]*checked=\{exposed\}/);
    assert.match(floorExposureCell, /"노출"[\s\S]*"미노출"[\s\S]*"미확인"/);
    assert.doesNotMatch(floorExposureCell, /main\.floorInfo/);
    assert.doesNotMatch(floorExposureCell, /floorExposureDescription/);
    assert.match(floorExposureCell, />\s*불리\s*</);
  });

  it("keeps CP and Naver identifiers semantically separate", () => {
    const source = readFileSync(desktopPath, "utf8");
    const cpCell = source.slice(
      source.indexOf("function CpAdvertisementCell"),
      source.indexOf("function NaverAdvertisementCell"),
    );

    assert.match(source, /advertisement\.externalAdId/);
    assert.match(source, /advertisement\.naverArticleNo/);
    assert.match(source, /advertisement\.naverUrl/);
    assert.match(source, /label="CP사"/);
    assert.doesNotMatch(cpCell, /advertisement\.status/);
    assert.doesNotMatch(source, /channel:\s*["']naver["']/);
    assert.doesNotMatch(source, /external_observed/);
  });

  it("keeps CP fetch failures on the workflow instead of advertisement rows", () => {
    const source = readFileSync(desktopPath, "utf8");
    const service = readFileSync(servicePath, "utf8");

    assert.match(source, /syncWorkflow\.cp\.state/);
    assert.match(
      service,
      /returnedAdvertisementStatus: ListingAdvertisementStatus\.ACTIVE/,
    );
    assert.match(service, /snapshotCommit: "only_after_complete_fetch"/);
    assert.match(service, /failurePolicy: "preserve_last_successful_snapshot"/);
    assert.match(
      service,
      /missingAfterCompleteFetch: ListingAdvertisementStatus\.ENDED/,
    );
  });

  it("expands current ranking into comparison evidence and a recommendation", () => {
    const source = readFileSync(desktopPath, "utf8");
    const rankingColumn = source.slice(
      source.indexOf('id: "ranking"'),
      source.indexOf('id: "checkedAt"'),
    );

    assert.match(source, /aria-expanded=\{expanded\}/);
    assert.match(source, /onToggleExpanded\(advertisement\.id\)/);
    assert.doesNotMatch(rankingColumn, /앞선/);
    assert.match(source, /renderExpandedRow=\{\(advertisement\) =>/);
    assert.match(
      source,
      /<AdvertisementAnalysisPanel[\s\S]*advertisement=\{advertisement\}[\s\S]*onEditAdvertisement=/,
    );
    assert.match(source, /현재 시점의 순위·가격·층 노출/);
    assert.match(source, /더 싼 광고 있음/);
    assert.match(source, /층 노출 불리/);
    assert.match(source, /lowerPricedCompetitorCount/);
    assert.match(source, /가격 수정안 작성/);
  });

  it("keeps the visible warning policy identical in desktop and web", () => {
    const desktopSignal = analysisSignalSource(desktopPath);
    const webSignal = analysisSignalSource(webPath);

    assert.equal(desktopSignal, webSignal);
    assert.match(desktopSignal, /label: "더 싼 광고 있음"/);
    assert.match(desktopSignal, /label: "내 광고 미노출"/);
    assert.doesNotMatch(desktopSignal, /현재 순위 우위/);
  });

  it("creates reviewed CP change requests with an explicit republish choice", () => {
    const source = readFileSync(desktopPath, "utf8");

    assert.match(source, /enableRowSelection/);
    assert.match(source, /수정안 작성/);
    assert.match(source, /api\.agentActionRequests\.create\(/);
    assert.match(source, /capability: "advertisement\.terms\.set"/);
    assert.match(source, /republishAfterSave: draft\.republishAfterSave/);
    assert.match(source, /저장 후 재광고/);
    assert.match(source, /검토·승인 후 CP Skill/);
  });

  it("keeps inline changes as explicit local drafts until reset or submitted", () => {
    const source = readFileSync(desktopPath, "utf8");
    const webSource = readFileSync(webPath, "utf8");
    const desktopInlineDraft = inlineDraftSource(desktopPath);
    const webInlineDraft = inlineDraftSource(webPath);
    const selectionHandler = source.slice(
      source.indexOf("const handleRowSelectionChange"),
      source.indexOf("const visibleDraftAdvertisements"),
    );

    assert.equal(desktopInlineDraft, webInlineDraft);
    assert.doesNotMatch(selectionHandler, /setInlineEdits/);
    assert.match(
      source,
      /변경 초안 \$\{dirtyAdvertisements\.length\}건 · AI 요청 전/,
    );
    assert.match(source, /변경 초안 \{draftAdvertisements\.length\}건/);
    assert.match(
      source,
      /if \(!isInlineEditDirty\(advertisement, nextEdit\)\)/,
    );
    assert.match(source, /submittedAdvertisementIds/);
    assert.match(desktopInlineDraft, /function InlineDraftResetButton/);
    assert.match(desktopInlineDraft, /이 행의 변경 초안 취소/);
    assert.match(desktopInlineDraft, /inlineMoneyEditLabel/);
    assert.match(desktopInlineDraft, /bg-warning-soft\/70/);
  });

  it("uses the property-list two-tier filter pattern for advertisement decisions", () => {
    const source = readFileSync(desktopPath, "utf8");
    const desktopFilters = myAdsFilterSource(desktopPath);
    const webFilters = myAdsFilterSource(webPath);

    assert.equal(desktopFilters, webFilters);
    assert.match(desktopFilters, /data-my-ads-results-toolbar/);
    assert.match(desktopFilters, /data-my-ads-filter-rail/);
    assert.match(desktopFilters, /ariaLabel="내 광고 단지 필터"/);
    assert.match(desktopFilters, /ariaLabel="내 광고 동 필터"/);
    assert.match(desktopFilters, /ariaLabel="내 광고 호 필터"/);
    assert.match(desktopFilters, /label="가격\/보증금"/);
    assert.match(desktopFilters, /label="월세"/);
    for (const label of [
      "거래 전체",
      "CP사 전체",
      "검증방식 전체",
      "층수노출 전체",
      "노출기간 전체",
      "경쟁 대비 전체",
    ]) {
      assert.match(desktopFilters, new RegExp(label));
    }
    assert.match(desktopFilters, /advertisementMatchesFilters/);
    assert.match(desktopFilters, /advertisementAmountMatchesRange/);
    assert.match(desktopFilters, /verificationMethodFilterKey/);
    assert.match(desktopFilters, /advertisementExposurePeriodBucket/);
    assert.match(desktopFilters, /advertisementComparisonFilterKey/);
    assert.match(source, /필터 결과/);
    assert.match(source, /aria-label="내 광고 필터 초기화"/);
    assert.match(source, /onClick=\{handleFiltersReset\}/);
    assert.match(source, /최대값은 최소값보다 크거나 같아야 합니다/);
    assert.match(
      source,
      /filterScopedAdvertisements\.filter\(\(advertisement\) =>[\s\S]*advertisementMatchesView/,
    );
  });
});
