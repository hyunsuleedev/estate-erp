import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  countActiveFilters,
  defaultListFilters,
  getContactPhone,
  getContractDateTone,
  isBalanceOverdue,
  isPristineList,
  summarizeDateFilter,
  summarizePriceFilter,
  toContractsFilter,
} from '../src/renderer/routes/_authenticated/contracts/-list-model';

const testDir = dirname(fileURLToPath(import.meta.url));
const contractsDir = resolve(testDir, '../src/renderer/routes/_authenticated/contracts');
const read = (path: string) => readFileSync(resolve(contractsDir, path), 'utf8');

const pageSource = read('index.tsx');
const toolbarSource = read('-list-toolbar.tsx');
const tableSource = read('-document-list-table.tsx');
const peekSource = read('-document-peek.tsx');
const gallerySource = read('-document-gallery.tsx');

describe('desktop documents list page (Notion database layout)', () => {
  it('starts with the view tabs, without a title, description or KPI tiles', () => {
    assert.match(pageSource, /data-contracts-page/);
    assert.match(pageSource, /<ContractsViewBar/);
    for (const removed of ['PageHeader', 'MetricTile', 'ContractsTitleBlock', '진행 계약', '서명 완료', '잔금 대기', '자료 누락 계약']) {
      assert.ok(!pageSource.includes(removed), `${removed} should be gone from the page`);
    }
    assert.doesNotMatch(toolbarSource, /<h1/);
    assert.doesNotMatch(read('-contract-shared.tsx'), /export function MetricTile/);
  });

  it('lays out view bar → filter row → table or gallery → footer, with the side peek beside them', () => {
    const order = ['<ContractsViewBar', '<ContractsFilterRow', '<DocumentListTable', '<DocumentGallery', 'data-contracts-footer', '<ContractPeek'];
    let last = -1;
    for (const part of order) {
      const at = pageSource.indexOf(part);
      assert.ok(at > last, `${part} missing or out of order`);
      last = at;
    }
  });

  it('keeps every legacy search condition reachable', () => {
    for (const label of ['서식', '거래유형', '상태', '문서 준비', '날짜', '금액', '공동중개', '보존기간 경과', '초기화', '검색 범위', '고객 연락처 표시', '목록', '자료 중심']) {
      assert.ok(toolbarSource.includes(label), `${label} missing from the toolbar`);
    }
    // 보기 탭은 전체 · 진행중 · 완료 (Notion 알약 탭)
    assert.match(toolbarSource, /role="tablist"/);
    assert.match(toolbarSource, /rounded-\[20px\]/);
  });

  it('keeps every legacy column, with the title column first and pinned', () => {
    const labels = ['소재지 / 매물', '계약일', '중개', '거래', '금액', '중도금일', '잔금일', '매도(임)인', '매수(임)인', '상태', '신고', '문서'];
    let last = -1;
    for (const label of labels) {
      const at = tableSource.indexOf(`label: '${label}'`);
      assert.ok(at > last, `${label} column missing or out of order`);
      last = at;
    }
    assert.match(tableSource, /index === 0 && 'left-0 z-\[3\]'/);
    assert.match(tableSource, /'sticky left-0 z-\[1\]'/);
    // Notion 표 치수: 머리줄 · 행 36px, 글자 14px
    assert.match(tableSource, /sticky top-0 z-\[2\] h-9/);
    assert.match(tableSource, /'h-9 border-b border-border px-2 align-middle text-\[14px\]/);
  });

  it('does not show contract memos on the list page', () => {
    for (const source of [tableSource, peekSource, gallerySource, toolbarSource]) {
      assert.doesNotMatch(source, /contract\.memo/);
      assert.doesNotMatch(source, />메모</);
      assert.doesNotMatch(source, /label: '메모'/);
    }
  });

  it('keeps the search open while its scope menu (rendered in a portal) has focus', () => {
    assert.match(toolbarSource, /scopeMenuOpenRef\.current = menuOpen/);
    assert.match(toolbarSource, /if \(scopeMenuOpenRef\.current\) return;/);
    assert.match(toolbarSource, /closest\('\[role="menu"\]'\)/);
  });

  it('opens the side panel first; the editor tab is reached from the panel', () => {
    // 행 누르기 · Enter · 열기 버튼 → 옆 상세 패널
    assert.match(tableSource, /onClick=\{\(\) => onSelect\(contract\.id\)\}/);
    assert.match(tableSource, /event\.key === 'Enter' \|\| event\.key === ' '/);
    assert.match(tableSource, /<RowOpenButton/);
    assert.match(tableSource, /onToggle=\{\(\) => onSelect\(selected \? null : contract\.id\)\}/);
    // 목록에서 편집 탭으로 바로 가지 않는다
    for (const source of [tableSource, gallerySource]) {
      assert.doesNotMatch(source, /onOpen/);
      assert.doesNotMatch(source, /onDoubleClick=\{\(\) =>/);
    }
    // 패널: 매물관리와 같은 도구 줄(닫기 · 새 탭으로 확장), 확장하면 편집 탭을 열고 패널을 닫는다
    assert.match(peekSource, /<PropertyInspectorToolbar/);
    assert.match(peekSource, /onOpenNewTab=\{\(\) => expand\(\)\}/);
    assert.match(peekSource, /onOpen\(contract\.id, documentId\);\s*onClose\(false\);/);
    assert.match(peekSource, /data-property-inspector/);
    assert.match(peekSource, /onClick=\{\(\) => expand\(document\.id\)\}/);
    assert.match(pageSource, /onOpen=\{openContractEditorTab\}/);
    assert.match(pageSource, /closing=\{isPeekClosing\}/);
    // 사본 · 삭제는 명시 버튼으로만 (행 · 패널)
    for (const source of [tableSource, peekSource]) {
      assert.ok(source.includes('사본 만들기'));
      assert.ok(source.includes('계약서 삭제'));
    }
  });

  it('uses the same row open button as the property list', () => {
    const shared = readFileSync(resolve(contractsDir, '../../../components/domain/row-open-button.tsx'), 'utf8');
    const propertyPage = read('../properties/index.tsx');
    const classNames = (source: string, marker: string) => {
      const at = source.indexOf(marker);
      if (at < 0) return null;
      return [...source.slice(at, at + 3200).matchAll(/className="([^"]+)"/g)].slice(0, 3).map((match) => match[1]);
    };
    const sharedClasses = classNames(shared, 'data-row-open');
    assert.ok(sharedClasses && sharedClasses.length === 3);
    assert.match(shared, /사이드 보기에서 열기/);
    assert.match(shared, /'닫기' : '열기'/);
    // 매물관리가 아직 같은 마크업을 직접 갖고 있는 동안에는 글자 하나까지 같아야 한다.
    const propertyClasses = classNames(propertyPage, 'data-property-row-open');
    if (propertyClasses) assert.deepEqual(sharedClasses, propertyClasses);
  });

  it('uses shared status tones instead of a page-local palette', () => {
    assert.match(tableSource, /<StatusBadge kind="contractStatus"/);
    assert.match(tableSource, /<ContractTransactionTypeBadge/);
    for (const source of [tableSource, peekSource, gallerySource, toolbarSource]) {
      assert.doesNotMatch(source, /bg-(?:red|emerald|amber|sky|rose)-\d/);
    }
  });
});

describe('documents list model', () => {
  const now = new Date(2026, 10, 15, 14, 30); // 2026-11-15
  const day = (offset: number) => new Date(2026, 10, 15 + offset, 9).toISOString();

  it('sends no conditions for the default filters', () => {
    const filter = toContractsFilter(defaultListFilters());
    assert.deepEqual(
      Object.values(filter).filter((value) => value !== undefined),
      [],
    );
    assert.equal(countActiveFilters(defaultListFilters(), ''), 0);
    assert.equal(isPristineList(defaultListFilters(), '', 'all'), true);
    assert.equal(isPristineList(defaultListFilters(), '', 'active'), false);
    assert.equal(isPristineList(defaultListFilters(), 'missing', 'all'), false);
  });

  it('sends the date and price field only with a range, and search field only with text', () => {
    const filters = { ...defaultListFilters(), dateField: 'statedBalanceDate' as const, priceField: 'statedDeposit' as const, searchField: 'phone' };
    assert.equal(toContractsFilter(filters).dateField, undefined);
    assert.equal(toContractsFilter(filters).priceField, undefined);
    assert.equal(toContractsFilter(filters).searchField, undefined);

    const ranged = toContractsFilter({ ...filters, dateTo: '2026-11-30', priceMin: '0', search: ' 8812 ' });
    assert.equal(ranged.dateField, 'statedBalanceDate');
    assert.equal(ranged.dateTo, '2026-11-30');
    assert.equal(ranged.priceField, 'statedDeposit');
    assert.equal(ranged.priceMin, 0);
    assert.equal(ranged.searchField, 'phone');
    assert.equal(ranged.search, '8812');
    assert.equal(toContractsFilter({ ...defaultListFilters(), search: '김' }).searchField, 'all');
  });

  it('summarises the date and price chips', () => {
    const base = defaultListFilters();
    assert.equal(summarizeDateFilter(base), null);
    assert.equal(summarizeDateFilter({ ...base, dateFrom: '2026-11-01', dateTo: '2026-11-30' }), '계약일자 26.11.01 ~ 26.11.30');
    assert.equal(summarizeDateFilter({ ...base, dateField: 'statedBalanceDate', dateFrom: '2026-11-01' }), '잔금일자 26.11.01 이후');
    assert.equal(summarizeDateFilter({ ...base, dateTo: '2026-11-30' }), '계약일자 26.11.30 이전');

    assert.equal(summarizePriceFilter(base), null);
    assert.equal(summarizePriceFilter({ ...base, priceMin: '10000', priceMax: '50000' }), '거래금액 1억 ~ 5억');
    assert.equal(summarizePriceFilter({ ...base, priceField: 'statedDeposit', priceMin: '3000' }), '계약금 3,000만 이상');
    // 0원은 금액이다 ("—"로 적지 않는다)
    assert.equal(summarizePriceFilter({ ...base, priceField: 'monthlyRent', priceMin: '0', priceMax: '100' }), '월차임 0 ~ 100만');
    assert.equal(summarizePriceFilter({ ...base, priceMax: 'abc' }), null);
  });

  it('counts active conditions without the search text', () => {
    const filters = { ...defaultListFilters(), search: '김', kind: 'base_contract', dateFrom: '2026-11-01', dateTo: '2026-11-30', priceMax: '5000', isJointBrokerage: true };
    assert.equal(countActiveFilters(filters, 'missing'), 5);
  });

  it('classifies dates as today, tomorrow, past or future by calendar day', () => {
    assert.equal(getContractDateTone(null, now), 'none');
    assert.equal(getContractDateTone('not-a-date', now), 'none');
    assert.equal(getContractDateTone(new Date(2026, 10, 15, 0, 5).toISOString(), now), 'today');
    assert.equal(getContractDateTone(new Date(2026, 10, 15, 23, 50).toISOString(), now), 'today');
    assert.equal(getContractDateTone(day(1), now), 'tomorrow');
    assert.equal(getContractDateTone(day(-1), now), 'past');
    assert.equal(getContractDateTone(day(2), now), 'future');
  });

  it('flags an unpaid balance only after its date has passed', () => {
    assert.equal(isBalanceOverdue({ status: 'signed', statedBalanceDate: day(-4) }, now), true);
    assert.equal(isBalanceOverdue({ status: 'signed', statedBalanceDate: day(0) }, now), false);
    assert.equal(isBalanceOverdue({ status: 'signed', statedBalanceDate: null }, now), false);
    for (const status of ['balancePaid', 'registered', 'cancelled']) {
      assert.equal(isBalanceOverdue({ status, statedBalanceDate: day(-4) }, now), false);
    }
  });

  it('falls back to the first registered phone number', () => {
    assert.equal(getContactPhone(null), null);
    assert.equal(getContactPhone({ phone: '01011112222', phones: [{ phone: '0299998888' }] }), '01011112222');
    assert.equal(getContactPhone({ phone: null, phones: [{ phone: '0299998888' }] }), '0299998888');
    assert.equal(getContactPhone({ phone: '', phones: [] }), null);
  });
});
