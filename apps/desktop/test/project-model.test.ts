import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  ProjectCommentList,
  ProjectList,
  ProjectListItem,
  ProjectPlan,
} from "@estate-erp/api-client";
import {
  collectProjectPhones,
  decideTextCommit,
  describePaymentState,
  describePlace,
  getProjectProgress,
  getProjectRowLabel,
  getProjectStatus,
  getProjectTitle,
  mergeCommentPages,
  mergeProjectConsultations,
  mergeProjectPages,
  mergeProjectUpdate,
  orderPayments,
  settleSavedCommentDraft,
  splitMatches,
  type CommentDraftStore,
} from "../src/renderer/routes/_authenticated/projects/-project-model.ts";

const item = (overrides: Partial<ProjectListItem>): ProjectListItem => ({
  id: "p1",
  title: null,
  memo: null,
  archivedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  primaryContact: null,
  assignedTo: null,
  customerName: null,
  peopleCount: 0,
  buyerIntakeCount: 0,
  listingIntakeCount: 0,
  stepCount: 0,
  doneStepCount: 0,
  firstStepTitle: null,
  nextStepTitle: null,
  nextStepTargetDate: null,
  commentCount: 0,
  latestComment: null,
  ...overrides,
});

const plan = (overrides: Partial<ProjectPlan>): ProjectPlan => ({
  id: "p1",
  title: "갈아타기",
  memo: "메모",
  archivedAt: null,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  primaryContact: null,
  assignedTo: null,
  people: [],
  commentCount: 0,
  steps: [],
  ...overrides,
});

