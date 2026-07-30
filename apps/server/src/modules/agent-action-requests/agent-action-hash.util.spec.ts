import { canonicalizeJson, hashCanonicalJson } from './agent-action-hash.util';

describe('agent action canonical JSON', () => {
  it('produces the same digest regardless of object key insertion order', () => {
    const left = {
      capability: 'advertisement.terms.set',
      payload: { advertisedPrice: 158000, advertisedDeposit: null },
    };
    const right = {
      payload: { advertisedDeposit: null, advertisedPrice: 158000 },
      capability: 'advertisement.terms.set',
    };

    expect(canonicalizeJson(left)).toBe(canonicalizeJson(right));
    expect(hashCanonicalJson(left)).toBe(hashCanonicalJson(right));
    expect(hashCanonicalJson(left)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('keeps array order as part of the reviewed content', () => {
    expect(hashCanonicalJson(['before', 'after'])).not.toBe(
      hashCanonicalJson(['after', 'before']),
    );
  });

  it('rejects non-finite JSON numbers', () => {
    expect(() => canonicalizeJson({ price: Number.NaN })).toThrow(
      'JSON numbers must be finite',
    );
  });
});
