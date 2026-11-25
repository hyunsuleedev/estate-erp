import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { BuyerRequirement } from '@estate-erp/api-client';
import {
  addPlaceRegion,
  addPlaceSite,
  buildAreaChange,
  buildBudgetChange,
  buildMemoChange,
  buildMoveInDateChange,
  buildPlacesChange,
  buildSiteTypesChange,
  buildStatusChange,
  buildUrgencyChange,
  currentStatus,
  findFieldsChangedBehind,
  getSiteTypeOptions,
  mergeLatestRequirement,
  mergeSavedRequirement,
  rebaseAreaDraft,
  rebaseBudgetDraft,
  rebaseMemo,
  rebaseMoveInDate,
  rebasePlacesDraft,
  rebaseSiteTypes,
  rebaseStatus,
  rebaseUrgency,
  removePlaceRegion,
  removePlaceSite,
  toAreaDraft,
  toBudgetDraft,
  toPlacesDraft,
} from '../src/renderer/routes/_authenticated/wanted-properties/-requirement-edit';
import { toDateInputValue } from '../src/renderer/routes/_authenticated/buyer-requirements/-buyer-utils';

// 금액은 만원, 면적은 m². 30평 = 99.17m², 34평 = 112.4m²
const requirement = {
  id: 'req-1',
  status: 'active',
  urgency: 'normal',
  transactionType: 'sale',
  siteTypes: ['apartment'],
  priceMin: 90000,
  priceMax: 105000,
  depositMin: null,
  depositMax: null,
  monthlyRentMin: null,
  monthlyRentMax: null,
  areaMin: 99.17,
  areaMax: 112.4,
  moveInDate: '2027-01-15T00:00:00.000Z',
  assignedToId: 'user-1',
  assignedTo: { id: 'user-1', name: '담당자' },
  _count: { matches: 2, consultations: 1 },
  preferredRegions: [
    {
      id: 'pr-1',
      provinceCode: null,
      districtCode: null,
      wardCode: '1174010300',
      ward: { code: '1174010300', name: '고덕동' },
    },
  ],
  preferredSites: [
    {
      id: 'ps-1',
      siteId: 'site-1',
      priority: 1,
      memo: '남향 동만',
      site: { id: 'site-1', name: '고덕그라시움', type: 'apartment' },
    },
    {
      id: 'ps-2',
      siteId: 'site-2',
      priority: 2,
      memo: null,
      site: { id: 'site-2', name: '고덕아르테온', type: 'apartment' },
    },
  ],
} as unknown as BuyerRequirement;

const patchOf = (change: ReturnType<typeof buildAreaChange>) =>
  change?.kind === 'update' ? change.patch : change;

describe('wanted properties inline edits: status and urgency', () => {
  it('sends a status change through the status route and nothing when unchanged', () => {
    assert.deepEqual(buildStatusChange(requirement, 'hold'), { kind: 'status', status: 'hold' });
    assert.deepEqual(buildStatusChange(requirement, 'completed'), {
      kind: 'status',
      status: 'completed',
    });
    assert.equal(buildStatusChange(requirement, 'active'), null);
    assert.throws(() => buildStatusChange(requirement, 'archived'), /상태/);
  });

  it('reads legacy statuses the way the badge shows them', () => {
    const legacy = { status: 'matched' } as unknown as BuyerRequirement;
    assert.equal(currentStatus(legacy), 'active');
    // 화면에 "활성"으로 보이는 값을 "활성"으로 고르는 것은 변경이 아니다
    assert.equal(buildStatusChange(legacy, 'active'), null);
    assert.deepEqual(buildStatusChange(legacy, 'hold'), { kind: 'status', status: 'hold' });
    assert.equal(currentStatus({ status: 'inactive' } as unknown as BuyerRequirement), 'hold');
  });

  it('accepts only the three urgency values', () => {
    assert.deepEqual(patchOf(buildUrgencyChange(requirement, 'urgent')), { urgency: 'urgent' });
    assert.equal(buildUrgencyChange(requirement, 'normal'), null);
    assert.throws(() => buildUrgencyChange(requirement, 'asap'), /긴급도/);
  });
});

describe('wanted properties inline edits: site types', () => {
  it('saves the selection in option order regardless of click order', () => {
    assert.deepEqual(patchOf(buildSiteTypesChange(requirement, ['villa', 'apartment'])), {
      siteTypes: ['apartment', 'villa'],
    });
    assert.deepEqual(patchOf(buildSiteTypesChange(requirement, [])), { siteTypes: [] });
    assert.equal(buildSiteTypesChange(requirement, ['apartment']), null);
    assert.equal(buildSiteTypesChange(requirement, ['apartment', 'apartment']), null);
  });

  it('keeps a legacy type selectable so saving does not silently drop it', () => {
    const legacy = { siteTypes: ['apartment', 'knowledge_center'] } as BuyerRequirement;
    const options = getSiteTypeOptions(legacy);
    assert.equal(options.length, 8);
    assert.deepEqual(options.at(-1), { value: 'knowledge_center', label: 'knowledge_center' });
    assert.equal(buildSiteTypesChange(legacy, ['knowledge_center', 'apartment']), null);
    assert.deepEqual(
      patchOf(buildSiteTypesChange(legacy, ['knowledge_center', 'apartment', 'officetel'])),
      { siteTypes: ['apartment', 'officetel', 'knowledge_center'] },
    );
    assert.equal(getSiteTypeOptions(requirement).length, 7);
  });
});

