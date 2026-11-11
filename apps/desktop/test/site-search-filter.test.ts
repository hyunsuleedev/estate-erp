import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { OfficeSite, Unit } from '@estate-erp/api-client';

import {
  filterOfficeSites,
  filterUnitsByRecordPresence,
  getSiteGroupKeys,
  SITES_MAIN_MIN_WIDTH,
  buildSitePanelSections,
  canEditSiteStructure,
  formatSiteSummary,
  toSiteAddress,
  SITES_PANEL_MAX_WIDTH_CSS,
  SITES_PANEL_WIDTH,
  clampPanelWidth,
  getManagedUnitCount,
  isManagedUnit,
  summarizeDongScope,
  prioritizeFavoriteOfficeSites,
  selectUnitTableRows,
} from '../src/renderer/routes/_authenticated/sites/-site-helpers';

const managedApartment = {
  id: 'office-site-1',
  officeId: 'office-1',
  siteId: 'site-1',
  memo: null,
  isFavorite: false,
  createdAt: '2026-07-28T00:00:00.000Z',
  site: {
    id: 'site-1',
    type: 'apartment',
    name: '고덕그라시움',
    roadAddress: '서울시 강동구 고덕동',
    jibunAddress: null,
    ward: {
      code: '1174010200',
      name: '고덕동',
      district: {
        code: '11740',
        name: '강동구',
        province: {
          code: '11',
          name: '서울시',
        },
      },
    },
  },
} as OfficeSite;

const managedVilla = {
  ...managedApartment,
  id: 'office-site-2',
  siteId: 'site-2',
  site: {
    ...managedApartment.site,
    id: 'site-2',
    type: 'villa',
    name: '문정동 빌라',
    roadAddress: '서울시 송파구 문정동',
    ward: {
      code: '1171010800',
      name: '문정동',
      district: {
        code: '11710',
        name: '송파구',
        province: {
          code: '11',
          name: '서울시',
        },
      },
    },
  },
} as OfficeSite;

describe('managed site search filter', () => {
  it('searches the visible site type as well as the name and address', () => {
    assert.deepEqual(filterOfficeSites([managedApartment], '아파트'), [managedApartment]);
    assert.deepEqual(filterOfficeSites([managedApartment], '서울시'), [managedApartment]);
  });

  it('matches whitespace-separated tokens without requiring exact spacing', () => {
    assert.deepEqual(filterOfficeSites([managedApartment], '고덕 그라시움'), [managedApartment]);
    assert.deepEqual(filterOfficeSites([managedApartment], '강동 고덕'), [managedApartment]);
  });

  it('combines region and site-type facets with text search', () => {
    const sites = [managedApartment, managedVilla];

    assert.deepEqual(
      filterOfficeSites(sites, '', { regions: ['강동구 고덕동'] }),
      [managedApartment],
    );
    assert.deepEqual(
      filterOfficeSites(sites, '', { types: ['villa'] }),
      [managedVilla],
    );
    assert.deepEqual(
      filterOfficeSites(sites, '서울', {
        regions: ['송파구 문정동'],
        types: ['villa'],
      }),
      [managedVilla],
    );
  });

  it('computes the target group keys before the grouping mode changes', () => {
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'type'), ['아파트']);
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'region'), ['강동구 고덕동']);
    assert.deepEqual(getSiteGroupKeys([managedApartment], 'none'), []);
  });

  it('prioritizes favorites without changing the order of either section', () => {
    const newestRegular = {
      ...managedApartment,
      id: 'office-site-2',
      siteId: 'site-2',
    };
    const favorite = {
      ...managedApartment,
      id: 'office-site-3',
      siteId: 'site-3',
      isFavorite: true,
    };

    assert.deepEqual(
      prioritizeFavoriteOfficeSites([newestRegular, favorite, managedApartment]),
      [favorite, newestRegular, managedApartment],
    );
  });
});

