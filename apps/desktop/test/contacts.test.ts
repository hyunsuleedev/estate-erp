import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CONTACT_CATEGORY_KEYS, CONTACT_TAG_COLORS } from '@estate-erp/shared';
import {
  buildContactTagChoices,
  diffContactTags,
  normalizeContactTagName,
  validateContactTagName,
} from '../src/renderer/routes/_authenticated/contacts/-contact-tags';
import { toContactTagColor } from '../src/renderer/components/contacts/contact-tag-chip';
import {
  ALL_CONTACTS_CATEGORY,
  CONTACT_CATEGORY_SECTIONS,
  contactGroupCategory,
  contactGroupNameOf,
  diffContactGroups,
  resolveContactCategory,
  validateContactGroupName,
} from '../src/renderer/routes/_authenticated/contacts/-contact-categories';
import {
  isContactColumnVisible,
  parseContactColumnOverrides,
  setContactColumnVisible,
} from '../src/renderer/routes/_authenticated/contacts/-contact-columns';

const testDir = dirname(fileURLToPath(import.meta.url));
const contactsDir = resolve(testDir, '../src/renderer/routes/_authenticated/contacts');
const pageSource = readFileSync(resolve(contactsDir, 'index.tsx'), 'utf8');
const panelSource = readFileSync(
  resolve(contactsDir, '-contact-categories-panel.tsx'),
  'utf8',
);

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
    assert.deepEqual(category.filter, { group: '매수/투자' });
    assert.equal(contactGroupNameOf(category.id), '매수/투자');
    assert.equal(contactGroupNameOf('tenant'), null);
    assert.deepEqual(resolveContactCategory(category.id).filter, { group: '매수/투자' });
  });

  it('validates group names with the same rules as the server', () => {
    assert.equal(validateContactGroupName('재개발 관심'), null);
    assert.ok(validateContactGroupName('   '));
    assert.ok(validateContactGroupName('VIP,단골'));
    assert.ok(validateContactGroupName('ㄱ'.repeat(31)));
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

  it('picks tags from the office list, offers to create a missing one, and sends only what changed', () => {
    const options = [
      { name: 'VIP', color: 'yellow', count: 3 },
      { name: '신혼', color: 'gray', count: 1 },
      { name: '재개발 관심', color: 'blue', count: 0 },
    ];
    // 글자를 치지 않으면 전부, 치면 그 글자가 든 것만(대소문자 무시)
    assert.equal(buildContactTagChoices(options, [], '').matches.length, 3);
    assert.deepEqual(
      buildContactTagChoices(options, [], 'vi').matches.map((option) => option.name),
      ['VIP'],
    );
    // 같은 이름이 없을 때만 "생성" 줄이 나온다. 이름은 서버와 같은 규칙으로 다듬는다
    assert.equal(buildContactTagChoices(options, [], 'vi').createName, 'vi');
    assert.equal(buildContactTagChoices(options, [], ' VIP ').createName, null);
    assert.equal(buildContactTagChoices(options, [], '  학군   좋음 ').createName, '학군 좋음');
    // 폼에서 방금 만들어 고른(아직 저장 전인) 이름을 또 만들지 않는다
    assert.equal(buildContactTagChoices(options, ['학군'], '학군').createName, null);
    // 쓸 수 없는 이름은 만들 수 없다
    assert.equal(buildContactTagChoices(options, [], 'a,b').createName, null);
    assert.equal(buildContactTagChoices(options, [], 'ㄱ'.repeat(31)).createName, null);
    assert.ok(validateContactTagName('a,b'));
    assert.equal(validateContactTagName(' 단골 '), null);
    assert.equal(normalizeContactTagName('  재개발   관심 '), '재개발 관심');

    // 수정 창은 연 때의 태그와 비교해 바꾼 것만 붙이고 뗀다 (통째로 덮지 않는다)
    assert.deepEqual(diffContactTags(['VIP', '신혼'], ['신혼', '투자']), {
      added: ['투자'],
      removed: ['VIP'],
    });
    const dialogSource = readFileSync(resolve(contactsDir, '-detail-dialogs.tsx'), 'utf8');
    assert.match(dialogSource, /diffContactTags\(initialTags, tags\)/);
    assert.match(dialogSource, /api\.contacts\.assignTag\(name, \[contact\.id\]\)/);
    assert.doesNotMatch(dialogSource, /tags: parseContactTags|customTagsInput/);
  });

  it('draws tags as Notion-style colored chips and edits them in the table cell', () => {
    const chipSource = readFileSync(
      resolve(testDir, '../src/renderer/components/contacts/contact-tag-chip.tsx'),
      'utf8',
    );
    // Notion에서 잰 치수: 높이 20 · 모서리 4 · 좌우 6 · 글자 14/20
    assert.match(chipSource, /h-5 min-w-0 max-w-full shrink-0 items-center overflow-hidden rounded-\[4px\] pl-1\.5 text-\[14px\] font-normal leading-5/);
    assert.match(chipSource, /var\(--contact-tag-\$\{name\}-text\)/);
    // 색 아홉 가지가 모두 토큰으로 있다
    const css = readFileSync(resolve(testDir, '../src/renderer/app.css'), 'utf8');
    for (const color of CONTACT_TAG_COLORS) {
      assert.match(css, new RegExp(`--contact-tag-${color}-text: #[0-9a-f]{6};`));
      assert.match(css, new RegExp(`--contact-tag-${color}-bg: #[0-9a-f]{8};`));
    }
    assert.equal(toContactTagColor('teal'), 'gray');
    assert.equal(toContactTagColor(undefined), 'gray');
    assert.equal(toContactTagColor('pink'), 'pink');

    const pickerSource = readFileSync(resolve(contactsDir, '-contact-tag-picker.tsx'), 'utf8');
    // 고르는 창: 너비 300 · 모서리 6, 입력 줄은 콤보박스 · 목록은 리스트박스 · 줄은 28px 옵션
    assert.match(pickerSource, /w-\[300px\] overflow-hidden rounded-\[6px\]/);
    assert.match(pickerSource, /role="combobox"/);
    assert.match(pickerSource, /role="listbox"/);
    assert.match(pickerSource, /role="option"[\s\S]{0,400}flex h-7 cursor-pointer/);
    assert.match(pickerSource, /옵션 선택 또는 생성/);
    // 표의 칸에서는 태그 하나를 붙이고 떼는 요청만 보낸다
    // Enter 뒤에 따라오는 blur가 이름 변경을 한 번 더 보내지 않는다
    assert.match(pickerSource, /const commitName = \(\) => \{\s*if \(renaming\.current\) return;/);
    assert.match(pickerSource, /api\.contacts\.assignTag\(name, \[contactId\]\)/);
    assert.match(pickerSource, /api\.contacts\.unassignTag\(name, \[contactId\]\)/);
    assert.match(pageSource, /<ContactTagsCell\s+contactId=\{row\.original\.id\}/);
    // 붙이기 → 떼기를 빠르게 눌러도 누른 순서대로 저장된다 (요청을 줄 세운다)
    assert.match(pickerSource, /const turn = queue\.current\.then\(request\);\s*[^\n]*\n\s*queue\.current = turn\.catch\(\(\) => undefined\);/);
    // ⋯ 메뉴 안에서 누른 것이 목록 줄의 처리에 걸리지 않는다 (이름 입력칸에 커서가 들어간다)
    assert.match(pickerSource, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}\s*onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
    // pointerdown은 막지 않는다. 막으면 메뉴가 바깥 클릭 한 번에 닫히지 않는다
    assert.doesNotMatch(pickerSource, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  });

  it('keeps groups apart from tags and sends only the group changes the user made', () => {
    assert.deepEqual(diffContactGroups(['VIP', '설 선물'], ['설 선물', '단골']), {
      added: ['단골'],
      removed: ['VIP'],
    });
    assert.deepEqual(diffContactGroups(['VIP'], ['VIP']), { added: [], removed: [] });

    const dialogSource = readFileSync(resolve(contactsDir, '-detail-dialogs.tsx'), 'utf8');
    // 창을 연 때의 소속과 비교한다. 지금 값과 비교하면 그 사이 다른 직원이 넣은 그룹을 빼게 된다
    assert.match(dialogSource, /diffContactGroups\(initialGroups, groups\)/);
    assert.match(dialogSource, /setInitialGroups\(contact\.groups \?\? \[\]\);/);
    // 그룹과 태그는 서로 다른 칸에서 고른다
    for (const file of ['new.tsx', '-detail-dialogs.tsx']) {
      const source = readFileSync(resolve(contactsDir, file), 'utf8');
      assert.match(source, /<FormField label="그룹">\s*<ContactGroupPicker/);
      assert.match(source, /<FormField label="태그">/);
    }
  });

  it('shows tags by default and keeps the computed 구분 column behind the column chooser', () => {
    assert.equal(isContactColumnVisible({}, 'tags'), true);
    assert.equal(isContactColumnVisible({}, 'labels'), false);
    // 이름 · 작업처럼 목록에 없는 열은 끌 수 없다
    assert.equal(isContactColumnVisible({ name: false }, 'name'), true);
    assert.deepEqual(setContactColumnVisible({}, 'name', false), {});

    // 켠 것만 기록하고, 기본값으로 돌아가면 기록에서 지운다
    const shown = setContactColumnVisible({}, 'labels', true);
    assert.deepEqual(shown, { labels: true });
    assert.equal(isContactColumnVisible(shown, 'labels'), true);
    assert.deepEqual(setContactColumnVisible(shown, 'labels', false), {});
    assert.deepEqual(setContactColumnVisible({}, 'phone', false), { phone: false });

    // 저장된 값이 깨졌거나 모르는 열이 섞여 있어도 표가 뜬다
    assert.deepEqual(parseContactColumnOverrides('not json'), {});
    assert.deepEqual(parseContactColumnOverrides('[1]'), {});
    assert.deepEqual(
      parseContactColumnOverrides('{"labels":true,"gone":true,"phone":"no"}'),
      { labels: true },
    );

    // 구분 열은 계산된 특징과 그룹만, 태그는 태그 열만 보여 준다
    assert.match(pageSource, /id: 'tags',[\s\S]{0,520}tags=\{row\.original\.tags\}/);
    const labelsFn = pageSource.slice(
      pageSource.indexOf('function getContactLabels'),
      pageSource.indexOf('function ContactChipsCell'),
    );
    assert.doesNotMatch(labelsFn, /tags/);
    assert.match(pageSource, /<ContactColumnSettings overrides=\{columnOverrides\}/);
  });

  it('has no hand-picked fixed groups', () => {
    // 매수 · 임차 · 소유자는 연결에서 계산하는 특징이다. 손으로 고르는 고정 그룹은 없앴다 (사용자 결정 2026-11-18)
    const libSource = readFileSync(resolve(testDir, '../src/renderer/lib/contacts.ts'), 'utf8');
    assert.doesNotMatch(libSource, /export const CONTACT_GROUPS|splitContactTags|mergeContactTags|parseContactTags/);
    for (const file of ['new.tsx', '-detail-dialogs.tsx']) {
      assert.doesNotMatch(readFileSync(resolve(contactsDir, file), 'utf8'), /ContactGroupSelector/);
    }
  });

  it('reads counts and groups from one summary and can retry when it fails', () => {
    assert.match(pageSource, /<ContactCategoriesPanel selectedId=\{categoryId\}/);
    // 필터 칩: 분류 묶음마다 하나씩 고른 것을 쉼표로 이어 보내고(모두 만족), 그룹은 태그가 아니라 group으로 보낸다
    assert.match(pageSource, /category: \(activeCategoryKeys\.join\(','\) \|\| undefined\)/);
    assert.match(pageSource, /group: contactFilters\.group \?\? undefined,/);
    assert.doesNotMatch(pageSource, /tags: contactFilters\.group/);
    // 다른 조건과 함께 걸린 그룹도 삭제·이름 변경을 따라간다
    assert.match(pageSource, /onGroupDeleted=\{/);
    assert.match(pageSource, /onGroupRenamed=\{/);
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
    assert.match(panelSource, /api\.contacts\.renameGroup\(target, newName\)/);
    assert.match(panelSource, /api\.contacts\.deleteGroup\(name\)/);
    assert.match(panelSource, /연락처는 지워지지 않고 그룹에서만 빠집니다/);
    // 고른 그룹의 이름이 바뀌거나 삭제되면 빈 화면에 남지 않는다.
    assert.match(
      panelSource,
      /selectedGroupName === target\) \{\s*onSelect\(contactGroupCategory\(name\)\.id\)/,
    );
    assert.match(
      panelSource,
      /contactGroupNameOf\(selectedId\) === name\) \{\s*onSelect\(ALL_CONTACTS_CATEGORY\.id\)/,
    );
  });

  it('switches the side panel between computed categories and office groups, with no title header', () => {
    // 제목("연락처 분류") 대신 보는 길을 고르는 탭을 둔다 (사용자 결정 2026-11-18)
    assert.doesNotMatch(panelSource, />\s*연락처 분류\s*</);
    assert.match(panelSource, /\{ value: 'category', label: '구분별' \}/);
    assert.match(panelSource, /\{ value: 'group', label: '그룹별' \}/);
    assert.match(panelSource, /<ToolbarPillTabs\s+shape="muted"\s+ariaLabel="연락처 보기"/);
    // 탭 줄의 높이는 본문 첫 도구줄과 같아 가로선이 이어진다
    assert.match(panelSource, /flex h-\[51px\] shrink-0 items-center border-b border-border px-3/);
    // 그룹을 고른 채로 들어오거나 다른 곳에서 그룹을 고르면 그룹 쪽이 열린다
    assert.match(panelSource, /selectedGroupName \? 'group' : readStoredPanelTab\(\)/);
    assert.match(panelSource, /if \(selectedGroupName\) setTab\('group'\);/);
    // 그룹은 창을 띄우지 않고 목록 안에서 바로 만들고 이름을 바꾼다
    assert.doesNotMatch(panelSource, /ContactGroupNameDialog/);
    assert.match(panelSource, /function GroupNameInput\(/);
    assert.match(panelSource, /if \(event\.nativeEvent\.isComposing\) return;/);
    // 저장 뒤나 Esc 뒤에 따라오는 blur가 한 번 더 저장하지 않는다
    assert.match(panelSource, /if \(saving \|\| settled\.current\) return;/);
    assert.match(panelSource, /if \(settled\.current \|\| saving\) return;/);
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

  it('shows each contact as one fixed-height row in the property table style so virtualization stays on', () => {
    // 매물관리 표와 같은 규격: 한 사람이 한 줄(36 + 선 1), 이름·태그·전화·최근 상담이 각자 칸을 가진다.
    assert.match(pageSource, /const CONTACT_ROW_HEIGHT = 37;/);
    assert.match(pageSource, /variant="notion"\s+propertyListTone\s+rowHeight=\{CONTACT_ROW_HEIGHT\}/);
    assert.match(pageSource, /id: 'labels'[\s\S]*?<ContactChipsCell labels=\{getContactLabels\(row\.original\)\}/);
    assert.match(pageSource, /id: 'latestConsultation'[\s\S]*?<ContactConsultationCell contact=\{row\.original\}/);
    // 항상 펼쳐진 행이 있으면 가상화가 꺼지므로 희망·매물 패널만 행 아래로 펼친다.
    assert.match(
      pageSource,
      /const expandedRowIds = useMemo<ReadonlySet<string>>\(\s*\(\) => new Set\(expandedPanels\.keys\(\)\)/,
    );
    assert.doesNotMatch(pageSource, /collapsedConsultIds/);
    // 세로선을 지우던 화면 전용 스타일은 더 쓰지 않는다
    assert.doesNotMatch(pageSource, /-contacts-table\.css/);
  });

  it('opens the side panel from the row and closes it from the same button', () => {
    assert.match(
      pageSource,
      /<RowOpenButton[\s\S]{0,260}controls=\{CONTACT_INSPECTOR_ID\}[\s\S]{0,160}closeInspector\(\) : openQuickSheet\(contact\)/,
    );
    // 이름 칸은 관리단지 소유자명과 같은 이름 배지지만 누르는 기능이 없다 (링크가 아닌 배지)
    assert.match(pageSource, /<ContactNameBadge name=\{contact\.name\} \/>/);
    assert.doesNotMatch(pageSource, /<ContactNameChip/);
    const chipSource = readFileSync(
      new URL('../src/renderer/components/domain/contact-name-chip.tsx', import.meta.url),
      'utf8',
    );
    const badge = chipSource.slice(chipSource.indexOf('export function ContactNameBadge'));
    assert.match(badge, /<span data-contact-name-badge className=\{nameBadgeClassName\}>/);
    assert.doesNotMatch(badge, /<Link|onClick|hover:/);

    assert.match(pageSource, /<ContactInspector[\s\S]{0,260}closing=\{isInspectorClosing\}/);
    assert.doesNotMatch(pageSource, /ContactQuickSheet/);
  });

  it('keeps the new-contact form in its owning tab and replaces it after save', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/contacts/new.tsx'),
      'utf8',
    );

    assert.match(source, /useTabScopedState\('contact-new:form:v2'/);
    assert.match(source, /replaceTabResource\(ownerTabIdRef\.current/);
    assert.match(source, /tabResourceKeys\.entity\('contact', created\.id\)/);
  });
});
