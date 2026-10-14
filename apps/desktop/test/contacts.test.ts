import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('desktop contacts pages', () => {
  it('keeps the new-contact form in its owning tab and replaces it after save', () => {
    const source = readFileSync(
      resolve(testDir, '../src/renderer/routes/_authenticated/contacts/new.tsx'),
      'utf8',
    );

    assert.match(source, /useTabScopedState\('contact-new:form:v1'/);
    assert.match(source, /replaceTabResource\(ownerTabIdRef\.current/);
    assert.match(source, /tabResourceKeys\.entity\('contact', created\.id\)/);
  });
});
