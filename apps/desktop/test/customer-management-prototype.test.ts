import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  CUSTOMER_MANAGEMENT_DEMO,
  getCustomerMode,
} from "../src/renderer/routes/_authenticated/prototypes/-customer-management/prototype-data.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const prototypeDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/prototypes",
);
const harnessSource = readFileSync(
  resolve(prototypeDir, "customer-management.tsx"),
  "utf8",
);
const partsSource = readFileSync(
  resolve(prototypeDir, "-customer-management/prototype-parts.tsx"),
  "utf8",
);
const ledgerSource = readFileSync(
  resolve(prototypeDir, "-customer-management/customer-ledger.tsx"),
  "utf8",
);
const boardSource = readFileSync(
  resolve(prototypeDir, "-customer-management/connection-board.tsx"),
  "utf8",
);
const workbenchSource = readFileSync(
  resolve(prototypeDir, "-customer-management/customer-workbench.tsx"),
  "utf8",
);
const pickerSource = readFileSync(
  resolve(prototypeDir, "-customer-management/prototype.css"),
  "utf8",
);

describe("customer management prototype", () => {
  it("keeps the exploration isolated behind three URL-selectable variants", () => {
    assert.match(
      harnessSource,
      /createFileRoute\(\s*"\/_authenticated\/prototypes\/customer-management",?\s*\)/,
    );
    assert.match(harnessSource, /name: "고객 원장"/);
    assert.match(harnessSource, /name: "연결 보드"/);
    assert.match(harnessSource, /name: "고객 워크벤치"/);
    assert.match(harnessSource, /parsed >= 1 && parsed <= 3 \? parsed : 1/);
    assert.doesNotMatch(harnessSource, /buyer-requirements|contacts\/index/);
  });

  it("uses the standard picker with keyboard switching and no static replay control", () => {
    assert.match(harnessSource, /className="proto-picker"/);
    assert.match(harnessSource, /className="proto-picker-highlight"/);
    assert.match(harnessSource, /className="proto-picker-item"/);
    assert.match(harnessSource, /event\.key === "ArrowRight"/);
    assert.match(harnessSource, /event\.key === "ArrowLeft"/);
    assert.match(harnessSource, /INPUT\|TEXTAREA\|SELECT/);
    assert.doesNotMatch(harnessSource, /proto-picker-replay|proto-picker-divider/);
    assert.match(
      pickerSource,
      /transform 250ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/,
    );
  });

  it("treats contacts as the complete address book and customers as active brokerage intents", () => {
    assert.match(partsSource, /to="\/contacts"/);
    assert.match(partsSource, /입주자·관계자는 전체 연락처에서 관리/);
    assert.equal(CUSTOMER_MANAGEMENT_DEMO.length, 6);
    assert.equal(
      CUSTOMER_MANAGEMENT_DEMO.some((customer) => /입주자|법무사|세무사/.test(customer.name)),
      false,
    );
    assert.ok(
      CUSTOMER_MANAGEMENT_DEMO.every(
        (customer) => customer.demands.length > 0 || customer.supplies.length > 0,
      ),
    );
  });

  it("includes demand-only, supply-only, and linked two-sided customers", () => {
    const modes = new Set(CUSTOMER_MANAGEMENT_DEMO.map(getCustomerMode));
    assert.deepEqual(modes, new Set(["demand", "both", "supply"]));
    assert.ok(
      CUSTOMER_MANAGEMENT_DEMO.some(
        (customer) =>
          customer.demands.some((demand) => demand.transactionType === "매매") &&
          customer.demands.some((demand) => demand.transactionType === "전세"),
      ),
    );
    assert.ok(
      CUSTOMER_MANAGEMENT_DEMO.some((customer) =>
        customer.steps.some((step) => step.label === "전세보증금 반환"),
      ),
    );
  });

  it("makes the ledger a dense customer-level view with an expandable connection flow", () => {
    for (const label of [
      "고객",
      "구하는 조건",
      "내놓은 물건",
      "거래 준비",
      "다음 액션",
      "최근 연락",
    ]) {
      assert.match(ledgerSource, new RegExp(label));
    }
    assert.match(ledgerSource, /aria-label="고객 유형 필터"/);
    assert.match(ledgerSource, /aria-expanded=\{isExpanded\}/);
    assert.match(ledgerSource, /출발점 · 내놓는 쪽/);
    assert.match(ledgerSource, /자금 · 선행 조건/);
    assert.match(ledgerSource, /목표 · 구하는 쪽/);
  });

  it("makes the board visibly compare customer relationship modes", () => {
    assert.match(boardSource, /mode: "demand"/);
    assert.match(boardSource, /mode: "both"/);
    assert.match(boardSource, /mode: "supply"/);
    assert.match(boardSource, /grid min-h-full grid-cols-3/);
    assert.match(boardSource, /<ConnectionInspector/);
    assert.match(boardSource, /onClose=\{\(\) => setSelectedId\(null\)\}/);
    assert.match(boardSource, /onClick=\{onToggleAction\}/);
  });

  it("makes the workbench a functional master-detail customer workspace", () => {
    assert.match(workbenchSource, /grid-cols-\[300px_minmax\(0,1fr\)\]/);
    assert.match(workbenchSource, /onClick=\{\(\) => selectCustomer\(customer\)\}/);
    assert.match(workbenchSource, /title="구하는 조건"/);
    assert.match(workbenchSource, /title="내놓은 물건"/);
    assert.match(workbenchSource, /거래 연결 계획/);
    assert.match(workbenchSource, /toggleAction\(selected\.id\)/);
    assert.match(workbenchSource, /완료됨\s*· 다시 열기/);
  });
});