describe('managed unit record filters', () => {
  const emptyUnit = {
    id: 'empty-unit',
    properties: [],
  } as unknown as Unit;
  const ownerOnlyUnit = {
    id: 'owner-only-unit',
    properties: [
      {
        propertyContacts: [{ role: 'owner' }],
        tenants: [],
        listings: [],
        consultations: [],
      },
    ],
  } as unknown as Unit;
  const fullyRecordedUnit = {
    id: 'fully-recorded-unit',
    properties: [
      {
        propertyContacts: [{ role: 'owner' }],
        tenants: [{}],
        listings: [{}],
        consultations: [{}],
      },
    ],
  } as unknown as Unit;
  const units = [emptyUnit, ownerOnlyUnit, fullyRecordedUnit];

  it('combines owner, tenant, listing, and consultation presence', () => {
    assert.deepEqual(
      filterUnitsByRecordPresence(units, {
        owner: 'present',
        tenant: 'missing',
        listing: 'missing',
        consultation: 'missing',
      }),
      [ownerOnlyUnit],
    );
    assert.deepEqual(
      filterUnitsByRecordPresence(units, {
        owner: 'missing',
        tenant: 'missing',
        listing: 'missing',
        consultation: 'missing',
      }),
      [emptyUnit],
    );
    assert.deepEqual(
      filterUnitsByRecordPresence(units, {
        owner: 'present',
        tenant: 'present',
        listing: 'present',
        consultation: 'present',
      }),
      [fullyRecordedUnit],
    );
  });
});

describe('managed unit table scope', () => {
  const unregisteredUnit = { id: 'unregistered', properties: [] } as unknown as Unit;
  const missingPropertiesUnit = { id: 'missing-properties' } as unknown as Unit;
  // 관리호수로 등록만 하고 아직 소유자·매물 등이 없는 호실도 우리 기록이다.
  const bareManagedUnit = {
    id: 'bare-managed',
    properties: [{ propertyContacts: [], tenants: [], listings: [], consultations: [] }],
  } as unknown as Unit;
  const units = [unregisteredUnit, missingPropertiesUnit, bareManagedUnit];

  it('treats any office property on the unit as a managed unit', () => {
    assert.equal(isManagedUnit(unregisteredUnit), false);
    assert.equal(isManagedUnit(missingPropertiesUnit), false);
    assert.equal(isManagedUnit(bareManagedUnit), true);
  });

  it('shows only managed units by default and every unit when asked', () => {
    assert.deepEqual(selectUnitTableRows(units, 'managed', false), [bareManagedUnit]);
    assert.deepEqual(selectUnitTableRows(units, 'all', false), units);
  });

  it('searches every unit even while the managed scope is selected', () => {
    assert.deepEqual(selectUnitTableRows(units, 'managed', true), units);
  });
});


