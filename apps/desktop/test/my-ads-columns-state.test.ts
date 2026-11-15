import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { buildColumns } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-columns";
import {
  MyAdsTableStateContext,
  type MyAdsTableRowState,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-table-context";
import { sanitizeManwonInput } from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-drafts";

const testDir = dirname(fileURLToPath(import.meta.url));
const pagePath = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/properties/naver-my-ads.tsx",
);
const columnsPath = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-columns.tsx",
);

type Ad = ListingAdvertisementWithListing;

function monthlyAd(source: "cp_sync" | "manual" = "cp_sync"): Ad {
  return {
    id: "ad-1",
    source,
    channel: "esiljang",
    advertisedPrice: null,
    advertisedDeposit: 2000,
    advertisedMonthlyRent: 80,
    officeAdvertisementGroup: null,
    listing: {
      transactionType: "monthly",
      property: {
        site: { name: "고덕아르테온" },
        unit: { name: "1503호", dong: { name: "103동" } },
      },
    },
  } as unknown as Ad;
}

function state(patch: Partial<MyAdsTableRowState> = {}): MyAdsTableRowState {
  return {
    expandedIds: new Set(),
    selectedIds: new Set(),
    inlineEdits: {},
    onToggleExpanded: () => undefined,
    onInlineEditChange: () => undefined,
    onInlineEditReset: () => undefined,
    ...patch,
  };
}

function renderCell(
  column: ColumnDef<Ad, unknown>,
  advertisement: Ad,
  value: MyAdsTableRowState,
) {
  const cell = column.cell;
  assert.equal(typeof cell, "function");
  const context = { row: { original: advertisement } } as unknown as CellContext<
    Ad,
    unknown
  >;
  const element = (cell as (props: CellContext<Ad, unknown>) => ReactNode)(context);
  return renderToStaticMarkup(
    createElement(MyAdsTableStateContext.Provider, { value }, element),
  );
}

describe("my ads column definitions stay stable while editing", () => {
  it("builds columns from the column set only, never from selection, expansion or inline edits", () => {
    const page = readFileSync(pagePath, "utf8");
    // 열 정의가 바뀌면 TanStack이 모든 칸을 새로 마운트해 입력 중인 가격 칸이 닫힌다(포커스 빠짐).
    assert.match(
      page,
      /const columns = useMemo\(\s*\(\) => buildColumns\(\{ areAdvertisementSourceColumnsCollapsed \}\),\s*\[areAdvertisementSourceColumnsCollapsed\],\s*\)/,
    );
    assert.match(page, /<MyAdsTableStateContext\.Provider value=\{tableRowState\}>/);
    const columns = readFileSync(columnsPath, "utf8");
    const buildColumnsSource = columns.slice(columns.indexOf("export function buildColumns"));
    for (const name of ["inlineEdits", "selectedRowIds", "expandedIds", "onInlineEditChange"]) {
      assert.doesNotMatch(buildColumnsSource, new RegExp(`\\b${name}\\b`), name);
    }
  });

  it("lets the same price and rent cells follow selection and drafts through context", () => {
    const columns = buildColumns({ areAdvertisementSourceColumnsCollapsed: false });
    const price = columns.find((column) => column.id === "price");
    const rent = columns.find((column) => column.id === "monthlyRent");
    assert.ok(price && rent);
    const advertisement = monthlyAd();

    const unselected = renderCell(price, advertisement, state());
    assert.doesNotMatch(unselected, /<input/);

    const selected = renderCell(
      price,
      advertisement,
      state({ selectedIds: new Set([advertisement.id]) }),
    );
    // 휠·위아래 화살표로 값이 바뀌는 type="number"가 아니라 숫자 자판만 띄우는 텍스트 칸
    assert.match(selected, /<input[^>]*type="text"[^>]*inputMode="numeric"|<input[^>]*inputMode="numeric"[^>]*type="text"/);
    assert.match(selected, /value="2000"/);
    assert.match(selected, /aria-label="고덕아르테온 103동 1503호 보증금"/);

    const drafted = renderCell(
      rent,
      advertisement,
      state({
        selectedIds: new Set([advertisement.id]),
        inlineEdits: {
          [advertisement.id]: {
            advertisedPrice: "",
            advertisedDeposit: "2000",
            advertisedMonthlyRent: "95",
            republishAfterSave: true,
          },
        },
      }),
    );
    assert.match(drafted, /value="95"/);
  });

  it("keeps manual advertisements read-only in the table even when selected", () => {
    const [price] = buildColumns({ areAdvertisementSourceColumnsCollapsed: true }).filter(
      (column) => column.id === "price",
    );
    const advertisement = monthlyAd("manual");
    const html = renderCell(
      price,
      advertisement,
      state({ selectedIds: new Set([advertisement.id]) }),
    );
    assert.doesNotMatch(html, /<input/);
  });

  it("reads the expansion of the ranking toggle from context", () => {
    const ranking = buildColumns({ areAdvertisementSourceColumnsCollapsed: false }).find(
      (column) => column.id === "ranking",
    );
    assert.ok(ranking);
    const advertisement = monthlyAd();
    assert.match(renderCell(ranking, advertisement, state()), /aria-expanded="false"/);
    const expanded = renderCell(
      ranking,
      advertisement,
      state({ expandedIds: new Set([advertisement.id]) }),
    );
    assert.match(expanded, /aria-expanded="true"/);
    assert.match(expanded, /data-my-ads-expand-toggle="ad-1"/);
  });
});

describe("my ads inline money input", () => {
  it("accepts whole manwon digits and rejects anything that would change the amount", () => {
    assert.equal(sanitizeManwonInput("15,000"), "15000");
    assert.equal(sanitizeManwonInput(" 2 000 "), "2000");
    assert.equal(sanitizeManwonInput("２０００"), "2000");
    assert.equal(sanitizeManwonInput(""), "");
    // 소수점·음수·문자가 섞이면 값을 바꾸지 않는다(12.5 → 125처럼 크기가 바뀌지 않게)
    for (const value of ["12.5", "-300", "2000a", "1e3"]) {
      assert.equal(sanitizeManwonInput(value), null, value);
    }
  });
});
