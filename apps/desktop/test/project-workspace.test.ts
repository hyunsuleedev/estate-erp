import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { ProjectStepDeal } from "@estate-erp/api-client";
import { matchTableColumns } from "../src/renderer/routes/_authenticated/properties/-components/property-match-table-state";
import {
  BUYER_STEP_COLUMNS,
  compactMatchPanelCss,
  isAddressOnlyStepTitle,
  isDefaultBuyerStepTitle,
  listingStepColumns,
  matchPanelFitFor,
  MATCH_PANEL_HIDDEN,
  pickStepTableColumns,
  siteNameFromPlaceLabel,
  LISTING_GRID,
  REQUIREMENT_GRID,
  afterDiscardedPlan,
  balanceShownInSchedule,
  canApplyRefreshedPlan,
  isSaveSettled,
  isSaveSuccess,
  listingRowSignature,
  projectFollowerKeysAfterSave,
  projectPlanScope,
  pickPlanDropTarget,
  collectProjectDeals,
  countMatchStages,
  describePlanSummary,
  mergeProjectFlow,
  planDropForMove,
  planOrderAfterDrop,
  planStageGroups,
  projectRemovalFor,
  projectTabCounts,
  splitProjectTasks,
  toDueDateKey,
} from "../src/renderer/routes/_authenticated/projects/-project-model";

describe("project workspace — tasks", () => {
  const task = (
    id: string,
    status: string,
    dueDate: string | null,
    createdAt = "2026-11-20T00:00:00.000Z",
    updatedAt?: string,
  ) => ({ id, status, dueDate, createdAt, updatedAt: updatedAt ?? createdAt });

  it("lists open tasks by due date first, undated last, then by when they were written", () => {
    const { open } = splitProjectTasks([
      task("nodue", "pending", null, "2026-11-01T00:00:00.000Z"),
      task("late", "in_progress", "2026-11-25T00:00:00.000Z"),
      task("soon", "pending", "2026-11-21T00:00:00.000Z"),
      task("soon-later-written", "pending", "2026-11-21T00:00:00.000Z", "2026-11-21T09:00:00.000Z"),
    ]);
    assert.deepEqual(
      open.map((item) => item.id),
      ["soon", "soon-later-written", "late", "nodue"],
    );
  });

  it("folds completed tasks apart (most recently finished first) and drops cancelled ones", () => {
    const { open, done } = splitProjectTasks([
      task("a", "completed", null, "2026-11-01T00:00:00.000Z", "2026-11-10T00:00:00.000Z"),
      task("b", "completed", null, "2026-11-01T00:00:00.000Z", "2026-11-12T00:00:00.000Z"),
      task("c", "cancelled", null),
      task("d", "pending", null),
    ]);
    assert.deepEqual(open.map((item) => item.id), ["d"]);
    assert.deepEqual(done.map((item) => item.id), ["b", "a"]);
  });

  it("keeps a task just checked in its place (so the next row does not slide under the cursor)", () => {
    const tasks = [
      task("first", "completed", "2026-11-21T00:00:00.000Z"),
      task("second", "pending", "2026-11-22T00:00:00.000Z"),
      task("old", "completed", null),
    ];
    const { open, done } = splitProjectTasks(tasks, new Set(["first"]));
    assert.deepEqual(open.map((item) => item.id), ["first", "second"]);
    assert.deepEqual(done.map((item) => item.id), ["old"]);
  });

  it("sends the due date as the local calendar day (the task screen's form)", () => {
    assert.equal(toDueDateKey(new Date(2026, 10, 3)), "2026-11-03");
    assert.equal(toDueDateKey(new Date(2027, 0, 20)), "2027-01-20");
  });
});

describe("project workspace — one flow of consultations and comments", () => {
  const person = (name: string) => ({ name });
  const consultation = (id: string, createdAt: string) => ({ id, createdAt });
  const comment = (id: string, createdAt: string) => ({ id, createdAt });

  it("merges both newest first and keeps each kind", () => {
    const result = mergeProjectFlow({
      consultations: [
        { person: person("김민준"), items: [consultation("c1", "2026-11-20T10:00:00Z")], hasMore: false },
      ],
      comments: { items: [comment("m1", "2026-11-21T10:00:00Z"), comment("m2", "2026-11-19T10:00:00Z")], hasMore: false },
      filter: "all",
    });
    assert.deepEqual(
      result.items.map((item) => item.id),
      ["comment:m1", "consultation:c1", "comment:m2"],
    );
    assert.equal(result.hasMore, false);
    assert.equal(result.heldBack, 0);
  });

  it("filters to consultations or comments only", () => {
    const input = {
      consultations: [{ person: person("A"), items: [consultation("c1", "2026-11-20T10:00:00Z")], hasMore: false }],
      comments: { items: [comment("m1", "2026-11-21T10:00:00Z")], hasMore: true },
    };
    const consultations = mergeProjectFlow({ ...input, filter: "consultation" });
    assert.deepEqual(consultations.items.map((item) => item.kind), ["consultation"]);
    // 코멘트가 더 있어도 상담만 볼 때는 더 받을 것이 없다
    assert.equal(consultations.hasMore, false);
    const comments = mergeProjectFlow({ ...input, filter: "comment" });
    assert.deepEqual(comments.items.map((item) => item.kind), ["comment"]);
    assert.equal(comments.hasMore, true);
  });

  it("holds back records older than what a still-paging source has loaded", () => {
    // 코멘트는 11.20까지만 받았고 더 있다. 그보다 오래된 상담(11.10)을 지금 보여 주면 그 사이 코멘트가
    // 빠진 채로 이어진다 — 더 보기 전까지 숨긴다.
    const result = mergeProjectFlow({
      consultations: [
        {
          person: person("A"),
          items: [consultation("new", "2026-11-22T10:00:00Z"), consultation("old", "2026-11-10T10:00:00Z")],
          hasMore: false,
        },
      ],
      comments: { items: [comment("m1", "2026-11-21T10:00:00Z"), comment("m2", "2026-11-20T10:00:00Z")], hasMore: true },
      filter: "all",
    });
    assert.deepEqual(
      result.items.map((item) => item.id),
      ["consultation:new", "comment:m1", "comment:m2"],
    );
    assert.equal(result.hasMore, true);
    assert.equal(result.heldBack, 1);
  });

  it("uses the latest boundary among sources that still have more", () => {
    const result = mergeProjectFlow({
      consultations: [
        { person: person("A"), items: [consultation("a1", "2026-11-18T00:00:00Z")], hasMore: true },
        { person: person("B"), items: [consultation("b1", "2026-11-15T00:00:00Z")], hasMore: true },
      ],
      comments: { items: [comment("m1", "2026-11-16T00:00:00Z")], hasMore: false },
      filter: "all",
    });
    // A가 11.18까지만 받았으므로 11.18보다 오래된 것은 아직 보이지 않는다
    assert.deepEqual(result.items.map((item) => item.id), ["consultation:a1"]);
    assert.equal(result.heldBack, 2);
  });

  it("shows a consultation once even if two people return it", () => {
    const shared = consultation("same", "2026-11-20T00:00:00Z");
    const result = mergeProjectFlow({
      consultations: [
        { person: person("A"), items: [shared], hasMore: false },
        { person: person("B"), items: [shared], hasMore: false },
      ],
      comments: { items: [], hasMore: false },
      filter: "all",
    });
    assert.equal(result.items.length, 1);
    assert.equal(result.items[0].kind === "consultation" && result.items[0].person.name, "A");
  });
});

