import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AgentActionRequest } from '@estate-erp/api-client';

import {
  canUserDecideAgentAction,
  getAgentActionDiff,
  getAgentActionFloorExposure,
  getAgentActionInboxView,
  getAgentActionNaverRanking,
  getAgentActionStatusMeta,
  requestMatchesAgentActionSearch,
} from '../src/renderer/routes/_authenticated/ai-requests/-agent-action-view';

function request(
  overrides: Partial<AgentActionRequest> = {},
): AgentActionRequest {
  return {
    id: 'request-1',
    officeId: 'office-1',
    reviewerId: 'reviewer-1',
    escalationTaskId: null,
    listingAdvertisementId: 'advertisement-1',
    supersedesId: null,
    capability: 'advertisement.terms.set',
    schemaVersion: 1,
    sourceSkillKey: 'naver-real-estate-reader',
    sourceSkillVersion: '1.0.0',
    executorSkillKey: 'esiljang-ad-manager',
    executorSkillVersion: 'computer-use-v1',
    title: '네이버 광고 가격 조건 변경 · 고덕그라시움',
    summary: '15억 → 15억 8,000만',
    rationale: '집주인이 새 매매가를 확인했습니다.',
    riskLevel: 'high',
    executionMode: 'manual',
    payload: {
      advertisedPrice: 158000,
      advertisedDeposit: null,
      advertisedMonthlyRent: null,
      articleNo: '2412345678',
    },
    preconditions: {},
    evidence: [
      {
        kind: 'listing_advertisement_state',
        state: {
          isActive: true,
          price: 150000,
          deposit: null,
          monthlyRent: null,
        },
      },
      {
        kind: 'office_advertisement_comparison',
        location: {
          site: '고덕그라시움',
          dong: '102동',
          ho: '1203호',
          type: '84A',
        },
        state: {
          mainAdvertisement: {
            articleNo: '2412345678',
            sourceUrl: 'https://land.naver.com/article/2412345678',
            ranking: 4,
            sameAddrCnt: 7,
            floorInfo: '중/25',
            floorExposureMode: 'band',
          },
        },
      },
    ],
    baseStateHash: 'b'.repeat(64),
    contentHash: 'a'.repeat(64),
    reviewStatus: 'pending',
    executionStatus: 'not_started',
    verificationStatus: 'pending',
    version: 1,
    dedupeKey: 'dedupe-1',
    observedAt: '2026-07-28T09:00:00.000Z',
    expiresAt: '2026-07-28T11:00:00.000Z',
    createdBy: 'mcp:user-1',
    createdByUserId: 'user-1',
    approvedContentHash: null,
    decidedById: null,
    decidedAt: null,
    decisionNote: null,
    executedById: null,
    executedAt: null,
    executionResult: null,
    verifiedAt: null,
    lastError: null,
    createdAt: '2026-07-28T09:00:00.000Z',
    updatedAt: '2026-07-28T09:00:00.000Z',
    reviewer: {
      id: 'reviewer-1',
      name: '김중개',
      role: 'agent',
    },
    ...overrides,
  };
}

describe('AI request inbox view model', () => {
  it('keeps review, execution, exception, and archive lanes separate', () => {
    assert.equal(getAgentActionInboxView(request()), 'review');
    assert.equal(
      getAgentActionInboxView(
        request({
          reviewStatus: 'approved',
          executionStatus: 'awaiting_manual',
        }),
      ),
      'ready',
    );
    assert.equal(
      getAgentActionInboxView(
        request({
          reviewStatus: 'approved',
          executionStatus: 'needs_input',
          verificationStatus: 'blocked',
          escalationTaskId: 'task-1',
        }),
      ),
      'attention',
    );
    assert.equal(
      getAgentActionInboxView(
        request({
          reviewStatus: 'rejected',
          executionStatus: 'cancelled',
          verificationStatus: 'not_required',
        }),
      ),
      'archive',
    );
  });

  it('builds the exact before/after terms from ListingAdvertisement evidence', () => {
    assert.deepEqual(getAgentActionDiff(request()), [
      {
        key: 'price',
        label: '매매가',
        kind: 'money',
        before: 150000,
        after: 158000,
        changed: true,
      },
      {
        key: 'deposit',
        label: '보증금',
        kind: 'money',
        before: null,
        after: null,
        changed: false,
      },
      {
        key: 'monthlyRent',
        label: '월세',
        kind: 'money',
        before: null,
        after: null,
        changed: false,
      },
    ]);
  });

  it('labels expired evidence and prevents an unrelated employee decision', () => {
    const pending = request();
    assert.deepEqual(
      getAgentActionStatusMeta(pending, new Date('2026-07-28T12:00:00.000Z')),
      { label: '근거 만료', tone: 'warning' },
    );
    assert.equal(
      canUserDecideAgentAction(pending, {
        id: 'other-agent',
        role: 'agent',
      }),
      false,
    );
    assert.equal(
      canUserDecideAgentAction(pending, {
        id: 'manager-1',
        role: 'manager',
      }),
      true,
    );
  });

  it('searches Korean location, article number, and reviewer tokens', () => {
    const item = request();
    assert.equal(requestMatchesAgentActionSearch(item, '고덕 1203'), true);
    assert.equal(
      requestMatchesAgentActionSearch(item, '2412345678 김중개'),
      true,
    );
    assert.equal(requestMatchesAgentActionSearch(item, '잠실'), false);
  });

  it('keeps Naver ranking and floor exposure in the approval evidence', () => {
    const item = request();
    assert.equal(getAgentActionNaverRanking(item), '4/7위');
    assert.equal(getAgentActionFloorExposure(item), '중/25 · 구간 노출');
  });
});
