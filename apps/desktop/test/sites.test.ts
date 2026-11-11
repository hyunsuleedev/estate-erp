import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop managed sites page', () => {
  it('opens the managed-site list as a sidebar from the site button', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );
    const panelSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/-sites-panel.tsx'),
      'utf8',
    );

    // 늘 펼쳐진 패널·접힌 레일 대신, 단지 버튼으로 여닫는 사이드바
    assert.doesNotMatch(source, /접힌 사이드바 레일|w-\[260px\]/);
    assert.match(source, /<SitesPanel\b/);
    assert.match(source, /<SitesPanelToggle\b/);
    assert.match(source, /open=\{isSitesPanelOpen\}/);
    assert.match(panelSource, /aria-expanded=\{open\}/);
    assert.match(panelSource, /inert=\{!open\}/);
    // 너비는 본문 최소 폭을 지키도록 페이지 폭에 맞춰 CSS로 제한한다
    assert.match(source, /@container\/sites-page/);
    assert.equal(panelSource.match(/maxWidth: SITES_PANEL_MAX_WIDTH_CSS/g)?.length, 2);
    // 앱 메뉴가 접히는 동안 페이지가 렌더링되지 않도록 페이지 폭을 재거나 state에 넣지 않는다
    assert.doesNotMatch(source, /ResizeObserver|setPageWidth|sitesPanelWidthCap/);
    // 끌기·키보드·더블클릭은 그 순간의 페이지 폭과 실제 너비를 DOM에서 읽는다
    assert.match(panelSource, /clampPanelWidth\(next, frameRef\.current\?\.parentElement\?\.clientWidth \?\? 0\)/);
    assert.match(panelSource, /const startWidth = readRenderedWidth\(\)/);
    assert.match(panelSource, /clampToPage\(readRenderedWidth\(\) \+/);
    assert.match(panelSource, /handle\.setAttribute\('aria-valuenow', String\(aside\.offsetWidth\)\)/);

    // 고정(즐겨찾기)은 낙관적으로 바꾸고 고정 묶음으로 보여준다 — 고정한 단지만 걸러 보는 필터는 두지 않는다
    assert.match(source, /api\.officeSites\.update\(id, \{ isFavorite: !isFavorite \}\)/);
    assert.match(panelSource, /officeSite\.isFavorite/);
    assert.doesNotMatch(panelSource, /고정한 단지만|pinnedOnly/);
    assert.match(panelSource, /조건에 맞는 관리단지가 없습니다/);
    assert.match(panelSource, /검색 지우기/);
    // 관리호수가 없는 단지는 아래 묶음으로 모은다
    assert.match(panelSource, /기록 없는 단지/);

    // 단지 줄은 앱 메뉴처럼 아이콘 + 이름 한 줄(h-8)이고, 선택은 평평한 바탕 — 목록 속 흰 카드로 띄우지 않는다
    assert.match(panelSource, /SITE_TYPE_ICONS/);
    assert.match(panelSource, /'group relative flex h-8 cursor-pointer/);
    assert.doesNotMatch(panelSource, /ring-1 ring-border hover:bg-background/);
  });

  it('keeps the add-site dialog open for adding several sites in a row', () => {
    const read = (path: string) => readFileSync(resolve(testDir, path), 'utf8');
    const source = read('../src/renderer/routes/_authenticated/sites/index.tsx');
    const dialogSource = read('../src/renderer/routes/_authenticated/sites/-add-site-dialog.tsx');

    assert.match(source, /<AddSiteDialog\b/);
    assert.match(source, /onOpenSite=\{handleSelectSite\}/);

    // 추가해도 창을 닫지 않고 검색창으로 돌아오며, 관리 중인 단지는 바로 열 수 있다
    const addMutation = dialogSource.slice(
      dialogSource.indexOf('const addSite = useMutation'),
      dialogSource.indexOf('const managedBySiteId'),
    );
    assert.doesNotMatch(addMutation, /onOpenChange|onDone/);
    assert.match(addMutation, /inputRef\.current\?\.focus\(\)/);
    assert.match(addMutation, /queryKey: \['office-sites'\]/);
    assert.match(dialogSource, /관리 중/);
    assert.match(dialogSource, /열기/);
    // 완료하면 방금 추가한 단지를 열어, 접힌 '기록 없는 단지' 묶음에 숨지 않게 한다
    assert.match(dialogSource, /addedSites\.at\(-1\)/);
    assert.match(dialogSource, /onClick=\{handleFinish\}/);
    // 긴 단지명이 버튼을 창 밖으로 밀지 않는다
    assert.match(dialogSource, /scroll-area-viewport\]>div\]:!block/);
    // 결과가 없어도, 결과에 찾는 단지가 없어도 직접 등록으로 이어진다
    assert.match(dialogSource, /setRegisterName\(debouncedQuery\)/);
    assert.match(dialogSource, /setRegisterName\(trimmedQuery\)/);

    // 입력 중 요청이 몰리지 않고, 안내·검색 중·오류·결과 없음을 구분한다
    assert.match(dialogSource, /useDebouncedValue\(trimmedQuery/);
    assert.match(dialogSource, /search\.refetch\(\)/);
    assert.match(dialogSource, /검색 결과가 없습니다/);
    assert.match(dialogSource, /단지 검색 중/);
  });

  it('registers a site as private without ever sending a visibility flag', () => {
    const read = (path: string) => readFileSync(resolve(testDir, path), 'utf8');
    const formSource = read('../src/renderer/routes/_authenticated/sites/-register-private-site-form.tsx');
    const clientSource = read('../../../packages/api-client/src/modules/office-sites.ts');

    assert.match(formSource, /api\.officeSites\.registerPrivateSite\(/);
    assert.match(formSource, /비공개 단지로 등록됩니다/);
    assert.doesNotMatch(formSource, /isPublic|isLocked/);

    const dto = clientSource.slice(
      clientSource.indexOf('export interface RegisterPrivateSiteDto'),
      clientSource.indexOf('export function createOfficeSitesApi'),
    );
    assert.match(dto, /wardCode: string/);
    assert.doesNotMatch(dto, /isPublic|isLocked|officeId/);
  });

  it('offers structure changes only from the row menu of a site the office registered', () => {
    const read = (path: string) => readFileSync(resolve(testDir, path), 'utf8');
    const source = read('../src/renderer/routes/_authenticated/sites/index.tsx');
    const panelSource = read('../src/renderer/routes/_authenticated/sites/-sites-panel.tsx');
    const detailSource = read('../src/renderer/routes/_authenticated/sites/-unit-detail-dialog.tsx');

    // 본문 도구줄에는 없다
    assert.doesNotMatch(source, /aria-label="동·호수 추가"/);
    assert.doesNotMatch(source, /canManageUnits/);

    const rowMenu = panelSource.slice(panelSource.indexOf('<DropdownMenuContent align="end"'));
    assert.match(rowMenu, /canEditSiteStructure\(site\) && \([\s\S]*?동 추가[\s\S]*?호수 추가[\s\S]*?\)\}/);
    assert.match(source, /onAddDong=\{/);
    assert.match(source, /onAddUnit=\{/);

    // 포털로 그려진 메뉴의 키 입력이 패널 닫기·목록 이동으로 새지 않는다
    const portalGuards = panelSource.match(/event\.currentTarget\.contains\(event\.target as Node\)/g) ?? [];
    assert.equal(portalGuards.length, 2);
    // 메뉴가 열려 있는 동안에는 줄 툴팁이 겹치거나 Esc를 가져가지 않는다
    assert.match(panelSource, /<Tooltip delayDuration=\{600\} open=\{isMenuOpen \? false : undefined\}>/);

    // 다른 단지에서 열면 그 단지로 옮기고, 이전 단지의 입력값을 지운다
    assert.match(source, /selectedOfficeSite\?\.id !== os\.id\) handleSelectSite\(os\)/);
    assert.match(source, /setNewUnit\(EMPTY_NEW_UNIT\)/);

    // 동 목록을 실제로 받기 전(로딩·조회 실패)에는 호수를 추가하지 않는다 — 있는 단지에 본동을 또 만들게 된다
    assert.match(source, /addUnitMutation\.isPending \|\| !siteDetail/);
    assert.match(source, /!newUnit\.name\.trim\(\) \|\| !selectedSiteId \|\| !siteDetail\) return/);
    assert.match(source, /role="alert"[\s\S]{0,200}단지 정보를 불러오지 못했습니다/);
    const addUnit = source.slice(source.indexOf('const addUnitMutation'), source.indexOf("name: '본동'"));
    assert.match(addUnit, /if \(!siteDetail\) throw new Error/);

    // 공공 단지의 호실은 상세에서도 수정·삭제 메뉴가 없다
    assert.match(detailSource, /canEditSiteStructure\(site\) && \([\s\S]*?호실 수정[\s\S]*?호실 삭제/);
  });

  it('opens the sidebar once when the office has no managed sites', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );
    const panelSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/-sites-panel.tsx'),
      'utf8',
    );
    const autoOpen = source.slice(
      source.indexOf('const didAutoOpenSitesPanel'),
      source.indexOf('}, [isListError, isLoadingList, officeSites.length]);'),
    );

    assert.match(autoOpen, /didAutoOpenSitesPanel\.current \|\| isLoadingList \|\| isListError \|\| officeSites\.length > 0/);
    // 저장된 열림 상태를 덮어쓰지 않고, 초점도 뺏지 않는다
    assert.match(autoOpen, /setIsSitesPanelOpen\(true\)/);
    assert.doesNotMatch(autoOpen, /storePanelOpen|setSitesPanelOpen/);
    assert.match(panelSource, /querySelector\('\[data-site-row\]'\)\) return/);
  });

  it('recovers from list failures and keeps sidebar counts fresh while the sidebar is closed', () => {
    const read = (path: string) => readFileSync(resolve(testDir, path), 'utf8');
    const source = read('../src/renderer/routes/_authenticated/sites/index.tsx');

    // 사이드바가 닫혀 있어도 목록 로딩·오류·다시 시도를 본문에서 보여준다
    const noSiteBranch = source.slice(
      source.indexOf('No site selected'),
      source.indexOf(') : isLoadingDetail ? ('),
    );
    assert.match(noSiteBranch, /isLoadingList \? \(/);
    assert.match(noSiteBranch, /isListError \? \(/);
    assert.match(noSiteBranch, /관리단지 목록을 불러오지 못했습니다/);
    assert.match(noSiteBranch, /refetchList\(\)/);
    assert.match(noSiteBranch, /setSitesPanelOpen\(true\)/);
    // 단지 버튼이 사이드바를 여닫는 유일한 마우스 경로이므로 단지가 없어도 보여야 한다
    assert.match(noSiteBranch, /\{sitesPanelToggle\}/);
    assert.doesNotMatch(source, /const sitesPanelToggle = selectedOfficeSite \?/);

    // 관리호수가 생기는 곳은 사이드바의 단지별 관리호수 수(office-sites 집계)를 갱신한다
    for (const path of [
      '../src/renderer/routes/_authenticated/sites/-unit-detail-dialog.tsx',
      '../src/renderer/routes/_authenticated/sites/-unit-dialogs.tsx',
      '../src/renderer/routes/_authenticated/properties/new.tsx',
    ]) {
      assert.match(read(path), /invalidateQueries\(\{ queryKey: \['office-sites'\] \}\)/, path);
    }
  });

  it('uses the property toolbar language for the unit filters', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    // 매물관리 툴바와 같은 부품: 한 줄 검색바 · 알약 보기 전환 · 알약 범위 탭 · 필터 칩 · + 필터
    assert.match(source, /from '\.\.\/properties\/-components\/property-toolbar'/);
    assert.match(source, /<UnitSearchBar\b/);
    assert.match(source, /<ToolbarPillToggle\b/);
    assert.match(source, /<ToolbarPillTabs\b/);
    assert.match(source, /<RecordFilterChip\b/);
    assert.match(source, /<AddFilterMenu\b/);
    // 예전 드롭다운·셀렉트 필터는 쓰지 않는다
    assert.doesNotMatch(source, /MultiFilterDropdown|UnitRecordFilterSelect|UnitTableScopeToggle/);
    // 칩이 넘쳐도 옆으로 숨기지 않고 다음 줄로 내린다
    assert.match(source, /flex min-w-0 flex-1 flex-wrap items-center gap-1\.5/);
  });

  it('keeps the dong and type checklists usable from the keyboard', () => {
    const read = (path: string) =>
      readFileSync(resolve(testDir, `../src/renderer/routes/_authenticated/sites/${path}`), 'utf8');
    const source = read('index.tsx');
    const toolbar = read('-unit-toolbar.tsx');

    // cmdk 목록은 입력칸에서 ↑↓·Enter로 고르므로, 항목이 적어도 입력칸을 숨기지 않는다
    assert.doesNotMatch(source, /searchable=\{unitTypeOptions\.length/);
    assert.doesNotMatch(toolbar, /searchable=\{dongOptions\.length/);
    // 동 팝오버는 열리면 맨 위 버튼이 아니라 동 찾기 입력에 초점을 둔다
    assert.match(toolbar, /onOpenAutoFocus=/);
    assert.match(toolbar, /querySelector<HTMLInputElement>\('\[cmdk-input\]'\)/);
  });

  it('lets the user fold any sidebar group, including the one holding the open site', () => {
    const panelSource = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/-sites-panel.tsx'),
      'utf8',
    );
    // 렌더할 때 선택된 묶음을 강제로 펼치면 접기 버튼이 먹히지 않는다
    assert.doesNotMatch(panelSource, /holdsSelected \|\||isIdleOpen \|\| idleSites\.some/);
    // 대신 선택이 다른 묶음으로 옮겨 갈 때만 한 번 펼친다
    assert.match(panelSource, /\}, \[selectedSectionKey\]\);/);
  });

  it('replaces the duplicate site header with two-tier working filters', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.doesNotMatch(source, /siteMetaLine/);
    assert.match(source, /1차 필터: 선택 범위 · 검색 · 보기 방식/);
    assert.match(source, /2차 필터: 호수별 CRM 등록 상태/);
    assert.match(source, /filterUnitsByRecordPresence/);
    assert.match(source, /label="소유자"/);
    assert.match(source, /label="세입자"/);
    assert.match(source, /label="등록 매물"/);
    assert.match(source, /label="상담"/);
  });

  it('loads and summarizes several selected dongs as one table scope', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.match(source, /dongIds: selectedDongIds\.length > 0 \? selectedDongIds : undefined/);
    assert.match(source, /selectedDongIds\.length > 1/);
    assert.match(source, /`\$\{selectedDongIds\.length\}개 동`/);
    assert.doesNotMatch(source, /label="동"[\s\S]{0,300}selectionMode="single"/);
  });

  it('uses the compact property-table visual language for the unit list', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/sites/index.tsx'),
      'utf8',
    );

    assert.match(source, /variant="notion"/);
    assert.match(source, /rowHeight=\{40\}/);
    assert.match(source, /enableRowSelection/);
    assert.match(source, /UnitTableHeaderLabel/);
    assert.match(source, /unitListingTransactionMeta/);
    assert.match(source, /UnitTableEmptyCell/);
    assert.match(source, /getUnitOwnerContacts/);
    assert.match(source, /id: 'ownerName'/);
    assert.match(source, /label="소유자명"/);
    assert.match(source, /id: 'ownerPhone'/);
    assert.match(source, /label="소유자 전화번호"/);
    assert.match(source, /외 \{owners\.length - 1\}명/);
    assert.match(
      source,
      /const \[areUnitRelationshipColumnsCollapsed, setAreUnitRelationshipColumnsCollapsed\]\s*=\s*useState\(true\)/,
    );
    assert.match(
      source,
      /const UNIT_RELATIONSHIP_COLUMN_IDS = \['tenant', 'listing'\] as const/,
    );
    assert.match(source, /columnGroupControls=\{\[/);
    assert.match(source, /anchorColumnId: 'ownerPhone'/);
    assert.match(source, /label: '세입자·등록 매물'/);
    assert.match(
      source,
      /areUnitRelationshipColumnsCollapsed &&\s*UNIT_RELATIONSHIP_COLUMN_ID_SET\.has\(columnId\)/,
    );
  });
});