describe('managed sites sidebar', () => {
  it('keeps the minimum main width when the sidebar is widened', () => {
    // 1180px 창에서 앱 메뉴를 뺀 924px — 본문 700px을 남기면 사이드바는 224px까지
    assert.equal(clampPanelWidth(380, 924), 924 - SITES_MAIN_MIN_WIDTH);
    // 넉넉하면 요청한 너비를 그대로, 최대치는 넘지 않는다
    assert.equal(clampPanelWidth(300, 1600), 300);
    assert.equal(clampPanelWidth(900, 1600), SITES_PANEL_WIDTH.max);
    // 아주 좁아도 최소 너비 아래로는 줄이지 않는다
    assert.equal(clampPanelWidth(280, 600), SITES_PANEL_WIDTH.min);
    // 폭을 아직 모르면(첫 렌더) 최대치까지 허용한다
    assert.equal(clampPanelWidth(320, 0), 320);
  });

  it('limits the sidebar in CSS by the same rule as clampPanelWidth', () => {
    const match = SITES_PANEL_MAX_WIDTH_CSS.match(
      /^max\((\d+)px, min\((\d+)px, calc\(100cqi - (\d+)px\)\)\)$/,
    );
    assert.ok(match, SITES_PANEL_MAX_WIDTH_CSS);
    const [low, high, reserved] = match.slice(1).map(Number);
    // 화면에 보이는 너비 = min(width, max-width). 끌 때 쓰는 JS 계산과 어긋나면 손잡이가 튄다
    for (let width = SITES_PANEL_WIDTH.min; width <= SITES_PANEL_WIDTH.max; width += 20) {
      for (let pageWidth = 40; pageWidth <= 1600; pageWidth += 40) {
        assert.equal(
          Math.min(width, Math.max(low, Math.min(high, pageWidth - reserved))),
          clampPanelWidth(width, pageWidth),
          `width=${width} pageWidth=${pageWidth}`,
        );
      }
    }
  });

  it('reads the office-scoped managed unit count from the list payload', () => {
    const withCount = { site: { _count: { dongs: 53, units: 5150, properties: 7 } } } as unknown as OfficeSite;
    const withoutCount = { site: {} } as unknown as OfficeSite;
    assert.equal(getManagedUnitCount(withCount), 7);
    assert.equal(getManagedUnitCount(withoutCount), 0);
  });
});

describe('managed site toolbar', () => {
  const dongs = [
    { value: 'd101', label: '101' },
    { value: 'd102', label: '102' },
    { value: 'dA', label: 'A동' },
  ];

  it('summarizes the dong scope like the property location filter', () => {
    assert.equal(summarizeDongScope(dongs, []), null); // 전체 동
    assert.equal(summarizeDongScope(dongs, ['d101']), '101동');
    assert.equal(summarizeDongScope(dongs, ['dA']), 'A동'); // 이미 '동'으로 끝나면 덧붙이지 않는다
    assert.equal(summarizeDongScope(dongs, ['d101', 'd102', 'dA']), '101동 외 2');
  });
});

describe('managed sites sidebar sections', () => {
  const site = (id: string, ward: string, type: string, managed: number, isFavorite = false) =>
    ({
      id,
      isFavorite,
      site: {
        id: `site-${id}`,
        name: id,
        type,
        ward: { code: id, name: ward, district: { code: '11740', name: '강동구' } },
        _count: { dongs: 1, units: 10, properties: managed },
      },
    }) as unknown as OfficeSite;
  // 사이드바에 들어가는 순서: 고정한 단지가 앞
  const sites = [
    site('그라시움', '고덕동', 'apartment', 7, true),
    site('아르테온', '상일동', 'apartment', 3, true),
    site('벨리온', '고덕동', 'officetel', 2),
    site('센트럴', '상일동', 'apartment', 0),
    site('리엔파크', '강일동', 'apartment', 0),
  ];
  const ids = (items: OfficeSite[]) => items.map((item) => item.id);

  it('keeps pinned sites inside their region group, first in each group', () => {
    const sections = buildSitePanelSections(sites, { groupBy: 'region', searching: false });
    assert.deepEqual(
      sections.map((section) => [section.label, ids(section.items)]),
      [
        ['강동구 강일동', ['리엔파크']],
        ['강동구 고덕동', ['그라시움', '벨리온']],
        ['강동구 상일동', ['아르테온', '센트럴']],
      ],
    );
    assert.ok(sections.every((section) => section.kind === 'group'));
  });

  it('splits the plain list into pinned, active, and record-less sites', () => {
    const sections = buildSitePanelSections(sites, { groupBy: 'none', searching: false });
    assert.deepEqual(
      sections.map((section) => [section.kind, section.label, ids(section.items)]),
      [
        ['pinned', '고정', ['그라시움', '아르테온']],
        ['all', '단지', ['벨리온']],
        ['idle', '기록 없는 단지', ['센트럴', '리엔파크']],
      ],
    );
  });

  it('does not hide record-less sites behind a fold while searching', () => {
    const sections = buildSitePanelSections(sites, { groupBy: 'none', searching: true });
    assert.deepEqual(sections.map((section) => section.kind), ['pinned', 'all']);
    assert.deepEqual(ids(sections[1].items), ['벨리온', '센트럴', '리엔파크']);
  });
});

