import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { ListingIntake, Property } from '@estate-erp/api-client';
import {
  buildOfferRows,
  buildPastIntakes,
  buildRecords,
  buildTenants,
  collectListingIds,
  formatListingPrice,
  getConfirmSummary,
  getUnitIdentity,
  selectPropertyDeals,
  type DetailListing,
} from '../src/renderer/routes/_authenticated/properties/-detail/model';
import {
  buildBriefCards,
  buildBriefText,
  buildTodos,
  buildUpcomingViewings,
  coverFirstOrder,
  formatPerPyeong,
  getHeaderSpecs,
  getHeaderTitle,
  getPhotoCaption,
  getSaleLease,
  getSupplyPyeong,
  sortPhotos,
} from '../src/renderer/routes/_authenticated/properties/-detail/brief-model';

const testDir = dirname(fileURLToPath(import.meta.url));
const detailDir = resolve(testDir, '../src/renderer/routes/_authenticated/properties');
const read = (path: string) => readFileSync(resolve(detailDir, path), 'utf8');

const routeSource = read('$id.tsx');
const screenSource = read('-detail/PropertyDetailScreen.tsx');
const recordsSource = read('-detail/records.tsx');
const detailSources = [
  screenSource,
  recordsSource,
  read('-detail/header.tsx'),
  read('-detail/brief.tsx'),
  read('-detail/photos.tsx'),
  read('-detail/rail.tsx'),
  read('-detail/composer.tsx'),
].join('\n');
const listingDialogSource = read('-property-detail-dialogs.tsx');

const DAY = 86_400_000;
const iso = (daysFromNow: number) => new Date(Date.now() + daysFromNow * DAY).toISOString();

function makeIntake(overrides: Partial<ListingIntake> = {}): ListingIntake {
  return {
    id: 'intake-1',
    officeId: 'office-1',
    projectId: 'case-1',
    casePriorityRank: 0,
    propertyId: 'prop-1',
    lifecycleStatus: 'open',
    lifecycleChangedAt: iso(-30),
    lifecycleChangedBy: 'user',
    closedReason: null,
    receivedAt: iso(-30),
    lastCheckedAt: iso(-3),
    lastVerifiedAt: iso(-3),
    lastCheckResult: 'alive',
    nextConfirmAt: iso(4),
    isJointBrokerageRequired: false,
    jointBrokeragePartnerId: null,
    memo: null,
    createdAt: iso(-30),
    updatedAt: iso(-3),
    ...overrides,
  } as ListingIntake;
}

function makeListing(overrides: Partial<DetailListing> = {}): DetailListing {
  return {
    id: 'listing-1',
    intakeId: 'intake-1',
    transactionType: 'sale',
    price: 158000,
    deposit: null,
    monthlyRent: null,
    moveInAvailableType: 'immediate',
    moveInAvailableFrom: null,
    moveInAvailableTo: null,
    isPaused: false,
    intake: { lifecycleStatus: 'open', lastVerifiedAt: iso(-3), lastCheckResult: 'alive', nextConfirmAt: iso(4) },
    deals: [],
    memo: null,
    createdAt: iso(-30),
    updatedAt: iso(-3),
    advertisements: [],
    priceHistories: [],
    maintenanceFee: 32,
    loanAmount: 0,
    ...overrides,
  } as DetailListing;
}

