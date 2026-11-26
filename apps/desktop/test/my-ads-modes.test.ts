import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import {
  amountProblem,
  buildRecordEdit,
  draftLines,
  draftToRequests,
  editBlockReason,
  flagBlockReason,
  isValueAsked,
  parseManwonCell,
  requestedCellDisplay,
  withDraftValue,
  withoutSentActions,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-modes";

type Ad = ListingAdvertisementWithListing;
const ad = (patch: Record<string, unknown> = {}): Ad =>
  ({
    id: "ad-1",
    status: "active",
    channel: "esiljang",
    transactionType: "monthly",
    advertisedPrice: null,
    advertisedDeposit: 5000,
    advertisedMonthlyRent: 250,
    floorExposure: "exact",
    lastSyncedAt: "2026-11-15T00:00:00.000Z",
    comparison: null,
    changeRequests: [],
    ...patch,
  }) as unknown as Ad;
const pending = (
  action: "publish" | "update" | "readvertise" | "takedown",
  targetValue: Record<string, unknown> = {},
) => ({
  id: `r-${action}`,
  action,
  status: "requested",
  baseSnapshot: {},
  targetValue,
  task: { id: "t", status: "pending", assignedToId: null, updatedAt: "" },
});
const shared = { memo: "메모", dueDate: null, assignedToId: null };

describe("my ads edit and request modes", () => {
  it("reads a typed amount without changing its size", () => {
    assert.equal(parseManwonCell("315,000"), 315000);
    assert.equal(parseManwonCell("３１５０００"), 315000);
    assert.equal(parseManwonCell("12.5"), null);
    assert.equal(parseManwonCell("삼십억"), null);
    assert.equal(parseManwonCell(""), null);
    // 월세의 보증금만 0이 될 수 있다
    assert.equal(amountProblem(ad(), "primary", 0), null);
    assert.match(amountProblem(ad(), "monthlyRent", 0) ?? "", /0이 될 수 없습니다/);
    assert.match(amountProblem(ad({ transactionType: "sale" }), "primary", 0) ?? "", /0이 될 수 없습니다/);
    assert.match(amountProblem(ad(), "primary", null) ?? "", /숫자로/);
  });

  it("keeps a draft only for values that differ from the advertisement", () => {
    const draft = withDraftValue(ad(), undefined, "monthlyRent", 240);
    assert.deepEqual(draft, { monthlyRent: 240 });
    // 지금 값으로 되돌리면 그 칸의 초안이 빠지고, 남는 것이 없으면 초안 자체가 없어진다
    assert.equal(withDraftValue(ad(), draft ?? undefined, "monthlyRent", 250), null);
    assert.deepEqual(withDraftValue(ad(), { readvertise: true }, "primary", 5000), { readvertise: true });
  });

  it("merges price, rent and floorExposure into one request per advertisement", () => {
    const requests = draftToRequests(
      ad(),
      { primary: 4000, monthlyRent: 240, floorExposure: "band", readvertise: true },
      shared,
    );
    assert.deepEqual(requests, [
      {
        advertisementId: "ad-1",
        listingId: null,
        channel: "esiljang",
        action: "readvertise",
        targetValue: { deposit: 4000, monthlyRent: 240, floorExposure: "band" },
        ...shared,
      },
    ]);
    assert.deepEqual(
      draftToRequests(ad({ transactionType: "sale", advertisedPrice: 320000 }), { primary: 315000 }, shared)[0],
      {
        advertisementId: "ad-1",
        listingId: null,
        channel: "esiljang",
        action: "update",
        targetValue: { price: 315000 },
        ...shared,
      },
    );
  });

  it("allows manual ads to draft requests while blocking duplicate open requests and invalid inline edits", () => {
    const manual = ad({ lastSyncedAt: null });
    assert.equal(editBlockReason(manual, "primary", "request"), null);
    assert.equal(editBlockReason(manual, "primary", "edit"), null);
    assert.equal(flagBlockReason(manual, "takedown"), null);
    // 내리기를 골라 둔 줄은 가격 · 층 노출을 바꿔 달라고 할 수 없다 (기록 수정은 그대로 된다)
    assert.match(
      editBlockReason(manual, "primary", "request", { takedown: true }) ?? "",
      /내리기/,
    );
    assert.equal(editBlockReason(manual, "primary", "request", { readvertise: true }), null);
    assert.equal(editBlockReason(manual, "primary", "edit", { takedown: true }), null);
    assert.deepEqual(
      draftToRequests(manual, { primary: 4000, takedown: true }, shared).map((r) => r.action),
      ["takedown"],
    );

    // 열린 변경 요청이 이미 있으면 추가 요청을 막는다
    const asked = ad({ changeRequests: [pending("update", { deposit: 4000 })] });
    assert.match(editBlockReason(asked, "monthlyRent", "request") ?? "", /처리 중인 요청이 이미/);
    assert.match(editBlockReason(asked, "floorExposure", "request") ?? "", /처리 중인 요청이 이미/);
    assert.deepEqual(
      draftToRequests(asked, { monthlyRent: 240, floorExposure: "band" }, shared),
      [],
    );
    assert.match(flagBlockReason(ad({ changeRequests: [pending("readvertise")] }), "readvertise") ?? "", /처리 중인 요청이 이미/);

    // 층 노출은 읽어 온 값이라 기록 수정으로 고치지 않는다
    assert.match(editBlockReason(ad(), "floorExposure", "edit") ?? "", /광고 요청으로/);
    assert.match(editBlockReason(ad({ transactionType: "sale" }), "monthlyRent", "edit") ?? "", /월세 광고가 아닙니다/);
  });

  it("strikes only the values a request touches", () => {
    assert.equal(isValueAsked(ad(), { monthlyRent: 240 }, "monthlyRent"), true);
    assert.equal(isValueAsked(ad(), { monthlyRent: 240 }, "primary"), false);
    const asked = ad({ changeRequests: [pending("update", { deposit: 4000 })] });
    assert.equal(isValueAsked(asked, undefined, "primary"), true);
    assert.equal(isValueAsked(asked, undefined, "monthlyRent"), false);
    assert.equal(isValueAsked(ad({ changeRequests: [pending("update", { floorExposure: "band" })] }), undefined, "floorExposure"), true);
    // 검증 끝난 요청은 긋지 않는다
    const done = ad({ changeRequests: [{ ...pending("update", { deposit: 4000 }), status: "verified" }] });
    assert.equal(isValueAsked(done, undefined, "primary"), false);
  });

  it("describes drafts for the requests tab and builds a guarded record edit", () => {
    assert.deepEqual(
      draftLines(ad(), { primary: 4000, takedown: true }).map((line) => `${line.label}: ${line.text}`),
      ["보증금: 5,000만 → 4,000만", "내리기: 광고 내리기"],
    );
    // 화면이 보고 있던 값을 함께 보낸다
    assert.deepEqual(buildRecordEdit(ad(), "monthlyRent", 240), {
      advertisedMonthlyRent: 240,
      expected: { advertisedMonthlyRent: 250 },
    });
    assert.deepEqual(buildRecordEdit(ad({ transactionType: "sale", advertisedPrice: 320000 }), "primary", 315000), {
      advertisedPrice: 315000,
      expected: { advertisedPrice: 320000 },
    });
  });

  it("drops only the actions that were already created after a partial send", () => {
    assert.deepEqual(
      withoutSentActions({ primary: 4000, monthlyRent: 240, readvertise: true }, ["update"]),
      { readvertise: true },
    );
    assert.deepEqual(
      withoutSentActions({ floorExposure: "band", takedown: true }, ["update"]),
      { takedown: true },
    );
    assert.equal(withoutSentActions({ primary: 4000 }, ["update"]), null);
  });

  it("formats requestedCellDisplay for drafts first and falls back to open server changeRequests", () => {
    const withPending = ad({
      changeRequests: [pending("update", { deposit: 4500, monthlyRent: 220, floorExposure: "band" })],
    });
    assert.deepEqual(requestedCellDisplay(withPending, undefined, "primary"), {
      kind: "pending",
      text: "4,500만",
    });
    assert.deepEqual(requestedCellDisplay(withPending, undefined, "monthlyRent"), {
      kind: "pending",
      text: "220만",
    });
    assert.deepEqual(requestedCellDisplay(withPending, undefined, "floorExposure"), {
      kind: "pending",
      text: "고·중·저",
    });
    assert.deepEqual(requestedCellDisplay(withPending, { primary: 4000 }, "primary"), {
      kind: "draft",
      text: "4,000만",
    });

    const takedownOnly = ad({
      changeRequests: [pending("takedown", {})],
    });
    assert.equal(requestedCellDisplay(takedownOnly, undefined, "primary"), null);

    const jeonseWithPending = ad({
      transactionType: "jeonse",
      advertisedDeposit: 85000,
      advertisedMonthlyRent: null,
      changeRequests: [pending("readvertise", { deposit: 82000 })],
    });
    assert.deepEqual(requestedCellDisplay(jeonseWithPending, undefined, "primary"), {
      kind: "pending",
      text: "8억 2,000만",
    });
  });
});
