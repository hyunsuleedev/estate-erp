import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildOutput, hashCanonicalJson } from "./snapshot-items.mjs";

function makeSnapshot() {
  const observedAt = "2026-08-04T14:48:01.956Z";
  const items = [
    {
      provider: "esiljang",
      externalAdId: "64850265",
      fullAddress: "교문동 미래유탑유블레스시티 1동 2810호",
      observedAt,
      sourcePage: 1,
    },
  ];
  const snapshot = {
    status: "succeeded",
    provider: "esiljang",
    scope: "active_advertisements",
    activeFilter: { dataValue: "ad", selected: true, count: 1 },
    observedAt,
    expectedTotal: 1,
    collectedTotal: 1,
    pageCount: 1,
    visitedPages: [1],
    paginationComplete: true,
    items,
    warnings: [],
  };
  snapshot.manifestHash = hashCanonicalJson({
    provider: snapshot.provider,
    scope: snapshot.scope,
    activeFilter: snapshot.activeFilter,
    observedAt: snapshot.observedAt,
    expectedTotal: snapshot.expectedTotal,
    paginationComplete: snapshot.paginationComplete,
    visitedPages: snapshot.visitedPages,
    items,
  });
  return snapshot;
}

test("builds begin metadata and one raw item without changing it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cp-snapshot-test-"));
  const file = join(directory, "snapshot.json");
  const snapshot = makeSnapshot();
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`, {
    mode: 0o600,
  });

  try {
    const begin = await buildOutput(file, "begin");
    assert.equal(begin.channel, "esiljang");
    assert.equal(begin.manifestHash, snapshot.manifestHash);
    assert.match(begin.fileSha256, /^[0-9a-f]{64}$/);

    const item = await buildOutput(file, "item", [
      "--session-id",
      "session-1",
      "--index",
      "0",
    ]);
    assert.deepEqual(item, {
      sessionId: "session-1",
      raw: snapshot.items[0],
    });

    const sameItem = await buildOutput(file, "item", [
      "--session-id",
      "session-1",
      "--external-ad-id",
      "64850265",
    ]);
    assert.deepEqual(sameItem, item);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a partial or tampered snapshot before producing MCP input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "cp-snapshot-test-"));
  const file = join(directory, "snapshot.json");
  const snapshot = makeSnapshot();
  snapshot.items[0].fullAddress = "tampered";
  await writeFile(file, JSON.stringify(snapshot), { mode: 0o600 });

  try {
    await assert.rejects(
      buildOutput(file, "begin"),
      /manifestHash does not match/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