describe('canEditSiteStructure', () => {
  it('allows only a private site that can have units', () => {
    assert.equal(canEditSiteStructure({ isPublic: false, type: 'villa' }), true);
    assert.equal(canEditSiteStructure({ isPublic: true, type: 'apartment' }), false);
    assert.equal(canEditSiteStructure({ isPublic: false, type: 'land' }), false);
  });

  it('denies when visibility is unknown', () => {
    assert.equal(
      canEditSiteStructure({ type: 'villa' } as Parameters<typeof canEditSiteStructure>[0]),
      false,
    );
  });
});

describe('toSiteAddress', () => {
  const result = (overrides: Partial<Parameters<typeof toSiteAddress>[0]> = {}) => ({
    roadAddress: '서울 강동구 고덕로 333',
    jibunAddress: '서울 강동구 고덕동 123-4',
    zonecode: '05265',
    buildingCode: '1174010200',
    userSelectedType: 'R' as const,
    address: '서울 강동구 고덕로 333',
    bcode: '1174010200',
    buildingName: '고덕빌라',
    apartment: 'N' as const,
    ...overrides,
  });

  it('keeps the ward code and addresses from the selected result', () => {
    assert.deepEqual(toSiteAddress(result()), {
      wardCode: '1174010200',
      roadAddress: '서울 강동구 고덕로 333',
      jibunAddress: '서울 강동구 고덕동 123-4',
      zipCode: '05265',
      buildingName: '고덕빌라',
      isApartment: false,
    });
  });

  it('refuses a result without a usable ward code', () => {
    assert.equal(toSiteAddress(result({ bcode: '' })), null);
    assert.equal(toSiteAddress(result({ bcode: undefined })), null);
    assert.equal(toSiteAddress(result({ bcode: '11740' })), null);
  });

  it('falls back to the selected address type, and refuses a result with no address', () => {
    const jibunOnly = toSiteAddress(
      result({ roadAddress: '', jibunAddress: '', userSelectedType: 'J', address: '경기 양평군 양평읍 오빈리 1' }),
    );
    assert.equal(jibunOnly?.jibunAddress, '경기 양평군 양평읍 오빈리 1');
    assert.equal(jibunOnly?.roadAddress, null);
    assert.equal(toSiteAddress(result({ roadAddress: '', jibunAddress: '', address: '' })), null);
  });

  it('marks apartments and treats a blank building name as missing', () => {
    const address = toSiteAddress(result({ apartment: 'Y', buildingName: '  ' }));
    assert.equal(address?.isApartment, true);
    assert.equal(address?.buildingName, null);
  });
});

describe('formatSiteSummary', () => {
  const site = (overrides: Partial<Parameters<typeof formatSiteSummary>[0]>) => ({
    type: 'apartment',
    totalDongs: null,
    totalUnits: null,
    builtYear: null,
    _count: null,
    ...overrides,
  });

  it('summarizes type, size, and build year', () => {
    assert.equal(
      formatSiteSummary(site({ totalDongs: 51, totalUnits: 4932, builtYear: 2019 })),
      '아파트 · 51개동 · 4,932세대 · 2019년 준공',
    );
  });

  it('falls back to public totals when units are not imported yet', () => {
    assert.equal(
      formatSiteSummary(
        site({ totalDongs: 3, totalUnits: 200, _count: { dongs: 0, units: 0, properties: 0 } }),
      ),
      '아파트 · 3개동 · 200세대',
    );
  });

  it('omits the dong count for a single-dong building and missing values', () => {
    assert.equal(formatSiteSummary(site({ type: 'villa', totalDongs: 1 })), '빌라');
  });
});
