import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MATCH_STAGE_ORDER } from '@estate-erp/shared';
import { STATUS_CONFIG } from '../src/renderer/lib/status-config';
import { matchStageLabels } from '../src/renderer/routes/_authenticated/consultations/-consultation-view-utils';

const read = (path: string) =>
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), path), 'utf8');

// 단계 이름을 손으로 적어 둔 곳이 여럿이다. 단계를 더하면서 한 곳을 빠뜨리면
// 그 화면에서만 "buyerReviewing" 같은 값이 그대로 보인다.
describe('match stage labels', () => {
  it('names every stage in the shared status config', () => {
    for (const stage of MATCH_STAGE_ORDER) {
      assert.ok(STATUS_CONFIG.matchStage[stage]?.label, `${stage} has no label`);
    }
  });

  it('names every stage on the consultation screens', () => {
    for (const stage of MATCH_STAGE_ORDER) {
      assert.equal(matchStageLabels[stage], STATUS_CONFIG.matchStage[stage].label, stage);
    }
  });

  it('names every stage the call analysis can suggest', () => {
    const payloadSource = read('../../server/src/modules/call-intelligence/call-suggestion.payload.ts');
    const formatSource = read('../src/renderer/routes/_authenticated/calls/-call-suggestion-format.ts');
    const list = payloadSource.slice(
      payloadSource.indexOf('SUGGESTIBLE_MATCH_STAGES = ['),
      payloadSource.indexOf('] as const;', payloadSource.indexOf('SUGGESTIBLE_MATCH_STAGES = [')),
    );
    const names = [...list.matchAll(/MatchStage\.([A-Z_]+)/g)].map((m) => m[1]);
    assert.ok(names.includes('BUYER_REVIEWING'));
    const labels = formatSource.slice(formatSource.indexOf('const MATCH_STAGE_LABEL'));
    for (const name of names) {
      const value = name.toLowerCase().replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
      assert.match(labels, new RegExp(`\\b${value}: '`), `${value} has no label in call suggestions`);
    }
  });

  it('describes every stage to the call analysis model', () => {
    const contextSource = read('../../server/src/modules/call-intelligence/analysis/call-context.ts');
    const promptSource = read('../../server/src/modules/call-intelligence/analysis/call-analysis.prompt.ts');
    const text = contextSource.slice(contextSource.indexOf('MATCH_STAGE_TEXT'));
    for (const stage of MATCH_STAGE_ORDER) {
      assert.match(text, new RegExp(`\\b${stage}: '`), `${stage} missing from MATCH_STAGE_TEXT`);
    }
    assert.match(promptSource, /viewing\|buyerReviewing\|negotiating/);
  });
});
