import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const CP_CREDENTIAL_PROVIDERS = [
  'esiljang',
  'budongsanbank',
] as const;

export type CpCredentialProvider =
  (typeof CP_CREDENTIAL_PROVIDERS)[number];

export interface CpCredentialInput {
  officeId: string;
  provider: CpCredentialProvider;
  username: string;
  password: string;
}

export interface StoredCpCredential extends CpCredentialInput {
  savedAt: string;
}

export interface CpCredentialStatus {
  provider: CpCredentialProvider;
  hasCredentials: boolean;
  maskedUsername: string | null;
  updatedAt: string | null;
  lastVerifiedAt: string | null;
}

export interface CpCredentialVaultStatus {
  available: boolean;
  deviceId: string;
  encryptionBackend: string;
  providers: CpCredentialStatus[];
}

export interface CpCredentialCipher {
  isAvailable(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
  backend(): string;
}

interface VaultEntry {
  provider: CpCredentialProvider;
  ciphertext: string;
  updatedAt: string;
  lastVerifiedAt: string | null;
}

interface VaultDocument {
  version: 1;
  deviceId: string;
  entries: Record<string, VaultEntry>;
}

const VAULT_DIRECTORY = 'credentials';
const VAULT_FILENAME = 'cp-credentials.v1.json';

export class CpCredentialVault {
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly userDataPath: string,
    private readonly cipher: CpCredentialCipher,
  ) {}

  async getStatus(officeId: string): Promise<CpCredentialVaultStatus> {
    await this.mutationQueue;
    const document = await this.readOrCreateDocument();
    const providers = await Promise.all(
      CP_CREDENTIAL_PROVIDERS.map(async (provider) => {
        const entry = document.entries[this.entryKey(officeId, provider)];
        if (!entry) {
          return {
            provider,
            hasCredentials: false,
            maskedUsername: null,
            updatedAt: null,
            lastVerifiedAt: null,
          } satisfies CpCredentialStatus;
        }

        try {
          const credentials = this.decryptEntry(entry);
          return {
            provider,
            hasCredentials: true,
            maskedUsername: maskUsername(credentials.username),
            updatedAt: entry.updatedAt,
            lastVerifiedAt: entry.lastVerifiedAt,
          } satisfies CpCredentialStatus;
        } catch {
          return {
            provider,
            hasCredentials: false,
            maskedUsername: null,
            updatedAt: entry.updatedAt,
            lastVerifiedAt: entry.lastVerifiedAt,
          } satisfies CpCredentialStatus;
        }
      }),
    );

    return {
      available: this.cipher.isAvailable(),
      deviceId: document.deviceId,
      encryptionBackend: this.cipher.backend(),
      providers,
    };
  }

  async save(input: CpCredentialInput): Promise<CpCredentialVaultStatus> {
    this.assertAvailable();
    const normalized = normalizeCredentialInput(input);
    await this.mutate(async (document) => {
      const now = new Date().toISOString();
      const stored: StoredCpCredential = {
        ...normalized,
        savedAt: now,
      };
      document.entries[this.entryKey(normalized.officeId, normalized.provider)] = {
        provider: normalized.provider,
        ciphertext: this.cipher
          .encrypt(JSON.stringify(stored))
          .toString('base64'),
        updatedAt: now,
        lastVerifiedAt: null,
      };
    });
    return this.getStatus(normalized.officeId);
  }

  async load(
    officeId: string,
    provider: CpCredentialProvider,
  ): Promise<StoredCpCredential | null> {
    this.assertAvailable();
    await this.mutationQueue;
    const document = await this.readOrCreateDocument();
    const entry = document.entries[this.entryKey(officeId, provider)];
    return entry ? this.decryptEntry(entry) : null;
  }

  async remove(
    officeId: string,
    provider: CpCredentialProvider,
  ): Promise<CpCredentialVaultStatus> {
    await this.mutate(async (document) => {
      delete document.entries[this.entryKey(officeId, provider)];
    });
    return this.getStatus(officeId);
  }

