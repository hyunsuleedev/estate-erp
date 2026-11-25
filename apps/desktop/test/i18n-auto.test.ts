import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createLookup, fill, passthrough } from '../src/renderer/i18n/auto-core';

const lookup = createLookup({
  _common: { strings: { 저장: 'Save', 확인: 'OK', '{0}건 선택': '{0} selected' } },
  properties: {
    strings: { 확인: 'Verify', '확인 ⟦dialog⟧': 'OK', 전체: 'All' },
    files: { 'routes/_authenticated/properties/dialog.tsx': { 확인: 'Confirm' } },
  },
  sites: { strings: { 전체: 'Everything' } },
  _server: {
    strings: { '권한이 없습니다.': "You don't have permission." },
    patterns: { '{0}은(는) {1}자 이하여야 합니다.': '{0} must be {1} characters or fewer.', '이미 {0} 중입니다': 'Already {0}' },
  },
});

describe('auto i18n lookup', () => {
  it('looks in the file, then the area, then the common dictionary, and falls back to Korean', () => {
    assert.equal(lookup.translatorFor('routes/_authenticated/properties/dialog.tsx', 'properties')('확인'), 'Confirm');
    assert.equal(lookup.translatorFor('routes/_authenticated/properties/index.tsx', 'properties')('확인'), 'Verify');
    assert.equal(lookup.translatorFor('routes/_authenticated/contacts/index.tsx', 'contacts')('확인'), 'OK');
    assert.equal(lookup.translatorFor('x.tsx', 'contacts')('사전에 없는 문구'), '사전에 없는 문구');
  });

  it('prefers the entry for the given context, and falls back to the plain entry', () => {
    const t = lookup.translatorFor('routes/_authenticated/properties/index.tsx', 'properties');
    assert.equal(t('확인', undefined, 'dialog'), 'OK');
    assert.equal(t('확인'), 'Verify');
    assert.equal(t('전체', undefined, 'dialog'), 'All');
  });

  it('fills the slots, in whatever order the translation puts them', () => {
    assert.equal(lookup.translatorFor('x.tsx', 'contacts')('{0}건 선택', [3]), '3 selected');
    assert.equal(fill('{1} of {0}', ['a', 'b']), 'b of a');
    // 한국어일 때: 받은 글에 값을 끼운 것이 원래 템플릿 문자열과 같다
    assert.equal(passthrough('{0}평 ({1}㎡)', [30, 99.17]), `${30}평 (${99.17}㎡)`);
    assert.equal(passthrough('{0}', [null]), `${null}`);
  });

  it('treats a value as the same as a Korean word when it is that word or any of its translations', () => {
    assert.equal(lookup.same('전체', '전체'), true);
    assert.equal(lookup.same('All', '전체'), true);
    // 영역마다 다르게 옮겨져 있어도 같다고 본다
    assert.equal(lookup.same('Everything', '전체'), true);
    assert.equal(lookup.same('Confirm', '확인'), true);
    assert.equal(lookup.same('Save', '전체'), false);
    assert.equal(lookup.same(undefined, '전체'), false);
  });

  it('translates a server message, pulling the values out of a message with slots', () => {
    assert.equal(lookup.serverMessage('권한이 없습니다.'), "You don't have permission.");
    assert.equal(lookup.serverMessage('이름은(는) 20자 이하여야 합니다.'), '이름 must be 20 characters or fewer.');
    assert.equal(lookup.serverMessage('이미 정산 중입니다'), 'Already 정산');
    assert.equal(lookup.serverMessage('사전에 없는 서버 문구'), '사전에 없는 서버 문구');
  });
});
