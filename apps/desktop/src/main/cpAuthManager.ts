import {
  BrowserWindow,
  ipcMain,
  session,
  type IpcMainInvokeEvent,
} from 'electron';
import {
  CP_CREDENTIAL_PROVIDERS,
  CpCredentialVault,
  type CpCredentialInput,
  type CpCredentialProvider,
  type CpCredentialVaultStatus,
} from './cpCredentialVault';

export interface CpAuthPrepareInput {
  officeId: string;
  provider: CpCredentialProvider;
}

export interface CpAuthPrepareResult {
  provider: CpCredentialProvider;
  deviceId: string;
  status: 'authenticated' | 'credentials_missing' | 'needs_input' | 'error';
  targetUrl: string | null;
  windowId: number | null;
  message: string;
}

interface CpProviderConfig {
  label: string;
  loginUrl: string;
  advertisementListUrl: string;
  allowedHostSuffixes: string[];
  usernameSelectors: string[];
  passwordSelectors: string[];
  submitSelectors: string[];
  isLoginUrl(url: URL): boolean;
}

const CP_PROVIDER_CONFIGS: Record<CpCredentialProvider, CpProviderConfig> = {
  esiljang: {
    label: '이실장',
    loginUrl:
      'https://www.aipartner.com/integrated/login?serviceCode=1000',
    advertisementListUrl: 'https://www.aipartner.com/offerings/ad_list',
    allowedHostSuffixes: ['aipartner.com'],
    usernameSelectors: ['#member-id'],
    passwordSelectors: ['#member-pw', 'input[type="password"]'],
    submitSelectors: ['.btn-login', 'button[type="submit"]'],
    isLoginUrl: (url) => url.pathname.includes('/integrated/login'),
  },
  budongsanbank: {
    label: '부동산뱅크',
    loginUrl:
      'https://www.neonet.co.kr/novo-rebank/view/member/MemberLogin.neo?login_check=yes&return_url=/novo-rebank/index.neo',
    advertisementListUrl:
      'https://www.neonet.co.kr/novo-rebank/view/offerings/ad_list.neo',
    allowedHostSuffixes: ['neonet.co.kr'],
    usernameSelectors: ['input[name="user_id"]', '#user_id'],
    passwordSelectors: [
      'input[name="user_pwd"]',
      '#user_pwd',
      'input[type="password"]',
    ],
    submitSelectors: [
      'button[type="submit"]',
      '.btn-login',
      'input[type="submit"]',
    ],
    isLoginUrl: (url) =>
      url.pathname.includes('/MemberLogin.neo') ||
      url.searchParams.get('login_check') === 'yes',
  },
};

const IPC_CHANNELS = {
  status: 'cp-auth:status',
  save: 'cp-auth:save',
  remove: 'cp-auth:remove',
  prepare: 'cp-auth:prepare-session',
} as const;

export class CpAuthManager {
  private readonly authWindows = new Map<string, BrowserWindow>();

  constructor(private readonly vault: CpCredentialVault) {}

  getStatus(officeId: string): Promise<CpCredentialVaultStatus> {
    return this.vault.getStatus(normalizeOfficeId(officeId));
  }

  async saveCredentials(
    input: CpCredentialInput,
  ): Promise<CpCredentialVaultStatus> {
    const normalized: CpCredentialInput = {
      officeId: normalizeOfficeId(input.officeId),
      provider: normalizeProvider(input.provider),
      username: input.username,
      password: input.password,
    };
    await this.clearProviderSession(
      normalized.officeId,
      normalized.provider,
    );
    return this.vault.save(normalized);
  }

  async removeCredentials(
    input: CpAuthPrepareInput,
  ): Promise<CpCredentialVaultStatus> {
    const normalized = normalizePrepareInput(input);
    await this.clearProviderSession(
      normalized.officeId,
      normalized.provider,
    );
    return this.vault.remove(normalized.officeId, normalized.provider);
  }

  private async clearProviderSession(
    officeId: string,
    provider: CpCredentialProvider,
  ): Promise<void> {
    const key = this.windowKey(officeId, provider);
    const authWindow = this.authWindows.get(key);
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();
    this.authWindows.delete(key);

    const providerSession = session.fromPartition(
      this.partitionName(officeId, provider),
    );
    await providerSession.clearStorageData({
      storages: [
        'cookies',
        'localstorage',
        'indexdb',
        'serviceworkers',
        'cachestorage',
      ],
    });
  }