  async markVerified(
    officeId: string,
    provider: CpCredentialProvider,
  ): Promise<void> {
    await this.mutate(async (document) => {
      const entry = document.entries[this.entryKey(officeId, provider)];
      if (entry) entry.lastVerifiedAt = new Date().toISOString();
    });
  }

  async getDeviceId(): Promise<string> {
    await this.mutationQueue;
    return (await this.readOrCreateDocument()).deviceId;
  }

  private decryptEntry(entry: VaultEntry): StoredCpCredential {
    const plaintext = this.cipher.decrypt(
      Buffer.from(entry.ciphertext, 'base64'),
    );
    const parsed = JSON.parse(plaintext) as Partial<StoredCpCredential>;
    return normalizeStoredCredential(parsed, entry.provider);
  }

  private async mutate(
    operation: (document: VaultDocument) => Promise<void>,
  ): Promise<void> {
    const next = this.mutationQueue.then(async () => {
      const document = await this.readOrCreateDocument();
      await operation(document);
      await this.writeDocument(document);
    });
    this.mutationQueue = next.catch(() => undefined);
    return next;
  }

  private async readOrCreateDocument(): Promise<VaultDocument> {
    try {
      const raw = await readFile(this.vaultPath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<VaultDocument>;
      if (
        parsed.version !== 1 ||
        typeof parsed.deviceId !== 'string' ||
        !parsed.deviceId ||
        !parsed.entries ||
        typeof parsed.entries !== 'object'
      ) {
        throw new Error('Unsupported CP credential vault format');
      }
      return parsed as VaultDocument;
    } catch (error) {
      if (!isFileNotFoundError(error)) throw error;
      const document: VaultDocument = {
        version: 1,
        deviceId: randomUUID(),
        entries: {},
      };
      await this.writeDocument(document);
      return document;
    }
  }

  private async writeDocument(document: VaultDocument): Promise<void> {
    const directory = path.dirname(this.vaultPath());
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = `${this.vaultPath()}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(document), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.vaultPath());
  }

  private vaultPath(): string {
    return path.join(
      this.userDataPath,
      VAULT_DIRECTORY,
      VAULT_FILENAME,
    );
  }

  private entryKey(
    officeId: string,
    provider: CpCredentialProvider,
  ): string {
    return `${officeId}:${provider}`;
  }

  private assertAvailable(): void {
    if (!this.cipher.isAvailable()) {
      throw new Error(
        '운영체제 보안 저장소를 사용할 수 없어 CP 계정을 저장할 수 없습니다.',
      );
    }
  }
}

function normalizeCredentialInput(input: CpCredentialInput): CpCredentialInput {
  const officeId = input.officeId.trim();
  const username = input.username.trim();
  const password = input.password;
  if (!officeId || officeId.length > 128) {
    throw new Error('사무소 정보를 확인할 수 없습니다.');
  }
  if (!CP_CREDENTIAL_PROVIDERS.includes(input.provider)) {
    throw new Error('지원하지 않는 CP사입니다.');
  }
  if (!username || username.length > 256) {
    throw new Error('CP 아이디를 확인해 주세요.');
  }
  if (!password || password.length > 1024) {
    throw new Error('CP 비밀번호를 확인해 주세요.');
  }
  return {
    officeId,
    provider: input.provider,
    username,
    password,
  };
}

function normalizeStoredCredential(
  input: Partial<StoredCpCredential>,
  provider: CpCredentialProvider,
): StoredCpCredential {
  if (
    typeof input.officeId !== 'string' ||
    input.provider !== provider ||
    typeof input.username !== 'string' ||
    typeof input.password !== 'string' ||
    typeof input.savedAt !== 'string'
  ) {
    throw new Error('저장된 CP 계정 형식이 올바르지 않습니다.');
  }
  return {
    officeId: input.officeId,
    provider,
    username: input.username,
    password: input.password,
    savedAt: input.savedAt,
  };
}

function isFileNotFoundError(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

export function maskUsername(username: string): string {
  const [local, domain] = username.split('@');
  const visible =
    local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  const masked = `${visible}${'•'.repeat(Math.max(3, local.length - visible.length))}`;
  return domain ? `${masked}@${domain}` : masked;
}
