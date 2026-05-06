import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildConsultationApiParams,
  getConsultationActionLabel,
  getConsultationContextCards,
  getConsultationContextLabels,
  getConsultationFilterChips,
  getSelectedConsultation,
  getConsultationSignal,
  getConsultationStats,
  groupConsultationsByDay,
  type ConsultationListItem,
} from '../src/routes/_authenticated/consultations/-consultation-view-utils';

describe('consultation view utilities', () => {
  it('classifies consultation content into business signals', () => {
    assert.equal(getConsultationSignal(item({ content: '급매 가격 조정 수락. 26.8억으로 인하.' })).key, 'price');
    assert.equal(getConsultationSignal(item({ content: '토요일 오후 2시 임장 일정 확정.' })).key, 'schedule');
    assert.equal(getConsultationSignal(item({ content: '계약금 입금 확인. 19.8억 매매.' })).key, 'contract');
    assert.equal(getConsultationSignal(item({ content: '전세 물건 추가 요청. 즉시입주 필수.' })).key, 'requirement');
  });

  it('derives context labels from linked property, listing, match, and buyer requirement fields', () => {
    assert.deepEqual(
      getConsultationContextLabels(
        item({
          property: {
            id: 'p1',
            memo: null,
            site: { name: '고덕그라시움' },
            unit: {
              id: 'u1',
              name: '1503',
              floor: 15,
              lineNo: 3,
              dong: { id: 'd1', name: '101', isPlaceholder: false },
            },
          },
          listing: { id: 'l1', transactionType: 'sale', price: 268000, checkStatus: 'verified' },
          matchId: 'm1',
          buyerReqId: 'b1',
        }),
      ),
      ['고덕그라시움 101동 1503호', '매매 26억 8,000만', '매칭 연결', '구매요건 연결'],
    );
  });

  it('formats linked property cards with dong and unit context', () => {
    const cards = getConsultationContextCards(
      item({
        propertyId: 'property-1',
        property: {
          id: 'property-1',
          memo: null,
          site: { name: '고덕그라시움' },
          unit: {
            id: 'unit-1',
            name: '1503',
            floor: 15,
            lineNo: 3,
            dong: { id: 'dong-1', name: '101', isPlaceholder: false },
          },
        },
      }),
    );

    assert.deepEqual(
      cards.find((card) => card.key === 'property'),
      {
        key: 'property',
        label: '매물',
        title: '고덕그라시움 101동 1503호',
        description: '15층 · 3라인',
        to: '/properties/$id',
        params: { id: 'property-1' },
      },
    );
  });

  it('hides placeholder dongs in linked property titles', () => {
    const labels = getConsultationContextLabels(
      item({
        propertyId: 'property-1',
        property: {
          id: 'property-1',
          memo: null,
          site: { name: '강동상가' },
          unit: {
            id: 'unit-1',
            name: '301호',
            floor: 3,
            lineNo: null,
            dong: { id: 'dong-1', name: '-', isPlaceholder: true },
          },
        },
      }),
    );

    assert.equal(labels[0], '강동상가 301호');
  });

  it('keeps the site name when a house or land property has no unit', () => {
    assert.deepEqual(
      getConsultationContextLabels(
        item({
          propertyId: 'property-1',
          property: {
            id: 'property-1',
            memo: null,
            site: { name: '고덕동 단독주택' },
            unit: null,
          },
        }),
      ),
      ['고덕동 단독주택'],
    );

    const propertyCard = getConsultationContextCards(
      item({
        propertyId: 'property-1',
        property: {
          id: 'property-1',
          memo: null,
          site: { name: '고덕동 토지' },
          unit: null,
        },
      }),
    ).find((card) => card.key === 'property');

    assert.equal(propertyCard?.title, '고덕동 토지');
  });

  it('builds linked context cards for every attached business object', () => {
    assert.deepEqual(
      getConsultationContextCards(
        item({
          contact: { id: 'contact-1', name: '한구매', phone: '01030010001' },
          propertyId: 'property-1',
          property: { id: 'property-1', memo: null, site: { name: '고덕그라시움' } },
          listingId: 'listing-1',
          listing: { id: 'listing-1', transactionType: 'sale', price: 268000, checkStatus: 'verified' },
          matchId: 'match-1',
          buyerReqId: 'buyer-1',
        }),
      ).map((card) => ({
        key: card.key,
        label: card.label,
        title: card.title,
        to: card.to,
        params: card.params,
      })),
      [
        { key: 'contact', label: '고객', title: '한구매', to: '/contacts/$id', params: { id: 'contact-1' } },
        { key: 'property', label: '매물', title: '고덕그라시움', to: '/properties/$id', params: { id: 'property-1' } },
        { key: 'listing', label: '리스팅', title: '매매 26억 8,000만', to: '/properties/$id', params: { id: 'property-1' } },
        { key: 'match', label: '매칭', title: '매칭 연결', to: '/matches', params: undefined },
        { key: 'buyerRequirement', label: '구매요건', title: '구매요건 연결', to: '/buyer-requirements', params: undefined },
      ],
    );
  });

  it('groups consultations by day and summarizes CRM memory stats', () => {
    const consultations = [
      item({ id: 'c1', createdAt: '2026-04-20T10:00:00.000Z', propertyId: 'p1', content: '재계약 여부 확인 필요.' }),
      item({ id: 'c2', createdAt: '2026-04-20T09:00:00.000Z', buyerReqId: 'b1', content: '전세 물건 추가 요청.' }),
      item({ id: 'c3', createdAt: '2026-04-19T12:00:00.000Z' }),
    ];

    assert.deepEqual(
      groupConsultationsByDay(consultations).map((group) => ({
        label: group.label,
        ids: group.items.map((consultation) => consultation.id),
      })),
      [
        { label: '2026년 4월 20일', ids: ['c1', 'c2'] },
        { label: '2026년 4월 19일', ids: ['c3'] },
      ],
    );

    assert.deepEqual(getConsultationStats(consultations), {
      total: 3,
      linked: 2,
      actionCandidates: 2,
    });
  });

  it('suggests the next operational action from the strongest signal', () => {
    assert.equal(
      getConsultationActionLabel(item({ type: 'phone', content: '세입자 만기 관련 상담. 재계약 여부 확인 필요.' })),
      '후속 통화 업무 만들기',
    );
    assert.equal(
      getConsultationActionLabel(item({ type: 'visit', content: '토요일 오후 2시 임장 일정 확정.' })),
      '캘린더 일정 확인',
    );
  });

  it('only selects a consultation after an explicit row selection', () => {
    const consultations = [item({ id: 'c1' }), item({ id: 'c2' })];

    assert.equal(getSelectedConsultation(consultations, null), null);
    assert.equal(getSelectedConsultation(consultations, 'missing'), null);
    assert.equal(getSelectedConsultation(consultations, 'c2')?.id, 'c2');
  });

  it('lets the ledger participate in the page scroll instead of trapping it in a fixed viewport', () => {
    const source = readFileSync(
      new URL('../src/routes/_authenticated/consultations/index.tsx', import.meta.url),
      'utf8',
    );

    assert.equal(source.includes('h-[calc(100vh-340px)]'), false);
    assert.equal(source.includes('flex min-h-0 flex-col gap-4'), false);
    assert.equal(source.includes('data-testid="consultation-ledger-flow"'), true);
  });

  it('starts the consultation page at filters without the summary header block', () => {
    const source = readFileSync(
      new URL('../src/routes/_authenticated/consultations/index.tsx', import.meta.url),
      'utf8',
    );

    assert.equal(source.includes('상담 타임라인'), false);
    assert.equal(source.includes('고객과 나눈 대화를 매물, 요건, 거래의 업무 맥락으로 이어 봅니다.'), false);
    assert.equal(source.includes('<MetricTile'), false);
    assert.equal(source.includes('현재 목록'), false);
    assert.equal(source.includes('맥락 연결'), false);
    assert.equal(source.includes('후속 후보'), false);
  });

  it('serializes entity filters into consultation list API params', () => {
    assert.deepEqual(
      buildConsultationApiParams({
        page: 2,
        sortOrder: 'asc',
        filters: {
          q: '계약금',
          quickFilter: 'property',
          contact: { id: 'contact-1', label: '김소유' },
          site: { id: 'site-1', label: '고덕그라시움' },
          dong: { id: 'dong-1', label: '102동' },
          unit: { id: 'unit-1', label: '302호' },
          type: 'phone',
        },
      }),
      {
        page: 2,
        limit: 20,
        sortOrder: 'asc',
        q: '계약금',
        context: 'property',
        contactId: 'contact-1',
        siteId: 'site-1',
        dongId: 'dong-1',
        unitId: 'unit-1',
        type: 'phone',
      },
    );

    assert.equal(
      buildConsultationApiParams({
        page: 1,
        sortOrder: 'desc',
        filters: { quickFilter: 'actionRequired' },
      }).outcome,
      'actionRequired',
    );
  });

  it('renders human-readable chips for selected entity filters', () => {
    assert.deepEqual(
      getConsultationFilterChips({
        q: '계약금',
        quickFilter: 'all',
        contact: { id: 'contact-1', label: '김소유' },
        site: { id: 'site-1', label: '고덕그라시움' },
        dong: { id: 'dong-1', label: '102동' },
        unit: { id: 'unit-1', label: '302호' },
      }).map((chip) => chip.label),
      ['검색 계약금', '고객 김소유', '매물 고덕그라시움 102동 302호'],
    );
  });
});

function item(overrides: Partial<ConsultationListItem> = {}): ConsultationListItem {
  return {
    id: 'consultation',
    officeId: 'office',
    contactId: 'contact',
    createdById: 'user',
    type: 'phone',
    content: '일반 상담',
    propertyId: null,
    listingId: null,
    matchId: null,
    buyerReqId: null,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z',
    contact: { id: 'contact', name: '한구매', phone: '01030010001' },
    createdBy: { id: 'user', name: '김영' },
    ...overrides,
  };
}
