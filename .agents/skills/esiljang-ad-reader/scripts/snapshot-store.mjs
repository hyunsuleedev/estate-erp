import { createHash, randomBytes } from 'node:crypto';
import {
  chmod,
  link,
  mkdir,
  open,
  readFile,
  unlink,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_SNAPSHOT_DIRECTORY = path.join(
  os.homedir(),
  '.agents',
  'data',
  'esiljang-ad-reader',
  'snapshots',
);

function observedAtToken(observedAt) {
  const parsed = new Date(observedAt);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('snapshot observedAt must be a valid ISO timestamp');
  }
  return parsed.toISOString().replaceAll(':', '-');
}

function assertSuccessfulSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('snapshot must be an object');
  }
  if (snapshot.status !== 'succeeded') {
    throw new Error('only a succeeded snapshot can be persisted');
  }
  if (snapshot.provider !== 'esiljang') {
    throw new Error('snapshot provider must be esiljang');
  }
  if (snapshot.scope !== 'active_advertisements') {
    throw new Error('snapshot scope must be active_advertisements');
  }
  if (!/^[a-f0-9]{64}$/.test(snapshot.manifestHash ?? '')) {
    throw new Error('snapshot manifestHash must be a SHA-256 value');
  }
  if (!Array.isArray(snapshot.items)) {
    throw new Error('snapshot items must be an array');
  }
  if (snapshot.collectedTotal !== snapshot.items.length) {
    throw new Error('snapshot collectedTotal must equal items.length');
  }
}

export function serializeSnapshot(snapshot) {
  assertSuccessfulSnapshot(snapshot);
  return `${JSON.stringify(snapshot, null, 2)}\n`;
}

export async function persistSnapshotJson(
  snapshot,
  { directory = DEFAULT_SNAPSHOT_DIRECTORY } = {},
) {
  const payload = serializeSnapshot(snapshot);
  const fileSha256 = createHash('sha256').update(payload).digest('hex');
  const fileName =
    `${observedAtToken(snapshot.observedAt)}--${snapshot.manifestHash}.json`;
  const snapshotPath = path.join(directory, fileName);
  const temporaryPath = path.join(
    directory,
    `.${fileName}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`,
  );

  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);

  let handle = null;
  let reused = false;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(payload, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;

    try {
      await link(temporaryPath, snapshotPath);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      reused = true;
    }
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
  }

  const storedPayload = await readFile(snapshotPath, 'utf8');
  if (storedPayload !== payload) {
    throw new Error('stored snapshot differs from the validated snapshot');
  }
  await chmod(snapshotPath, 0o600);

  return {
    path: snapshotPath,
    fileName,
    sha256: fileSha256,
    bytes: Buffer.byteLength(payload, 'utf8'),
    reused,
  };
}