describe('desktop property detail page structure', () => {
  it('keeps the route thin and subscribes to realtime updates', () => {
    assert.match(routeSource, /useRealtimeRoom\('property', id\)/);
    assert.match(routeSource, /<PropertyDetailScreen propertyId=\{id\} \/>/);
  });

  it('lays the page out in the broker work order without tabs', () => {
    assert.match(screenSource, /data-property-detail-page/);
    const order = [
      '<TopHeader',
      '<BriefSection',
      '<PhotosSection',
      '<VisitSection',
      '<PropertyInspectorProgressTab',
      '<RecordsSection',
      '<ComposerDock',
    ];
    let last = -1;
    for (const part of order) {
      const at = screenSource.indexOf(part);
      assert.ok(at > last, `${part} missing or out of order`);
      last = at;
    }
    for (const part of ['<TodosCallout', '<ContactsSection', '<ConfirmSection', '<AdsSection', '<InfoSection']) {
      assert.ok(screenSource.includes(part), `${part} missing`);
    }
    assert.doesNotMatch(screenSource, /\bTabs(?:List|Trigger|Content)?\b/);
  });

  it('hides internal sections while showing the page to a customer', () => {
    for (const guarded of [
      "{!guest && (allListingIds.length > 0 || propertyDeals.length > 0) && (",
      '{!guest && (\n              <RecordsSection',
      '{!guest && (\n            <ComposerDock',
      '{wide && !guest && (',
      '{!wide && !guest && (',
    ]) {
      assert.ok(screenSource.includes(guarded), `${guarded} not guarded`);
    }
    // 창 전체를 덮어 사이드바·다른 화면이 보이지 않게 한다.
    assert.match(screenSource, /guest \? 'fixed inset-0 z-50'/);
  });

  it('keeps matches and deals of intakes that closed after a completed deal', () => {
    assert.match(screenSource, /listingIds=\{allListingIds\}/);
    assert.match(screenSource, /propertyId=\{propertyId\}/);
    assert.match(screenSource, /collectListingIds\(listings, intakes\)/);
  });

  it('offers only listings of the open intake when creating a new match', () => {
    assert.match(
      screenSource,
      /creatableListingIds=\{listings\.map\(\(listing\) => listing\.id\)\}/,
    );
    const progressSource = read('-components/property-inspector-progress-tab.tsx');
    assert.match(progressSource, /creatableListingIds = listingIds/);
    assert.match(progressSource, /listingIds=\{creatableListingIds\}/);
    assert.match(progressSource, /open=\{createOpen && listingIds\.length > 0\}/);
  });

  it('shows property photos without pretending to upload them', () => {
    assert.match(screenSource, /api\.propertyPhotos\.listByProperty\(propertyId\)/);
    assert.match(screenSource, /api\.propertyPhotos\.reorder/);
    // 저장소 연동 전이라 사진 올리기는 없다 (자료실과 같은 정책).
    assert.doesNotMatch(detailSources, /propertyPhotos\.create/);
    assert.doesNotMatch(detailSources, /type="file"/);
    for (const unsupported of ['PublicDocument', 'publicDocuments', '공적장부']) {
      assert.doesNotMatch(detailSources, new RegExp(unsupported));
    }
  });

  it('keeps every listing action reachable from the page', () => {
    for (const action of [
      '거래 조건 추가',
      '소유주·관련인 추가',
      '세입자 추가',
      '거래 바로 만들기',
      '확인 결과 기록',
      '가격·조건 수정',
      '고객 공개 설정',
      '거래 조건 삭제',
      '확인 완료',
      '상담 기록',
      '의뢰 보류',
      '새 창으로 열기',
    ]) {
      assert.ok(detailSources.includes(action), `${action} missing`);
    }
  });

  it('does not render a redundant back-to-list link in desktop detail tabs', () => {
    assert.doesNotMatch(detailSources, /to="\/properties"/);
    assert.doesNotMatch(detailSources, /<ArrowLeft\b/);
  });

  it('does not edit the removed listing checkStatus field', () => {
    assert.doesNotMatch(listingDialogSource, /checkStatus/);
    assert.doesNotMatch(listingDialogSource, /확인 상태/);
  });
});

