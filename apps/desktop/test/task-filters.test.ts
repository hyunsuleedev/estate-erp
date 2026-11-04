import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Task } from '@estate-erp/api-client';

import {
  ASSIGNEE_UNASSIGNED,
  applyTaskUpdate,
  compareTaskOrder,
  countByCategory,
  countByDueFacet,
  countByPriority,
  countByScope,
  countByStatus,
  describeDue,
  dueBucketOf,
  filterTasks,
  groupTasks,
  heldStatusOf,
  listStatusColumns,
  isTaskOverdue,
  matchesDueFilter,
  matchesTaskFilters,
  nextCheckStatus,
  sortActiveFirst,
  sortTasksBy,
  type TaskFilterState,
} from '../src/renderer/routes/_authenticated/tasks/-task-filters';
import {
  DEFAULT_TASK_DISPLAY,
  effectiveGroupBy,
  parseTaskDisplay,
  parseTaskScope,
} from '../src/renderer/routes/_authenticated/tasks/-task-display';

// 서비스 기준 시간대(KST)로 고정 — 서버 마감일(UTC 자정 ISO)을 로컬 날짜로 해석하는 규칙을 검증한다.
process.env.TZ = 'Asia/Seoul';

// 2026-11-04(수) 오후 3시 (KST)
const NOW = new Date(2026, 10, 4, 15, 0, 0);

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    content: null,
    status: 'pending',
    priority: 'medium',
    category: 'other',
    sortOrder: 0,
    dueDate: null,
    assignedToId: null,
    assignedTo: null,
    source: 'manual',
    ...overrides,
  } as Task;
}