describe('wanted properties inline edits: desired area', () => {
  it('shows the stored m² as 평 and leaves an untouched side exactly as stored', () => {
    assert.deepEqual(toAreaDraft(requirement), { min: '30', max: '34' });
    assert.equal(buildAreaChange(requirement, { min: '30', max: '34' }), null);
    // 34평은 112.39m²로 환산되지만, 고치지 않은 쪽을 다시 계산해 112.4를 바꾸지 않는다
    assert.deepEqual(patchOf(buildAreaChange(requirement, { min: '25', max: '34' })), {
      areaMin: 82.65,
    });
    assert.deepEqual(patchOf(buildAreaChange(requirement, { min: '', max: '' })), {
      areaMin: null,
      areaMax: null,
    });
  });

  it('reads decimal strings from the server and refuses bad ranges', () => {
    const fromServer = { areaMin: '99.17', areaMax: null } as unknown as BuyerRequirement;
    assert.deepEqual(toAreaDraft(fromServer), { min: '30', max: '' });
    assert.equal(buildAreaChange(fromServer, { min: '30', max: '' }), null);
    assert.deepEqual(patchOf(buildAreaChange(fromServer, { min: '30', max: '40' })), {
      areaMax: 132.23,
    });
    assert.throws(
      () => buildAreaChange(requirement, { min: '40', max: '30' }),
      /희망 평형의 최소값이 최대값보다 큽니다/,
    );
    assert.throws(() => buildAreaChange(requirement, { min: '서른', max: '' }), /숫자/);
    assert.throws(() => buildAreaChange(requirement, { min: '-3', max: '' }), /0 이상/);
  });

  it('treats 0 as no limit, never as a stored zero', () => {
    assert.deepEqual(patchOf(buildAreaChange(requirement, { min: '0', max: '34' })), {
      areaMin: null,
    });
  });
});

