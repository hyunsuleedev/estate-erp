import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTACT_CATEGORY_KEYS } from '@estate-erp/shared';
import {
  hasContactTagsChanged,
  splitContactTags,
  stringifyContactTags,
} from '../src/renderer/lib/contacts';
import {
  ALL_CONTACTS_CATEGORY,
  CONTACT_CATEGORY_SECTIONS,
  contactGroupCategory,
  contactGroupNameOf,
  resolveContactCategory,
  validateContactGroupName,
} from '../src/renderer/routes/_authenticated/contacts/-contact-categories';

const testDir = dirname(fileURLToPath(import.meta.url));
const contactsDir = resolve(testDir, '../src/renderer/routes/_authenticated/contacts');
const pageSource = readFileSync(resolve(contactsDir, 'index.tsx'), 'utf8');
const panelSource = readFileSync(
  resolve(contactsDir, '-contact-categories-panel.tsx'),
  'utf8',
);
const tableStyles = readFileSync(resolve(contactsDir, '-contacts-table.css'), 'utf8');

describe('desktop contacts pages', () => {
  it('offers every automatic category from the server exactly once', () => {
    const sectionIds = CONTACT_CATEGORY_SECTIONS.flatMap((section) =>
      section.categories.map((category) => category.id),
    );
    assert.deepEqual([...sectionIds].sort(), [...CONTACT_CATEGORY_KEYS].sort());
    assert.deepEqual(resolveContactCategory('tenant').filter, { category: 'tenant' });
    // 없는 분류 id는 전체로 되돌려 빈 화면을 만들지 않는다.
    assert.equal(resolveContactCategory('missing'), ALL_CONTACTS_CATEGORY);
  });

  it('keeps group names intact when they contain a slash', () => {
    const category = contactGroupCategory('매수/투자');
    assert.deepEqual(category.filter, { tags: '매수/투자' });
    assert.equal(contactGroupNameOf(category.id), '매수/투자');
    assert.equal(contactGroupNameOf('tenant'), null);
    assert.deepEqual(resolveContactCategory(category.id).filter, { tags: '매수/투자' });
  });

  it('validates group names with the same rules as the server', () => {
    assert.equal(validateContactGroupName('재개발 관심'), null);
    assert.ok(validateContactGroupName('   '));
    assert.ok(validateContactGroupName('VIP,단골'));
    assert.ok(validateContactGroupName('ㄱ'.repeat(31)));
    // 화면에서 숨기는 옛 태그로는 만들 수 없다.
    assert.ok(validateContactGroupName('중개사무소'));
  });

  it('names sidebar sections by what people look for, with deals under progress', () => {
    assert.deepEqual(
      CONTACT_CATEGORY_SECTIONS.map((section) => section.label),
      ['고객 구분', '진행 상황', '정리'],
    );
    assert.ok(
      CONTACT_CATEGORY_SECTIONS[1].categories.some((category) => category.id === 'in_deal'),
    );
  });

  it('only sends tags from the edit form when they actually changed', () => {
    const current = ['매수/투자', 'VIP', '재개발 관심'];
    // 그대로면 보내지 않아, 폼을 연 사이 다른 직원이 넣은 그룹이 지워지지 않는다.
    assert.equal(hasContactTagsChanged(current, ['매수/투자'], 'VIP, 재개발 관심'), false);
    assert.equal(hasContactTagsChanged(current, ['매수/투자'], 'VIP'), true);
    assert.equal(hasContactTagsChanged(current, [], 'VIP, 재개발 관심'), true);
    // 숨긴 옛 태그만 있는 연락처를 저장해도 태그를 건드리지 않는다.
    assert.equal(hasContactTagsChanged(['중개사무소'], [], ''), false);

    // 폼을 연 그대로 저장하면 어떤 태그든 변경이 아니다. 공백·쉼표가 든 옛 태그도 다시 쓰지 않는다.
    for (const tags of [
      [],
      ['VIP '],
      ['  앞뒤 공백  '],
      ['a,b'],
      ['VIP', 'VIP'],
      ['중개사무소', 'VIP'],
      ['매수/투자', '매수/투자'],
      ['거래처', 'a,b', ' 법무사', '중개사무소'],
    ]) {
      const { groupTags, customTags } = splitContactTags(tags);
      assert.equal(
        hasContactTagsChanged(tags, groupTags, stringifyContactTags(customTags)),
        false,
        JSON.stringify(tags),
      );
    }
    // 정리하면 같아지는 값이어도 사용자가 고르거나 고친 것은 반드시 저장한다.
    assert.equal(hasContactTagsChanged(['거래처 '], ['거래처'], '거래처 '), true);
    assert.equal(hasContactTagsChanged(['a,거래처'], ['거래처'], 'a,거래처'), true);
    assert.equal(hasContactTagsChanged(['거래처 '], [], '거래처'), true);
    assert.equal(hasContactTagsChanged(['a,b'], [], 'a, b'), true);
    // 그룹을 빼거나 넣고, 태그를 바꾸는 일반적인 경우
    assert.equal(hasContactTagsChanged(['거래처'], [], ''), true);
    assert.equal(hasContactTagsChanged([], ['거래처'], ''), true);
    assert.equal(hasContactTagsChanged(['VIP '], [], 'VIP, 단골'), true);
    assert.equal(hasContactTagsChanged(['VIP '], ['거래처'], 'VIP '), true);
    // 켰다 끄거나 순서만 달라진 그룹 선택은 변경이 아니다.
    assert.equal(hasContactTagsChanged(['거래처', '소유자'], ['거래처', '소유자'], ''), false);
    assert.equal(hasContactTagsChanged(['거래처', '소유자'], ['소유자', '거래처'], ''), false);

    const dialogSource = readFileSync(resolve(contactsDir, '-detail-dialogs.tsx'), 'utf8');
    assert.match(
      dialogSource,
      /\.\.\.\(hasContactTagsChanged\(contact\.tags, groupTags, customTagsInput\) && \{/,
    );
  });

  it('reads counts and groups from one summary and can retry when it fails', () => {
    assert.match(pageSource, /<ContactCategoriesPanel selectedId=\{categoryId\}/);
    assert.match(pageSource, /\.\.\.category\.filter,/);
    assert.match(panelSource, /api\.contacts\.getCategorySummary\(\)/);
    assert.match(panelSource, /w-\[240px\]/);
    // 건수를 못 불러와도 자동 분류와 고른 그룹은 그대로 쓸 수 있어야 한다.
    assert.match(panelSource, /role="alert"/);
    assert.match(panelSource, /void summary\.refetch\(\)/);
    assert.match(
      panelSource,
      /selectedGroupName && !loadedGroups\.some\(\(\{ name \}\) => name === selectedGroupName\)/,
    );
    // 사이드바로 옮긴 필터 칩이 남아 같은 조건을 두 곳에서 고르지 않게 한다.
    assert.doesNotMatch(pageSource, /FilterToggleChip/);
    // 표가 무거워 열고 닫을 때 폭 전환 애니메이션을 쓰지 않는다.
    assert.doesNotMatch(panelSource, /transition-\[width\]/);
  });

  it('lets people create, rename and delete shared groups', () => {
    assert.match(panelSource, /api\.contacts\.createGroup\(typedName\)/);
    assert.match(panelSource, /api\.contacts\.renameGroup\(renameTarget, newName\)/);
    assert.match(panelSource, /api\.contacts\.deleteGroup\(name\)/);
    assert.match(panelSource, /연락처는 지워지지 않고 그룹에서만 빠집니다/);
    // 고른 그룹의 이름이 바뀌거나 삭제되면 빈 화면에 남지 않는다.
    assert.match(
      panelSource,
      /selectedGroupName === renameTarget\) \{\s*onSelect\(contactGroupCategory\(name\)\.id\)/,
    );
    assert.match(
      panelSource,
      /contactGroupNameOf\(selectedId\) === name\) \{\s*onSelect\(ALL_CONTACTS_CATEGORY\.id\)/,
    );
  });

  it('adds selected contacts to a group and removes them from the current one', () => {
    assert.match(pageSource, /api\.contacts\.addGroupMembers\(name, contactIds\)/);
    assert.match(pageSource, /api\.contacts\.removeGroupMembers\(name, contactIds\)/);
    assert.match(pageSource, /\{currentGroupName && \(/);
    assert.match(pageSource, /onDone=\{\(\) => setSelectedContactIds\(\[\]\)\}/);
    // 그룹 목록을 못 불러와도 사이드바 없이 다시 불러올 수 있다.
    assert.match(pageSource, /그룹 목록 다시 불러오기/);
    assert.match(pageSource, /contactIds\.length > CONTACT_GROUP_MEMBERS_MAX/);
  });

  it('creates a group and its members in one request so a retry is never blocked', () => {
    assert.match(
      pageSource,
      /const \{ name, updated \} = await api\.contacts\.createGroup\(typedName, contactIds\)/,
    );
    assert.doesNotMatch(pageSource, /await api\.contacts\.createGroup\(name\);/);
    // 서버가 다듬은 이름으로 고른다. 입력값으로 고르면 없는 그룹이 선택된다.
    assert.match(panelSource, /const \{ name \} = await api\.contacts\.createGroup\(typedName\)/);
  });

  it('shows each contact as an even two-line row so virtualization stays on', () => {
    assert.match(pageSource, /const CONTACT_ROW_HEIGHT = 56;/);
    assert.match(pageSource, /<ContactPrimaryCell contact=\{row\.original\}/);
    // 상담이 없어도 둘째 줄을 둬서 행 높이를 맞춘다.
    assert.match(pageSource, /상담 기록 없음/);
    // 항상 펼쳐진 행이 있으면 가상화가 꺼지므로 희망·매물 패널만 행 아래로 펼친다.
    assert.match(
      pageSource,
      /const expandedRowIds = useMemo<ReadonlySet<string>>\(\s*\(\) => new Set\(expandedPanels\.keys\(\)\)/,
    );
    assert.doesNotMatch(pageSource, /collapsedConsultIds/);
    assert.match(tableStyles, /border-right: 0;/);
    assert.match(tableStyles, /box-shadow: none;/);
  });

  it('keeps the new-contact form in its owning tab and replaces it after save', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/contacts/new.tsx'),
      'utf8',
    );

    assert.match(source, /useTabScopedState\('contact-new:form:v1'/);
    assert.match(source, /replaceTabResource\(ownerTabIdRef\.current/);
    assert.match(source, /tabResourceKeys\.entity\('contact', created\.id\)/);
  });
});
