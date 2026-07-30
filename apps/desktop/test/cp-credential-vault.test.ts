import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  CpCredentialVault,
  maskUsername,
  type CpCredentialCipher,
} from '../src/main/cpCredentialVault';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('CpCredentialVault', () => {
  it('stores CP passwords only as encrypted local payloads and returns masked status', async () => {
    const directory = await createTemporaryDirectory();
    const vault = new CpCredentialVault(directory, testCipher());

    const saved = await vault.save({
      officeId: 'office-1',
      provider: 'esiljang',
      username: 'broker@example.com',
      password: 'local-password-123!',
    });

    assert.equal(saved.available, true);
    assert.equal(saved.encryptionBackend, 'test-keychain');
    assert.match(saved.deviceId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(
      saved.providers.find((item) => item.provider === 'esiljang'),
      {
        provider: 'esiljang',
        hasCredentials: true,
        maskedUsername: 'br••••@example.com',
        updatedAt: saved.providers[0]?.updatedAt,
        lastVerifiedAt: null,
      },
    );
    const vaultFile = await readFile(
      path.join(directory, 'credentials', 'cp-credentials.v1.json'),
      'utf8',
    );
    assert.doesNotMatch(vaultFile, /local-password-123!/);
    assert.doesNotMatch(vaultFile, /broker@example\\.com/);

    const loaded = await vault.load('office-1', 'esiljang');
    assert.equal(loaded?.username, 'broker@example.com');
    assert.equal(loaded?.password, 'local-password-123!');
  });

  it('keeps a stable local runner device id and removes one provider independently', async () => {
    const directory = await createTemporaryDirectory();
    const vault = new CpCredentialVault(directory, testCipher());
    await vault.save({
      officeId: 'office-1',
      provider: 'esiljang',
      username: 'estate-a',
      password: 'password-a',
    });
    await vault.save({
      officeId: 'office-1',
      provider: 'budongsanbank',
      username: 'estate-b',
      password: 'password-b',
    });
    const firstDeviceId = await vault.getDeviceId();

    const reopenedVault = new CpCredentialVault(directory, testCipher());
    assert.equal(await reopenedVault.getDeviceId(), firstDeviceId);
    await reopenedVault.markVerified('office-1', 'budongsanbank');
    const afterRemoval = await reopenedVault.remove('office-1', 'esiljang');

    assert.equal(
      afterRemoval.providers.find((item) => item.provider === 'esiljang')
        ?.hasCredentials,
      false,
    );
    assert.ok(
      afterRemoval.providers.find(
        (item) => item.provider === 'budongsanbank',
      )?.lastVerifiedAt,
    );
    assert.equal(
      (await reopenedVault.load('office-1', 'budongsanbank'))?.password,
      'password-b',
    );
  });

  it('refuses to save when the operating-system encryption backend is unavailable', async () => {
    const directory = await createTemporaryDirectory();
    const cipher = testCipher();
    cipher.isAvailable = () => false;
    const vault = new CpCredentialVault(directory, cipher);

    await assert.rejects(
      vault.save({
        officeId: 'office-1',
        provider: 'esiljang',
        username: 'broker',
        password: 'password',
      }),
      /운영체제 보안 저장소/,
    );
  });

  it('does not overwrite a malformed vault document', async () => {
    const rootDirectory = await createTemporaryDirectory();
    const vault = new CpCredentialVault(rootDirectory, testCipher());
    await vault.save({
      officeId: 'office-corrupt',
      provider: 'esiljang',
      username: 'estate-agent',
      password: 'local-only-password',
    });
    const vaultPath = path.join(
      rootDirectory,
      'credentials',
      'cp-credentials.v1.json',
    );
    await writeFile(vaultPath, '{not-valid-json', 'utf8');

    await assert.rejects(
      () => vault.getStatus('office-corrupt'),
      /JSON/,
    );
    assert.equal(await readFile(vaultPath, 'utf8'), '{not-valid-json');
  });

  it('masks usernames without returning the stored value verbatim', () => {
    assert.equal(maskUsername('hyunsu'), 'hy••••');
    assert.equal(maskUsername('a@example.com'), 'a•••@example.com');
  });
});

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), 'estate-erp-cp-vault-'),
  );
  temporaryDirectories.push(directory);
  return directory;
}

function testCipher(): CpCredentialCipher {
  return {
    isAvailable: () => true,
    encrypt: (value) =>
      Buffer.from(
        Buffer.from(value, 'utf8').toString('base64').split('').reverse().join(''),
        'utf8',
      ),
    decrypt: (value) =>
      Buffer.from(
        value.toString('utf8').split('').reverse().join(''),
        'base64',
      ).toString('utf8'),
    backend: () => 'test-keychain',
  };
}