describe("project workspace — view tab counts", () => {
  const deal = (id: string, isCancelled = false) => ({ id, isCancelled }) as ProjectStepDeal;

  it("counts open matches of every intake and each live deal once", () => {
    const counts = projectTabCounts([
      { listingIntake: { matchCount: 3 } as never, buyerIntake: null, deal: deal("d1") },
      { listingIntake: null, buyerIntake: { matchCount: 2 } as never, deal: null },
      // 거래 단계가 같은 거래를 또 가리킨다
      { listingIntake: null, buyerIntake: null, deal: deal("d1") },
      { listingIntake: null, buyerIntake: null, deal: deal("d2", true) },
    ]);
    assert.deepEqual(counts, { matches: 5, deals: 1 });
  });

  it("is zero for an empty project (the tab shows no number)", () => {
    assert.deepEqual(projectTabCounts([]), { matches: 0, deals: 0 });
  });
});

describe("project workspace — deals of a project", () => {
  const deal = (id: string, isCancelled = false) => ({ id, isCancelled }) as ProjectStepDeal;
  const step = (
    id: string,
    sortOrder: number,
    current: ProjectStepDeal | null,
    cancelled: ProjectStepDeal | null = null,
  ) => ({ id, title: id, sortOrder, deal: current, cancelledDeal: cancelled });

  it("puts live deals first in plan order, cancelled ones after, each once", () => {
    const deals = collectProjectDeals([
      step("b", 2, deal("d2"), deal("x1", true)),
      step("a", 1, deal("d1")),
      step("c", 3, deal("d1")),
    ]);
    assert.deepEqual(
      deals.map((item) => [item.deal.id, item.step.id]),
      [
        ["d1", "a"],
        ["d2", "b"],
        ["x1", "b"],
      ],
    );
  });
});

describe("project workspace — match summary", () => {
  it('reads like "협상 1 · 임장 1": most advanced first, closed matches not counted', () => {
    const stages = countMatchStages([
      { stage: "viewing" },
      { stage: "negotiating" },
      { stage: "closed" },
      { stage: "suggested" },
      { stage: "suggested" },
      // 예전 단계 값은 지금 값으로 읽는다
      { stage: "buyerContacted" },
    ]);
    assert.deepEqual(stages, [
      { stage: "negotiating", count: 1 },
      { stage: "viewing", count: 1 },
      { stage: "buyerInterested", count: 1 },
      { stage: "suggested", count: 2 },
    ]);
  });
});

describe("project workspace — a project with tasks is not empty", () => {
  const plan = {
    title: null,
    memo: null,
    primaryContact: null,
    steps: [],
    commentCount: 0,
    assignedTo: { id: "me" },
  };
  const me = { id: "me", role: "agent" };

  it("lets the creator delete only when there is no task", () => {
    assert.equal(projectRemovalFor(plan, me, 0), "delete-empty");
    assert.equal(projectRemovalFor(plan, me, 2), null);
    // 업무를 아직 모르면 지우기를 내놓지 않는다
    assert.equal(projectRemovalFor(plan, me, null), null);
  });

  it("makes owners and managers release (not delete) a project that has tasks", () => {
    assert.equal(projectRemovalFor(plan, { id: "o", role: "owner" }, 1), "remove");
    assert.equal(projectRemovalFor(plan, { id: "o", role: "owner" }, 0), "delete-empty");
  });
});