describe('wanted properties inline edits: budget', () => {
  it('opens on the stored amounts and writes only the edited field', () => {
    assert.deepEqual(toBudgetDraft(requirement), {
      transactionType: 'sale',
      price: { min: '90000', max: '105000' },
      deposit: { min: '', max: '' },
      monthlyRent: { min: '', max: '' },
    });
    const draft = toBudgetDraft(requirement);
    assert.equal(buildBudgetChange(requirement, draft), null);
    assert.deepEqual(
      patchOf(buildBudgetChange(requirement, { ...draft, price: { min: '90000', max: '110,000' } })),
      { priceMax: 110000 },
    );
    assert.deepEqual(
      patchOf(buildBudgetChange(requirement, { ...draft, price: { min: '', max: '105000' } })),
      { priceMin: null },
    );
  });

  it('empties the amounts of the type being left, like the edit form', () => {
    const draft = toBudgetDraft(requirement);
    assert.deepEqual(
      patchOf(
        buildBudgetChange(requirement, {
          ...draft,
          transactionType: 'monthly',
          deposit: { min: '1000', max: '3000' },
          monthlyRent: { min: '', max: '90' },
        }),
      ),
      {
        transactionType: 'monthly',
        priceMin: null,
        priceMax: null,
        depositMin: 1000,
        depositMax: 3000,
        monthlyRentMax: 90,
      },
    );
    // 매매 → 전세는 같은 칸(priceMin/Max)을 쓰므로 유형만 바뀐다
    assert.deepEqual(
      patchOf(buildBudgetChange(requirement, { ...draft, transactionType: 'jeonse' })),
      { transactionType: 'jeonse' },
    );
  });

  it('does not touch hidden amounts while the type stays the same', () => {
    // 예전에 월세였던 조건에 보증금 값이 남아 있어도, 매매가만 고치면 매매가만 보낸다.
    // 열기만 한 칸이 "고친 칸"이 되어 바깥을 눌렀을 때 저장이 나가지 않게 하는 규칙이기도 하다.
    const stale = { ...requirement, depositMax: 5000, monthlyRentMax: 80 } as BuyerRequirement;
    assert.equal(buildBudgetChange(stale, toBudgetDraft(stale)), null);
    assert.deepEqual(
      patchOf(
        buildBudgetChange(stale, {
          ...toBudgetDraft(stale),
          price: { min: '90000', max: '100000' },
        }),
      ),
      { priceMax: 100000 },
    );
    // 저장된 0은 빈 값으로 본다
    const zero = { ...requirement, priceMin: 0 } as BuyerRequirement;
    assert.equal(toBudgetDraft(zero).price.min, '');
    assert.equal(buildBudgetChange(zero, toBudgetDraft(zero)), null);
  });

  it('refuses fractions, reversed ranges, and amounts without a transaction type', () => {
    const draft = toBudgetDraft(requirement);
    assert.throws(
      () => buildBudgetChange(requirement, { ...draft, price: { min: '9000.5', max: '' } }),
      /금액을 읽을 수 없습니다/,
    );
    assert.throws(
      () => buildBudgetChange(requirement, { ...draft, price: { min: '억', max: '' } }),
      /금액을 읽을 수 없습니다/,
    );
    // 전화로 들은 대로 "8억 5천"처럼 적어도 받는다 (앱 공용 금액 규칙)
    assert.deepEqual(
      patchOf(buildBudgetChange(requirement, { ...draft, price: { min: '8억 5천', max: '' } }))
        ?.priceMin,
      85000,
    );
    assert.throws(
      () => buildBudgetChange(requirement, { ...draft, price: { min: '110000', max: '105000' } }),
      /매매가의 최소값이 최대값보다 큽니다/,
    );
    assert.throws(
      () =>
        buildBudgetChange(requirement, {
          ...draft,
          transactionType: 'monthly',
          monthlyRent: { min: '120', max: '90' },
        }),
      /월세의 최소값이 최대값보다 큽니다/,
    );

    const untyped = {
      ...requirement,
      transactionType: null,
      priceMin: null,
      priceMax: null,
    } as BuyerRequirement;
    assert.equal(toBudgetDraft(untyped).transactionType, '');
    assert.equal(buildBudgetChange(untyped, toBudgetDraft(untyped)), null);
    assert.throws(
      () =>
        buildBudgetChange(untyped, {
          ...toBudgetDraft(untyped),
          price: { min: '', max: '50000' },
        }),
      /거래유형을 먼저 골라 주세요/,
    );
    assert.deepEqual(
      patchOf(
        buildBudgetChange(untyped, {
          ...toBudgetDraft(untyped),
          transactionType: 'jeonse',
          price: { min: '', max: '50000' },
        }),
      ),
      { transactionType: 'jeonse', priceMax: 50000 },
    );

    // 거래유형 없이 금액만 저장돼 있던 조건: 열기만 해서는 막히지 않고, 비울 수 있고, 고치려면 유형이 필요하다
    const amountOnly = { ...untyped, priceMax: 70000 } as BuyerRequirement;
    assert.equal(buildBudgetChange(amountOnly, toBudgetDraft(amountOnly)), null);
    assert.deepEqual(
      patchOf(
        buildBudgetChange(amountOnly, {
          ...toBudgetDraft(amountOnly),
          price: { min: '', max: '' },
        }),
      ),
      { priceMax: null },
    );
    assert.throws(
      () =>
        buildBudgetChange(amountOnly, {
          ...toBudgetDraft(amountOnly),
          price: { min: '', max: '80000' },
        }),
      /거래유형을 먼저 골라 주세요/,
    );
  });
});

describe('wanted properties inline edits: move-in date', () => {
  it('sends the picked day in the form the create screen uses', () => {
    assert.deepEqual(patchOf(buildMoveInDateChange(requirement, '2027-02-28')), {
      moveInDate: '2027-02-28',
    });
    assert.throws(() => buildMoveInDateChange(requirement, '2027-02-30'), /올바른 날짜/);
    assert.throws(() => buildMoveInDateChange(requirement, '27-2-3'), /올바른 날짜/);
  });

  it('clears a saved date when the input is emptied, and leaves an empty one alone', () => {
    assert.deepEqual(patchOf(buildMoveInDateChange(requirement, '')), { moveInDate: null });
    assert.equal(
      buildMoveInDateChange({ moveInDate: null } as BuyerRequirement, ''),
      null,
    );
    assert.deepEqual(
      patchOf(buildMoveInDateChange({ moveInDate: null } as BuyerRequirement, '2027-03-02')),
      { moveInDate: '2027-03-02' },
    );
  });
});

