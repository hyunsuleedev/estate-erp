import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const detailPath = resolve(
  testDir,
  '../src/renderer/routes/_authenticated/properties/$id.tsx',
);
const quickActionsPath = resolve(
  testDir,
  '../src/renderer/routes/_authenticated/properties/-detail/actions/QuickActionsPanel.tsx',
);
const detailHeaderPath = resolve(
  testDir,
  '../src/renderer/routes/_authenticated/properties/-detail/PropertyDetailHeader.tsx',
);
const listingDialogPath = resolve(
  testDir,
  '../src/renderer/routes/_authenticated/properties/-property-detail-dialogs.tsx',
);

const detailSource = readFileSync(detailPath, 'utf8');
const detailHeaderSource = readFileSync(detailHeaderPath, 'utf8');
const quickActionsSource = readFileSync(quickActionsPath, 'utf8');
const listingDialogSource = readFileSync(listingDialogPath, 'utf8');

describe('desktop property detail page', () => {
  it('uses one continuous information flow instead of tabs', () => {
    assert.match(detailSource, /data-property-detail-page/);
    assert.match(detailSource, /<PropertyDetailHeader/);
    assert.match(detailSource, /<ListingsSection/);
    assert.match(detailSource, /<PeopleConsultationsSection/);
    assert.match(detailSource, /<ActiveMatchesSection/);
    assert.match(detailSource, /<DealProgressSection/);
    assert.match(detailSource, /<ActivityTimelineSection/);

    assert.doesNotMatch(detailSource, /\bTabs(?:List|Trigger|Content)?\b/);
    assert.doesNotMatch(detailSource, /setTab\(/);
  });

  it('removes unsupported photo and public-document features from the detail route', () => {
    for (const unsupported of [
      'PropertyPhoto',
      'PublicDocument',
      'PhotosTab',
      'PublicDocumentsTab',
      'propertyPhotos',
      'publicDocuments',
      '사진',
      '공적장부',
    ]) {
      assert.doesNotMatch(detailSource, new RegExp(unsupported));
    }
  });

  it('keeps only supported, actionable commands in the right rail', () => {
    assert.match(quickActionsSource, /소유주에게 전화/);
    assert.match(quickActionsSource, /상담 기록 추가/);
    assert.match(quickActionsSource, /매칭 생성/);
    assert.match(quickActionsSource, /거래 생성/);
    assert.match(quickActionsSource, /가격·조건 수정/);
    assert.doesNotMatch(quickActionsSource, /공동중개망 공유/);
  });

  it('does not render a redundant back-to-list link in desktop detail tabs', () => {
    assert.doesNotMatch(detailHeaderSource, /to="\/properties"/);
    assert.doesNotMatch(detailHeaderSource, /ArrowLeft/);
    assert.doesNotMatch(detailHeaderSource, />\s*매물관리\s*</);
  });

  it('does not edit the removed listing checkStatus field', () => {
    assert.doesNotMatch(listingDialogSource, /checkStatus/);
    assert.doesNotMatch(listingDialogSource, /확인 상태/);
  });
});
