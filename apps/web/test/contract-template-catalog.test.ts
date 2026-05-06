import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import catalogModule from '../../../prisma/contract-template-catalog';

const { CONTRACT_TEMPLATE_BODY_SEEDS, MYSPIDER_REFERENCED_TEMPLATE_CODES } =
  catalogModule as typeof import('../../../prisma/contract-template-catalog');

describe('contract template catalog', () => {
  it('provides safe test body text for every MySpider-referenced document template', () => {
    const seededCodes = new Set(CONTRACT_TEMPLATE_BODY_SEEDS.map((seed) => seed.code));

    for (const code of MYSPIDER_REFERENCED_TEMPLATE_CODES) {
      assert.ok(seededCodes.has(code), `${code} should have template body seed`);
    }
  });

  it('marks imported bodies as non-verbatim test content', () => {
    for (const seed of CONTRACT_TEMPLATE_BODY_SEEDS) {
      assert.equal(seed.copiedVerbatimFromMySpider, false);
      assert.ok(seed.fields.bodyText.length > 0, `${seed.code} should have body text`);
      assert.ok(seed.fields.sourceNotice.length > 0, `${seed.code} should have source notice`);
    }
  });
});
