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
  MY_ADS_READ_ONLY_STATE,
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
    status: "active",
    source,
    channel: "esiljang",
    advertisedPrice: null,
    advertisedDeposit: 2000,
    advertisedMonthlyRent: 80,
    comparison: null,
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
  return { ...MY_ADS_READ_ONLY_STATE, ...patch };
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
    for (const name of ["drafts", "editingCell", "expandedIds", "onCommitEdit"]) {
      assert.doesNotMatch(buildColumnsSource, new RegExp(`\\b${name}\\b`), name);
    }
  });

  it("keeps the table read-only until a mode is entered, then turns the cells into buttons", () => {
    const columns = buildColumns({ areAdvertisementSourceColumnsCollapsed: false });
    const price = columns.find((column) => column.id === "price");
    const rent = columns.find((column) => column.id === "monthlyRent");
    assert.ok(price && rent);
    const advertisement = monthlyAd();

    // 평소: 누를 것도 입력칸도 없다
    const idle = renderCell(price, advertisement, state());
    assert.doesNotMatch(idle, /<input|<button/);

    // 기록 수정 · 변경 요청에 들어오면 칸이 버튼이 된다 (이름으로 무엇을 하는지 알린다)
    assert.match(
      renderCell(price, advertisement, state({ mode: "edit" })),
      /<button[^>]*data-my-ads-cell="primary"[^>]*aria-label="고덕아르테온 103동 1503호 보증금 고치기"/,
    );
    assert.match(
      renderCell(rent, advertisement, state({ mode: "request" })),
      /<button[^>]*data-my-ads-cell="monthlyRent"[^>]*aria-label="고덕아르테온 103동 1503호 월세 변경 요청"/,
    );

    // 누른 칸만 입력칸이 된다. 휠 · 위아래 화살표로 값이 바뀌는 type="number"가 아니라 숫자 자판만 띄우는 텍스트 칸
    const editing = renderCell(
      price,
      advertisement,
      state({ mode: "edit", editingCell: { id: advertisement.id, field: "primary" } }),
    );
    assert.match(editing, /<input[^>]*type="text"[^>]*inputMode="numeric"|<input[^>]*inputMode="numeric"[^>]*type="text"/);
    assert.match(editing, /value="2000"/);
    assert.match(editing, /aria-label="고덕아르테온 103동 1503호 보증금 \(만원\)"/);
    assert.doesNotMatch(
      renderCell(rent, advertisement, state({ mode: "edit", editingCell: { id: advertisement.id, field: "primary" } })),
      /<input/,
    );
  });

  it("strikes a requested value through without writing the new value into the cell", () => {
    const columns = buildColumns({ areAdvertisementSourceColumnsCollapsed: false });
    const price = columns.find((column) => column.id === "price");
    const rent = columns.find((column) => column.id === "monthlyRent");
    const request = columns.find((column) => column.id === "request");
    assert.ok(price && rent && request);
    const advertisement = monthlyAd();
    const drafting = state({ mode: "request", drafts: { [advertisement.id]: { monthlyRent: 95 } } });

    // 요청한 칸(월세)에만 줄이 그어지고, 바꿀 값(95)은 칸에 나오지 않는다
    const rentHtml = renderCell(rent, advertisement, drafting);
    assert.match(rentHtml, /line-through/);
    assert.doesNotMatch(rentHtml, /95/);
    assert.doesNotMatch(renderCell(price, advertisement, drafting), /line-through/);
    // 요청 칸은 있다는 표시만 한다
    const marker = renderCell(request, advertisement, drafting);
    assert.match(marker, /data-my-ads-request-marker="draft"/);
    assert.match(marker, /작성 중/);
    assert.doesNotMatch(marker, /95|→/);

    // 변경 요청을 다시 고치려고 열면 적어 둔 값에서 시작한다
    assert.match(
      renderCell(rent, advertisement, { ...drafting, editingCell: { id: advertisement.id, field: "monthlyRent" } }),
      /value="95"/,
    );

    // 보낸 요청: 가격 요청이 건드린 칸(보증금)에 줄, 요청 칸은 "요청 중"
    const pending = {
      ...advertisement,
      changeRequests: [
        { id: "r1", kind: "price", fromValue: { deposit: 2000 }, toValue: { deposit: 1500 }, task: { id: "t1", status: "pending", assignedToId: null, updatedAt: "" } },
      ],
    } as unknown as Ad;
    assert.match(renderCell(price, pending, state()), /line-through/);
    assert.doesNotMatch(renderCell(rent, pending, state()), /line-through/);
    const pendingMarker = renderCell(request, pending, state());
    assert.match(pendingMarker, /data-my-ads-request-marker="pending"/);
    assert.match(pendingMarker, /요청 중/);
    // 칸에 보이는 글에는 내용이 없다 (올렸을 때의 풍선말에만 있다)
    assert.equal(pendingMarker.replace(/<[^>]*>/g, ""), "요청 중");
  });

  it("does not let a request be drafted where it cannot be sent", () => {
    const [price] = buildColumns({ areAdvertisementSourceColumnsCollapsed: true }).filter(
      (column) => column.id === "price",
    );
    // 직접 입력한 광고는 요청할 곳이 없다. 기록 수정으로는 고칠 수 있다.
    const manual = monthlyAd("manual");
    const blocked = renderCell(price, manual, state({ mode: "request" }));
    assert.doesNotMatch(blocked, /<button|<input/);
    assert.match(blocked, /직접 입력한 광고는 요청할 곳이 없습니다/);
    assert.match(renderCell(price, manual, state({ mode: "edit" })), /<button/);

    // 같은 종류의 요청이 걸려 있으면 또 요청하지 못한다
    const pending = {
      ...monthlyAd(),
      changeRequests: [
        { id: "r1", kind: "price", fromValue: {}, toValue: { deposit: 1500 }, task: { id: "t1", status: "in_progress", assignedToId: null, updatedAt: "" } },
      ],
    } as unknown as Ad;
    const again = renderCell(price, pending, state({ mode: "request" }));
    assert.doesNotMatch(again, /<button/);
    assert.match(again, /처리되지 않은 가격 변경 요청이 이미 있습니다/);
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
