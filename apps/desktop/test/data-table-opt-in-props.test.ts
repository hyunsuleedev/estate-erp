import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));
const table = readFileSync(
  resolve(testDir, "../src/renderer/components/data-table/data-table.tsx"),
  "utf8",
);
const types = readFileSync(
  resolve(testDir, "../src/renderer/components/data-table/types.ts"),
  "utf8",
);

// 공용 표를 쓰는 다른 화면은 아무것도 넘기지 않으므로 지금 모양·동작 그대로여야 한다.
describe("data table opt-in props", () => {
  it("declares every new prop as optional", () => {
    for (const prop of [
      /propertyListTone\?: boolean;/,
      /columnSizing\?: Record<string, number>;/,
      /onColumnSizingChange\?: \(sizing: Record<string, number>\) => void;/,
      /scrollResetKey\?: string \| number;/,
      /getRowSelectionLabel\?: \(row: TData\) => string;/,
      /estimateExpandedRowHeight\?: number;/,
      /selectionToolbarPlacement\?: 'top' \| 'bottom';/,
      /selectionItemLabel\?: string;/,
      /scrollerContainerQuery\?: boolean;/,
    ]) {
      assert.match(types, prop);
    }
    assert.match(table, /propertyListTone = false,/);
    assert.match(table, /selectionToolbarPlacement = 'top',/);
    assert.match(table, /scrollerContainerQuery = false,/);
  });

  it("keeps the top selection toolbar by default and adds the property-list bottom bar only on request", () => {
    assert.match(
      table,
      /\{renderBulkActions &&\s*selectionToolbarPlacement === 'top' &&[\s\S]*?className="flex h-9 shrink-0 items-center gap-2 border-b border-border\/60 bg-accent\/40 px-3 text-xs"/,
    );
    // 매물관리 표(property-listings-table)와 같은 자리·모양: 스크롤 영역 아래, 상태 줄 위
    const bottomBar = table.indexOf('data-data-table-selection-toolbar="bottom"');
    assert.ok(bottomBar > table.indexOf('</table>'), "bottom bar comes after the scroller");
    assert.ok(bottomBar < table.indexOf("{/* Status bar"), "bottom bar comes before the status bar");
    assert.match(
      table,
      /showsSelectionToolbar && selectionToolbarPlacement === 'bottom'[\s\S]*?"flex min-h-9 flex-wrap items-center gap-2 border-t border-border\/60 bg-white px-3 py-1\.5 text-xs"/,
    );
    assert.match(table, /scrollerContainerQuery && '\[container-type:inline-size\]'/);
  });

  it("limits the scroll fixes to the opt-in modes", () => {
    // 여백 줄을 높이마다 새로 그리는 것은 펼친 행을 가상 스크롤할 때만
    assert.match(
      table,
      /virtualizesExpandedRows \? `spacer-\$\{edge\}-\$\{height\}` : undefined/,
    );
    // 열 묶음 띠를 고정 열 경계에서 자르는 것은 매물관리 모양에서만
    assert.match(table, /const clipsGuideUnderPinnedColumns =\s*isPropertyListTone && hasColumnGroupGuide;/);
    // 끄는 중 Esc 취소는 제어형 열 너비에서만
    assert.match(table, /if \(!isColumnSizingControlled \|\| !isResizingColumn\) return;/);
    assert.match(table, /\.\.\.\(columnSizing !== undefined\s*\? \{\s*onColumnSizingChange:/);
    assert.doesNotMatch(table, /TEMP-DEBUG|__dtLog/);
  });

  it("keeps the default selection label and virtualization rule when the props are absent", () => {
    assert.match(table, /getRowSelectionLabel\s*\?\s*getRowSelectionLabel\(row\.original\)\s*:\s*`\$\{row\.index \+ 1\}번째 행 선택`/);
    assert.match(
      table,
      /\(virtualizesExpandedRows \|\|\s*!expandedRowIds \|\|\s*expandedRowIds\.size === 0\)/,
    );
    assert.match(table, /typeof estimateExpandedRowHeight === 'number' && !!renderExpandedRow/);
  });

  it("only wires width saving, double-click reset and resize click guards for controlled widths", () => {
    assert.match(table, /\.\.\.\(columnSizing !== undefined\s*\? \{ initialState: \{ columnSizing \} \}\s*: \{\}\)/);
    assert.match(table, /onMouseDown=\{\s*isColumnSizingControlled\s*\?[\s\S]*?: header\.getResizeHandler\(\)\s*\}/);
    assert.match(table, /onDoubleClick=\{\s*isColumnSizingControlled\s*\?[\s\S]*?resetColumnWidth\(header\.column\.id\)/);
    // 움직이지 않은 클릭은 저장하지 않는다
    assert.match(table, /if \(!isSameColumnSizing\(next, columnSizing, getDefaultColumnWidth\)\) \{\s*onColumnSizingChange\?\.\(next\);/);
  });

  it("uses the property list cell spec only for propertyListTone", () => {
    assert.match(
      table,
      /if \(isPropertyListTone\) \{[\s\S]*?'relative select-none border-b border-border px-2\.5 align-middle text-\[14px\] font-\[450\] leading-\[21px\] text-foreground'[\s\S]*?'border-r border-r-\[#eeeeec\]'[\s\S]*?'group-hover:bg-muted\/70'[\s\S]*?'group-data-\[state=selected\]:bg-primary\/5'/,
    );
    assert.match(
      table,
      /'h-9 border-b border-border bg-white px-2\.5 text-\[13px\] font-normal leading-\[21px\] normal-case tracking-normal text-muted-foreground transition-colors'/,
    );
    assert.match(table, /tabIndex=\{isPropertyListTone && canSort \? 0 : undefined\}/);
  });
});
