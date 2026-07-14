import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ChannelDedup } from './dedup.js';

test('처음 보는 채널키는 통과', () => {
  const dedup = new ChannelDedup(30_000);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 1_000), true);
});

test('TTL 내 같은 채널키는 억제 (레거시 sKTPreChannel 대응)', () => {
  const dedup = new ChannelDedup(30_000);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 1_000), true);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 2_000), false);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 29_000), false);
});

test('TTL 경과 후 같은 채널키는 다시 통과 (재발신 케이스)', () => {
  const dedup = new ChannelDedup(30_000);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 1_000), true);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 31_001), true);
});

test('다른 채널키는 서로 영향 없음', () => {
  const dedup = new ChannelDedup(30_000);
  assert.equal(dedup.shouldProcess('41:0101234|0001', 1_000), true);
  assert.equal(dedup.shouldProcess('41:0101234|0002', 1_000), true);
  assert.equal(dedup.shouldProcess('20:0105678:202607141200', 1_000), true);
});

test('만료된 키는 정리되어 메모리가 누적되지 않음', () => {
  const dedup = new ChannelDedup(1_000);
  for (let i = 0; i < 100; i++) {
    dedup.shouldProcess(`key-${i}`, i);
  }
  // 전부 만료된 시점 이후 새 키 처리 시 prune 동작
  assert.equal(dedup.shouldProcess('fresh', 10_000), true);
  assert.equal((dedup as unknown as { seen: Map<string, number> }).seen.size, 1);
});