describe("project screen model", () => {
  it("names an untitled project after its customer, then its first step", () => {
    assert.equal(getProjectTitle(item({ title: "  갈아타기  " })), "갈아타기");
    assert.equal(getProjectTitle(item({ customerName: "김민준" })), "김민준님 프로젝트");
    assert.equal(getProjectTitle(item({ firstStepTitle: "A 매도" })), "A 매도");
    assert.equal(getProjectTitle(item({})), "이름 없는 프로젝트");
  });

  it("labels a table row by its customer first, then the project name", () => {
    assert.equal(getProjectRowLabel(item({ customerName: "김민준", title: " 갈아타기 " })), "김민준 · 갈아타기");
    assert.equal(getProjectRowLabel(item({ customerName: "김민준" })), "김민준");
    assert.equal(getProjectRowLabel(item({ title: "상가 재계약" })), "상가 재계약");
    assert.equal(getProjectRowLabel(item({})), "이름 없는 프로젝트");
  });

  it("collects each primary contact phone once for copying", () => {
    const contact = (phone: string | null) => ({ id: "c", name: "이름", phone });
    assert.deepEqual(
      collectProjectPhones([
        item({ primaryContact: contact("01011112222") }),
        item({ primaryContact: contact(null) }),
        item({ primaryContact: null }),
        item({ primaryContact: contact("01011112222") }),
        item({ primaryContact: contact("01033334444") }),
      ]),
      ["01011112222", "01033334444"],
    );
  });

  it("derives the status from the end mark and step counts instead of a stored value", () => {
    assert.equal(getProjectStatus(item({})), "preparing");
    assert.equal(getProjectStatus(item({ stepCount: 3, doneStepCount: 1 })), "active");
    assert.equal(getProjectStatus(item({ stepCount: 3, doneStepCount: 3 })), "wrapping");
    // 끝낸 것은 단계가 남아 있어도 끝남이다(끝냈는지는 사용자가 정한다).
    assert.equal(
      getProjectStatus(item({ archivedAt: "2026-11-20T00:00:00.000Z", stepCount: 3, doneStepCount: 1 })),
      "archived",
    );
    assert.equal(getProjectStatus(item({ archivedAt: "2026-11-20T00:00:00.000Z" })), "archived");
  });

  it("reads progress from step counts without storing a status", () => {
    assert.deepEqual(getProjectProgress(item({})), { kind: "none" });
    assert.deepEqual(
      getProjectProgress(item({ stepCount: 3, doneStepCount: 1, nextStepTitle: "잔금" })),
      { kind: "going", done: 1, total: 3, next: "잔금" },
    );
    assert.deepEqual(getProjectProgress(item({ stepCount: 2, doneStepCount: 2 })), {
      kind: "done",
      total: 2,
    });
  });

  it("joins list pages in order and keeps the first copy of a project that shifted pages", () => {
    const page = (ids: string[], nextOffset: number | null): ProjectList => ({
      total: 4,
      nextOffset,
      items: ids.map((id) => item({ id })),
    });
    // 쪽을 넘기는 사이에 b가 고쳐져 둘째 쪽에도 다시 나왔다.
    assert.deepEqual(
      mergeProjectPages([page(["a", "b"], 2), page(["b", "c", "d"], null)]).map((row) => row.id),
      ["a", "b", "c", "d"],
    );
    assert.deepEqual(mergeProjectPages(undefined), []);
  });

  it("joins comment pages oldest first even though pages arrive newest first", () => {
    const comment = (id: string) => ({
      id,
      body: id,
      createdAt: "2026-11-01T00:00:00.000Z",
      updatedAt: "2026-11-01T00:00:00.000Z",
      author: null,
    });
    const page = (ids: string[], nextBefore: string | null): ProjectCommentList => ({
      total: 5,
      nextBefore,
      items: ids.map(comment),
    });
    // 첫 쪽이 가장 최근(c4, c5), 그다음 쪽이 더 오래된 것(c2, c3), 마지막이 c1.
    assert.deepEqual(
      mergeCommentPages([page(["c4", "c5"], "c4"), page(["c2", "c3"], "c2"), page(["c1"], null)]).map(
        (row) => row.id,
      ),
      ["c1", "c2", "c3", "c4", "c5"],
    );
    assert.deepEqual(mergeCommentPages(undefined), []);
  });

  it("joins each person's consultations newest first without repeating one", () => {
    const c = (id: string, createdAt: string) => ({ id, createdAt });
    const merged = mergeProjectConsultations([
      { person: "한지우", items: [c("a", "2026-11-20T00:00:00.000Z"), c("b", "2026-11-10T00:00:00.000Z")] },
      { person: "서하린", items: [c("c", "2026-11-15T00:00:00.000Z"), c("a", "2026-11-20T00:00:00.000Z")] },
    ]);
    assert.deepEqual(
      merged.map((row) => `${row.person}:${row.consultation.id}`),
      ["한지우:a", "서하린:c", "한지우:b"],
    );
    assert.deepEqual(mergeProjectConsultations([]), []);
  });

  it("never saves an untouched field over a value that changed elsewhere", () => {
    // 칸에 들어가 있기만 했는데 그 사이에 다른 탭이 저장했다: 예전 글로 덮어쓰지 않고 새 값을 받아들인다.
    assert.deepEqual(decideTextCommit({ draft: "옛 이름", base: "옛 이름", current: "새 이름" }), {
      kind: "adopt",
    });
    // 이 칸에서만 바꿨다: 저장한다 (앞뒤 빈칸은 뗀다).
    assert.deepEqual(decideTextCommit({ draft: " 내 이름 ", base: "옛 이름", current: "옛 이름" }), {
      kind: "save",
      value: "내 이름",
    });
    // 비우는 것도 바꾼 것이다.
    assert.deepEqual(decideTextCommit({ draft: "", base: "옛 이름", current: "옛 이름" }), {
      kind: "save",
      value: "",
    });
    // 양쪽에서 바뀌었다: 알아서 덮지 않는다.
    assert.deepEqual(decideTextCommit({ draft: "내 이름", base: "옛 이름", current: "새 이름" }), {
      kind: "conflict",
    });
    // 지금 값과 같으면 할 일이 없다 (양쪽이 같은 글로 바꾼 경우 포함).
    assert.deepEqual(decideTextCommit({ draft: "새 이름", base: "옛 이름", current: "새 이름" }), {
      kind: "none",
    });
    assert.deepEqual(decideTextCommit({ draft: "같음 ", base: "같음", current: "같음" }), { kind: "none" });
  });

  it("shows live matches newest first and only counts the closed ones", () => {
    const m = (id: string, stage: string, updatedAt: string) => ({ id, stage, updatedAt });
    const { active, closedCount } = splitMatches([
      m("a", "suggested", "2026-11-01T00:00:00.000Z"),
      m("b", "closed", "2026-11-20T00:00:00.000Z"),
      m("c", "viewing", "2026-11-10T00:00:00.000Z"),
      m("d", "dealCreated", "2026-11-10T00:00:00.000Z"),
    ]);
    assert.deepEqual(active.map((match) => match.id), ["c", "d", "a"]);
    assert.equal(closedCount, 1);
    assert.deepEqual(splitMatches([]), { active: [], closedCount: 0 });
  });

  it("names a home by site, building and unit, leaving out a placeholder building", () => {
    const unit = (space: { name: string | null }) => space.name ?? "3층";
    assert.equal(
      describePlace(
        { site: { name: "고덕그라시움" }, unit: { name: "3501", floor: 35, dong: { name: "101" } } },
        unit,
      ),
      "고덕그라시움 101동 3501",
    );
    assert.equal(
      describePlace(
        { site: { name: "고덕빌라" }, unit: { name: null, floor: 3, dong: { name: "본동", isPlaceholder: true } } },
        unit,
      ),
      "고덕빌라 3층",
    );
    assert.equal(describePlace({ site: { name: "단독주택" }, unit: null }, unit), "단독주택");
    assert.equal(describePlace(null, unit), "매물");
  });

  it("orders the payment schedule by date and leaves out cancelled rows", () => {
    const p = (id: string, status: string, scheduledDate: string | null, sequence = 1) => ({
      id,
      status,
      scheduledDate,
      sequence,
    });
    assert.deepEqual(
      orderPayments([
        p("balance", "pending", "2026-12-20T00:00:00.000Z"),
        p("undated", "pending", null),
        p("cancelled", "cancelled", "2026-11-01T00:00:00.000Z"),
        p("interim2", "pending", "2026-12-05T00:00:00.000Z", 2),
        p("interim1", "pending", "2026-12-05T00:00:00.000Z", 1),
        p("contract", "paid", "2026-11-20T00:00:00.000Z"),
      ]).map((payment) => payment.id),
      ["contract", "interim1", "interim2", "balance", "undated"],
    );
  });

  it("reads a payment's state from its status, not from whether a paid time is recorded", () => {
    const now = new Date(2026, 10, 22, 9);
    const state = (status: string, scheduledDate: string | null, kind = "balance") =>
      describePaymentState({ kind, status, scheduledDate }, now);
    const past = new Date(2026, 10, 21).toISOString();
    const today = new Date(2026, 10, 22).toISOString();
    const future = new Date(2026, 11, 20).toISOString();
    assert.deepEqual(state("paid", past), { label: "입금", tone: "done" });
    // 환불은 받은 돈이 아니다.
    assert.deepEqual(state("paid", past, "refund"), { label: "환불함", tone: "done" });
    // 일부만 받은 것은 다 받은 것이 아니다. 예정일이 지났으면 그것도 말한다.
    assert.deepEqual(state("partial", future), { label: "일부 입금", tone: "plain" });
    assert.deepEqual(state("partial", past), { label: "일부 입금 · 지남", tone: "late" });
    assert.deepEqual(state("overdue", past), { label: "지남", tone: "late" });
    assert.deepEqual(state("overdue", null), { label: "지남", tone: "late" });
    // 서버가 아직 지남으로 바꾸지 않았어도 예정일이 지났으면 지남이다. 오늘은 아직 예정이다.
    assert.deepEqual(state("pending", past), { label: "지남", tone: "late" });
    assert.deepEqual(state("pending", today), { label: "예정", tone: "plain" });
    assert.deepEqual(state("pending", null), { label: "예정", tone: "plain" });
    // 입금한 때가 적혀 있어도(일부 받았거나 상태를 되돌린 경우) status가 입금이 아니면 입금이 아니다.
    assert.equal(
      describePaymentState(
        { status: "pending", scheduledDate: future, paidAt: "2026-11-20T03:00:00.000Z" } as never,
        now,
      ).label,
      "예정",
    );
    assert.equal(
      describePaymentState(
        { status: "overdue", scheduledDate: past, paidAt: "2026-11-20T03:00:00.000Z" } as never,
        now,
      ).label,
      "지남",
    );
  });

  it("clears a comment draft only when it is still the text that was sent", () => {
    const drafts: CommentDraftStore = new Map([
      ["p1", "  잔금일 협의 중  "],
      ["p2", "보낸 글에 더 적음"],
    ]);
    settleSavedCommentDraft(drafts, { projectId: "p1", body: "잔금일 협의 중" });
    settleSavedCommentDraft(drafts, { projectId: "p2", body: "보낸 글" });
    assert.equal(drafts.has("p1"), false);
    assert.equal(drafts.get("p2"), "보낸 글에 더 적음");
  });

  it("applies an update response only to the fields that request changed", () => {
    // 이름을 고친 요청의 응답이 오기 전에 메모를 고쳤다: 응답의 예전 메모가 지금 메모를 덮으면 안 된다.
    const current = plan({ title: "새 이름", memo: "방금 고친 메모" });
    const response = plan({
      title: "새 이름",
      memo: "메모",
      updatedAt: "2026-11-11T00:00:00.000Z",
      assignedTo: { id: "u1", name: "박대리" },
    });
    const merged = mergeProjectUpdate(current, response, { title: "새 이름" });
    assert.equal(merged.title, "새 이름");
    assert.equal(merged.memo, "방금 고친 메모");
    assert.equal(merged.assignedTo, null);
    assert.equal(merged.updatedAt, "2026-11-11T00:00:00.000Z");

    const withContact = mergeProjectUpdate(
      current,
      plan({
        primaryContact: { id: "c1", name: "김민준", phone: null },
        people: [{ contactId: "c1", name: "김민준", phone: null, role: "primary" }],
      }),
      { primaryContactId: "c1" },
    );
    assert.equal(withContact.primaryContact?.name, "김민준");
    assert.equal(withContact.people.length, 1);
    assert.equal(withContact.memo, "방금 고친 메모");

    assert.equal(mergeProjectUpdate(undefined, response, { title: "새 이름" }), response);
  });
});