  async prepareSession(input: CpAuthPrepareInput): Promise<CpAuthPrepareResult> {
    const normalized = normalizePrepareInput(input);
    const config = CP_PROVIDER_CONFIGS[normalized.provider];
    const deviceId = await this.vault.getDeviceId();
    const credentials = await this.vault.load(
      normalized.officeId,
      normalized.provider,
    );
    if (!credentials) {
      return {
        provider: normalized.provider,
        deviceId,
        status: 'credentials_missing',
        targetUrl: null,
        windowId: null,
        message: `${config.label} 계정이 이 PC에 저장되어 있지 않습니다.`,
      };
    }

    const authWindow = this.getOrCreateAuthWindow(
      normalized.officeId,
      normalized.provider,
    );
    authWindow.show();
    authWindow.focus();

    try {
      await authWindow.loadURL(config.advertisementListUrl);
      if (this.isAuthenticatedUrl(authWindow.webContents.getURL(), config)) {
        await this.vault.markVerified(
          normalized.officeId,
          normalized.provider,
        );
        return this.authenticatedResult(
          normalized.provider,
          deviceId,
          authWindow,
          config,
        );
      }

      await authWindow.loadURL(config.loginUrl);
      const fillResult = await authWindow.webContents.executeJavaScript(
        buildLoginScript(config, credentials.username, credentials.password),
        true,
      ) as { ok?: boolean; error?: string };
      if (!fillResult?.ok) {
        return {
          provider: normalized.provider,
          deviceId,
          status: 'needs_input',
          targetUrl: authWindow.webContents.getURL(),
          windowId: authWindow.id,
          message:
            fillResult?.error ??
            `${config.label} 로그인 화면을 확인해 주세요.`,
        };
      }

      const authenticated = await waitForCondition(
        () =>
          this.isAuthenticatedUrl(
            authWindow.webContents.getURL(),
            config,
          ),
        25_000,
      );
      if (!authenticated) {
        return {
          provider: normalized.provider,
          deviceId,
          status: 'needs_input',
          targetUrl: authWindow.webContents.getURL(),
          windowId: authWindow.id,
          message: `${config.label} 자동 로그인에 실패했습니다. 열린 창에서 계정 또는 추가 인증을 확인해 주세요.`,
        };
      }

      await authWindow.loadURL(config.advertisementListUrl);
      if (!this.isAuthenticatedUrl(authWindow.webContents.getURL(), config)) {
        return {
          provider: normalized.provider,
          deviceId,
          status: 'needs_input',
          targetUrl: authWindow.webContents.getURL(),
          windowId: authWindow.id,
          message: `${config.label} 광고 목록 접근을 위해 다시 로그인이 필요합니다.`,
        };
      }

      await this.vault.markVerified(
        normalized.officeId,
        normalized.provider,
      );
      return this.authenticatedResult(
        normalized.provider,
        deviceId,
        authWindow,
        config,
      );
    } catch (error) {
      return {
        provider: normalized.provider,
        deviceId,
        status: 'error',
        targetUrl: authWindow.isDestroyed()
          ? null
          : authWindow.webContents.getURL(),
        windowId: authWindow.isDestroyed() ? null : authWindow.id,
        message:
          error instanceof Error
            ? error.message
            : `${config.label} 로그인 창을 열지 못했습니다.`,
      };
    }
  }

  close(): void {
    for (const authWindow of this.authWindows.values()) {
      if (!authWindow.isDestroyed()) authWindow.close();
    }
    this.authWindows.clear();
  }

  private authenticatedResult(
    provider: CpCredentialProvider,
    deviceId: string,
    authWindow: BrowserWindow,
    config: CpProviderConfig,
  ): CpAuthPrepareResult {
    return {
      provider,
      deviceId,
      status: 'authenticated',
      targetUrl: config.advertisementListUrl,
      windowId: authWindow.id,
      message: `${config.label} 자동 로그인이 준비되었습니다.`,
    };
  }

