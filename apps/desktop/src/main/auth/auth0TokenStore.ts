import { promises as fs } from 'node:fs';
import path from 'node:path';
import { app, safeStorage } from 'electron';
import type { Auth0TokenStore, StoredAuth0Session } from './auth0DesktopSession';
import { canPersistWithSafeStorage } from './tokenStorePolicy';

const SESSION_FILE_NAME = 'auth0-session.bin';

function isStoredSession(value: unknown): value is StoredAuth0Session {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.domain === 'string' &&
    typeof candidate.clientId === 'string' &&
    typeof candidate.refreshToken === 'string'
  );
}

/**
 * refresh token을 OS 키체인 키로 암호화해 사용자 데이터 폴더에 둔다
 * (macOS Keychain, Windows DPAPI, Linux libsecret).
 *
 * 암호화를 쓸 수 없는 환경이면 디스크에 남기지 않는다. 그때는 앱을 다시 켤 때마다
 * 로그인해야 하지만, 평문 토큰이 파일로 남는 것보다 낫다. Linux에 비밀 저장소가 없어
 * 암호화가 흉내뿐인 경우(`basic_text`)도 같다.
 */
export class SafeStorageAuth0TokenStore implements Auth0TokenStore {
  private readonly filePath = path.join(app.getPath('userData'), SESSION_FILE_NAME);

  private isWeakLinuxBackend(): boolean {
    return (
      process.platform === 'linux' &&
      safeStorage.getSelectedStorageBackend() === 'basic_text'
    );
  }

  private canPersist(): boolean {
    return canPersistWithSafeStorage({
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      platform: process.platform,
      backend:
        process.platform === 'linux'
          ? safeStorage.getSelectedStorageBackend()
          : null,
    });
  }

  async load(): Promise<StoredAuth0Session | null> {
    if (this.isWeakLinuxBackend()) {
      // 예전에 흉내뿐인 암호화로 남긴 파일이 있으면 지운다.
      await fs.rm(this.filePath, { force: true }).catch(() => undefined);
      return null;
    }
    if (!safeStorage.isEncryptionAvailable()) return null;
    let encrypted: Buffer;
    try {
      encrypted = await fs.readFile(this.filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const parsed: unknown = JSON.parse(safeStorage.decryptString(encrypted));
    return isStoredSession(parsed) ? parsed : null;
  }

  async save(session: StoredAuth0Session): Promise<void> {
    if (!this.canPersist()) {
      console.warn('[auth0] OS encryption is unavailable; session is kept in memory only');
      // 예전 토큰이 파일에 남아 있으면 다음 실행이 교체된 토큰으로 갱신하게 된다.
      await fs.rm(this.filePath, { force: true }).catch(() => undefined);
      return;
    }
    const encrypted = safeStorage.encryptString(JSON.stringify(session));
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, encrypted, { mode: 0o600 });
    await fs.rename(temporaryPath, this.filePath);
  }

  async clear(): Promise<void> {
    await fs.rm(this.filePath, { force: true });
  }
}