describe('wanted properties inline edits: regions and sites', () => {
  it('reads each region at its narrowest level and keeps site memos', () => {
    assert.deepEqual(toPlacesDraft(requirement), {
      regions: [{ level: 'ward', code: '1174010300', label: '고덕동' }],
      sites: [
        { siteId: 'site-1', name: '고덕그라시움', memo: '남향 동만' },
        { siteId: 'site-2', name: '고덕아르테온', memo: null },
      ],
    });
    assert.equal(buildPlacesChange(requirement, toPlacesDraft(requirement)), null);
  });

  it('sends only the side that changed, because the server replaces each list whole', () => {
    const draft = toPlacesDraft(requirement);
    const withSite = addPlaceSite(draft, { siteId: 'site-3', name: '고덕자이' });
    assert.deepEqual(patchOf(buildPlacesChange(requirement, withSite)), {
      preferredSites: [
        { siteId: 'site-1', priority: 1, memo: '남향 동만' },
        { siteId: 'site-2', priority: 2 },
        { siteId: 'site-3', priority: 3 },
      ],
    });
    const withRegion = addPlaceRegion(draft, { level: 'district', code: '11740', label: '강동구' });
    assert.deepEqual(patchOf(buildPlacesChange(requirement, withRegion)), {
      preferredRegions: [{ wardCode: '1174010300' }, { districtCode: '11740' }],
    });
    const cleared = removePlaceSite(removePlaceSite(draft, 'site-1'), 'site-2');
    assert.deepEqual(patchOf(buildPlacesChange(requirement, cleared)), { preferredSites: [] });
    assert.deepEqual(
      patchOf(buildPlacesChange(requirement, removePlaceRegion(draft, draft.regions[0]))),
      { preferredRegions: [] },
    );
  });

  it('does not add the same place twice and treats region order as irrelevant', () => {
    const draft = toPlacesDraft(requirement);
    assert.equal(addPlaceSite(draft, { siteId: 'site-1', name: '고덕그라시움' }), draft);
    assert.equal(addPlaceRegion(draft, draft.regions[0]), draft);

    const two = {
      ...requirement,
      preferredRegions: [
        ...(requirement.preferredRegions ?? []),
        { id: 'pr-2', provinceCode: null, districtCode: '11740', wardCode: null },
      ],
    } as BuyerRequirement;
    const reversed = { ...toPlacesDraft(two), regions: [...toPlacesDraft(two).regions].reverse() };
    assert.equal(buildPlacesChange(two, reversed), null);
    // 이름을 함께 받지 못한 지역도 버리지 않는다 (코드를 이름 자리에 둔다)
    assert.equal(toPlacesDraft(two).regions[1].label, '11740');

    // 단지는 순서가 우선순위라 순서만 바뀌어도 변경이다
    const swapped = { ...draft, sites: [...draft.sites].reverse() };
    assert.deepEqual(patchOf(buildPlacesChange(requirement, swapped)), {
      preferredSites: [
        { siteId: 'site-2', priority: 1 },
        { siteId: 'site-1', priority: 2, memo: '남향 동만' },
      ],
    });
  });
});