describe('property detail model', () => {
  const property = {
    id: 'prop-1',
    officeId: 'office-1',
    siteId: 'site-1',
    unitId: 'unit-1',
    createdAt: iso(-400),
    updatedAt: iso(-3),
    site: {
      id: 'site-1',
      name: '고덕그라시움',
      type: 'apartment',
      roadAddress: '서울특별시 강동구 고덕로 333',
      jibunAddress: null,
      builtYear: 2019,
      totalUnits: 4932,
      totalDongs: 51,
      ward: { name: '고덕동', district: { name: '강동구' } },
    },
    unit: {
      id: 'unit-1',
      name: '3401',
      floor: 34,
      exclusiveAreaM2: null,
      supplyAreaM2: null,
      dong: { id: 'dong-1', name: '103', isPlaceholder: false },
      siteUnitType: { id: 't-1', name: '84A', exclusiveAreaM2: '84.97', supplyAreaM2: '112.40', roomCount: 3, bathRoomCount: 2, direction: 'SS' },
    },
  } as unknown as Property;

  it('names the unit with 동·호 suffixes and a region eyebrow', () => {
    const identity = getUnitIdentity(property);
    assert.equal(identity.dong, '103동');
    assert.equal(identity.ho, '3401호');
    assert.deepEqual(identity.eyebrow, ['아파트', '강동구 고덕동']);
  });

  it('hides the placeholder dong of single-building sites', () => {
    const villa = {
      ...property,
      unit: { ...property.unit, dong: { id: 'd', name: '-', isPlaceholder: true } },
    } as Property;
    assert.equal(getUnitIdentity(villa).dong, null);
  });

  it('reads area, rooms and direction from the unit type when the unit has no override', () => {
    const specs = Object.fromEntries(getHeaderSpecs(property, false).map((spec) => [spec.key, spec.text]));
    assert.equal(specs.type, '84A · 아파트');
    assert.equal(specs.area, '공급 34.0평 · 전용 25.7평');
    assert.equal(specs.floor, '34층');
    assert.equal(specs.rooms, '방 3 · 욕실 2');
    assert.equal(specs.direction, '남향');
    assert.equal(specs.built, '2019년 · 4,932세대');
    assert.equal(specs.region, '강동구 고덕동');
  });

  it('flags an active ad whose advertised price differs from the listing price', () => {
    const [row] = buildOfferRows([
      makeListing({
        advertisements: [
          {
            id: 'ad-1',
            channel: 'esiljang',
            status: 'active',
            advertisedPrice: 160000,
            advertisedDeposit: null,
            advertisedMonthlyRent: null,
            url: null,
          } as never,
        ],
      }),
    ]);
    assert.equal(row.activeAds.length, 1);
    assert.equal(row.activeAds[0].stale, true);
    assert.equal(row.activeAds[0].priceText, '16억');
  });

  it('sorts offers sale → jeonse → monthly and formats monthly as deposit / rent', () => {
    const rows = buildOfferRows([
      makeListing({ id: 'm', transactionType: 'monthly', price: null, deposit: 5000, monthlyRent: 150 }),
      makeListing({ id: 's', transactionType: 'sale' }),
      makeListing({ id: 'j', transactionType: 'jeonse', price: 82000 }),
    ]);
    assert.deepEqual(rows.map((row) => row.listing.id), ['s', 'j', 'm']);
    assert.equal(rows[2].priceText, '5,000만 / 150만');
    assert.equal(rows[0].loan, '없음');
  });

  it('marks a move-in date the owner has not given as needing confirmation', () => {
    const [row] = buildOfferRows([makeListing({ moveInAvailableType: null })]);
    assert.equal(row.moveIn, '확인 필요');
    assert.equal(row.moveInPending, true);
  });

  it('summarises the confirmation state of the open intake', () => {
    assert.equal(getConfirmSummary(makeIntake()).headline, '확인됨');
    assert.equal(
      getConfirmSummary(makeIntake({ nextConfirmAt: iso(-2) })).headline,
      '재확인 필요',
    );
    assert.equal(
      getConfirmSummary(makeIntake({ lastVerifiedAt: null, lastCheckResult: null })).headline,
      '미확인',
    );
  });

  it('counts days to the lease end and drops tenants who already moved out', () => {
    const tenants = buildTenants([
      { id: 't1', contactId: 'c1', deposit: 78000, monthlyRent: null, contractStart: iso(-600), contractEnd: iso(30), moveOutDate: null, status: 'residing', memo: null } as never,
      { id: 't2', contactId: 'c2', deposit: 1000, monthlyRent: 50, contractStart: null, contractEnd: null, moveOutDate: null, status: 'moved', memo: null } as never,
    ]);
    assert.equal(tenants.length, 1);
    assert.equal(tenants[0].terms, '보증금 7억 8,000만');
    assert.equal(tenants[0].daysToEnd, 30);
  });

  it('orders records newest first and strips the confirm-record prefix', () => {
    const records = buildRecords({
      listings: [
        makeListing({
          priceHistories: [
            { id: 'ph', priceBefore: 160000, priceAfter: 158000, depositBefore: null, depositAfter: null, monthlyRentBefore: null, monthlyRentAfter: null, reason: null, createdAt: iso(-5) } as never,
          ],
        }),
      ],
      consultations: [
        { id: 'c', type: 'phone', purpose: 'listing_confirm', content: '[매물확인] 가격 조정 동의', createdAt: iso(-1), contact: { id: 'o', name: '김정훈', phone: null } } as never,
      ],
      intakes: [makeIntake()],
    });
    assert.deepEqual(records.map((record) => record.kind), ['confirm', 'price', 'intake']);
    assert.equal(records[0].body, '가격 조정 동의');
    assert.equal(records[1].summary, '16억 → 15억 8,000만');
    assert.equal(records[1].direction, 'down');
  });

  it('lists only closed intakes as past intakes', () => {
    const past = buildPastIntakes([
      makeIntake(),
      makeIntake({
        id: 'old',
        lifecycleStatus: 'closed',
        closedReason: 'deal_completed',
        listings: [{ transactionType: 'jeonse', price: 78000, deposit: null, monthlyRent: null } as never],
      }),
    ]);
    assert.equal(past.length, 1);
    assert.equal(past[0].status, '종료 · 거래 완료');
    assert.equal(past[0].offers, '전세 7억 8,000만');
  });

  it('collects listing ids from closed intakes too', () => {
    const ids = collectListingIds([{ id: 'open-1' }], [
      makeIntake({ listings: [{ id: 'open-1' } as never] }),
      makeIntake({ id: 'old', lifecycleStatus: 'closed', listings: [{ id: 'closed-1' } as never] }),
    ]);
    assert.deepEqual(ids.sort(), ['closed-1', 'open-1']);
  });

  it('keeps a completed deal after its intake closed and records its history', () => {
    const deals = [
      { id: 'done', propertyId: null, listingId: 'closed-1', transactionType: 'jeonse', stage: 'completed', stageChangedAt: iso(-2), createdAt: iso(-20), isCancelled: false, cancelledAt: null, cancelReason: null, agreedPrice: 82000, agreedDeposit: 82000, agreedMonthlyRent: null, buyerContact: { id: 'b', name: '정민호' } },
      { id: 'direct', propertyId: 'prop-1', listingId: null, transactionType: 'sale', stage: 'preparing', stageChangedAt: iso(-1), createdAt: iso(-1), isCancelled: false, cancelledAt: null, cancelReason: null, agreedPrice: null, agreedDeposit: null, agreedMonthlyRent: null },
      { id: 'cancelled', propertyId: 'prop-1', listingId: null, transactionType: 'sale', stage: 'preContract', stageChangedAt: iso(-10), createdAt: iso(-12), isCancelled: true, cancelledAt: iso(-9), cancelReason: '매수인 대출 불가', agreedPrice: null, agreedDeposit: null, agreedMonthlyRent: null },
      { id: 'other', propertyId: 'prop-2', listingId: 'elsewhere', transactionType: 'sale', stage: 'completed', stageChangedAt: iso(-1), createdAt: iso(-1), isCancelled: false },
    ] as never[];
    const mine = selectPropertyDeals(deals, 'prop-1', ['closed-1']);
    assert.deepEqual(mine.map((deal) => deal.id).sort(), ['cancelled', 'direct', 'done']);

    const records = buildRecords({ listings: [], consultations: [], intakes: [], deals: mine });
    const titles = records.map((record) => `${record.id}:${record.title}`);
    assert.ok(titles.includes('deal-stage-done:거래 잔금완료'), titles.join(', '));
    assert.ok(titles.includes('deal-done:거래 시작'));
    assert.ok(titles.includes('deal-cancel-cancelled:거래 취소'));
    assert.ok(!titles.some((title) => title.startsWith('deal-stage-cancelled')));
    assert.equal(records.find((record) => record.id === 'deal-done')?.summary, '8억 2,000만');
  });

  // ── 2판: 브리핑 · 지금 챙길 것 · 손님 보기 ──

  const tenant = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'tenant-1',
      status: 'residing',
      deposit: 60000,
      monthlyRent: null,
      contractStart: iso(-600),
      contractEnd: iso(100),
      moveOutDate: null,
      contact: { id: 'c-t', name: '김세입', phone: '01022223333' },
      ...overrides,
    }) as never;

  it('prices per pyeong of supply area', () => {
    assert.equal(getSupplyPyeong(property), 34);
    assert.equal(formatPerPyeong(158000, 34), '평당 4,647만');
    assert.equal(formatPerPyeong(null, 34), null);
    assert.equal(formatPerPyeong(158000, null), null);
  });

  it('computes cash needed for a sale with a sitting tenant and the jeonse ratio', () => {
    const rows = buildOfferRows([
      makeListing(),
      makeListing({ id: 'j', transactionType: 'jeonse', price: 82000, moveInAvailableType: 'date', moveInAvailableFrom: iso(90) }),
    ]);
    const cards = buildBriefCards({ offerRows: rows, tenants: [tenant()], supplyPyeong: 34 });
    const sale = cards.find((card) => card.row.listing.id === 'listing-1');
    const jeonse = cards.find((card) => card.row.listing.id === 'j');
    const value = (card: typeof sale, key: string) => card?.rows.find((row) => row.key === key)?.value;
    assert.equal(value(sale, 'lease'), '현 전세 6억');
    assert.equal(value(sale, 'cash'), '9억 8,000만');
    assert.equal(value(jeonse, 'ratio'), '51.9%');
    assert.equal(sale?.perPyeong, '평당 4,647만');
  });

  it('assumes the new lease under contract before the current tenant', () => {
    const lease = getSaleLease(
      [
        { ...makeListing(), availability: 'available' },
        { ...makeListing({ id: 'j', transactionType: 'jeonse', price: 65000 }), availability: 'in_contract' },
      ] as never,
      [tenant()],
    );
    // 합의 금액이 없으면 호가를 쓰되 호가 기준임을 밝힌다
    assert.equal(lease?.label, '새 전세 6억 5,000만');
    assert.equal(lease?.source, 'new_lease');
    assert.equal(lease?.basis, 'asking');
    assert.match(lease?.note ?? '', /호가 기준/);
    assert.equal(getSaleLease([{ ...makeListing(), availability: 'available' }] as never, []), null);
    assert.equal(getSaleLease([{ ...makeListing(), availability: 'available' }] as never, [tenant({ status: 'moving_out' })]), null);
  });

  it('subtracts the deposit agreed in the lease deal, not the asking price', () => {
    // 매매 15억 · 전세 호가 8억 · 실제 합의 7억 → 실투자금 8억
    const rows = buildOfferRows([
      makeListing({ price: 150000 }),
      makeListing({ id: 'j', transactionType: 'jeonse', price: 80000, deals: [{ id: 'd-j', stage: 'contracted', stageChangedAt: iso(-1) }] }),
    ]);
    const deals = [
      { id: 'd-old', listingId: 'j', stage: 'preContract', isCancelled: true, agreedPrice: 60000, agreedDeposit: null, agreedMonthlyRent: null },
      { id: 'd-j', listingId: 'j', stage: 'contracted', isCancelled: false, agreedPrice: 70000, agreedDeposit: null, agreedMonthlyRent: null },
    ] as never[];
    const cards = buildBriefCards({ offerRows: rows, tenants: [tenant()], deals, supplyPyeong: 34 });
    const sale = cards.find((card) => card.row.listing.transactionType === 'sale');
    const value = (key: string) => sale?.rows.find((row) => row.key === key);
    assert.equal(value('lease')?.value, '새 전세 7억');
    assert.equal(value('cash')?.value, '8억');
    assert.equal(value('cash')?.note, '매매가 − 승계 보증금');

    // 월세 거래는 합의 보증금과 합의 월세를 쓴다
    const monthly = getSaleLease(
      [{ ...makeListing({ id: 'm', transactionType: 'monthly', price: null, deposit: 10000, monthlyRent: 150 }), availability: 'in_contract' }] as never,
      [],
      { deals: [{ id: 'd-m', listingId: 'm', stage: 'preparing', isCancelled: false, agreedPrice: null, agreedDeposit: 8000, agreedMonthlyRent: 170 }] as never },
    );
    assert.equal(monthly?.label, '새 월세 8,000만 / 170만');
    assert.equal(monthly?.basis, 'agreed');
  });

  it('writes a zero monthly deposit as 0, not as unknown', () => {
    assert.equal(formatListingPrice({ transactionType: 'monthly', price: null, deposit: 0, monthlyRent: 120 }), '0만 / 120만');
    assert.equal(formatListingPrice({ transactionType: 'monthly', price: null, deposit: null, monthlyRent: 120 }), '- / 120만');
  });

  it('treats a zero deposit as an amount, not as missing', () => {
    // 매매 15억 · 새 월세 합의 보증금 0원 · 지금 세입자 보증금 6억 → 실투자금 15억 (6억을 빼지 않는다)
    const rows = buildOfferRows([
      makeListing({ price: 150000 }),
      makeListing({ id: 'm', transactionType: 'monthly', price: null, deposit: 1000, monthlyRent: 180, deals: [{ id: 'd-m', stage: 'contracted', stageChangedAt: iso(-1) }] }),
    ]);
    const deals = [
      { id: 'd-m', listingId: 'm', stage: 'contracted', isCancelled: false, agreedPrice: null, agreedDeposit: 0, agreedMonthlyRent: 200 },
    ] as never[];
    const cards = buildBriefCards({ offerRows: rows, tenants: [tenant()], deals, supplyPyeong: 34 });
    const sale = cards.find((card) => card.row.listing.transactionType === 'sale');
    const value = (key: string) => sale?.rows.find((row) => row.key === key)?.value;
    assert.equal(value('lease'), '새 월세 보증금 없음 / 200만');
    assert.equal(value('cash'), '15억');

    // 지금 세입자가 무보증 월세여도 실투자금은 매매가 그대로
    const zeroTenant = getSaleLease([{ ...makeListing(), availability: 'available' }] as never, [tenant({ deposit: 0, monthlyRent: 150 })]);
    assert.equal(zeroTenant?.deposit, 0);
    assert.equal(zeroTenant?.label, '현 월세 보증금 없음 / 150만');
    // 보증금을 모르면 계산하지 않는다
    assert.equal(getSaleLease([{ ...makeListing(), availability: 'available' }] as never, [tenant({ deposit: null })]), null);
  });

  it('does not fall back to the departing tenant when the new lease has no amount yet', () => {
    const lease = getSaleLease(
      [
        { ...makeListing(), availability: 'available' },
        { ...makeListing({ id: 'm', transactionType: 'monthly', price: null, deposit: null, monthlyRent: 150 }), availability: 'in_contract' },
      ] as never,
      [tenant()],
      { deals: [{ id: 'd-m', listingId: 'm', stage: 'preparing', isCancelled: false, agreedPrice: null, agreedDeposit: null, agreedMonthlyRent: null }] as never },
    );
    assert.equal(lease, null);
  });

  it('removes the exact floor and unit number for customers', () => {
    assert.deepEqual(getHeaderTitle(property, true), { siteName: '고덕그라시움', unit: '103동' });
    assert.deepEqual(getHeaderTitle(property, false), { siteName: '고덕그라시움', unit: '103동 3401호' });
    assert.ok(getHeaderSpecs(property, false).some((spec) => spec.text === '34층'));
    assert.ok(!getHeaderSpecs(property, true).some((spec) => /층/.test(spec.text)));
    // 사진 메모는 내부 기록: 손님에게는 분류만 (연락처·현관 비밀번호가 들어 있을 수 있다)
    const photo = { id: 'p', category: 'entrance', memo: '현관 비번 1234* · 세입자 010-2222-3333', sortOrder: 0, createdAt: iso(-1) } as never;
    assert.equal(getPhotoCaption(photo, true), '현관');
    assert.equal(getPhotoCaption(photo, false), '현관 비번 1234* · 세입자 010-2222-3333');
  });

  it('keeps the first photo as the cover and moves a new cover to the front', () => {
    const photos = [
      { id: 'b', sortOrder: 1, createdAt: iso(-1) },
      { id: 'a', sortOrder: 0, createdAt: iso(-2) },
      { id: 'c', sortOrder: 2, createdAt: iso(-1) },
    ] as never[];
    assert.deepEqual(sortPhotos(photos).map((photo: { id: string }) => photo.id), ['a', 'b', 'c']);
    assert.deepEqual(coverFirstOrder(photos, 'c'), ['c', 'a', 'b']);
  });

  it('lists only upcoming viewings of live matches, soonest first', () => {
    const viewing = (id: string, days: number) => ({ id, type: 'viewing', start: iso(days) });
    const matches = [
      { id: 'm1', listingId: 'listing-1', stage: 'viewingConfirmed', buyerRequirement: { contact: { id: 'b1', name: '정민호' } }, calendarEvents: [viewing('v-past', -1), viewing('v-late', 5)] },
      { id: 'm2', listingId: 'listing-1', stage: 'viewing', buyerRequirement: { contact: { id: 'b2', name: '오지은' } }, calendarEvents: [viewing('v-soon', 1), { id: 'call', type: 'call', start: iso(1) }] },
      { id: 'm3', listingId: 'listing-1', stage: 'closed', buyerRequirement: { contact: { id: 'b3', name: '닫힘' } }, calendarEvents: [viewing('v-closed', 2)] },
    ] as never[];
    const items = buildUpcomingViewings(matches, new Map([['listing-1', 'sale']]));
    assert.deepEqual(items.map((item) => item.id), ['v-soon', 'v-late']);
    assert.equal(items[0].buyerName, '오지은');
    assert.equal(items[0].typeLabel, '매매');
  });

  it('puts overdue work first in the to-do list', () => {
    const rows = buildOfferRows([
      makeListing({
        advertisements: [{ id: 'ad', status: 'active', channel: 'esiljang', advertisedPrice: 160000, url: 'https://cp.example/ad' } as never],
      }),
    ]);
    const deals = [
      { id: 'd1', transactionType: 'sale', stage: 'contracted', isCancelled: false, buyerContact: { name: '정민호' }, payments: [
        { id: 'pay-paid', kind: 'contract', status: 'paid', scheduledAmount: 15000, paidAmount: 15000, scheduledDate: iso(-5) },
        { id: 'pay-next', kind: 'interim', status: 'pending', scheduledAmount: 50000, paidAmount: null, scheduledDate: iso(6) },
      ] },
    ] as never[];
    const todos = buildTodos({
      intake: makeIntake({ nextConfirmAt: iso(-2), lastVerifiedAt: iso(-12) }),
      offerRows: rows,
      deals,
      viewings: [],
      people: [],
      tenants: buildTenants([tenant({ contractEnd: iso(40) })]),
    });
    const keys = todos.map((todo) => todo.key);
    assert.equal(keys[0], 'confirm');
    assert.equal(todos[0].tone, 'danger');
    assert.ok(keys.includes('ad-ad'));
    assert.ok(keys.includes('pay-pay-next'));
    assert.ok(!keys.includes('pay-pay-paid'));
    assert.ok(keys.includes('tenant-tenant-1'));
    assert.ok(keys.includes('no-owner'));
    assert.equal(todos.find((todo) => todo.key === 'pay-pay-next')?.text.startsWith('중도금 5억 입금'), true);
  });

  it('writes the KakaoTalk brief without the unit number or in-contract offers by default', () => {
    const rows = buildOfferRows([
      makeListing(),
      makeListing({ id: 'j', transactionType: 'jeonse', price: 82000, deals: [{ id: 'd', stage: 'contracted', isCancelled: false }] as never }),
    ]);
    const cards = buildBriefCards({ offerRows: rows, tenants: [tenant()], supplyPyeong: 34 });
    const text = buildBriefText({ property, cards, options: { includeUnit: false, includeBusy: false, includePerPyeong: true } });
    assert.match(text, /^\[고덕그라시움 103동\]/);
    assert.doesNotMatch(text, /3401|34층/);
    assert.match(text, /■ 매매 15억 8,000만 · 평당 4,647만/);
    const withBusy = buildBriefText({ property, cards, options: { includeUnit: true, includeBusy: true, includePerPyeong: false } });
    assert.match(withBusy, /3401호/);
    assert.doesNotMatch(withBusy, /평당/);
  });
});