describe("project workspace — header", () => {
  const source = readFileSync(
    new URL("../src/renderer/routes/_authenticated/projects/$id.tsx", import.meta.url),
    "utf8",
  );

  it('opens the primary-contact picker from the empty-project guide ("대표 고객 정하기")', () => {
    // 안내의 단추는 머리에 있는 고르기를 찾아 누른다. 머리를 고치면서 찾는 자리와 표식이 어긋나면
    // 단추가 아무 일도 하지 않는다(실제로 그랬다). 머리에는 담당 고르기도 같은 모양으로 있어서,
    // 대표 고객 고르기만 짚는 표식이어야 한다.
    const selector = source.match(/querySelector<HTMLButtonElement>\('(\[[^\]]+\]) button\[role="combobox"\]'\)/);
    assert.ok(selector, "the guide button looks the picker up by a marker");
    const marker = selector[1].slice(1, -1);
    assert.equal(marker, "data-project-primary-picker");
    const wrapper = source.indexOf(`<span ${marker} `);
    assert.notEqual(wrapper, -1, "the marker is on the element that wraps the picker");
    assert.match(source.slice(wrapper, wrapper + 200), /<PrimaryContactField/);
    // 담당 고르기는 그 표식 안에 있지 않다.
    const picker = source.slice(wrapper, source.indexOf("</span>", wrapper));
    assert.doesNotMatch(picker, /AssigneeField/);
  });

  it("keeps the header to two lines instead of one property per row", () => {
    // 사용자 지적(2026-11-23): 속성을 한 줄씩 늘어놓는 표는 자리만 차지한다.
    assert.doesNotMatch(source, /data-project-props/);
    assert.doesNotMatch(source, /<DocProp\b/);
    assert.match(source, /data-project-meta/);
    assert.match(source, /data-project-people/);
  });
});

describe("project workspace — plan stages (one box per order, flowing down)", () => {
  const step = (id: string, sortOrder: number, done = false) => ({ id, sortOrder, done });

  it("groups steps that share an order and numbers the orders from 1", () => {
    const groups = planStageGroups([step("c", 30), step("a", 10, true), step("b", 10, true), step("d", 40)]);
    assert.deepEqual(
      groups.map((group) => [group.index, group.steps.map((item) => item.id)]),
      [
        [1, ["a", "b"]],
        [2, ["c"]],
        [3, ["d"]],
      ],
    );
  });

  it("marks done, the first open order as current, the one after as next, the rest upcoming", () => {
    const groups = planStageGroups([
      step("a", 1, true),
      step("b", 2, true),
      step("c", 2),
      step("d", 3),
      step("e", 4),
    ]);
    assert.deepEqual(
      groups.map((group) => group.state),
      ["done", "current", "next", "upcoming"],
    );
  });

  it("keeps a finished order as done even when it comes after an open one", () => {
    const groups = planStageGroups([step("a", 1), step("b", 2, true), step("c", 3)]);
    assert.deepEqual(groups.map((group) => group.state), ["current", "done", "next"]);
  });

  it('sums the plan up as "1/4 끝남 · 매물 의뢰 1 · 구매 의뢰 2"', () => {
    assert.equal(
      describePlanSummary([
        { kind: "listing_intake", done: true },
        { kind: "buyer_intake", done: false },
        { kind: "buyer_intake", done: false },
        { kind: "manual", done: false },
      ]),
      "1/4 끝남 · 매물 의뢰 1 · 구매 의뢰 2",
    );
    assert.equal(describePlanSummary([]), "");
  });
});

describe("project workspace — match tables fit their card", () => {
  // 격자 글자("grid-cols-[minmax(120px,1.2fr)_56px_…]")에서 칸마다의 최소 폭을 읽는다.
  const tracks = (grid: string) => {
    const columns = grid.match(/grid-cols-\[([^\]]+)\]/)?.[1].split("_") ?? [];
    return columns.map((column) => {
      const minmax = column.match(/^minmax\((\d+)(?:px)?,(.+)\)$/);
      if (minmax) return { min: Number(minmax[1]), flexible: minmax[2].endsWith("fr") };
      return { min: Number.parseFloat(column), flexible: false };
    });
  };
  const GAP = 12; // gap-x-3

  it("lets the memo column shrink, so the columns never need more room than a narrow card has", () => {
    // 메모 칸에 최소 폭을 줬더니 본문이 좁을 때 표가 카드 밖으로 넘쳤다(창 820px에서 카드는 516px).
    for (const grid of [REQUIREMENT_GRID, LISTING_GRID]) {
      const columns = tracks(grid);
      assert.match(grid, /gap-x-3/);
      const memo = columns.at(-1);
      assert.deepEqual(memo, { min: 0, flexible: true }, "memo: no minimum, takes the leftover");
      const needed = columns.reduce((sum, column) => sum + column.min, 0) + GAP * (columns.length - 1);
      assert.ok(needed <= 500, `columns need ${needed}px, more than a narrow card`);
    }
  });

  it("gives the memo column the largest share of leftover width", () => {
    // 앞 칸에 최대 폭(minmax(a, b px))을 주면 앞 칸이 먼저 다 늘어 메모가 수십 px로 눌린다.
    for (const grid of [REQUIREMENT_GRID, LISTING_GRID]) {
      const shares = [...grid.matchAll(/,([\d.]+)fr\)/g)].map((match) => Number(match[1]));
      assert.ok(shares.length >= 3, "name, condition and memo all share the leftover");
      assert.equal(Math.max(...shares), shares.at(-1));
      assert.doesNotMatch(grid, /minmax\(\d+px,\d+px\)/);
    }
  });
});