describe('wanted properties inline edits: a list refresh under an open editor', () => {
  // 편집기를 열어 둔 사이 목록이 새로 왔을 때: 손대지 않은 값은 지금 값을 따르고, 손댄 값만 남는다.
  // 열 때의 초안을 그대로 지금 값과 견주면 예전 값이 "고친 값"으로 읽혀 새 값을 덮는다.
  it('budget: an untouched editor has nothing to save, an edited one sends only its edit', () => {
    const live = { ...requirement, priceMax: 120000 } as BuyerRequirement;
    const opened = toBudgetDraft(requirement);

    assert.deepEqual(rebaseBudgetDraft(requirement, live, opened), toBudgetDraft(live));
    assert.equal(buildBudgetChange(live, rebaseBudgetDraft(requirement, live, opened)), null);
    // 다시 얹지 않으면 이렇게 예전 상한이 새 값을 덮는다
    assert.deepEqual(patchOf(buildBudgetChange(live, opened)), { priceMax: 105000 });

    const edited = { ...opened, price: { ...opened.price, min: '80000' } };
    const rebased = rebaseBudgetDraft(requirement, live, edited);
    assert.deepEqual(rebased.price, { min: '80000', max: '120000' });
    assert.deepEqual(patchOf(buildBudgetChange(live, rebased)), { priceMin: 80000 });

    // 쉼표를 넣었을 뿐인 칸은 고친 것이 아니다 — 새 값을 따른다
    const reformatted = { ...opened, price: { min: '90,000', max: '105,000' } };
    assert.deepEqual(rebaseBudgetDraft(requirement, live, reformatted).price, {
      min: '90000',
      max: '120000',
    });
    // 조건이 그대로면 초안도 그대로다
    assert.deepEqual(rebaseBudgetDraft(requirement, requirement, edited), edited);
  });

  it('budget: a type changed elsewhere is never applied to amounts typed under another type', () => {
    // 금액은 유형에 묶인 값이다. 매매가로 넣은 금액을 전세가로 저장해도, 월세 칸으로 바꿔 입력을 감춰도 안 된다.
    const opened = toBudgetDraft(requirement);
    const edited = { ...opened, price: { ...opened.price, max: '170000' } };

    for (const type of ['jeonse', 'monthly'] as const) {
      const live = { ...requirement, transactionType: type } as BuyerRequirement;
      // 손대지 않았으면 지금 유형을 그대로 따른다
      assert.equal(rebaseBudgetDraft(requirement, live, opened).transactionType, type);
      assert.equal(rebaseBudgetDraft(requirement, live, opened).typeConflict, undefined);

      // 금액을 고치던 중이면: 보던 유형(매매)과 입력을 그대로 두고, 유형을 다시 고를 때까지 저장을 막는다
      const held = rebaseBudgetDraft(requirement, live, edited);
      assert.equal(held.transactionType, 'sale');
      assert.equal(held.typeConflict, type);
      assert.deepEqual(held.price, { min: '90000', max: '170000' });
      assert.throws(() => buildBudgetChange(live, held), /거래유형을 골라 주세요/);

      // 이어서 금액을 더 고쳐도(기준이 지금 조건으로 옮겨져도) 풀리지 않는다
      const typedMore = { ...held, price: { ...held.price, min: '95000' } };
      assert.equal(rebaseBudgetDraft(live, live, typedMore).typeConflict, type);
      assert.throws(() => buildBudgetChange(live, typedMore), /거래유형을 골라 주세요/);

      // 지금 유형을 고르면: 유형은 보내지 않고, 고른 유형의 칸에 있는 값만 저장한다
      const acceptNew = { ...held, transactionType: type, typeConflict: undefined };
      assert.deepEqual(
        patchOf(buildBudgetChange(live, acceptNew)),
        type === 'jeonse' ? { priceMax: 170000 } : null,
      );
      // 보던 유형을 고르면: 유형까지 함께 보낸다 (사용자가 고른 것이므로)
      const keepMine = { ...held, typeConflict: undefined };
      assert.deepEqual(patchOf(buildBudgetChange(live, keepMine)), {
        transactionType: 'sale',
        priceMax: 170000,
      });
      // 고른 뒤에는 그 선택이 남는다 (기준 = 고를 때의 조건)
      const again = { ...live, priceMin: 85000 } as BuyerRequirement;
      const afterPick = rebaseBudgetDraft(live, again, keepMine);
      assert.equal(afterPick.transactionType, 'sale');
      assert.equal(afterPick.typeConflict, undefined);
      assert.equal(afterPick.price.min, '85000');
    }

    // 유형이 보던 것으로 돌아오면 저절로 풀린다
    const back = rebaseBudgetDraft(
      { ...requirement, transactionType: 'jeonse' } as BuyerRequirement,
      requirement,
      { ...edited, typeConflict: 'jeonse' },
    );
    assert.equal(back.typeConflict, undefined);
    assert.equal(back.transactionType, 'sale');

    // 사용자가 직접 바꾼 유형은 다른 곳에서 유형이 바뀌어도 남는다
    const picked = { ...opened, transactionType: 'monthly' as const, deposit: { min: '', max: '3000' } };
    const elsewhere = { ...requirement, transactionType: 'jeonse' } as BuyerRequirement;
    const kept = rebaseBudgetDraft(requirement, elsewhere, picked);
    assert.equal(kept.transactionType, 'monthly');
    assert.equal(kept.typeConflict, undefined);
    assert.deepEqual(patchOf(buildBudgetChange(elsewhere, kept)), {
      transactionType: 'monthly',
      priceMin: null,
      priceMax: null,
      depositMax: 3000,
    });
  });

  it('area and move-in date follow the refresh unless edited', () => {
    const live = {
      ...requirement,
      areaMin: 82.65,
      moveInDate: '2027-04-10T00:00:00.000Z',
    } as BuyerRequirement;
    assert.deepEqual(rebaseAreaDraft(requirement, live, { min: '30', max: '40' }), {
      min: '25',
      max: '40',
    });
    assert.deepEqual(
      patchOf(buildAreaChange(live, rebaseAreaDraft(requirement, live, { min: '30', max: '40' }))),
      { areaMax: 132.23 },
    );
    assert.equal(buildAreaChange(live, rebaseAreaDraft(requirement, live, toAreaDraft(requirement))), null);

    const openedDate = toDateInputValue(requirement.moveInDate);
    const liveDate = toDateInputValue(live.moveInDate);
    assert.equal(rebaseMoveInDate(requirement, live, openedDate), liveDate);
    assert.equal(buildMoveInDateChange(live, rebaseMoveInDate(requirement, live, openedDate)), null);
    assert.equal(rebaseMoveInDate(requirement, live, '2027-02-01'), '2027-02-01');
  });

  it('memo: sends only a real change and an untouched draft follows the refresh', () => {
    const withMemo = { ...requirement, memo: '학군 중심, 남향 선호' } as BuyerRequirement;
    // 그대로이거나 앞뒤 공백만 다르면 보내지 않는다
    assert.equal(buildMemoChange(withMemo, '학군 중심, 남향 선호'), null);
    assert.equal(buildMemoChange(withMemo, '  학군 중심, 남향 선호\n'), null);
    assert.equal(buildMemoChange({ memo: null }, '   '), null);
    // 고치면 다듬은 글을 보낸다. 비우면 빈 글을 보낸다 (서버는 null을 받지 않는다)
    assert.deepEqual(patchOf(buildMemoChange(withMemo, ' 고층 선호 ')), { memo: '고층 선호' });
    assert.deepEqual(patchOf(buildMemoChange(withMemo, '')), { memo: '' });
    // 줄바꿈은 그대로 둔다
    assert.deepEqual(patchOf(buildMemoChange(withMemo, '첫 줄\n둘째 줄')), {
      memo: '첫 줄\n둘째 줄',
    });

    // 편집기를 연 채 다른 곳에서 메모가 바뀌었다
    const live = { ...withMemo, memo: '다른 직원이 고친 메모' } as BuyerRequirement;
    // 손대지 않은 초안은 새 메모를 따르고, 닫아도 예전 메모를 덮지 않는다
    assert.equal(rebaseMemo(withMemo, live, '학군 중심, 남향 선호'), '다른 직원이 고친 메모');
    assert.equal(
      buildMemoChange(live, rebaseMemo(withMemo, live, '학군 중심, 남향 선호')),
      null,
    );
    // 끝에 줄바꿈이나 공백만 넣은 초안도 손대지 않은 것이다: 새 메모를 따르고, 닫아도 저장하지 않는다
    for (const padded of ['학군 중심, 남향 선호\n', '  학군 중심, 남향 선호  ', '학군 중심, 남향 선호\n\n ']) {
      assert.equal(rebaseMemo(withMemo, live, padded), '다른 직원이 고친 메모');
      assert.equal(buildMemoChange(live, rebaseMemo(withMemo, live, padded)), null);
    }
    // 메모가 없던 조건에 공백만 친 것도 마찬가지다
    assert.equal(rebaseMemo({ memo: null }, live, ' \n'), '다른 직원이 고친 메모');
    // 손댄 초안은 남는다
    assert.equal(rebaseMemo(withMemo, live, '내가 쓰던 글'), '내가 쓰던 글');
    assert.equal(rebaseMemo(withMemo, live, '학군 중심, 남향 선호\n고층'), '학군 중심, 남향 선호\n고층');
    // 화면이 모르는 사이 바뀐 메모 위에 덮으려 하면 한 번 멈춘다
    assert.deepEqual(
      findFieldsChangedBehind(withMemo, live, { kind: 'update', patch: { memo: '내가 쓰던 글' } }),
      ['memo'],
    );
    assert.deepEqual(
      findFieldsChangedBehind(live, live, { kind: 'update', patch: { memo: '내가 쓰던 글' } }),
      [],
    );
  });

  it('status and urgency: the untouched choice follows the refresh', () => {
    const live = { ...requirement, status: 'hold', urgency: 'urgent' } as BuyerRequirement;
    assert.equal(rebaseStatus(requirement, live, 'active'), 'hold');
    assert.equal(rebaseStatus(requirement, live, 'completed'), 'completed');
    assert.equal(
      rebaseStatus({ status: 'matched' } as unknown as BuyerRequirement, live, 'active'),
      'hold',
    );
    assert.equal(rebaseUrgency(requirement, live, 'normal'), 'urgent');
    assert.equal(rebaseUrgency(requirement, live, 'flexible'), 'flexible');
  });

  it('site types: replays what the user added and removed on the refreshed list', () => {
    const live = { siteTypes: ['apartment', 'villa'] } as BuyerRequirement;
    // 사용자가 오피스텔을 더한 사이, 다른 곳에서 빌라가 더해졌다
    const added = rebaseSiteTypes(requirement, live, ['apartment', 'officetel']);
    assert.deepEqual(added, ['apartment', 'villa', 'officetel']);
    assert.deepEqual(patchOf(buildSiteTypesChange(live, added)), {
      siteTypes: ['apartment', 'officetel', 'villa'],
    });
    // 사용자가 아파트를 뺀 사이, 다른 곳에서 빌라가 더해졌다
    assert.deepEqual(rebaseSiteTypes(requirement, live, []), ['villa']);
    // 손대지 않았으면 지금 목록 그대로 — 저장할 것이 없다
    assert.equal(buildSiteTypesChange(live, rebaseSiteTypes(requirement, live, ['apartment'])), null);
    // 다른 곳에서 빠진 유형을 손대지 않은 초안이 되살리지 않는다
    assert.deepEqual(
      rebaseSiteTypes(
        { siteTypes: ['apartment', 'villa'] } as BuyerRequirement,
        { siteTypes: ['villa'] } as BuyerRequirement,
        ['apartment', 'villa'],
      ),
      ['villa'],
    );
  });

  it('places: keeps regions and sites added elsewhere while applying the user edits', () => {
    const live = {
      preferredRegions: [
        ...(requirement.preferredRegions ?? []),
        {
          id: 'pr-9',
          provinceCode: null,
          districtCode: null,
          wardCode: '1174010200',
          ward: { code: '1174010200', name: '상일동' },
        },
      ],
      preferredSites: [
        ...(requirement.preferredSites ?? []),
        {
          id: 'ps-9',
          siteId: 'site-4',
          priority: 3,
          memo: null,
          site: { id: 'site-4', name: '고덕자이', type: 'apartment' },
        },
      ],
    } as unknown as BuyerRequirement;

    // 사용자는 그라시움을 빼고 솔베뉴를 더했다. 그 사이 다른 곳에서 상일동과 고덕자이가 더해졌다
    const opened = toPlacesDraft(requirement);
    const edited = addPlaceSite(removePlaceSite(opened, 'site-1'), {
      siteId: 'site-9',
      name: '래미안솔베뉴',
    });
    const rebased = rebasePlacesDraft(requirement, live, edited);
    assert.deepEqual(rebased.regions.map((region) => region.label), ['고덕동', '상일동']);
    assert.deepEqual(rebased.sites.map((site) => site.siteId), ['site-2', 'site-4', 'site-9']);
    assert.deepEqual(patchOf(buildPlacesChange(live, rebased)), {
      preferredSites: [
        { siteId: 'site-2', priority: 1 },
        { siteId: 'site-4', priority: 2 },
        { siteId: 'site-9', priority: 3 },
      ],
    });
    // 다시 얹지 않으면 지역까지 예전 목록으로 덮고, 다른 곳에서 더한 단지가 사라진다
    assert.deepEqual(patchOf(buildPlacesChange(live, edited)), {
      preferredRegions: [{ wardCode: '1174010300' }],
      preferredSites: [
        { siteId: 'site-2', priority: 1 },
        { siteId: 'site-9', priority: 2 },
      ],
    });
    // 손대지 않은 편집기는 저장할 것이 없다
    assert.equal(buildPlacesChange(live, rebasePlacesDraft(requirement, live, opened)), null);
  });
});

