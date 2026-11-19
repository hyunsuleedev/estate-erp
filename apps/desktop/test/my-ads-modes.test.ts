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
  withDraftValue,
  withoutSentKinds,
} from "../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-modes";

type Ad = ListingAdvertisementWithListing;
const ad = (patch: Record<string, unknown> = {}): Ad =>
  ({
    id: "ad-1",
    status: "active",
    source: "cp_sync",
    channel: "esiljang",
    transactionType: "monthly",
    advertisedPrice: null,
    advertisedDeposit: 5000,
    advertisedMonthlyRent: 250,
    floorExposure: "exact",
    comparison: null,
    changeRequests: [],
    ...patch,
  }) as unknown as Ad;
const pending = (kind: string, toValue: Record<string, unknown> = {}) => ({
  id: `r-${kind}`,
  kind,
  fromValue: {},
  toValue,
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

  it("sends price and rent as one price request, and one request per kind", () => {
    const requests = draftToRequests(
      ad(),
      { primary: 4000, monthlyRent: 240, floorExposure: "band", readvertise: true },
      shared,
    );
    assert.deepEqual(requests, [
      { kind: "price", toValue: { deposit: 4000, monthlyRent: 240 }, ...shared },
      { kind: "floor_exposure", toValue: { floorExposure: "band" }, ...shared },
      { kind: "readvertise", ...shared },
    ]);
    // 매매는 보증금이 아니라 매매가로 보낸다
    assert.deepEqual(
      draftToRequests(ad({ transactionType: "sale", advertisedPrice: 320000 }), { primary: 315000 }, shared)[0].toValue,
      { price: 315000 },
    );
  });

  it("blocks requests that could not be sent, both when drafting and when sending", () => {
    const manual = ad({ source: "manual" });
    assert.match(editBlockReason(manual, "primary", "request") ?? "", /직접 입력한 광고/);
    assert.equal(editBlockReason(manual, "primary", "edit"), null);
    assert.match(flagBlockReason(manual, "takedown") ?? "", /직접 입력한 광고/);
    assert.deepEqual(draftToRequests(manual, { primary: 4000, takedown: true }, shared), []);

    // 가격과 월세는 같은 종류다: 가격 요청이 걸려 있으면 월세도 또 요청하지 못한다
    const asked = ad({ changeRequests: [pending("price", { deposit: 4000 })] });
    assert.match(editBlockReason(asked, "monthlyRent", "request") ?? "", /가격 변경 요청이 이미/);
    assert.equal(editBlockReason(asked, "floorExposure", "request"), null);
    assert.deepEqual(
      draftToRequests(asked, { monthlyRent: 240, floorExposure: "band" }, shared).map((request) => request.kind),
      ["floor_exposure"],
    );
    assert.match(flagBlockReason(ad({ changeRequests: [pending("readvertise")] }), "readvertise") ?? "", /재광고 요청이 이미/);

    // 층 노출은 읽어 온 값이라 기록 수정으로 고치지 않는다
    assert.match(editBlockReason(ad(), "floorExposure", "edit") ?? "", /변경 요청으로/);
    assert.match(editBlockReason(ad({ transactionType: "sale" }), "monthlyRent", "edit") ?? "", /월세 광고가 아닙니다/);
  });

  it("strikes only the values a request touches", () => {
    assert.equal(isValueAsked(ad(), { monthlyRent: 240 }, "monthlyRent"), true);
    assert.equal(isValueAsked(ad(), { monthlyRent: 240 }, "primary"), false);
    const asked = ad({ changeRequests: [pending("price", { deposit: 4000 })] });
    assert.equal(isValueAsked(asked, undefined, "primary"), true);
    assert.equal(isValueAsked(asked, undefined, "monthlyRent"), false);
    assert.equal(isValueAsked(ad({ changeRequests: [pending("floor_exposure", { floorExposure: "band" })] }), undefined, "floorExposure"), true);
    // 끝난 요청은 긋지 않는다
    const done = ad({ changeRequests: [{ ...pending("price", { deposit: 4000 }), task: { id: "t", status: "completed", assignedToId: null, updatedAt: "" } }] });
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

  it("drops only the kinds that were already created after a partial send", () => {
    // 가격 요청은 만들어지고 재광고에서 끊겼다 — 다시 보낼 것은 재광고뿐이다
    assert.deepEqual(
      withoutSentKinds({ primary: 4000, monthlyRent: 240, readvertise: true }, ["price"]),
      { readvertise: true },
    );
    assert.deepEqual(
      withoutSentKinds({ floorExposure: "band", takedown: true }, ["floor_exposure"]),
      { takedown: true },
    );
    assert.equal(withoutSentKinds({ primary: 4000 }, ["price"]), null);
  });
});