describe("project workspace — drag a step to reorder the plan", () => {
  // 1: a, b (동시) · 2: c · 3: d
  const steps = [
    { id: "a", sortOrder: 1 },
    { id: "b", sortOrder: 1 },
    { id: "c", sortOrder: 2 },
    { id: "d", sortOrder: 3 },
  ];
  const asMap = (order: Array<{ id: string; sortOrder: number }> | null) =>
    order ? Object.fromEntries(order.map((item) => [item.id, item.sortOrder])) : null;

  it("joins another order (runs at the same time)", () => {
    assert.deepEqual(asMap(planOrderAfterDrop(steps, "d", { kind: "join", order: 2 })), { a: 1, b: 1, c: 2, d: 2 });
  });

  it("drops into a gap as a new order and renumbers", () => {
    assert.deepEqual(asMap(planOrderAfterDrop(steps, "b", { kind: "gap", index: 1 })), { a: 1, b: 2, c: 3, d: 4 });
  });

  it("closes the hole when a step leaves an order it was alone in", () => {
    assert.deepEqual(asMap(planOrderAfterDrop(steps, "c", { kind: "join", order: 1 })), { a: 1, b: 1, c: 1, d: 2 });
  });

  it("sends nothing when dropped where it already is", () => {
    assert.equal(planOrderAfterDrop(steps, "c", { kind: "join", order: 2 }), null);
    assert.equal(planOrderAfterDrop(steps, "c", { kind: "gap", index: 1 }), null);
    assert.equal(planOrderAfterDrop(steps, "c", { kind: "gap", index: 2 }), null);
    assert.equal(planOrderAfterDrop(steps, "a", { kind: "join", order: 1 }), null);
  });

  it("moves to the very front and the very end", () => {
    assert.deepEqual(asMap(planOrderAfterDrop(steps, "d", { kind: "gap", index: 0 })), { d: 1, a: 2, b: 2, c: 3 });
    assert.deepEqual(asMap(planOrderAfterDrop(steps, "a", { kind: "gap", index: 3 })), { b: 1, c: 2, d: 3, a: 4 });
  });

  it("renumbers gappy server orders and sends every step", () => {
    const gappy = [
      { id: "x", sortOrder: 10 },
      { id: "y", sortOrder: 20 },
      { id: "z", sortOrder: 30 },
    ];
    const order = planOrderAfterDrop(gappy, "z", { kind: "gap", index: 0 });
    assert.deepEqual(asMap(order), { z: 1, x: 2, y: 3 });
    assert.equal(order?.length, 3);
  });

  it("turns menu moves into drops", () => {
    assert.deepEqual(planDropForMove(steps, "c", "earlier"), { kind: "gap", index: 0 });
    assert.deepEqual(planDropForMove(steps, "c", "later"), { kind: "gap", index: 3 });
    assert.deepEqual(planDropForMove(steps, "b", "earlier"), { kind: "gap", index: 0 });
    assert.deepEqual(planDropForMove(steps, "b", "later"), { kind: "gap", index: 1 });
    assert.deepEqual(planDropForMove(steps, "c", "withPrevious"), { kind: "join", order: 1 });
    assert.deepEqual(planDropForMove(steps, "b", "split"), { kind: "gap", index: 1 });
    assert.equal(planDropForMove(steps, "c", "split"), null);
    assert.equal(planDropForMove(steps, "d", "later"), null);
    assert.equal(planDropForMove(steps, "a", "withPrevious"), null);
    // 앞으로 옮긴 결과
    assert.deepEqual(asMap(planOrderAfterDrop(steps, "c", planDropForMove(steps, "c", "earlier")!)), {
      c: 1,
      a: 2,
      b: 2,
      d: 3,
    });
  });
});

describe("project workspace — where a dragged step lands", () => {
  // 화면 자리(창 기준). 틈 0 · 1단계 상자 · 틈 1 · 2단계 상자 · 틈 2 가 위에서 아래로 놓여 있다.
  const column = { left: 340, right: 1010 };
  const rects = [
    { id: "gap:0", gap: true, top: 100, bottom: 130, ...column },
    { id: "group:1", gap: false, top: 134, bottom: 300, ...column },
    { id: "gap:1", gap: true, top: 304, bottom: 334, ...column },
    { id: "group:2", gap: false, top: 338, bottom: 440, ...column },
    { id: "gap:2", gap: true, top: 444, bottom: 474, ...column },
  ];

  it("picks what is under the hand, and the gap when a gap and a box both are", () => {
    assert.equal(pickPlanDropTarget({ x: 600, y: 200 }, rects), "group:1");
    assert.equal(pickPlanDropTarget({ x: 600, y: 320 }, rects), "gap:1");
    const overlapping = [...rects, { id: "group:9", gap: false, top: 300, bottom: 340, ...column }];
    assert.equal(pickPlanDropTarget({ x: 600, y: 320 }, overlapping), "gap:1");
  });

  it("takes a drop below the last gap as the end, and above the first as the front", () => {
    // 맨 끝 틈 아래에는 "단계 추가" 줄과 빈 곳이 있다. 거기에 놓아도 맨 끝으로 간다
    // (긴 계획을 스크롤하며 끌면 손이 틈을 조금 지나치기 쉽다).
    assert.equal(pickPlanDropTarget({ x: 600, y: 520 }, rects), "gap:2");
    assert.equal(pickPlanDropTarget({ x: 600, y: 40 }, rects), "gap:0");
  });

  it("uses the nearest place for the number column and the thin space between places", () => {
    // 번호 동그라미 줄(상자 왼쪽)
    assert.equal(pickPlanDropTarget({ x: 325, y: 200 }, rects), "group:1");
    // 상자와 틈 사이 4px 여백: 거리가 같으면 틈
    assert.equal(pickPlanDropTarget({ x: 600, y: 302 }, rects), "gap:1");
    assert.equal(pickPlanDropTarget({ x: 600, y: 336 }, rects), "gap:1");
  });

  it("is nowhere when the hand is off to the side (the right column), so releasing there cancels", () => {
    assert.equal(pickPlanDropTarget({ x: 1200, y: 200 }, rects), null);
    assert.equal(pickPlanDropTarget({ x: 1200, y: 520 }, rects), null);
    assert.equal(pickPlanDropTarget({ x: 200, y: 320 }, rects), null);
    assert.equal(pickPlanDropTarget({ x: 600, y: 200 }, []), null);
  });
});