describe('wanted properties inline edits: applying the save response', () => {
  it('overlays only the edited fields, so a stale response cannot roll back untouched values', () => {
    const other = { ...requirement, id: 'req-2' } as BuyerRequirement;
    // 목록은 그 사이 새로 와서 긴급도가 urgent다. 상태 변경 응답은 저장한 순간의 값(normal)을 싣고 온다.
    const listed = { ...requirement, urgency: 'urgent' } as BuyerRequirement;
    const statusResponse = { id: 'req-1', status: 'hold', urgency: 'normal' } as BuyerRequirement;
    const merged = mergeSavedRequirement([listed, other], statusResponse, {
      kind: 'status',
      status: 'hold',
    });
    assert.equal(merged?.[0].status, 'hold');
    assert.equal(merged?.[0].urgency, 'urgent');
    // 응답에 없는 것(지역 · 단지 · 담당자 요약 · 매칭 수)은 목록 값을 둔다
    assert.equal(merged?.[0].preferredSites?.length, 2);
    assert.deepEqual(merged?.[0].assignedTo, { id: 'user-1', name: '담당자' });
    assert.deepEqual(merged?.[0]._count, { matches: 2, consultations: 1 });
    assert.equal(merged?.[1], other);

    // 고친 칸은 응답 값으로 바뀐다 (단지는 이름이 붙은 응답 모양 그대로)
    const updateResponse = {
      ...requirement,
      priceMin: 1,
      priceMax: 110000,
      preferredSites: [],
    } as unknown as BuyerRequirement;
    const priced = mergeSavedRequirement([requirement], updateResponse, {
      kind: 'update',
      patch: { priceMax: 110000 },
    });
    assert.equal(priced?.[0].priceMax, 110000);
    assert.equal(priced?.[0].priceMin, 90000);
    assert.equal(priced?.[0].preferredSites?.length, 2);
    const cleared = mergeSavedRequirement([requirement], updateResponse, {
      kind: 'update',
      patch: { preferredSites: [] },
    });
    assert.deepEqual(cleared?.[0].preferredSites, []);
    assert.equal(cleared?.[0].priceMax, 105000);

    assert.equal(
      mergeSavedRequirement(undefined, statusResponse, { kind: 'status', status: 'hold' }),
      undefined,
    );
  });
});