  private getOrCreateAuthWindow(
    officeId: string,
    provider: CpCredentialProvider,
  ): BrowserWindow {
    const key = this.windowKey(officeId, provider);
    const existing = this.authWindows.get(key);
    if (existing && !existing.isDestroyed()) return existing;

    const config = CP_PROVIDER_CONFIGS[provider];
    const authWindow = new BrowserWindow({
      title: `${config.label} · Estate ERP 로컬 Skill`,
      width: 1280,
      height: 820,
      minWidth: 960,
      minHeight: 680,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#ffffff',
      webPreferences: {
        partition: this.partitionName(officeId, provider),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    authWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    authWindow.webContents.on('will-navigate', (event, targetUrl) => {
      if (!isAllowedProviderUrl(targetUrl, config)) event.preventDefault();
    });
    authWindow.webContents.session.setPermissionCheckHandler(() => false);
    authWindow.webContents.session.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    authWindow.on('closed', () => this.authWindows.delete(key));
    this.authWindows.set(key, authWindow);
    return authWindow;
  }

  private isAuthenticatedUrl(
    rawUrl: string,
    config: CpProviderConfig,
  ): boolean {
    try {
      const url = new URL(rawUrl);
      return isAllowedProviderUrl(rawUrl, config) && !config.isLoginUrl(url);
    } catch {
      return false;
    }
  }

  private partitionName(
    officeId: string,
    provider: CpCredentialProvider,
  ): string {
    const safeOfficeId = officeId.replace(/[^a-zA-Z0-9-]/g, '');
    return `persist:estate-erp-cp-${safeOfficeId}-${provider}`;
  }

  private windowKey(
    officeId: string,
    provider: CpCredentialProvider,
  ): string {
    return `${officeId}:${provider}`;
  }
}

export function registerCpAuthIpcHandlers(
  manager: CpAuthManager,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(IPC_CHANNELS.status, (event, input: { officeId: string }) => {
    assertTrustedSender(event, isTrustedSender);
    return manager.getStatus(input?.officeId);
  });
  ipcMain.handle(IPC_CHANNELS.save, (event, input: CpCredentialInput) => {
    assertTrustedSender(event, isTrustedSender);
    return manager.saveCredentials(input);
  });
  ipcMain.handle(IPC_CHANNELS.remove, (event, input: CpAuthPrepareInput) => {
    assertTrustedSender(event, isTrustedSender);
    return manager.removeCredentials(input);
  });
  ipcMain.handle(IPC_CHANNELS.prepare, (event, input: CpAuthPrepareInput) => {
    assertTrustedSender(event, isTrustedSender);
    return manager.prepareSession(input);
  });
}

function assertTrustedSender(
  event: IpcMainInvokeEvent,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
): void {
  if (!isTrustedSender(event)) {
    throw new Error('허용되지 않은 화면에서 CP 인증을 요청했습니다.');
  }
}

function normalizePrepareInput(input: CpAuthPrepareInput): CpAuthPrepareInput {
  return {
    officeId: normalizeOfficeId(input?.officeId),
    provider: normalizeProvider(input?.provider),
  };
}

function normalizeOfficeId(officeId: string): string {
  const normalized = typeof officeId === 'string' ? officeId.trim() : '';
  if (!normalized || normalized.length > 128) {
    throw new Error('사무소 정보를 확인할 수 없습니다.');
  }
  return normalized;
}

function normalizeProvider(provider: string): CpCredentialProvider {
  if (
    !CP_CREDENTIAL_PROVIDERS.includes(provider as CpCredentialProvider)
  ) {
    throw new Error('지원하지 않는 CP사입니다.');
  }
  return provider as CpCredentialProvider;
}

function isAllowedProviderUrl(
  rawUrl: string,
  config: CpProviderConfig,
): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:') return false;
    return config.allowedHostSuffixes.some(
      (suffix) =>
        url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

function buildLoginScript(
  config: CpProviderConfig,
  username: string,
  password: string,
): string {
  const payload = JSON.stringify({
    username,
    password,
    usernameSelectors: config.usernameSelectors,
    passwordSelectors: config.passwordSelectors,
    submitSelectors: config.submitSelectors,
  });
  return `(() => {
    const payload = ${payload};
    const first = (selectors) => selectors
      .map((selector) => document.querySelector(selector))
      .find(Boolean);
    const username = first(payload.usernameSelectors);
    const password = first(payload.passwordSelectors);
    const submit = first(payload.submitSelectors);
    if (!(username instanceof HTMLInputElement)) {
      return { ok: false, error: '아이디 입력 칸을 찾지 못했습니다.' };
    }
    if (!(password instanceof HTMLInputElement)) {
      return { ok: false, error: '비밀번호 입력 칸을 찾지 못했습니다.' };
    }
    if (!(submit instanceof HTMLElement)) {
      return { ok: false, error: '로그인 버튼을 찾지 못했습니다.' };
    }
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    if (!setValue) {
      return { ok: false, error: '로그인 입력 칸을 갱신하지 못했습니다.' };
    }
    setValue.call(username, payload.username);
    username.dispatchEvent(new Event('input', { bubbles: true }));
    username.dispatchEvent(new Event('change', { bubbles: true }));
    setValue.call(password, payload.password);
    password.dispatchEvent(new Event('input', { bubbles: true }));
    password.dispatchEvent(new Event('change', { bubbles: true }));
    submit.click();
    return { ok: true };
  })()`;
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return condition();
}