describe("project workspace — step cards without 자세히", () => {
  const read = (name: string) =>
    readFileSync(new URL(`../src/renderer/routes/_authenticated/projects/${name}`, import.meta.url), "utf8");
  const flow = read("-project-plan-flow.tsx");
  const body = read("-project-step-body.tsx");

  it("has no 자세히 / 접기 toggle — what it held lives in the card", () => {
    // 사용자 요청(2026-11-23): "자세히는 그냥 펼쳐".
    const code = flow.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    assert.doesNotMatch(code, /자세히|"접기"|aria-expanded=\{open\}/);
    assert.doesNotMatch(flow, /ProjectStepDetail/);
    assert.doesNotMatch(read("-project-step-detail.tsx"), /export function ProjectStepDetail/);
  });

  it("shows an empty memo and target date only on hover or focus (and keeps them reachable by keyboard)", () => {
    for (const marker of ["data-project-step-memo-add", '"+ 목표일"']) {
      const at = flow.indexOf(marker);
      assert.notEqual(at, -1, marker);
    }
    // 숨긴 것은 opacity로만 숨기고(Tab이 닿는다) 올렸을 때 · 카드 안에 포커스가 있을 때 · 자기가 포커스일 때 보인다.
    const hoverOnly = flow.match(/opacity-0[^"]*"/g) ?? [];
    assert.ok(hoverOnly.length >= 3);
    for (const classes of hoverOnly) {
      assert.match(classes, /group-hover\/step:opacity-100/);
      assert.match(classes, /group-focus-within\/step:opacity-100|focus-visible:opacity-100/);
    }
  });

  it("does not repeat the deal stage in the card head (the deal block shows it)", () => {
    const tag = flow.slice(flow.indexOf("function StepStateTag"), flow.indexOf("// ── 단계 추가"));
    assert.doesNotMatch(tag, /dealStage/);
  });

  it("lists every payment row instead of only the next one", () => {
    // 첫 줄의 잔금일을 언제 빼는지는 아래 "payment schedule on the step card"가 본다.
    assert.doesNotMatch(body, /NextPaymentLine/);
    assert.match(body, /payments\.map\(/);
  });
});

describe("project workspace — payment schedule on the step card", () => {
  const body = readFileSync(
    new URL("../src/renderer/routes/_authenticated/projects/-project-step-body.tsx", import.meta.url),
    "utf8",
  );
  const dealBlock = body.slice(body.indexOf("export function DealFlowBlock"), body.indexOf("function DealHeadLine"));

  it("keeps the balance date on the first line unless a dated balance row already shows it", () => {
    // 잔금 줄이 있어도 날짜가 비어 있으면 그 줄은 "날짜 미정"이다. 그때 첫 줄의 잔금일까지 빼면
    // 알고 있는 잔금일(계약서의 것)이 화면에서 사라진다.
    assert.equal(balanceShownInSchedule([{ kind: "balance", scheduledDate: "2027-01-20T00:00:00.000Z" }]), true);
    assert.equal(balanceShownInSchedule([{ kind: "balance", scheduledDate: null }]), false);
    assert.equal(balanceShownInSchedule([{ kind: "interim", scheduledDate: "2026-12-10T00:00:00.000Z" }]), false);
    assert.equal(balanceShownInSchedule([]), false);
    assert.match(dealBlock, /showBalance=\{!balanceInSchedule\}/);
    assert.match(dealBlock, /balanceShownInSchedule\(payments\)/);
  });

  it("says so and offers a retry when the schedule could not be read, instead of looking empty", () => {
    // "자세히"를 없애면서 다시 시도가 사라졌었다. 못 읽은 것을 일정이 없는 것처럼 보이면 안 된다.
    assert.match(dealBlock, /!dealQuery\.isPending && !dealQuery\.data && \(\s*<LoadFailedRow what="대금 일정을" onRetry=\{\(\) => void dealQuery\.refetch\(\)\}/);
  });

  it("flags a schedule that may be stale when re-reading failed", () => {
    // 이 화면은 돌아올 때마다 다시 읽는다. 그 읽기가 실패하면 예전 일정이 지금 것처럼 보인다.
    assert.match(dealBlock, /dealQuery\.data && dealQuery\.isError && \(\s*<RefreshFailedNote what="최신 대금 일정을"/);
    // 매칭도 같은 알림을 단다. 매물 의뢰 카드의 매칭은 매물관리의 매칭 패널이(그쪽이 오류를 알린다),
    // 구매 의뢰 카드의 매칭은 구매 의뢰 표가 단다(2026-11-24 카드 본문을 표의 한 줄로 바꿨다).
    const buyerTable = readFileSync(
      new URL("../src/renderer/routes/_authenticated/projects/-project-buyer-table.tsx", import.meta.url),
      "utf8",
    );
    assert.match(buyerTable, /matchesRefreshFailed && \([\s\S]{0,120}<RefreshFailedNote what="최신 매칭을"/);
  });

  it("keeps the retry outside the part that opens the 거래·보수 tab", () => {
    // 누를 수 있는 덩이 안에 두면 "다시 시도"를 눌렀을 때 탭이 넘어간다.
    const clickable = dealBlock.slice(dealBlock.indexOf('role="button"'), dealBlock.indexOf("</div>\n      )}"));
    assert.ok(clickable.length > 0);
    assert.doesNotMatch(clickable, /LoadFailedRow|RefreshFailedNote/);
  });
});

describe("project workspace — step cards are table rows (매물관리 · 희망매물의 모양)", () => {
  const read = (name: string) =>
    readFileSync(new URL(`../src/renderer/routes/_authenticated/projects/${name}`, import.meta.url), "utf8");

  it("drops the listing columns in the order the user gave, keeping 거래 · 단지 · 동 · 호 · 매칭 · 매물상태 · 가격", () => {
    // 사용자 지시(2026-11-24): 메모 → 월세가 없는 줄의 월세 → 타입 → 입주가능일 순으로 뺀다. 가로 스크롤은 만들지 않는다.
    const columns = listingStepColumns(false);
    const dropOrder = columns.filter((column) => column.drop > 0).sort((a, b) => a.drop - b.drop).map((column) => column.id);
    assert.deepEqual(dropOrder.slice(0, 4), ["memo", "monthlyRent", "unitType", "moveInAvailable"]);
    const always = columns.filter((column) => column.drop === 0).map((column) => column.id);
    assert.deepEqual(always, ["info", "site", "dong", "unit", "matching", "listingAvailability", "price"]);
    // 월세 조건이 있는 줄은 월세를 가장 늦게 뺀다
    const monthly = listingStepColumns(true).find((column) => column.id === "monthlyRent");
    assert.equal(monthly?.drop, Math.max(...listingStepColumns(true).map((column) => column.drop)));
  });

  it("fits the columns into the card width without horizontal scroll", () => {
    // 1440px 창의 카드(647px): 늘 두는 칸만 남고, 줄일 수 있는 칸을 줄여 맞춘다
    const narrow = pickStepTableColumns(listingStepColumns(false), 647);
    assert.deepEqual(narrow.visible, ["info", "site", "dong", "unit", "matching", "listingAvailability", "price"]);
    assert.equal(narrow.overflow, false);
    const sum = (fit: typeof narrow) => fit.visible.reduce((total, id) => total + fit.widths[id], 0);
    assert.ok(sum(narrow) <= 647);
    // 1920px 창의 카드(998px): 공급 · 광고 · 확인이 더 들어온다(원래 순서 그대로)
    const wide = pickStepTableColumns(listingStepColumns(false), 998);
    assert.deepEqual(wide.visible, ["info", "site", "dong", "unit", "supplyArea", "matching", "advertisement", "confirmationAt", "listingAvailability", "price"]);
    assert.ok(sum(wide) <= 998);
    // 남는 폭은 단지 칸이 받는다(원래 폭 240px까지)
    assert.ok(wide.widths.site > 96 && wide.widths.site <= 240);
    // 구매 의뢰: 펼침 · 고객 · 예산 · 희망 지역·단지는 늘 남는다
    const buyer = pickStepTableColumns(BUYER_STEP_COLUMNS, 560);
    for (const id of ["toggle", "customer", "budget", "places"] as const) assert.ok(buyer.visible.includes(id), id);
    assert.equal(pickStepTableColumns(BUYER_STEP_COLUMNS, 400).overflow, true);
  });

  it("merges the title line into the table only when the name just repeats the address", () => {
    const place = { siteName: "고덕그라시움", placeLabel: "고덕그라시움 101동 3501호" };
    assert.equal(isAddressOnlyStepTitle("고덕그라시움 101동 3501호 매물 의뢰", place), true);
    assert.equal(isAddressOnlyStepTitle("고덕그라시움 3501 매도", place), true);
    assert.equal(isAddressOnlyStepTitle("고덕그라시움 3501 급매 협상", place), false);
    assert.equal(isAddressOnlyStepTitle("엄마 집 정리", place), false);
    assert.equal(siteNameFromPlaceLabel("고덕그라시움 101동 3501호"), "고덕그라시움");
    assert.equal(siteNameFromPlaceLabel("래미안 퍼스티지 101동 1203호"), "래미안 퍼스티지");
    assert.equal(isDefaultBuyerStepTitle("매매 구매 의뢰"), true);
    assert.equal(isDefaultBuyerStepTitle("구매 의뢰"), true);
    assert.equal(isDefaultBuyerStepTitle("아들 신혼집 전세"), false);
  });

  it("the compact match panel hides the columns it means to (computed from the panel's own columns)", () => {
    // 매물관리의 매칭 패널을 그대로 쓰되, 카드가 좁으면 바깥에서 칸을 감춘다. 감출 칸이 패널에 있어야 한다
    // (패널이 칸 이름을 바꾸면 여기서 알린다).
    const ids = matchTableColumns.map((column) => column.id as string);
    for (const hidden of [...MATCH_PANEL_HIDDEN.mid, ...MATCH_PANEL_HIDDEN.narrow]) {
      assert.ok(ids.includes(hidden), `panel has ${hidden}`);
    }
    // 단계 칸은 어느 폭에서도 감추지 않는다
    assert.ok(!MATCH_PANEL_HIDDEN.narrow.includes("stage") && !MATCH_PANEL_HIDDEN.mid.includes("stage"));
    const css = compactMatchPanelCss(matchTableColumns);
    // 줄의 첫 칸은 펼침 화살표라 칸의 자리는 정의 순서 + 2
    const nth = (id: string) => `:nth-child(${ids.indexOf(id) + 2})`;
    const narrowRule = css.split("\n").find((line) => line.startsWith('[data-project-match-panel="narrow"] :is('));
    for (const id of MATCH_PANEL_HIDDEN.narrow) assert.ok(narrowRule?.includes(nth(id)), id);
    assert.ok(!narrowRule?.includes(nth("stage")));
    assert.equal(matchPanelFitFor(647), "narrow");
    assert.equal(matchPanelFitFor(998), "mid");
    assert.equal(matchPanelFitFor(1200), "full");
  });

  it("uses the 매물관리 match panel and the 희망매물 match lanes, not a card-made list", () => {
    const listing = read("-project-listing-table.tsx");
    const buyer = read("-project-buyer-table.tsx");
    assert.match(listing, /<PropertyMatchPanel\b/);
    assert.match(buyer, /<BuyerMatchBranchList\b/);
    // 그 화면들이 여는 창도 그대로
    for (const dialog of ["MatchDetailDialog", "MatchCreateDialog", "MatchConvertDialog"]) assert.match(buyer, new RegExp(`<${dialog}\\b`));
    // 카드가 만든 매칭 줄은 없다
    assert.doesNotMatch(read("-project-step-body.tsx"), /function MatchesBlock|function MatchLine/);
    // 진행 중인 매칭이 있으면 처음부터 펼친다
    assert.match(listing, /savedPanel === undefined \? \(matchCount > 0 \? "match" : null\)/);
    assert.match(buyer, /savedExpanded \?\? activeCount > 0/);
  });
});

describe("project workspace — table cards keep the ways out and stay fresh", () => {
  const read = (name: string) =>
    readFileSync(new URL(`../src/renderer/routes/_authenticated/projects/${name}`, import.meta.url), "utf8");
  const buyer = read("-project-buyer-table.tsx");
  const listing = read("-project-listing-table.tsx");
  const flow = read("-project-plan-flow.tsx");

  it("opens the requirement screen from a buyer card (per row, and by ↗ when there is one requirement)", () => {
    // 표 모양으로 바꾸면서 예산의 링크가 빠져, 구매 의뢰 카드에서는 희망 조건을 열 방법이 없었다.
    assert.match(buyer, /<Link\s+to="\/buyer-requirements\/\$id"\s+params=\{\{ id: requirementId \}\}/);
    const openLink = flow.slice(flow.indexOf("function StepOpenLink"), flow.indexOf("function MemoAddButton"));
    assert.match(openLink, /to="\/properties\/\$id"/);
    assert.match(openLink, /requirements\.length === 1/);
    assert.match(openLink, /to="\/buyer-requirements\/\$id"\s+params=\{\{ id: requirements\[0\]\.id \}\}/);
    assert.match(openLink, /to="\/deals\/\$id"/);
  });

  it("flags rows that may be stale after a failed re-read", () => {
    assert.match(listing, /group && rowQuery\.isError && \([\s\S]{0,260}<RefreshFailedNote what="최신 매물 정보를"/);
    assert.match(buyer, /requirementRefreshFailed=\{Boolean\(detailQuery\?\.data && detailQuery\.isError\)\}/);
    assert.match(buyer, /<RefreshFailedNote what="최신 희망조건을" onRetry=\{onRetryRequirement\}/);
    assert.match(buyer, /<RefreshFailedNote what="최신 매칭을" onRetry=\{onRetryMatches\}/);
  });

  it("re-reads the plan and deals when the match panel changed the listing", () => {
    // 매물관리의 매칭 패널은 자기 일을 한 뒤 매칭과 매물 의뢰만 다시 읽는다. 거래로 넘겨도 진행 계획은 그대로였다.
    const hook = listing.slice(
      listing.indexOf("function useRefreshPlanWhenListingChanges"),
      listing.indexOf("export function isListingTitleMerged"),
    );
    assert.match(hook, /previous\.current !== null && previous\.current !== signature/);
    assert.match(hook, /invalidateQueries\(\{ queryKey: \["projects"\] \}\)/);
    assert.match(hook, /invalidateQueries\(\{ queryKey: dealQueries\.all \}\)/);
    assert.match(listing, /useRefreshPlanWhenListingChanges\(group\)/);
  });

  it("treats a new deal, a changed match count or a closed intake as a change — not a mere re-read", () => {
    const base = {
      representative: { lifecycleStatus: "open", closedReason: null },
      listings: [
        { id: "b", isPaused: false, price: 158000, _count: { matches: 2 }, deals: [] },
        { id: "a", isPaused: false, deposit: 70000, _count: { matches: 0 }, deals: [] },
      ],
    };
    const same = { ...base, listings: [...base.listings].reverse() };
    assert.equal(listingRowSignature(base), listingRowSignature(same), "order of listings does not matter");
    assert.equal(
      listingRowSignature(base),
      listingRowSignature({ ...base, listings: base.listings.map((item) => ({ ...item, updatedAt: "2026-11-24" })) }),
      "a newer updatedAt alone is not a change",
    );
    const withDeal = {
      ...base,
      listings: [{ ...base.listings[0], deals: [{ id: "d1", stage: "preparing", isCancelled: false }] }, base.listings[1]],
    };
    assert.notEqual(listingRowSignature(base), listingRowSignature(withDeal));
    const advanced = {
      ...base,
      listings: [{ ...base.listings[0], deals: [{ id: "d1", stage: "contracted", isCancelled: false }] }, base.listings[1]],
    };
    assert.notEqual(listingRowSignature(withDeal), listingRowSignature(advanced));
    assert.notEqual(
      listingRowSignature(base),
      listingRowSignature({ ...base, listings: [{ ...base.listings[0], _count: { matches: 3 } }, base.listings[1]] }),
    );
    assert.notEqual(
      listingRowSignature(base),
      listingRowSignature({ ...base, representative: { lifecycleStatus: "closed", closedReason: "sold" } }),
    );
  });
});

describe("project workspace — the plan follows saves made by borrowed parts", () => {
  const read = (name: string) =>
    readFileSync(new URL(`../src/renderer/routes/_authenticated/projects/${name}`, import.meta.url), "utf8");
  const hooks = read("-project-hooks.ts");
  const hook = hooks.slice(hooks.indexOf("export function useRefreshAfterSaves"));

  it("is driven by the saves themselves, not by the listing row changing", () => {
    // 거래 전환 창은 매칭과 거래만 다시 읽고 매물(listing-intakes)은 다시 읽지 않는다. 매물 줄이 달라질 때만
    // 다시 읽던 방식은 그 경로에서 걸리지 않았다(실제 화면에서 전환을 끝까지 눌러 확인).
    assert.match(hook, /getMutationCache\(\)\.subscribe/);
    assert.match(read("$id.tsx"), /useRefreshAfterSaves\(plan\.id\)/);
    assert.deepEqual(projectFollowerKeysAfterSave(), [
      ["listing-intakes", "project-row"],
      ["deals", "detail"],
    ]);
  });

  it("listens to saves that finished — a success marks the plan stale, a failure still releases the wait", () => {
    assert.equal(isSaveSuccess({ type: "updated", action: { type: "success" } }), true);
    assert.equal(isSaveSuccess({ type: "updated", action: { type: "error" } }), false);
    assert.equal(isSaveSettled({ type: "updated", action: { type: "error" } }), true);
    assert.equal(isSaveSettled({ type: "updated", action: { type: "pending" } }), false);
    assert.equal(isSaveSettled({ type: "added" }), false);
  });

  it("never puts a re-read plan over a value the screen is still saving", () => {
    // 다시 읽기를 시작한 뒤 사용자가 메모를 고치면, 늦게 온 응답(고치기 전의 서버 값)이 저장 중인 메모를
    // 예전 글로 되돌렸다(실제 화면에서 재현: 2초 동안 예전 글). 받아 오는 동안 저장이 시작됐거나
    // 지금 저장 중이면 받아 온 계획을 넣지 않는다.
    assert.equal(canApplyRefreshedPlan({ startedAt: 3, now: 3, saving: 0 }), true);
    assert.equal(canApplyRefreshedPlan({ startedAt: 3, now: 4, saving: 0 }), false, "a save started and already ended");
    assert.equal(canApplyRefreshedPlan({ startedAt: 3, now: 4, saving: 1 }), false, "a save started and is running");
    assert.equal(canApplyRefreshedPlan({ startedAt: 3, now: 3, saving: 1 }), false);
    // 진행 계획은 "다시 읽어라"(invalidate)로 맡기지 않고, 따로 받아 와 그 조건을 본 뒤에만 넣는다.
    assert.doesNotMatch(hook, /invalidateQueries\(\{ queryKey: planQueryKey\(projectId\) \}\)/);
    assert.match(hook, /fresh = await api\.projects\.findOne\(projectId\);/);
    assert.match(
      hook,
      /if \(canApplyRefreshedPlan\(\{ startedAt, now: saveEpoch, saving \}\)\) \{\s*queryClient\.setQueryData\(planQueryKey\(projectId\), fresh\);\s*return;\s*\}/,
    );
    // 저장이 시작될 때마다 세고, 저장이 이어지는 중에는 시작하지도 않는다.
    assert.match(hook, /if \(event\.type === "added"\) \{\s*saveEpoch \+= 1;/);
    assert.match(hook, /queryClient\.isMutating\(\) > 0 \|\| !dirty/);
  });

  it("re-reads again after throwing a late result away, even when no save is left to trigger it", () => {
    // 받아 오는 사이에 짧은 저장이 시작해서 끝나 버리면 그 저장의 끝 알림은 이미 지나갔다. 버리고 "나중에"라고만
    // 해 두면 다시 읽기가 통째로 빠진다(실제 화면에서 재현: 받아 온 횟수 1번에서 멈춤).
    assert.equal(afterDiscardedPlan({ lastFetchEpoch: 3, now: 4, saving: 0 }), "refetch-now");
    // 저장이 아직 진행 중이면 그 끝 알림이 다시 받게 한다.
    assert.equal(afterDiscardedPlan({ lastFetchEpoch: 3, now: 4, saving: 1 }), "wait-for-save");
    // 지금의 저장 차례에서 새로 시작한 받아 오기가 따로 있으면 그것이 넣는다.
    assert.equal(afterDiscardedPlan({ lastFetchEpoch: 4, now: 4, saving: 0 }), "covered");
    assert.match(hook, /lastFetchEpoch = startedAt;/);
    assert.match(
      hook,
      /const next = afterDiscardedPlan\(\{ lastFetchEpoch, now: saveEpoch, saving \}\);\s*if \(next === "covered"\) return;\s*dirty = true;/,
    );
    assert.match(hook, /if \(next === "refetch-now" && timer === null\) timer = setTimeout\(\(\) => void refresh\(\), 0\);/);
    // 못 받아 온 것도 잊지 않는다.
    assert.match(hook, /\} catch \{[\s\S]{0,160}if \(!disposed\) dirty = true;\s*return;\s*\}/);
  });

  it("does not re-read because of the page's own plan saves, which already apply their responses", () => {
    assert.equal(projectPlanScope("p1"), "project-plan-p1");
    assert.match(hook, /isSaveSuccess\(event\) && event\.mutation\?\.options\.scope\?\.id !== ownScope/);
    // 이름·메모 저장과 단계·순서 저장이 모두 그 줄에 선다.
    assert.match(hooks, /scope: \{ id: projectPlanScope\(projectId\) \}/);
    assert.equal((read("-project-plan-hooks.ts").match(/scope: \{ id: projectPlanScope\(projectId\) \}/g) ?? []).length, 2);
  });
});