describe('wanted properties inline edits: the value fetched right before saving', () => {
  it('replaces the listed requirement with the fresh read, keeping what only the list carries', () => {
    const other = { ...requirement, id: 'req-2' } as BuyerRequirement;
    // 한 건 조회에는 매칭 · 상담 목록이 실려 오고 매칭 수는 없다
    const latest = {
      ...requirement,
      transactionType: 'jeonse',
      urgency: 'urgent',
      preferredSites: [],
      matches: [{ id: 'match-1' }],
      consultations: [{ id: 'consultation-1' }],
      _count: undefined,
    } as unknown as BuyerRequirement;
    delete (latest as { _count?: unknown })._count;

    const merged = mergeLatestRequirement([requirement, other], latest);
    assert.equal(merged?.[0].transactionType, 'jeonse');
    assert.equal(merged?.[0].urgency, 'urgent');
    assert.deepEqual(merged?.[0].preferredSites, []);
    assert.deepEqual(merged?.[0]._count, { matches: 2, consultations: 1 });
    assert.equal(merged?.[0].matches, undefined);
    assert.equal(merged?.[0].consultations, undefined);
    assert.equal(merged?.[1], other);
    assert.equal(mergeLatestRequirement(undefined, latest), undefined);
  });

  it('re-evaluates the edit on the fresh value the same way as after a list refresh', () => {
    // 화면은 매매 9억 ~ 10억 5,000만으로 알고 상한을 17억으로 고쳤다. 서버는 그 사이 전세가 됐다.
    const seen = requirement;
    const edited = { ...toBudgetDraft(seen), price: { min: '90000', max: '170000' } };
    assert.deepEqual(patchOf(buildBudgetChange(seen, edited)), { priceMax: 170000 });

    const fresh = { ...requirement, transactionType: 'jeonse' } as BuyerRequirement;
    const onFresh = rebaseBudgetDraft(seen, fresh, edited);
    assert.equal(onFresh.typeConflict, 'jeonse');
    assert.throws(() => buildBudgetChange(fresh, onFresh), /거래유형을 골라 주세요/);

    // 상관없는 칸만 바뀌어 있었으면 그대로 보낸다
    const unrelated = { ...requirement, urgency: 'urgent', priceMin: 80000 } as BuyerRequirement;
    assert.deepEqual(
      patchOf(buildBudgetChange(unrelated, rebaseBudgetDraft(seen, unrelated, edited))),
      { priceMax: 170000 },
    );
    // 이미 같은 값이 돼 있었으면 보낼 것이 없다
    const same = { ...requirement, priceMax: 170000 } as BuyerRequirement;
    assert.equal(buildBudgetChange(same, rebaseBudgetDraft(seen, same, edited)), null);
  });
});