/** 서버가 내려주는 형식(UTC 자정 ISO)으로 로컬 날짜를 표현 */
function due(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00.000Z`;
}

const NO_FILTERS: TaskFilterState = {
  status: '',
  due: '',
  category: '',
  assignee: '',
  scope: 'team',
  currentUserId: null,
  hideCompleted: false,
  priorities: [],
  search: '',
};

describe('task due filters', () => {
  it('treats yesterday as overdue only while the task is still open', () => {
    assert.equal(isTaskOverdue(task({ id: 'a', dueDate: due(2026, 11, 3) }), NOW), true);
    assert.equal(
      isTaskOverdue(task({ id: 'b', dueDate: due(2026, 11, 3), status: 'completed' }), NOW),
      false,
    );
    assert.equal(isTaskOverdue(task({ id: 'c', dueDate: due(2026, 11, 4) }), NOW), false);
  });

  it('matches today and the next seven days inclusive', () => {
    const today = task({ id: 'today', dueDate: due(2026, 11, 4) });
    const day7 = task({ id: 'day7', dueDate: due(2026, 11, 11) });
    const day8 = task({ id: 'day8', dueDate: due(2026, 11, 12) });

    assert.equal(matchesDueFilter(today, 'today', NOW), true);
    assert.equal(matchesDueFilter(day7, 'today', NOW), false);
    assert.equal(matchesDueFilter(today, 'week', NOW), true);
    assert.equal(matchesDueFilter(day7, 'week', NOW), true);
    assert.equal(matchesDueFilter(day8, 'week', NOW), false);
  });

  it('matches tasks without a due date only for the none facet', () => {
    const undated = task({ id: 'undated' });
    assert.equal(matchesDueFilter(undated, 'none', NOW), true);
    assert.equal(matchesDueFilter(undated, 'today', NOW), false);
    assert.equal(matchesDueFilter(undated, '', NOW), true);
  });
});

describe('task filter state', () => {
  it('hides cancelled tasks unless the cancelled status is selected', () => {
    const cancelled = task({ id: 'x', status: 'cancelled' });
    assert.equal(matchesTaskFilters(cancelled, NO_FILTERS, { now: NOW }), false);
    assert.equal(
      matchesTaskFilters(cancelled, { ...NO_FILTERS, status: 'cancelled' }, { now: NOW }),
      true,
    );
  });

  it('separates unassigned, a specific assignee and my tasks', () => {
    const mine = task({ id: 'mine', assignedToId: 'u1' });
    const nobody = task({ id: 'nobody' });

    const unassigned = { ...NO_FILTERS, assignee: ASSIGNEE_UNASSIGNED };
    assert.equal(matchesTaskFilters(nobody, unassigned, { now: NOW }), true);
    assert.equal(matchesTaskFilters(mine, unassigned, { now: NOW }), false);

    const onlyMine: TaskFilterState = { ...NO_FILTERS, scope: 'mine', currentUserId: 'u1' };
    assert.equal(matchesTaskFilters(mine, onlyMine, { now: NOW }), true);
    assert.equal(matchesTaskFilters(nobody, onlyMine, { now: NOW }), false);
  });

  it('searches title, contact and property label', () => {
    const t = task({
      id: 's',
      title: '등기부 열람',
      contact: { id: 'c', name: '김민준', phone: '01012345678' } as Task['contact'],
      property: {
        site: { name: '고덕그라시움' },
        unit: { name: '3401', dong: { id: 'd', name: '101', isPlaceholder: false } },
      } as Task['property'],
    });
    for (const search of ['등기부', '김민준', '0101234', '101동 3401호']) {
      assert.equal(matchesTaskFilters(t, { ...NO_FILTERS, search }, { now: NOW }), true, search);
    }
    assert.equal(matchesTaskFilters(t, { ...NO_FILTERS, search: '없는말' }, { now: NOW }), false);
  });
});

describe('task facet counts', () => {
  const tasks = [
    task({ id: 'late', dueDate: due(2026, 11, 2), category: 'call' }),
    task({ id: 'today', dueDate: due(2026, 11, 4), category: 'call' }),
    task({ id: 'soon', dueDate: due(2026, 11, 8), category: 'document' }),
    task({ id: 'undated', category: 'document' }),
    task({ id: 'done', dueDate: due(2026, 11, 1), status: 'completed', category: 'call' }),
  ];

  it('counts due facets while ignoring the active due filter', () => {
    const counts = countByDueFacet(tasks, { ...NO_FILTERS, due: 'today' }, NOW);
    assert.deepEqual(counts, { all: 5, overdue: 1, today: 1, week: 2, none: 1 });
  });

  it('counts categories while respecting the other filters', () => {
    const counts = countByCategory(tasks, { ...NO_FILTERS, category: 'call', due: 'overdue' }, NOW);
    assert.equal(counts.all, 1);
    assert.equal(counts.byCategory.get('call'), 1);
    assert.equal(counts.byCategory.get('document'), undefined);
  });
});

describe('task ordering and completion toggle', () => {
  it('keeps open tasks first and preserves sortOrder within each block', () => {
    const sorted = sortActiveFirst([
      task({ id: 'done-1', status: 'completed', sortOrder: 0 }),
      task({ id: 'open-2', sortOrder: 2 }),
      task({ id: 'doing-1', status: 'in_progress', sortOrder: 1 }),
    ]);
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['doing-1', 'open-2', 'done-1'],
    );
  });

  it('keeps a just-completed task in the open block when held in place', () => {
    const tasks = [
      task({ id: 'open-1', sortOrder: 1 }),
      task({ id: 'just-done', status: 'completed', sortOrder: 2 }),
      task({ id: 'open-3', sortOrder: 3 }),
    ];
    assert.deepEqual(
      sortActiveFirst(tasks).map((t) => t.id),
      ['open-1', 'open-3', 'just-done'],
    );
    assert.deepEqual(
      sortActiveFirst(tasks, new Map([['just-done', { status: 'pending' }]])).map((t) => t.id),
      ['open-1', 'just-done', 'open-3'],
    );
  });

  it('cycles the row check: pending → in progress (half) → completed → pending', () => {
    assert.equal(nextCheckStatus('pending'), 'in_progress');
    assert.equal(nextCheckStatus('in_progress'), 'completed');
    assert.equal(nextCheckStatus('completed'), 'pending');
  });
});

describe('holding just-changed tasks in place', () => {
  const pendingFilter: TaskFilterState = { ...NO_FILTERS, status: 'pending' };
  const tasks = [
    task({ id: 'a', sortOrder: 1 }),
    task({ id: 'b', status: 'completed', sortOrder: 2 }), // 방금 대기 → 완료
    task({ id: 'c', sortOrder: 3 }),
  ];
  const held = new Map([['b', { status: 'pending' }]]);

  it('drops a completed task from a pending-only filter when it is not held', () => {
    assert.deepEqual(
      filterTasks(tasks, pendingFilter, undefined, NOW).map((t) => t.id),
      ['a', 'c'],
    );
  });

  it('keeps the held task in its row under a status filter so the next row does not shift up', () => {
    const result = filterTasks(tasks, pendingFilter, held, NOW);
    assert.deepEqual(
      result.map((t) => t.id),
      ['a', 'b', 'c'],
    );
    // 표시는 새 상태 그대로 (완료 체크·취소선)
    assert.equal(result[1].status, 'completed');
  });

  it('keeps a held task under the overdue filter after it is completed', () => {
    const overdue = [task({ id: 'late', status: 'completed', dueDate: due(2026, 11, 2) })];
    const overdueFilter = { ...NO_FILTERS, due: 'overdue' as const };
    assert.equal(filterTasks(overdue, overdueFilter, undefined, NOW).length, 0);
    assert.equal(
      filterTasks(overdue, overdueFilter, new Map([['late', { status: 'pending' }]]), NOW).length,
      1,
    );
  });

  it('groups a held task by its previous status (status view / board column)', () => {
    assert.equal(heldStatusOf(tasks[1], held), 'pending');
    assert.equal(heldStatusOf(tasks[1]), 'completed');
  });
});

describe('task order is independent of status', () => {
  it('breaks sortOrder ties by newest createdAt, so a status change never reorders rows', () => {
    const older = task({ id: 'older', createdAt: '2026-10-01T00:00:00.000Z' });
    const newer = task({ id: 'newer', createdAt: '2026-10-05T00:00:00.000Z' });
    // 서버는 status 순으로 내려주므로 상태가 바뀌면 배열 순서가 달라질 수 있다
    const asPending = [older, newer].sort(compareTaskOrder).map((t) => t.id);
    const afterComplete = [{ ...newer, status: 'completed' }, older]
      .sort(compareTaskOrder)
      .map((t) => t.id);
    assert.deepEqual(asPending, ['newer', 'older']);
    assert.deepEqual(afterComplete, ['newer', 'older']);
  });
});

describe('status tabs and priority filter', () => {
  const tasks = [
    task({ id: 'p1', priority: 'urgent' }),
    task({ id: 'p2', priority: 'high', status: 'in_progress' }),
    task({ id: 'p3', priority: 'high', status: 'completed' }),
    task({ id: 'p4', priority: 'low', status: 'cancelled' }),
  ];

  it('counts every status tab while ignoring the selected status', () => {
    assert.deepEqual(countByStatus(tasks, { ...NO_FILTERS, status: 'completed' }, NOW), {
      all: 3,
      pending: 1,
      in_progress: 1,
      completed: 1,
      cancelled: 1,
    });
  });

  it('filters by any of the selected priorities and counts priorities without that filter', () => {
    const filters = { ...NO_FILTERS, priorities: ['urgent', 'high'] };
    assert.deepEqual(
      tasks.filter((t) => matchesTaskFilters(t, filters, { now: NOW })).map((t) => t.id),
      ['p1', 'p2', 'p3'],
    );
    const counts = countByPriority(tasks, { ...filters, priorities: ['urgent'] }, NOW);
    assert.equal(counts.get('high'), 2);
    assert.equal(counts.get('low'), undefined); // 취소는 기본 숨김
  });
});

describe('optimistic task update from the edit dialog', () => {
  const base = task({
    id: 't',
    title: '전 제목',
    priority: 'medium',
    assignedToId: 'u1',
    assignedTo: { id: 'u1', name: '김중개' },
    contactId: 'c1',
    contact: { id: 'c1', name: '강수연', phone: '01011112222' },
    propertyId: 'p1',
    property: { id: 'p1' } as Task['property'],
  });

  it('applies saved fields so a later edit starts from the saved values', () => {
    const next = applyTaskUpdate(
      base,
      { title: '새 제목', priority: 'high', dueDate: '2026-11-20', assignedToId: 'u2', propertyId: null },
      { employees: [{ id: 'u2', name: '박실장' }] },
    );
    assert.equal(next.title, '새 제목');
    assert.equal(next.priority, 'high');
    assert.equal(next.dueDate, '2026-11-20T00:00:00.000Z');
    assert.deepEqual(next.assignedTo, { id: 'u2', name: '박실장' });
    assert.equal(next.propertyId, null);
    assert.equal(next.property, null);
    assert.equal(next.contact?.name, '강수연'); // 건드리지 않은 연결은 유지
  });

  it('links a newly picked contact and clears an unlinked one', () => {
    const picked = { id: 'c2', name: '한지우', phone: null };
    assert.deepEqual(applyTaskUpdate(base, { contactId: 'c2' }, { employees: [], contact: picked }).contact, picked);
    assert.equal(applyTaskUpdate(base, { contactId: null }).contact, null);
  });
});

describe('scope tabs (내 담당 · 내가 요청 · 팀 전체)', () => {
  const me = 'u1';
  const mine = task({ id: 'mine', assignedToId: me, createdById: 'u2' });
  const requested = task({ id: 'requested', assignedToId: 'u2', createdById: me });
  const selfMade = task({ id: 'self', assignedToId: me, createdById: me });
  const others = task({ id: 'others', assignedToId: 'u2', createdById: 'u3' });
  const unassignedByMe = task({ id: 'unassigned-by-me', assignedToId: null, createdById: me });
  const all = [mine, requested, selfMade, others, unassignedByMe];
  const ids = (filters: TaskFilterState) => filterTasks(all, filters, undefined, NOW).map((t) => t.id).sort();

  it('splits tasks assigned to me from tasks I handed to someone else', () => {
    assert.deepEqual(ids({ ...NO_FILTERS, scope: 'mine', currentUserId: me }), ['mine', 'self']);
    // 내가 만들어 나에게 배정한 업무는 "내 담당"에만, 아직 아무에게도 안 맡긴 업무는 "내가 요청"에 남는다
    assert.deepEqual(ids({ ...NO_FILTERS, scope: 'requested', currentUserId: me }), ['requested', 'unassigned-by-me']);
    assert.deepEqual(ids({ ...NO_FILTERS, scope: 'team', currentUserId: me }), [
      'mine',
      'others',
      'requested',
      'self',
      'unassigned-by-me',
    ]);
  });

  it('counts open tasks per tab, ignoring the selected tab and status but not other filters', () => {
    const done = task({ id: 'done', assignedToId: me, status: 'completed' });
    const filters: TaskFilterState = { ...NO_FILTERS, scope: 'mine', currentUserId: me, status: 'completed' };
    assert.deepEqual(countByScope([...all, done], filters, NOW), { mine: 2, requested: 2, team: 5 });
    const urgentOnly: TaskFilterState = { ...filters, priorities: ['urgent'] };
    assert.deepEqual(countByScope([...all, task({ id: 'u', assignedToId: me, priority: 'urgent' })], urgentOnly, NOW), {
      mine: 1,
      requested: 0,
      team: 1,
    });
  });

  it('hides completed tasks when "show completed" is off, unless the status filter asks for them', () => {
    const done = task({ id: 'done', status: 'completed' });
    const open = task({ id: 'open' });
    const hide: TaskFilterState = { ...NO_FILTERS, hideCompleted: true };
    assert.deepEqual(filterTasks([done, open], hide, undefined, NOW).map((t) => t.id), ['open']);
    assert.deepEqual(filterTasks([done, open], { ...hide, status: 'completed' }, undefined, NOW).map((t) => t.id), ['done']);
    // 방금 완료한 업무는 바꾸기 전 상태로 판단해 제자리에 남는다
    const held = new Map([['done', { status: 'pending' }]]);
    assert.deepEqual(filterTasks([done, open], hide, held, NOW).map((t) => t.id).sort(), ['done', 'open']);
  });
});

describe('due label and due groups', () => {
  it('describes due dates relative to today', () => {
    const at = (y: number, m: number, d: number, status = 'pending') => describeDue({ status, dueDate: due(y, m, d) }, NOW);
    assert.deepEqual(at(2026, 11, 1), { text: '3일 지남', tone: 'overdue' });
    assert.deepEqual(at(2026, 11, 3), { text: '어제', tone: 'overdue' });
    assert.deepEqual(at(2026, 11, 4), { text: '오늘', tone: 'today' });
    assert.deepEqual(at(2026, 11, 5), { text: '내일', tone: 'normal' });
    assert.deepEqual(at(2026, 11, 6), { text: '11.6 (금)', tone: 'normal' });
    assert.deepEqual(at(2027, 1, 5), { text: '2027.01.05', tone: 'normal' });
    // 끝난 업무는 "지남" 대신 날짜만 흐리게
    assert.deepEqual(at(2026, 11, 1, 'completed'), { text: '11.1 (일)', tone: 'muted' });
    assert.equal(describeDue({ status: 'pending', dueDate: null }, NOW), null);
  });

  it('buckets by due date with the same 7-day window as the due filter', () => {
    const bucket = (y: number, m: number, d: number) => dueBucketOf({ dueDate: due(y, m, d) }, NOW);
    assert.equal(bucket(2026, 11, 3), 'overdue');
    assert.equal(bucket(2026, 11, 4), 'today');
    assert.equal(bucket(2026, 11, 5), 'tomorrow');
    assert.equal(bucket(2026, 11, 11), 'week');
    assert.equal(bucket(2026, 11, 12), 'later');
    assert.equal(dueBucketOf({ dueDate: null }, NOW), 'none');
  });
});

describe('grouping and sorting the list', () => {
  const keys = (groups: { key: string; tasks: Task[] }[]) => groups.map((g) => `${g.key}:${g.tasks.map((t) => t.id).join(',')}`);

  it('groups by status with in-progress first and keeps a held task in its previous group', () => {
    const tasks = [
      task({ id: 'p1' }),
      task({ id: 'i1', status: 'in_progress' }),
      task({ id: 'c1', status: 'completed' }),
      task({ id: 'x1', status: 'cancelled' }),
    ];
    assert.deepEqual(keys(groupTasks(tasks, 'status', { sortBy: 'manual', now: NOW })), [
      'in_progress:i1',
      'pending:p1',
      'completed:c1',
      'cancelled:x1',
    ]);
    const held = new Map([['c1', { status: 'in_progress' }]]);
    assert.deepEqual(keys(groupTasks(tasks, 'status', { sortBy: 'manual', held, now: NOW })), [
      // 같은 순서값끼리는 id 순 — 붙잡힌 업무도 묶음 안에서 원래 순서 규칙을 따른다
      'in_progress:c1,i1',
      'pending:p1',
      'cancelled:x1',
    ]);
  });

  it('groups by due date and sends finished tasks to the bottom regardless of their date', () => {
    const tasks = [
      task({ id: 'late', dueDate: due(2026, 11, 2) }),
      task({ id: 'today', dueDate: due(2026, 11, 4) }),
      task({ id: 'none' }),
      task({ id: 'done-late', status: 'completed', dueDate: due(2026, 11, 2) }),
    ];
    assert.deepEqual(keys(groupTasks(tasks, 'due', { sortBy: 'manual', now: NOW })), [
      'overdue:late',
      'today:today',
      'none:none',
      'completed:done-late',
    ]);
  });

  it('groups by assignee with me first, others by name, and unassigned last', () => {
    const tasks = [
      task({ id: 'z', assignedToId: 'u3', assignedTo: { id: 'u3', name: '하지민' } as Task['assignedTo'] }),
      task({ id: 'n' }),
      task({ id: 'a', assignedToId: 'u2', assignedTo: { id: 'u2', name: '김실장' } as Task['assignedTo'] }),
      task({ id: 'm', assignedToId: 'u1', assignedTo: { id: 'u1', name: '이현수' } as Task['assignedTo'] }),
    ];
    assert.deepEqual(
      groupTasks(tasks, 'assignee', { sortBy: 'manual', now: NOW, currentUserId: 'u1' }).map((g) => g.key),
      ['u1', 'u2', 'u3', 'unassigned'],
    );
  });

  it('groups by category in the configured order, putting unknown categories under 기타', () => {
    const tasks = [task({ id: 'ad', category: 'advertisement' }), task({ id: 'weird', category: 'legacy' }), task({ id: 'p', category: 'property' })];
    assert.deepEqual(
      groupTasks(tasks, 'category', { sortBy: 'manual', now: NOW, categoryOrder: ['property', 'other', 'advertisement'] }).map(
        (g) => g.key,
      ),
      ['property', 'other', 'advertisement'],
    );
  });

  it('sorts by priority or due date while keeping finished tasks at the bottom', () => {
    const tasks = [
      task({ id: 'low-soon', priority: 'low', dueDate: due(2026, 11, 4) }),
      task({ id: 'urgent-late', priority: 'urgent', dueDate: due(2026, 11, 20) }),
      task({ id: 'high-none', priority: 'high' }),
      task({ id: 'done-urgent', priority: 'urgent', status: 'completed' }),
    ];
    assert.deepEqual(sortTasksBy(tasks, 'priority').map((t) => t.id), ['urgent-late', 'high-none', 'low-soon', 'done-urgent']);
    assert.deepEqual(sortTasksBy(tasks, 'due').map((t) => t.id), ['low-soon', 'urgent-late', 'high-none', 'done-urgent']);
  });
});

describe('display settings', () => {
  it('falls back to defaults for missing or broken stored values', () => {
    assert.deepEqual(parseTaskDisplay(null), DEFAULT_TASK_DISPLAY);
    assert.deepEqual(parseTaskDisplay('{broken'), DEFAULT_TASK_DISPLAY);
    const partial = parseTaskDisplay(JSON.stringify({ groupBy: 'due', sortBy: 'nope', visible: { category: false } }));
    assert.equal(partial.groupBy, 'due');
    assert.equal(partial.sortBy, 'manual');
    assert.deepEqual(partial.visible, { context: true, category: false, assignee: true, due: true });
  });

  it('carries over the old view mode once', () => {
    assert.equal(parseTaskDisplay(null, 'board').layout, 'board');
    assert.equal(parseTaskDisplay(null, 'category').groupBy, 'category');
    assert.equal(parseTaskDisplay(null, 'list').groupBy, 'none');
    assert.equal(parseTaskDisplay(null, 'status').groupBy, 'status');
    // 새 설정이 있으면 예전 값은 무시
    assert.equal(parseTaskDisplay(JSON.stringify({ layout: 'list' }), 'board').layout, 'list');
  });

  it('shows status groups instead of a single-person assignee grouping on the 내 담당 tab', () => {
    assert.equal(effectiveGroupBy('assignee', 'mine'), 'status');
    assert.equal(effectiveGroupBy('assignee', 'team'), 'assignee');
    assert.equal(parseTaskScope('team'), 'team');
    assert.equal(parseTaskScope('weird'), 'mine');
  });
});

describe('status columns in the drag-sortable list', () => {
  it('still shows completed tasks picked by the status filter while "show completed" is off', () => {
    const done = task({ id: 'done', status: 'completed' });
    const open = task({ id: 'open' });
    const filters: TaskFilterState = { ...NO_FILTERS, status: 'completed', hideCompleted: true };
    const visible = filterTasks([done, open], filters, undefined, NOW);
    assert.deepEqual(visible.map((t) => t.id), ['done']);
    // 필터를 통과한 완료 업무를 담을 묶음이 있어야 한다 (없으면 목록이 빈다)
    const columns = listStatusColumns(filters.status, false);
    assert.deepEqual(columns, ['completed']);
    assert.ok(visible.every((t) => (columns as string[]).includes(t.status)));
  });

  it('shows only the filtered status, or open groups plus completed when shown', () => {
    assert.deepEqual(listStatusColumns('pending', true), ['pending']);
    assert.deepEqual(listStatusColumns('', true), ['in_progress', 'pending', 'completed']);
    assert.deepEqual(listStatusColumns('', false), ['in_progress', 'pending']);
  });
});
