import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop data table', () => {
  it('supports controlled row selection for edit-triggered selection', () => {
    const tableSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );
    const typesSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/types.ts'),
      'utf8',
    );

    assert.match(typesSource, /selectedRowIds\?: readonly string\[\]/);
    assert.match(
      tableSource,
      /selectedRowIds === undefined[\s\S]*internalRowSelection[\s\S]*Object\.fromEntries/,
    );
    assert.match(
      tableSource,
      /if \(selectedRowIds === undefined\) setInternalRowSelection\(next\)/,
    );
  });

  it('can reserve the selection toolbar while no rows are selected', () => {
    const tableSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );
    const typesSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/types.ts'),
      'utf8',
    );

    assert.match(typesSource, /alwaysShowSelectionToolbar\?: boolean/);
    assert.match(
      tableSource,
      /alwaysShowSelectionToolbar \|\| selectedRows\.length > 0/,
    );
    assert.match(tableSource, /data-data-table-selection-toolbar/);
    assert.match(tableSource, /className="flex h-9 shrink-0/);
    assert.match(tableSource, /disabled=\{selectedRows\.length === 0\}/);
  });

  it('lets an explicit fill column absorb remaining table width', () => {
    const tableSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );
    const typesSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/types.ts'),
      'utf8',
    );

    assert.match(typesSource, /fill\?: boolean/);
    assert.match(
      tableSource,
      /const hasFillColumn = leafColumns\.some\([\s\S]*column\.columnDef\.meta\?\.fill/,
    );
    assert.match(
      tableSource,
      /width: hasFillColumn[\s\S]*\? `max\(100%, \$\{tableTotalSize\}px\)`[\s\S]*: tableTotalSize/,
    );
    assert.match(
      tableSource,
      /width: header\.column\.columnDef\.meta\?\.fill[\s\S]*\? undefined[\s\S]*: header\.getSize\(\)/,
    );
    assert.match(
      tableSource,
      /width: cell\.column\.columnDef\.meta\?\.fill[\s\S]*\? undefined[\s\S]*: cell\.column\.getSize\(\)/,
    );
  });

  it('removes the browser outline from the keyboard navigation scroller', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/data-table.tsx'),
      'utf8',
    );

    assert.match(
      source,
      /'relative w-full overflow-auto outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0'/,
    );
  });

  it('removes the browser outline from the property listings keyboard navigation scroller', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /className="[^"]*outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"/,
    );
  });

  it('scopes the property listing confirm pending state to the clicked intake row', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /confirmMutation\.isPending\s*&&\s*confirmMutation\.variables\?\.intakeId\s*===\s*row\.original\.representative\.id/,
    );
  });

  it('labels an available property listing as active in the interface', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const statusConfigSource = readFileSync(
      resolve(testDir, '../src/renderer/lib/status-config.ts'),
      'utf8',
    );

    assert.match(
      pageSource,
      /\[ListingAvailability\.AVAILABLE\]:\s*\{\s*label: '활성'/,
    );
    assert.match(
      statusConfigSource,
      /listingAvailability:\s*\{\s*available: \{ label: '활성'/,
    );
    assert.match(pageSource, /'활성으로'/);
  });

  it('combines confirm action, date, and next-confirm columns into the web-style confirm column', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /id: 'confirmationAt'[\s\S]*?label="확인"[\s\S]*?<IntakeConfirmationCell/,
    );
    assert.match(source, /title="오늘로 확인 갱신"/);
    assert.doesNotMatch(source, /id: 'confirmAction'/);
    assert.doesNotMatch(source, /label="확인일"/);
    assert.doesNotMatch(source, /label="다음확인"/);
  });

  it('makes property data headers keyboard-sortable with announced direction', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    for (const columnId of [
      'info',
      'site',
      'dong',
      'unit',
      'supplyArea',
      'unitType',
      'matching',
      'advertisement',
      'confirmationAt',
      'listingAvailability',
      'price',
      'monthlyRent',
      'loanAmount',
      'moveInAvailable',
      'memo',
    ]) {
      const columnStart = pageSource.indexOf(`id: '${columnId}'`);
      assert.notEqual(columnStart, -1, `${columnId} column should exist`);
      assert.match(
        pageSource.slice(columnStart, columnStart + 700),
        /enableSorting: true/,
        `${columnId} should opt in to sorting`,
      );
    }

    assert.match(tableSource, /aria-sort=\{/);
    assert.match(
      tableSource,
      /<button[\s\S]*?type="button"[\s\S]*?onClick=\{handleSortToggle\}/,
    );
    assert.match(tableSource, /focus-visible:ring-2/);
  });

  it('keeps the confirmation column within the compact property row height', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const confirmationCell = source.slice(
      source.indexOf('function IntakeConfirmationCell'),
      source.indexOf('function ListingPriceDepositStack'),
    );

    assert.match(
      confirmationCell,
      /className="flex h-8 min-w-0 items-center gap-1\.5"/,
    );
    assert.doesNotMatch(confirmationCell, /py-1/);
  });

  it('gives property controls precise press feedback without transition-all', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const cssSource = readFileSync(
      resolve(testDir, '../src/renderer/app.css'),
      'utf8',
    );

    assert.match(pageSource, /data-properties-page/);
    assert.match(
      cssSource,
      /:is\(\[data-properties-page\], \[data-property-inspector\]\) :where\(button, \[data-slot="button"\]\)[\s\S]*?scale 140ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/,
    );
    assert.match(
      cssSource,
      /@media \(hover: hover\) and \(pointer: fine\)[\s\S]*?active:hover[\s\S]*?scale: 0\.97/,
    );
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?scale: 1/,
    );
  });

  it('overlays a full-page resizable workflow inspector above the filters', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const cssSource = readFileSync(
      resolve(testDir, '../src/renderer/app.css'),
      'utf8',
    );

    assert.match(pageSource, /<PropertyInspector/);
    assert.match(
      pageSource,
      /data-properties-page[\s\S]*?className="relative -m-4 flex min-h-0 flex-1 flex-col bg-white"/,
    );
    assert.match(pageSource, /data-property-workspace/);
    assert.match(
      pageSource,
      /data-property-workspace[\s\S]*?className="relative flex min-h-0 flex-1 overflow-hidden/,
    );
    assert.match(pageSource, /data-property-inspector/);
    assert.doesNotMatch(pageSource, /data-property-inspector-backdrop/);
    assert.match(
      pageSource,
      /data-property-inspector[\s\S]*?className="absolute inset-y-0 right-0 z-50/,
    );
    assert.match(pageSource, /data-property-inspector-resize-handle/);
    assert.match(
      pageSource,
      /<\/section>\s*\{selectedIntakeId && \(\s*<PropertyInspector/,
      'the inspector covers both filter rows while the uncovered list remains interactive',
    );
    assert.match(pageSource, /role="separator"/);
    assert.match(pageSource, /aria-label="상세 패널 너비 조절"/);
    const inspectorViewSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-inspector-view.tsx',
      ),
      'utf8',
    );
    const progressTabSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-inspector-progress-tab.tsx',
      ),
      'utf8',
    );
    assert.match(pageSource, /<PropertyInspectorView/);
    assert.match(
      pageSource,
      /steps: \[confirmStep, adStep, buyerStep, dealStep\]/,
      'the inspector should read in brokerage order: 확인 → 광고 → 매칭 → 거래',
    );
    assert.match(
      pageSource,
      /intake as ListingIntake & \{ consultations\?: Consultation\[\] \}/,
      'the inspector should read consultations from the intake detail root',
    );
    assert.match(inspectorViewSource, /aria-label="업무 흐름"/);
    assert.match(inspectorViewSource, /지금 할 일/);
    assert.match(
      inspectorViewSource,
      /<h2[\s\S]*?\{model\.siteName\}[\s\S]*?<\/h2>/,
      'the inspector title should lead with the site name',
    );
    assert.doesNotMatch(
      inspectorViewSource,
      /label: "광고·손님·계약"/,
      'advertisements get their own tab instead of sharing one with buyers and deals',
    );
    for (const label of ['요약', '사람·상담', '광고', '매칭·거래', '이력']) {
      assert.match(
        inspectorViewSource,
        new RegExp(`label: "${label}"`),
        `the inspector should keep secondary info behind the ${label} tab`,
      );
    }
    assert.match(inspectorViewSource, /role="tablist"/);
    for (const label of ['상담 남기기', '가격·상태 수정', '매물 확인 완료']) {
      assert.match(
        inspectorViewSource,
        new RegExp(label),
        `the bottom action bar should name the action: ${label}`,
      );
    }
    assert.doesNotMatch(
      inspectorViewSource,
      /ownerPhone/,
      'the owner call button was removed from the inspector actions',
    );
    assert.match(
      pageSource,
      /matchesStatus === "error"[\s\S]*?value: "확인 불가"/,
      'a failed match query must not read as "no buyers"',
    );
    assert.match(
      progressTabSource,
      /status === "error" && <RetryNote onRetry=\{onRetry\}>매칭을 불러오지 못했습니다\./,
      'the buyer list should offer a retry when the match query fails',
    );
    assert.match(
      inspectorViewSource,
      /\{tab === "progress" && progressTab\}/,
      'the 매칭·거래 tab is rendered from the dedicated progress tab component',
    );
    assert.match(
      progressTabSource,
      /<MatchProgressTrack match=\{match\} actions=\{actions\} \/>/,
      'matches reuse the 희망매물 page progress track so stages can be changed from the panel',
    );
    assert.match(
      progressTabSource,
      /if \(stage === MatchStage\.DEAL_CREATED\) \{\s*setConvertMatchId\(id\);/,
      'converting a match to a deal goes through the deal creation dialog',
    );
    assert.match(
      progressTabSource,
      /queryKey: \["deals"\],\s*queryFn: \(\) => api\.deals\.findAll\(\)/,
      'deals share the 거래관리 query cache (with payment schedules)',
    );
    assert.match(
      progressTabSource,
      /<ol aria-label="거래 흐름"/,
      'each deal shows its stage flow',
    );
    assert.match(
      progressTabSource,
      /if \(kind === "pre_contract"\) return DealStage\.PRE_CONTRACT;\s*if \(kind === "contract"\) return DealStage\.CONTRACTED;\s*return DealStage\.SETTLING;/,
      'payments are placed on the deal stage where the money changes hands',
    );
    assert.match(
      progressTabSource,
      /onSuccess: \(\) => refreshRelated\(\),[\s\S]*?onError: async[\s\S]*?await refreshRelated\(\);/,
      'a match memo save must wait for the refetch so the next edit uses the fresh updatedAt',
    );
    assert.match(
      progressTabSource,
      /onSettled: async \(\) => \{[\s\S]*?await refreshRelated\(\);/,
      'a viewing schedule must refetch even when the stage change fails, so a retry updates the saved event',
    );
    assert.match(
      progressTabSource,
      /savedEventIds: savedViewingEventIds\.current,/,
      'the panel remembers saved viewing events so a retry never creates a duplicate',
    );
    assert.match(
      progressTabSource,
      /await queryClient\.cancelQueries\(\{ queryKey: \["matches"\] \}\);\s*queryClient\.setQueriesData/,
      'an in-flight match query must not overwrite the saved viewing event',
    );
    assert.match(
      progressTabSource,
      /stage === DealStage\.PREPARING \|\| stage === DealStage\.PRE_CONTRACT[\s\S]*?님과 거래 진행 중 · 본계약하면 이 매칭은 자동 종료됩니다/,
      'other buyers on a listing with a pre-contract deal are told the match will close at 본계약',
    );
    assert.match(
      progressTabSource,
      /MATCH_CLOSED_REASON_LABELS\[match\.closedReason as MatchClosedReason\][\s\S]*?종료 · \{closedReasonLabel\}/,
      'closed matches show why they were closed',
    );
    assert.doesNotMatch(
      progressTabSource,
      /api\.deals\.updateStage/,
      'deal stages stay owned by 거래관리; the panel only mirrors them',
    );
    assert.match(
      pageSource,
      /intakeListingIds\.has\(match\.listingId\)/,
      'the buyer step should only count matches on this intake\'s listings',
    );
    assert.match(
      pageSource,
      /const buyerKeys = new Set\(/,
      'the buyer step should count distinct buyers, not match rows',
    );
    assert.match(
      inspectorViewSource,
      /tab === "history"[\s\S]*?<Timeline activities=\{model\.activities\} \/>/,
      'past consultation, ad and price history should stay reachable inside the panel',
    );
    assert.match(
      inspectorViewSource,
      /\.\.\.model\.offers\.map\(\(offer\) => \(\{[\s\S]*?label: memoLabelOf\(offer\),[\s\S]*?\{ key: "intake", label: "의뢰"/,
      'every listing memo is labelled by its transaction type, followed by the intake memo',
    );
    assert.doesNotMatch(
      inspectorViewSource,
      /label: "거래", text/,
      '"거래" reads as a deal, so listing memos must not use it as a label',
    );
    assert.match(
      inspectorViewSource,
      /<InlineMemoField label=\{memo\.label\} value=\{memo\.text\} onSave=\{memo\.onSave\} \/>/,
      'both memos should be editable in place from the summary tab',
    );
    assert.match(
      pageSource,
      /onSaveOfferMemo=\{saveOfferMemo\}[\s\S]*?onSaveIntakeMemo=\{saveIntakeMemo\}/,
    );
    assert.match(
      inspectorViewSource,
      /onSave\(next\)\.then\([\s\S]*?\(\) => \{[\s\S]*?setDraft\(typed\);/,
      'a failed memo save must reopen the editor with what was typed',
    );
    assert.match(
      pageSource,
      /const isConfirmRecord = consultation\.purpose === "listing_confirm";[\s\S]*?title: isConfirmRecord\s*\? "매물 확인"/,
      'confirm-button records are stored as online consultations but must read as 매물 확인',
    );
    assert.match(
      pageSource,
      /<ConsultationAddDialog[\s\S]*?propertyId=\{property\.id\}\s*listingIntakeId=\{intake\.id\}/,
      'a consultation left from the panel must be linked to this intake so the panel shows it',
    );
    assert.match(
      pageSource,
      /fetchAllConsultations\(\{ propertyId: property\.id \}\),\s*\.\.\.inspectorListingIds\.map\(\(listingId\) =>\s*fetchAllConsultations\(\{ listingId \}\)/,
      'loose consultations are fetched by property and by each listing (the server does not fill propertyId from listingId)',
    );
    assert.match(
      pageSource,
      /page >= result\.pagination\.totalPages/,
      'every page of consultations must be read, not just the first 100',
    );
    assert.match(
      pageSource,
      /catch \{\s*return \{ items, complete: false \};\s*\}/,
      'a failed page or request must keep the consultations already received',
    );
    assert.doesNotMatch(
      pageSource,
      /isConsultationsError\s*\?\s*"error"\s*:\s*looseConsultations\b/,
      'a partial consultation result must still be reported as an error',
    );
    assert.match(
      pageSource,
      /at: consultation\.createdAt,[\s\S]{0,120}?timeText: formatInspectorTime\(consultation\.createdAt\)/,
      'consultations in the panel timeline should show the time as well as the date',
    );
    assert.match(
      inspectorViewSource,
      /\{activity\.dateText\}\s*\{activity\.timeText && /,
    );
    assert.doesNotMatch(
      pageSource,
      /getQueryData<\{\s*items: Consultation\[\];/,
      'a partial refetch must not merge the old cache back in (it would revive deleted consultations)',
    );
    assert.match(
      pageSource,
      /!item\.listingIntakeId &&\s*\(!item\.listingId \|\| intakeListingIdSet\.has\(item\.listingId\)\)/,
      'property-level consultations not tied to another intake should also appear in the panel',
    );
    assert.match(
      inspectorViewSource,
      /model\.consultationsStatus === "error" && \(\s*<RetryNote onRetry=\{onRetryConsultations\}>/,
      'a failed consultation load must be shown with a retry, not as an empty list',
    );
    assert.doesNotMatch(
      pageSource,
      /isConfirmRecord = content\.startsWith/,
      'the editable consultation body must not decide whether a record is a confirmation',
    );
    assert.match(
      inspectorViewSource,
      /focusOnOpenRef\.current =\s*!active \|\| active === document\.body \|\| active === buttonRef\.current;/,
      'a failed save must not steal focus from another memo editor (blur-save retry loop)',
    );
    assert.match(
      inspectorViewSource,
      /const startEditing = \(\) => \{[\s\S]*?if \(saving !== null\) return;/,
      'a memo must not reopen from the stale value while its save is in flight',
    );
    assert.match(
      pageSource,
      /event\.target\.closest\("\[data-inspector-inline-editor\]"\)/,
      'Escape inside a memo editor cancels the edit instead of closing the panel',
    );
    assert.doesNotMatch(
      pageSource,
      /label: "가격 수정"/,
      'updatedAt is any edit, so it must not be labelled as a price change',
    );
    assert.match(
      pageSource,
      /value == null \? "-" : value === 0 \? "없음"/,
      'an unset loan must not be shown as "없음"',
    );
    assert.match(
      pageSource,
      /listings\.length === 1 \? \(listings\[0\] as InspectorListing\) : null/,
      'per-listing facts should only show when there is one listing',
    );
    assert.doesNotMatch(
      inspectorViewSource,
      /text-\[0\.62em\]|text-\[#a9a7a1\]">(동|호)</,
      '억·만·동·호 should render at the same size and colour as the digits',
    );
    assert.doesNotMatch(
      pageSource,
      /label: `의뢰 \$\{/,
      'the panel should not show a separate "의뢰 진행" chip next to the listing status',
    );
    assert.match(
      pageSource,
      /const chips: InspectorChip\[\] = \[\s*\{\s*label:\s*availability === ListingAvailability\.CLOSED\s*\? getClosedStatusLabel\(intake\.closedReason\)\s*: listingAvailabilityMeta\[availability\]\.label/,
      'the panel status chip should reuse the table status labels',
    );
    assert.match(
      pageSource,
      /palette: getAvailabilityPalette\(availability\)[\s\S]*?palette: getAvailabilityPalette\(listingAvailability\)/,
      'listing status badges in the panel must use the table status colours',
    );
    assert.match(
      inspectorViewSource,
      /function StatusChip[\s\S]*?rounded-\[4px\] px-1\.5 py-0\.5 text-\[12px\] font-medium leading-5/,
      'panel badges should share the table StatusIndicator shape',
    );
    assert.match(
      pageSource,
      /key: "deal",[\s\S]*?action: \{\s*label: "거래 보기",/,
      'the deal row in 진행 상황 should link to the deal',
    );
    assert.doesNotMatch(
      pageSource,
      /id: "deal",/,
      'an ongoing deal is shown once in 진행 상황, not repeated as a to-do',
    );
    assert.doesNotMatch(
      pageSource,
      /label: "최근 확인"|label: "다음 확인"|label: "공동중개"/,
      'confirmation dates and joint brokerage already appear in 진행 상황 and the header chips',
    );
    for (const value of ['확인됨', '부재중', '미확인']) {
      assert.match(
        pageSource,
        new RegExp(`value: "${value}",\\s*detail: \\[[^\\]]*?nextConfirmText,?\\s*\\]`),
        `the ${value} confirm row should keep the next confirm date`,
      );
    }
    assert.doesNotMatch(
      inspectorViewSource,
      /shadow-\[inset_0_0_0_1px_#ecebe8\]">\s*\{model\.infoFacts|grid grid-cols-4 overflow-hidden rounded-xl/,
      'the summary tab should use plain lists instead of boxed cards',
    );
    assert.match(pageSource, /onRequestClose=/);
    assert.doesNotMatch(pageSource, /aria-label="빠른 보기"/);
    assert.match(
      cssSource,
      /\[data-property-inspector\][\s\S]*?transition: transform 200ms/,
    );
    assert.doesNotMatch(cssSource, /property-inspector-backdrop/);
    assert.match(
      cssSource,
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\[data-property-inspector\][\s\S]*?transition: none/,
    );
  });

  it('closes the property inspector with Escape and restores table focus', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(pageSource, /closePropertyInspector/);
    assert.match(pageSource, /\[data-property-table-scroller\]/);
    assert.match(pageSource, /focus\(\{ preventScroll: true \}\)/);
    assert.match(tableSource, /case 'Escape':[\s\S]*?if \(onRequestClose\)/);
  });

  it('removes the joint brokerage column from the desktop property table', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.doesNotMatch(source, /id: 'jointBrokerage'/);
    assert.doesNotMatch(source, /function JointBrokerageCell/);
  });

  it('does not show the quick-panel double-click hint above the desktop table', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.doesNotMatch(source, /행 더블클릭 시 빠른 확인 패널을 엽니다/);
  });

  it('moves the row actions menu from the table into the property detail panel', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const inspectorSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-inspector-view.tsx',
      ),
      'utf8',
    );

    // 표에는 '작업' 칸이 없다. 확인 기록·거래별 매물 삭제는 상세 패널 위 막대의 메뉴로 옮겼다.
    assert.doesNotMatch(source, /id: ["']actions["']/);
    assert.match(
      source,
      /headerActions=\{\s*<PropertyRowActions[\s\S]*?listings=\{listings\}[\s\S]*?intake=\{intake\}[\s\S]*?triggerLabel="매물 작업 메뉴"/,
    );
    assert.match(inspectorSource, /headerActions\?: ReactNode/);
    assert.match(inspectorSource, /<div className="flex-1" \/>\s*\{headerActions\}/);
  });

  it('uses a spreadsheet-style control above the header to collapse columns from type through confirmation', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(
      pageSource,
      /const \[arePropertyDetailColumnsCollapsed, setArePropertyDetailColumnsCollapsed\] = useState\(true\)/,
    );
    assert.match(pageSource, /columnGroupControl=\{\{/);
    assert.match(tableSource, /data-column-group-toggle="property-details"/);
    assert.match(tableSource, /data-column-group-line="property-details"/);
    assert.match(
      tableSource,
      /aria-expanded=\{!columnGroupControl\.collapsed\}/,
    );
    assert.match(
      tableSource,
      /const leafColumns = table\.getAllLeafColumns\(\)[\s\S]*?column\.id === 'unitType'[\s\S]*?column\.id === 'listingAvailability'[\s\S]*?const propertyDetailGroupStart =/,
    );
    assert.match(
      tableSource,
      /data-column-group-line="property-details"[\s\S]*?left: propertyDetailGuideLeft,[\s\S]*?width: propertyDetailGuideWidth/,
    );
    assert.match(
      tableSource,
      /data-column-group-toggle="property-details"[\s\S]*?left: propertyDetailToggleLeft,[\s\S]*?marginLeft: propertyDetailToggleLeft/,
    );
    // 경계선 위의 작은 +/− 상자: 테두리가 경계선과 같은 색이라 선과 한 부품처럼 보인다.
    assert.match(
      tableSource,
      /data-column-group-toggle="property-details"[\s\S]*?size-4[\s\S]*?border-\[#cfcecb\] bg-white[\s\S]*?text-\[#8f8c86\]/,
    );
    // 고정 열 경계선은 머리글과 행이 같은 선 하나를 쓴다 (다른 칸 선보다 조금 굵다).
    assert.match(
      tableSource,
      /const PINNED_EDGE_LINE_CLASS =\s*"shadow-\[1px_0_0_0_#e3e2df\] [^"]*group-has-\[\[data-column-edge-hit\]:hover\]\/ptable:after:bg-foreground\/10/,
    );
    assert.equal(
      (tableSource.match(/isLastPinned && PINNED_EDGE_LINE_CLASS/g) ?? []).length,
      2,
    );

    assert.doesNotMatch(
      tableSource,
      /border-slate-700 bg-slate-700 text-white/,
    );
    assert.match(
      tableSource,
      /columnGroupControl\.collapsed \? \([\s\S]*?<Plus className="size-2\.5"/,
    );
    assert.match(tableSource, /<Minus className="size-2\.5"/);
    assert.match(
      pageSource,
      /\.\.\.\(!arePropertyDetailColumnsCollapsed[\s\S]*?id: 'unitType'[\s\S]*?id: 'matching'[\s\S]*?id: 'advertisement'[\s\S]*?id: 'confirmationAt'/,
    );
    assert.doesNotMatch(pageSource, /id: 'exclusiveArea'/);
    assert.match(tableSource, /타입–확인 컬럼 펼치기/);
  });

  it('keeps the button fixed while the property detail guide follows native table scrolling', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );
    const cssSource = readFileSync(
      resolve(testDir, '../src/renderer/app.css'),
      'utf8',
    );

    assert.doesNotMatch(pageSource, /data-property-table-scroll-scope/);
    assert.match(
      tableSource,
      /data-property-table-scroller[\s\S]*?data-property-column-guide[\s\S]*?data-column-group-line="property-details"/,
    );
    assert.match(tableSource, /className="relative flex h-full items-start"/);
    assert.match(
      tableSource,
      /data-column-group-line="property-details"[\s\S]*?top-\[9px\][\s\S]*?h-\[2px\]/,
    );
    assert.doesNotMatch(tableSource, /data-column-group-cap=/);
    assert.match(
      tableSource,
      /data-column-group-toggle="property-details"[\s\S]*?className="sticky z-50/,
    );
    assert.doesNotMatch(
      tableSource,
      /data-column-group-(?:line|cap|toggle)="property-details"[\s\S]*?left-\[\d+px\]/,
      'the property detail guide must follow live TanStack column sizes',
    );
    assert.doesNotMatch(
      tableSource,
      /data-column-group-toggle="property-details"[\s\S]*?className="[^"]*active:translate-y-px/,
      'pressing the sticky toggle must not move its guide mask',
    );
    assert.match(
      cssSource,
      /\[data-column-group-toggle="property-details"\]\[aria-expanded="true"\]::before[\s\S]*?right: calc\(100% \+ 1px\);[\s\S]*?top: 6px;[\s\S]*?width: 100vw;[\s\S]*?height: 2px;[\s\S]*?background: #ffffff;/,
      'the sticky toggle should mask guide segments without covering its border',
    );
    assert.match(
      tableSource,
      /data-property-column-guide[\s\S]*?className="sticky top-0 z-40 bg-white"/,
      'the guide band and its mask should share the header color',
    );
    assert.doesNotMatch(
      cssSource,
      /timeline-scope: --property-table-horizontal/,
    );
    assert.doesNotMatch(
      cssSource,
      /scroll-timeline-name: --property-table-horizontal/,
    );
    assert.doesNotMatch(
      cssSource,
      /animation-timeline: --property-table-horizontal/,
    );
    assert.doesNotMatch(cssSource, /property-detail-group-(?:line|cap)-scroll/);
    assert.doesNotMatch(pageSource, /handlePropertyTableHorizontalScroll/);
    assert.doesNotMatch(tableSource, /onHorizontalScroll/);
  });

  it('resizes the active Deal connector without distorting its stroke or endpoint', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const connectorSource = pageSource.slice(
      pageSource.indexOf('function ActiveDealListingConnector'),
      pageSource.indexOf('function getConfirmFreshness'),
    );

    assert.match(
      pageSource,
      /id: 'listingAvailability'[\s\S]*?size: 120,[\s\S]*?minSize: 96/,
    );
    assert.match(
      pageSource,
      /grid-cols-\[max-content_minmax\(0,1fr\)\][\s\S]*?<ActiveDealListingConnector/,
    );
    assert.match(connectorSource, /w-\[calc\(100%\+1rem\)\]/);
    assert.match(connectorSource, /-left-1\.5/);
    assert.match(connectorSource, /const curveWidth = 28/);
    assert.match(connectorSource, /const chipGap = 6/);
    assert.match(
      connectorSource,
      /viewBox=\{`0 0 \$\{curveWidth \+ chipGap\} \$\{height\}`\}/,
    );
    assert.match(connectorSource, /data-active-deal-connector-line/);
    assert.match(
      connectorSource,
      /data-active-deal-connector-end[\s\S]*?size-\[5px\]/,
    );
    assert.doesNotMatch(connectorSource, /new ResizeObserver/);
    assert.doesNotMatch(connectorSource, /preserveAspectRatio="none"/);
    assert.doesNotMatch(
      connectorSource,
      /data-active-deal-connector[\s\S]*?left-\[64px\][\s\S]*?w-16/,
    );
  });

  it('keeps the property site column compact', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(source, /id: 'site'[\s\S]*?size: 240,/);
  });

  it('shows the supply area directly after the unit with the unit-type fallback', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    const unitColumnIndex = source.indexOf("id: 'unit'");
    const supplyAreaColumnIndex = source.indexOf("id: 'supplyArea'");
    const actionsColumnIndex = source.indexOf("id: 'actions'");

    assert.ok(unitColumnIndex < supplyAreaColumnIndex);
    assert.ok(supplyAreaColumnIndex < actionsColumnIndex);
    assert.match(
      source.slice(supplyAreaColumnIndex, actionsColumnIndex),
      /label="공급"[\s\S]*?size: 72,[\s\S]*?getSupplyAreaM2\(row\.original\.property\),[\s\S]*?0,[\s\S]*?tabular-nums/,
    );
    assert.match(
      source,
      /function formatAreaPyeong\(value\?: number \| null, fractionDigits = 1\)[\s\S]*?toFixed\(fractionDigits\)/,
    );
    assert.match(
      source,
      /property\?\.unit\?\.supplyAreaM2 \?\?[\s\S]*?property\?\.unit\?\.siteUnitType\?\.supplyAreaM2/,
    );
  });

  it('keeps the property panel open when Esc closes a confirm dialog opened from it', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    // 패널의 매물 작업 메뉴가 여는 삭제 확인창은 AlertDialog(role=alertdialog)다.
    // 창 전체 Esc 처리와 패널 Esc 처리 둘 다 이 확인창이 떠 있으면 패널을 닫지 않아야 한다.
    const guards = source.match(/'\[role="dialog"\], \[role="alertdialog"\], \[role="listbox"\]/g) ?? [];
    assert.equal(guards.length, 2);
  });

  it('pins the identity columns without a row actions column', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /left: \['_select', 'info', 'site', 'dong', 'unit', 'supplyArea'\]/,
    );
  });

  it('keeps pinned property cells above decorations from horizontally scrolled cells', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    assert.match(source, /const PINNED_BODY_CELL_Z_INDEX = 10;/);
    assert.match(source, /zIndex: PINNED_BODY_CELL_Z_INDEX/);
  });

  it('moves chip editor popups in the same native scroll layer as their cells', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/cell-editor.tsx'),
      'utf8',
    );

    assert.equal(
      source.match(/data-cell-chip-popup/g)?.length,
      2,
      'both option and date-picker popups should use the native scroll layer',
    );
    assert.match(source, /className="absolute z-50 w-\[220px\]/);
    assert.match(source, /className="absolute z-50 w-\[280px\]/);
    assert.match(source, /top: rect\.top \+ rect\.height \+ 4/);
    assert.match(source, /left: clampPopupLeft\(220\)/);
    assert.match(source, /left: clampPopupLeft\(280\)/);
    assert.match(source, /return createPortal\(portalContent, scrollParent\)/);
    assert.doesNotMatch(source, /updatePositionStrategy="always"/);
    assert.doesNotMatch(source, /<PopoverContent/);
  });

  it('uses Korean month, weekday, and accessibility labels in date pickers', () => {
    const calendarSource = readFileSync(
      resolve(testDir, '../src/renderer/components/ui/calendar.tsx'),
      'utf8',
    );

    assert.match(calendarSource, /import \{ ko \} from 'react-day-picker\/locale'/);
    assert.match(calendarSource, /locale = ko/);
    assert.match(calendarSource, /<DayPicker[\s\S]*?locale=\{locale\}/);
  });

  it('uses a pencil-free floating popup for editable property text and number cells', () => {
    const editorSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/cell-editor.tsx'),
      'utf8',
    );
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(editorSource, /editorChrome\?: 'cell' \| 'floating'/);
    assert.match(editorSource, /data-cell-edit-popup[\s\S]*?role="dialog"/);
    assert.match(
      pageSource,
      /activation="click"[\s\S]*?editorChrome="floating"/,
    );
    assert.doesNotMatch(editorSource, /\bPencil\b/);
  });

  it('focuses text and number editors without selecting the existing value', () => {
    const editorSource = readFileSync(
      resolve(testDir, '../src/renderer/components/data-table/cell-editor.tsx'),
      'utf8',
    );

    assert.match(editorSource, /inputRef\.current\?\.focus\(\)/);
    assert.doesNotMatch(editorSource, /inputRef\.current\?\.select\(\)/);
  });

  it('uses a vertical ellipsis for the property row actions menu', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-property-intake-actions.tsx',
      ),
      'utf8',
    );

    assert.match(source, /<MoreVertical className="size-4 text-slate-500" \/>/);
    assert.match(source, /className="flex items-center justify-center"/);
    assert.doesNotMatch(
      source,
      /<MoreHorizontal className="size-4 text-slate-500" \/>/,
    );
    assert.doesNotMatch(source, /setHidden/);
    assert.doesNotMatch(source, /숨김 처리|숨김 해제|일괄 숨김/);
  });

  it('expands advertisement counts into the web-style detail row', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const tableSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-listings-table.tsx',
      ),
      'utf8',
    );

    const panelSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-match-panel.tsx',
      ),
      'utf8',
    );

    // 매칭 열과 광고 열은 하나의 펼침 패널을 공유하고, 패널 머리글의 탭으로
    // 연결 구매고객 ↔ 광고를 전환한다.
    assert.match(
      pageSource,
      /const \[expandedPanels, setExpandedPanels\] = useState<\s*ReadonlyMap<string, "match" \| "ad">/,
    );
    assert.match(pageSource, /listing\.activeAdvertisements/);
    assert.match(pageSource, /listing\.activeAdvertisementCount/);
    assert.match(pageSource, /renderExpandedRow=\{renderExpandedPropertyRow\}/);
    // 두 열의 토글은 같은 펼침 컨트롤을 쓴다.
    assert.equal(
      pageSource.match(/<ListingPanelToggle/g)?.length,
      2,
      'matching and advertisement counts should share the same expansion control',
    );
    // 두 토글 모두 통합 패널을 가리킨다 (광고 전용 패널 ID는 사라졌다).
    assert.doesNotMatch(pageSource, /property-ad-panel-/);
    assert.equal(
      (pageSource.match(/panelId=\{`property-expand-panel-\$\{group\.id\}`\}/g) ??
        [])
        .length,
      2,
    );
    assert.match(panelSource, /id=\{`property-expand-panel-\$\{group\.id\}`\}/);
    // 패널 머리글은 두 탭을 가진다.
    assert.match(panelSource, /label="연결 구매고객"/);
    assert.match(panelSource, /label="광고"/);
    assert.match(panelSource, /activeTab === 'ad' \? \(\s*adPanel\(/);
    assert.match(tableSource, /expandedRowIds\?: ReadonlySet<string>/);
    assert.match(tableSource, /data-expanded-row=\{row\.original\.id\}/);
    assert.match(tableSource, /renderExpandedRow\?\.\(row\.original\)/);
  });

  it('shows match counts beside advertisements and expands buyers as property branches', () => {
    const pageSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const clientSource = readFileSync(
      resolve(
        testDir,
        '../../../packages/api-client/src/modules/listing-intakes.ts',
      ),
      'utf8',
    );

    const columnIdIndex = (id: string) => {
      const match = pageSource.search(
        new RegExp(`id: ['"]${id}['"]`),
      );
      return match;
    };
    const matchingColumnIndex = columnIdIndex('matching');
    const advertisementColumnIndex = columnIdIndex('advertisement');
    const confirmationAtColumnIndex = columnIdIndex('confirmationAt');

    assert.ok(matchingColumnIndex !== -1, 'matching column should be rendered');
    assert.ok(
      advertisementColumnIndex !== -1,
      'advertisement column should be rendered',
    );
    assert.doesNotMatch(pageSource, /id: 'exclusiveArea'/);
    assert.doesNotMatch(pageSource, /label="전용면적"/);
    assert.ok(
      confirmationAtColumnIndex !== -1,
      'confirmation column should be rendered',
    );
    assert.ok(
      matchingColumnIndex < advertisementColumnIndex &&
        advertisementColumnIndex < confirmationAtColumnIndex,
      'matching and advertisement should sit between type and confirmation',
    );
    const panelSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-match-panel.tsx',
      ),
      'utf8',
    );

    assert.match(pageSource, /label="매칭"/);
    // 연결 구매고객 패널 — 고객을 펼치면 단계 경로와 다음 작업이 나온다.
    assert.match(panelSource, /label="연결 구매고객"/);
    assert.match(panelSource, /data-property-match-row=\{match\.id\}/);
    assert.match(panelSource, /data-property-match-detail=\{match\.id\}/);
    assert.match(panelSource, /<MatchStagePath/);
    assert.match(panelSource, /<MatchConvertDialog/);
    assert.match(panelSource, /buildViewingCalendarEventPayload/);
    assert.match(panelSource, /api\.matches\.updateStage/);
    // 메모는 매물 표와 같은 공통 셀 편집기를 쓴다.
    assert.match(panelSource, /<EditableCell/);
    assert.match(pageSource, /_count: listing\._count/);
    assert.match(clientSource, /activeAdvertisementCount\?: number/);
    assert.match(clientSource, /_count\?: \{ matches: number \}/);
  });

  it('keeps property quick search controls in tab, site, dong, unit, integrated search order', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    const tabsIndex = source.indexOf('<Tabs value={selectedTransactionType}');
    const siteIndex = source.indexOf('placeholder="단지 전체"');
    const dongIndex = source.indexOf('placeholder="동"');
    const unitIndex = source.indexOf('placeholder="호"');
    const integratedSearchIndex = source.indexOf(
      'placeholder="주소, 연락처, 메모"',
    );
    const createIndex = source.indexOf(
      '<Plus className="size-3.5" />새 매물 등록',
    );

    assert.ok(tabsIndex !== -1, 'transaction tabs should be rendered');
    assert.ok(
      siteIndex !== -1,
      'site quick search should be rendered in the top row',
    );
    assert.ok(
      integratedSearchIndex !== -1,
      'integrated search should use the secondary-search placeholder',
    );
    assert.ok(
      tabsIndex < siteIndex &&
        siteIndex < dongIndex &&
        dongIndex < unitIndex &&
        unitIndex < integratedSearchIndex &&
        integratedSearchIndex < createIndex,
      'top row controls should follow the expected search priority',
    );
  });

  it('uses the soft toolbar shape on the property page only and keeps the pill default elsewhere', () => {
    const page = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const toolbar = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-toolbar.tsx',
      ),
      'utf8',
    );

    // 거래 탭은 광고노트와 같은 알약 탭에서 트랙만 옅은 회색으로 낮춘 것(고른 탭은 검정 채움)
    assert.match(page, /<ToolbarPillTabs\s+shape="muted"\s+ariaLabel="거래유형"/);
    assert.match(toolbar, /muted \? "bg-\[rgba\(55,53,47,0\.08\)\]" : toolbarSurfaceClassName/);
    assert.match(page, /<ToolbarSearchBar\s+shape="soft"/);
    // 목록/지도는 거래 탭과 같은 둥근 회색 트랙, 고른 쪽은 흰 알약
    assert.match(page, /<ToolbarPillToggle\s+shape="muted"\s+ariaLabel="매물 보기 방식"/);
    // 다른 화면은 prop을 주지 않으므로 기본값이 기존 알약 모양이어야 한다
    assert.equal(toolbar.match(/shape = "pill",/g)?.length, 5);
    // soft 위치 칸: 단지 │ 동 │ 호가 한 칸, 동·호는 고정 너비 입력칸, 검색칸은 따로
    // 지역·단지는 필터 칩 모양(고르기 전 테두리 없음, 고르면 파란 알약)
    assert.match(toolbar, /<span className="shrink-0">지역·단지<\/span>[\s\S]*?aria-label="위치 필터 해제"/);
    // 동·호는 버블 하나에 같은 너비의 두 칸: 비면 옅은 회색, 값이 있으면 파란 버블 + 둘 다 지우는 ×
    const unitBubble = toolbar.slice(toolbar.indexOf('aria-label="동·호"'), toolbar.indexOf('검색: 평소에는 돋보기'));
    assert.match(unitBubble, /rounded-full[\s\S]*?dong \|\| unit\s*\? "bg-\[rgba\(35,131,226,0\.1\)\][^"]*"\s*: "bg-\[rgba\(60,52,40,0\.045\)\]/);
    assert.match(unitBubble, /<Hash[\s\S]*?suffix="동"\s+className="w-\[84px\] pl-2"[\s\S]*?suffix="호"\s+className="w-\[84px\] pl-2"/);
    assert.match(unitBubble, /aria-label="동·호 지우기"[\s\S]*?onDongChange\(""\);\s*onUnitChange\(""\);/);
    // 검색은 평소 돋보기 아이콘만, 입력 중이거나 검색어가 있을 때만 펼쳐지고 자리 표시도 그때만 나온다
    assert.match(toolbar, /const searchExpanded = searchFocused \|\| search\.length > 0;/);
    assert.match(toolbar, /placeholder=\{searchExpanded \? searchPlaceholder : undefined\}/);
    assert.match(toolbar, /searchExpanded \? "min-w-0 flex-1" : "w-0 opacity-0"/);
    assert.match(toolbar, /function SoftUnitSegment[\s\S]*?text-right font-semibold tabular-nums/);
  });

  it('renders the property filter row as borderless chips with icons, tinting only the set ones', () => {
    const page = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const toolbar = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-components/property-toolbar.tsx',
      ),
      'utf8',
    );

    for (const [label, icon] of [
      ['label="매물상태"', '<Info />'],
      ['label={priceFilterLabel}', '<WonCircleIcon />'],
      ['label="월세"', '<WonCircleIcon />'],
      ['label="공급평형"', '<Ruler />'],
      ['label="방/욕실"', '<BedDouble />'],
      ['label={item.label}', 'item.icon'],
    ]) {
      const chip = [
        '<ToolbarFilterChip',
        ...(label === 'label={item.label}' ? ['key={item.key}'] : []),
        label,
        'shape="soft"',
        `icon={${icon}}`,
      ].join(' ');
      assert.ok(
        page.replace(/\s+/g, ' ').includes(chip),
        `${label} chip should be soft and carry ${icon}`,
      );
    }
    // 유형·입주일·광고도 "+ 필터" 메뉴에 숨기지 않고 값이 없어도 늘 칩으로 보인다
    assert.doesNotMatch(page, /AddFilterMenu/);
    assert.match(page, /\{extraFilterItems\.map\(\(item\) => \(\s*<ToolbarFilterChip/);
    for (const key of ['siteTypes', 'moveIn', 'advertisement']) {
      assert.match(page, new RegExp(`key: "${key}"`));
    }
    // 좁은 창에서도 칩이 옆으로 숨지 않고 다음 줄로 내려간다
    const filterRowStart = page.indexOf('{isFilterRowOpen && (');
    const filterRow = page.slice(filterRowStart, page.indexOf('label="매물상태"', filterRowStart));
    assert.match(filterRow, /"flex shrink-0 items-start gap-2/);
    assert.match(filterRow, /className="flex min-w-0 flex-1 flex-wrap items-center/);
    assert.doesNotMatch(filterRow, /overflow-x-auto/);
    // soft: 설정 전에는 테두리·바탕이 없고, 설정 후에만 파란 알약
    assert.match(toolbar, /active\s*\? "rounded-full bg-\[rgba\(35,131,226,0\.1\)\] text-\[#2383e2\][^"]*"\s*: "rounded-full text-\[#6f6c66\]/);
    // hover·열림 바탕도 Notion처럼 끝이 둥근 알약이다(각진 6px 모서리를 쓰지 않는다)
    assert.doesNotMatch(
      toolbar.slice(toolbar.indexOf('export function ToolbarFilterChip'), toolbar.indexOf('export function ToolbarToggleChip')),
      /soft[\s\S]{0,400}rounded-\[6px\] (?:text|px)/,
    );
    // 다른 화면이 쓰는 기본 모양(테두리 있는 알약)은 그대로다
    assert.match(toolbar, /"rounded-full border text-\[12\.5px\]"/);
  });

  it('folds the property filter row from a filter icon next to search and keeps reset and columns reachable', () => {
    const page = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(page, /const \[isFilterRowOpen, setIsFilterRowOpen\] = useState\(true\);/);
    // 아이콘은 검색(ToolbarSearchBar) 바로 뒤에 있다
    assert.match(page, /<\/ToolbarSearchBar>\s*<button[\s\S]{0,400}?aria-pressed=\{isFilterRowOpen\}[\s\S]{0,700}?<ListFilter className="size-3\.5" \/>/);
    assert.match(page, /\{isFilterRowOpen && \(\s*<section[\s\S]*?label="매물상태"/);
    // 컬럼은 필터 아이콘 바로 옆의 아이콘 버튼이고, 접혀 있을 때는 초기화가 찾기 줄 오른쪽으로 옮겨 온다
    assert.match(page, /<ListFilter className="size-3\.5" \/>\s*<\/button>\s*<PropertyColumnSettings/);
    const columnControls = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/properties/-components/property-table-controls.tsx'),
      'utf8',
    );
    assert.match(columnControls, /aria-label="컬럼 설정"[\s\S]*?<Columns3 className="size-3\.5" \/>/);
    assert.match(page, /const filterRowActions = \([\s\S]*?초기화[\s\S]*?\n  \);/);
    assert.doesNotMatch(page.slice(page.indexOf('const filterRowActions = ('), page.indexOf('const filterRowActions = (') + 800), /Columns3/);
    assert.match(page, /\{!isFilterRowOpen && filterRowActions\}/);
    assert.equal(page.match(/\{filterRowActions\}/g)?.length, 1);
  });

  it('keeps the monthly rent chip beside the price chip on the all and monthly tabs', () => {
    const page = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    // 가격/보증금 칩 바로 다음이 월세 칩이고, 전체·월세 탭(또는 값이 남은 경우)에 보인다
    assert.match(
      page,
      /label=\{priceFilterLabel\}[\s\S]*?<\/ToolbarFilterChip>\s*\{\/\*[\s\S]*?\*\/\}\s*\{\(selectedTransactionType === "all" \|\|\s*selectedTransactionType === "monthly" \|\|\s*monthlyRentFilterSummary\) && \(\s*<ToolbarFilterChip\s+label="월세"/,
    );
    // + 필터 메뉴에는 월세가 없다
    assert.doesNotMatch(page, /key: "monthlyRent"/);
  });

  it('combines province district and ward filters into the location search bar popover', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(
      source,
      /<ToolbarSearchBar[\s\S]*?ariaLabel="시도"[\s\S]*?ariaLabel="시군구"[\s\S]*?ariaLabel="법정동"[\s\S]*?<\/ToolbarSearchBar>/,
    );
    // 지역 세 단계는 고르기 상자가 아니라 펼친 목록(ToolbarRegionColumn)이고, 단지 목록과 한 면에 놓인다
    assert.match(
      source,
      /<ToolbarSearchBar[\s\S]*?popoverClassName="w-\[736px\][\s\S]*?<ToolbarRegionColumn\s+ariaLabel="시도"[\s\S]*?<ToolbarRegionColumn\s+ariaLabel="시군구"[\s\S]*?<ToolbarRegionColumn\s+ariaLabel="법정동"[\s\S]*?<ChecklistFilterPanel[\s\S]*?지역 초기화[\s\S]*?완료[\s\S]*?<\/ToolbarSearchBar>/,
    );
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="시도"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="시군구"/);
    assert.doesNotMatch(source, /<FilterPopoverChip\s+label="법정동"/);
  });

  it('exposes the NAVER property map through the list-to-map toggle', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );

    assert.match(source, /type PropertyViewMode = 'list' \| 'map'/);
    assert.match(
      source,
      /const \[viewMode, setViewMode\] = useState<PropertyViewMode>\('list'\)/,
    );
    assert.match(
      source,
      /<ViewModeSwitch value=\{viewMode\} onChange=\{setViewMode\} \/>/,
    );
    assert.match(source, /function ViewModeSwitch/);
    assert.match(source, /aria-label="매물 보기 방식"/);
    assert.match(source, /aria-pressed=\{value === 'map'\}/);
    assert.match(source, /viewMode === 'list'/);
    assert.match(source, /<PropertyMapView/);
    assert.match(source, /api\.listingIntakes\.map/);
    assert.match(source, /buildPropertyMapPoints\(mapGroups\)/);
    assert.match(source, /VITE_NAVER_MAPS_NCP_KEY_ID/);
    assert.match(
      source,
      /https:\/\/oapi\.map\.naver\.com\/openapi\/v3\/maps\.js\?ncpKeyId=/,
    );
    assert.match(source, /new mapsApi\.Map/);
    assert.match(source, /new mapsApi\.Marker/);
    assert.match(source, /buildPropertyMapClusters/);
    assert.match(source, /PROPERTY_MAP_CLUSTER_GRID_SIZE/);
    assert.match(source, /buildPropertyMapClustersFromOffsets/);
    assert.match(source, /clusterRadius: PROPERTY_MAP_CLUSTER_GRID_SIZE/);
    assert.match(source, /placeholderData: keepPreviousData/);
    assert.match(source, /hasAutoFittedRef/);
  });

  it('selects site coordinates for property map view', () => {
    const source = readFileSync(
      resolve(
        testDir,
        '../../../apps/server/src/modules/listing-intakes/listing-intakes.service.ts',
      ),
      'utf8',
    );

    const siteSelectIndex = source.indexOf('site: {');
    const latIndex = source.indexOf('lat: true', siteSelectIndex);
    const lngIndex = source.indexOf('lng: true', siteSelectIndex);
    const wardCodeIndex = source.indexOf('wardCode: true', siteSelectIndex);

    assert.ok(siteSelectIndex !== -1, 'property site select should exist');
    assert.ok(latIndex !== -1, 'property site select should include lat');
    assert.ok(lngIndex !== -1, 'property site select should include lng');
    assert.ok(
      latIndex < wardCodeIndex && lngIndex < wardCodeIndex,
      'coordinates should be selected with the site summary fields',
    );
  });

  it('adds a listing intake map endpoint for unpaginated map data', () => {
    const controllerSource = readFileSync(
      resolve(
        testDir,
        '../../../apps/server/src/modules/listing-intakes/listing-intakes.controller.ts',
      ),
      'utf8',
    );
    const serviceSource = readFileSync(
      resolve(
        testDir,
        '../../../apps/server/src/modules/listing-intakes/listing-intakes.service.ts',
      ),
      'utf8',
    );
    const apiClientSource = readFileSync(
      resolve(
        testDir,
        '../../../packages/api-client/src/modules/listing-intakes.ts',
      ),
      'utf8',
    );

    assert.match(controllerSource, /@Get\('map'\)/);
    assert.ok(
      controllerSource.indexOf("@Get('map')") <
        controllerSource.indexOf("@Get(':id')"),
      'map route should be registered before id route',
    );
    assert.match(serviceSource, /findMapIntakes/);
    assert.match(serviceSource, /MAP_INTAKES_LIMIT/);
    assert.match(serviceSource, /buildMapSelect/);
    assert.match(apiClientSource, /ListingIntakesMapResponse/);
    assert.match(
      apiClientSource,
      /request<ListingIntakesMapResponse>\('\/listing-intakes\/map'/,
    );
  });

  it('asks how to resolve an active Deal before closing its listing intake', () => {
    const propertiesSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/index.tsx',
      ),
      'utf8',
    );
    const dealsSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/deals/index.tsx',
      ),
      'utf8',
    );
    const intakeActionsSource = readFileSync(
      resolve(
        testDir,
        '../src/renderer/routes/_authenticated/properties/-property-intake-actions.tsx',
      ),
      'utf8',
    );

    const manualReasonOptions = propertiesSource.slice(
      propertiesSource.indexOf('const MANUAL_INTAKE_CLOSE_REASON_OPTIONS'),
      propertiesSource.indexOf('type ManualIntakeCloseReason'),
    );
    const confirmReasonOptions = intakeActionsSource.slice(
      intakeActionsSource.indexOf('const CONFIRM_CLOSED_REASON_OPTIONS'),
      intakeActionsSource.indexOf('type ConfirmClosedReason'),
    );

    assert.match(propertiesSource, /진행 중인 거래가 있습니다/);
    assert.match(propertiesSource, /거래 취소 후 종료/);
    assert.match(propertiesSource, /거래 완료 처리/);
    assert.match(propertiesSource, /다른 중개사·직거래로 계약됨/);
    assert.doesNotMatch(manualReasonOptions, /IntakeClosedReason\.UNAVAILABLE/);
    assert.doesNotMatch(manualReasonOptions, /IntakeClosedReason\.SUPERSEDED/);
    assert.doesNotMatch(confirmReasonOptions, /IntakeClosedReason\.UNAVAILABLE/);
    assert.match(manualReasonOptions, /IntakeClosedReason\.OTHER/);
    assert.match(confirmReasonOptions, /IntakeClosedReason\.OTHER/);
    assert.match(
      propertiesSource,
      /closedReason:\s*resolvedClosedReason|closedReason,/,
    );
    assert.match(propertiesSource, /`\/deals\?dealId=\$\{encodeURIComponent\(dealId\)\}`/);
    assert.match(dealsSource, /dealId:\s*typeof search\.dealId/);
    assert.match(dealsSource, /setSelectedDealId\(deepLinkDealId\)/);
  });
});