describe('wanted properties inline edits: fields changed behind the screen', () => {
  it('names the fields about to be written whose value the screen had not seen', () => {
    const seen = requirement;
    const latest = {
      ...requirement,
      priceMax: 150000,
      urgency: 'urgent',
      status: 'hold',
      moveInDate: '2027-04-10T00:00:00.000Z',
    } as BuyerRequirement;
    const update = (patch: Record<string, unknown>) => ({ kind: 'update' as const, patch });

    // 고치려는 칸이 바뀌어 있었다 → 멈춘다
    assert.deepEqual(findFieldsChangedBehind(seen, latest, update({ priceMax: 170000 })), [
      'priceMax',
    ]);
    assert.deepEqual(findFieldsChangedBehind(seen, latest, update({ urgency: 'flexible' })), [
      'urgency',
    ]);
    assert.deepEqual(findFieldsChangedBehind(seen, latest, update({ moveInDate: '2027-05-01' })), [
      'moveInDate',
    ]);
    assert.deepEqual(
      findFieldsChangedBehind(seen, latest, { kind: 'status', status: 'completed' }),
      ['status'],
    );
    // 다른 칸만 바뀌어 있었다 → 그대로 보낸다
    assert.deepEqual(findFieldsChangedBehind(seen, latest, update({ priceMin: 80000 })), []);
    assert.deepEqual(findFieldsChangedBehind(seen, latest, update({ areaMax: 132.23 })), []);
    // 화면이 이미 그 값을 보여 주고 있었으면 해당하지 않는다
    assert.deepEqual(findFieldsChangedBehind(latest, latest, update({ priceMax: 170000 })), []);
  });

  it('compares by meaning, not by text or representation', () => {
    const seen = { ...requirement, priceMin: 0, areaMin: '99.17', status: 'matched' } as unknown as BuyerRequirement;
    const latest = { ...requirement, priceMin: null, areaMin: 99.17, status: 'active' } as BuyerRequirement;
    // 0과 빈 값, 글자와 수, 예전 상태값과 지금 상태값은 같은 것이다
    assert.deepEqual(
      findFieldsChangedBehind(seen, latest, {
        kind: 'update',
        patch: { priceMin: 50000, areaMin: 82.65 },
      }),
      [],
    );
    assert.deepEqual(findFieldsChangedBehind(seen, latest, { kind: 'status', status: 'hold' }), []);
  });

  it('leaves list fields to the replay rules', () => {
    // 목록은 사용자가 더하고 뺀 것만 지금 목록에 다시 적용해서 보내므로 서로 덮지 않는다
    const latest = { ...requirement, siteTypes: ['apartment', 'villa'], preferredSites: [] } as BuyerRequirement;
    assert.deepEqual(
      findFieldsChangedBehind(requirement, latest, {
        kind: 'update',
        patch: { siteTypes: ['apartment', 'officetel', 'villa'], preferredSites: [], preferredRegions: [] },
      }),
      [],
    );
  });
});

