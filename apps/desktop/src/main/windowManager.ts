import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  screen,
  shell,
  webContents,
  WebContentsView,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import {
  isTabCommand,
  isTabMenuItems,
  tabCommandForInput,
  type TabCommand,
  type TabMenuItem,
} from '../common/tabCommands';
import { randomUUID } from 'node:crypto';
import type {
  BeginDragPayload,
  CommitTabTransfer,
  DetachPayload,
  DragPositionPayload,
  FinalTabTransferSnapshotAck,
  InitialTabTransfer,
  InitialTabTransferAck,
  OpenPropertyWindowPayload,
  Tab,
  TabKind,
  TabTransferAborted,
  TabWorkspaceSnapshot,
  WindowKind,
} from '@estate-erp/shared';
import type {
  DesktopAuthSignOutResponse,
  DesktopAuthSessionSnapshot,
  DesktopAuthTokenResponse,
} from '../common/desktopAuth';
import type {
  RealtimeAuthorityClaim,
  RealtimeAuthorityRelease,
  RealtimeAuthoritySnapshot,
} from '../common/desktopRealtime';
import {
  parseNativeTabAction,
  type NativeTabAction,
  type NativeTabActionEnvelope,
} from '../common/nativeTabActions';
import {
  NATIVE_SPARE_TAB_ID_PREFIX,
  resolveNativeTabRoute,
  type NativeSidebarState,
  type NativeTabLifecycleUpdate,
  type NativeTabRetentionUpdate,
  type NativeTabStateUpdate,
  type NativeTabViewportPayload,
  type NativeTabViewportReleasePayload,
  type NativeTabViewportResult,
} from '../common/nativeTabs';
import {
  RENDERER_SURFACE_ARGUMENT,
  RENDERER_TAB_ID_ARGUMENT,
} from '../common/rendererSurface';
import { isPostcodeFrameRedirect } from './embeddedAddressNavigation';
import { AuthBroker } from './authBroker';
import {
  ElectronNativeTabViewFactory,
  ElectronNativeTabWindowHost,
} from './electronNativeTabAdapter';
import { NativeTabHost, type NativeTabMove } from './nativeTabHost';
import { CallOverlayHost } from './callOverlayHost';
import {
  isCallOverlayState,
  parseCallOverlayAction,
  parseCallOverlaySize,
  parseWindowToast,
  type CallOverlayAction,
  type CallOverlayInset,
  type WindowToast,
} from '../common/callOverlay';
import { RealtimeLeaseBroker } from './realtimeLeaseBroker';
import {
  windowWorkspaceOwnerKey,
  type WindowWorkspaceOwner,
} from '../common/windowWorkspace';
import {
  AUTH_PROVIDER_ARGUMENT,
  parseDesktopAuthProvider,
  parseProviderCredentials,
  resolveAuth0DesktopConfig,
  type DesktopAuthProviderKind,
  type DesktopProviderAuthState,
  type DesktopProviderCredentials,
  type DesktopProviderLoginResult,
} from '../common/desktopAuthProvider';
import {
  Auth0DesktopSession,
  toLoginError,
} from './auth0/auth0DesktopSession';
import { SafeStorageAuth0TokenStore } from './auth0/auth0TokenStore';
import {
  expectedTokenSessionId,
  mayReceiveToken,
} from './auth0/tokenSessionScope';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let packagedRendererBaseUrl: string | null = null;

export function setPackagedRendererBaseUrl(baseUrl: string | null) {
  packagedRendererBaseUrl = baseUrl;
}

interface WindowEntry {
  kind: WindowKind;
  /** detached shell이 drag transfer인지 독립 새 창 bootstrap인지 구분한다. */
  bootstrapMode?: 'transfer' | 'standalone';
  workspace?: TabWorkspaceSnapshot;
  /** Prevents a workspace snapshot from crossing a user/office boundary. */
  workspacePrincipal?: string;
  /**
   * target으로 ownership이 넘어간 탭을 source renderer의 늦은 snapshot이
   * 다시 살려내지 못하게 하는 main-process tombstone.
   */
  outgoingTabIds?: Set<string>;
  transferTabId?: string;
  transferId?: string;
  pendingTransfer?: PendingTransfer;
  acceptedTransferId?: string;
  transferCommitted?: boolean;
  nativeViewportLeaseId?: string;
  /** 창 단위 사이드바 펼침. 셸이 정하고 그 창의 탭 화면이 따른다. */
  sidebarOpen?: boolean;
}

type GlobalOverlaySource = 'cti' | 'updater';

interface GlobalOverlayVisibilityPayload {
  schemaVersion: 1;
  source: GlobalOverlaySource;
  visible: boolean;
}

interface PendingTransfer {
  transferId: string;
  tabId: string;
  sourceWebContentsId: number;
  acceptance: Promise<boolean>;
  resolveAcceptance: (accepted: boolean) => void;
  timeout: NodeJS.Timeout;
}

interface DetachedWindowCreation {
  windowId: number;
  acceptance: Promise<boolean>;
}

interface TransferRecord {
  transferId: string;
  tabId: string;
  sourceWebContentsId: number;
  sourceWindowId: number;
  targetWindowId: number;
  state: 'pending' | 'accepted' | 'committed';
  mode: 'snapshot' | 'native';
  cleanupTimer?: NodeJS.Timeout;
  finalSnapshot?: PendingFinalSnapshot;
  appliedSnapshotFingerprint?: string;
  appliedSnapshotId?: string;
  appliedTab?: Tab;
}

interface PendingFinalSnapshot {
  snapshotId: string;
  tab: Tab;
  fingerprint: string;
  acceptance: Promise<boolean>;
  resolveAcceptance: (accepted: boolean) => void;
  timeout: NodeJS.Timeout;
}

interface PendingSignOut {
  requestId: string;
  shellWebContentsId: number;
  attemptedShellIds: Set<number>;
  promise: Promise<boolean>;
  resolve: (ok: boolean) => void;
  timeout: NodeJS.Timeout;
}

type BeginDragResult =
  | ({ ok: true } & DetachedWindowCreation)
  | { ok: false; error: string };

const DETACHED_TITLEBAR_HEIGHT = 40;

/**
 * 로그인 서비스. 기본은 Clerk이고, `ESTATE_AUTH_PROVIDER=auth0`이면 main이
 * Auth0 로그인과 토큰을 맡는다. 셸 창에는 실행 인자로 같은 값을 알려 준다.
 */
const AUTH_PROVIDER: DesktopAuthProviderKind = parseDesktopAuthProvider(
  process.env.ESTATE_AUTH_PROVIDER,
);

function getBaseWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  const platformOptions: Partial<Electron.BrowserWindowConstructorOptions> =
    isMac
      ? {
          titleBarStyle: 'hiddenInset',
          // 헤더 h-10 (40px) 기준 traffic light 가운데 정렬
          trafficLightPosition: { x: 16, y: 12 },
        }
      : isWin
        ? {
            titleBarStyle: 'hidden',
            titleBarOverlay: {
              color: '#00000000',
              symbolColor: nativeTheme.shouldUseDarkColors
                ? '#ffffff'
                : '#1f1f1f',
              // 헤더 h-10 (40px)와 동기화
              height: 40,
            },
          }
        : {};

  return {
    backgroundColor: '#f8f9fa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`${AUTH_PROVIDER_ARGUMENT}${AUTH_PROVIDER}`],
    },
    ...platformOptions,
  };
}

function rendererUrlFor(searchParams?: Record<string, string>): {
  isDev: boolean;
  url?: string;
  filePath?: string;
  hash?: string;
} {
  const hashSegments = searchParams
    ? `?${new URLSearchParams(searchParams).toString()}`
    : '';

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const url = `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/${hashSegments ? `#${hashSegments}` : ''}`;
    return { isDev: true, url };
  }

  if (packagedRendererBaseUrl) {
    const url = `${packagedRendererBaseUrl}/${hashSegments}`;
    return { isDev: false, url };
  }

  return {
    isDev: false,
    filePath: path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    ),
    hash: hashSegments || undefined,
  };
}

function nativeTabDestinationFor(
  route: string,
): { url: string } | { filePath: string; options: Electron.LoadFileOptions } {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return {
      url: new URL(route, `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/`).toString(),
    };
  }
  if (packagedRendererBaseUrl) {
    return {
      url: new URL(route, `${packagedRendererBaseUrl}/`).toString(),
    };
  }
  return {
    filePath: path.join(
      __dirname,
      `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
    ),
    options: { hash: route },
  };
}

function isTrustedRendererDocumentUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      const expectedPath = path.resolve(
        __dirname,
        `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`,
      );
      return path.resolve(decodeURIComponent(url.pathname)) === expectedPath;
    }
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      const developmentOrigin = new URL(MAIN_WINDOW_VITE_DEV_SERVER_URL).origin;
      return url.origin === developmentOrigin;
    }
    if (packagedRendererBaseUrl) {
      const expected = new URL(packagedRendererBaseUrl);
      return url.protocol === expected.protocol && url.host === expected.host;
    }
    return false;
  } catch {
    return false;
  }
}

function internalHrefFromRendererUrl(rawUrl: string): string | null {
  try {
    if (!isTrustedRendererDocumentUrl(rawUrl)) return null;
    const url = new URL(rawUrl);
    if (url.protocol === 'file:') {
      const hash = url.hash.replace(/^#/, '');
      return hash.startsWith('/') ? hash : null;
    }
    const href = `${url.pathname}${url.search}${url.hash}`;
    return href.startsWith('/') ? href : null;
  } catch {
    return null;
  }
}

interface DragState {
  windowId: number;
  transferId: string;
  sourceWebContentsId: number;
  /** 마우스가 새 창의 좌측 상단으로부터 떨어진 offset (= 탭 mouseOffset) */
  mouseOffset: { x: number; y: number };
  /** renderer cleanup 이벤트까지 유실됐을 때 click-through ghost를 해제하는 hard deadline */
  recoveryTimer: NodeJS.Timeout;
}

const TRANSFER_ACCEPT_TIMEOUT_MS = 30_000;
const TRANSFER_COMMIT_TIMEOUT_MS = 5 * 60_000;
const FINAL_SNAPSHOT_ACCEPT_TIMEOUT_MS = 10_000;
const COMMITTED_TRANSFER_TTL_MS = 60_000;
const DRAG_HARD_TIMEOUT_MS = 120_000;
const MAX_TAB_TITLE_LENGTH = 500;
const MAX_TAB_ROUTE_LENGTH = 4_096;
const TAB_KINDS = new Set<TabKind>([
  'home',
  'property',
  'contact',
  'consultation',
  'deal',
  'match',
  'task',
  'calendar',
  'site',
  'contract',
  'cashflow',
  'employee',
  'settings',
  'dashboard',
  'generic',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32) return true;
  }
  return false;
}

function isJsonValue(
  value: unknown,
  seen = new Set<object>(),
  budget = { nodes: 0 },
  depth = 0,
): boolean {
  budget.nodes += 1;
  if (budget.nodes > 10_000 || depth > 20) return false;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    return false;
  }
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every((item) => isJsonValue(item, seen, budget, depth + 1))
    : Object.values(value).every((item) =>
        isJsonValue(item, seen, budget, depth + 1),
      );
  seen.delete(value);
  return valid;
}

function isValidTab(tab: unknown): tab is Tab {
  if (!isRecord(tab)) return false;
  const routeParamsValid =
    tab.routeParams === undefined ||
    (isRecord(tab.routeParams) && isJsonValue(tab.routeParams));
  const uiStateValid =
    tab.uiState === undefined ||
    (isRecord(tab.uiState) &&
      (tab.uiState.scrollY === undefined ||
        (typeof tab.uiState.scrollY === 'number' &&
          Number.isFinite(tab.uiState.scrollY))) &&
      (tab.uiState.formDraft === undefined ||
        (isRecord(tab.uiState.formDraft) &&
          isJsonValue(tab.uiState.formDraft))));
  return (
    tab.schemaVersion === 1 &&
    typeof tab.id === 'string' &&
    tab.id.length > 0 &&
    tab.id.length <= 256 &&
    (tab.resourceKey === undefined ||
      (typeof tab.resourceKey === 'string' &&
        tab.resourceKey.length <= 1_024)) &&
    typeof tab.kind === 'string' &&
    TAB_KINDS.has(tab.kind as TabKind) &&
    typeof tab.title === 'string' &&
    tab.title.length <= MAX_TAB_TITLE_LENGTH &&
    typeof tab.route === 'string' &&
    tab.route.startsWith('/') &&
    tab.route.length <= MAX_TAB_ROUTE_LENGTH &&
    typeof tab.createdAt === 'number' &&
    Number.isFinite(tab.createdAt) &&
    routeParamsValid &&
    uiStateValid
  );
}

function isValidWorkspaceSnapshot(
  workspace: unknown,
): workspace is TabWorkspaceSnapshot {
  if (!isRecord(workspace) || workspace.schemaVersion !== 1) return false;
  if (!Array.isArray(workspace.tabs) || workspace.tabs.length > 100)
    return false;
  if (!workspace.tabs.every(isValidTab)) return false;
  const ids = new Set(workspace.tabs.map((tab) => tab.id));
  if (ids.size !== workspace.tabs.length) return false;
  return (
    workspace.activeTabId === null ||
    (typeof workspace.activeTabId === 'string' &&
      ids.has(workspace.activeTabId))
  );
}

function isValidWindowWorkspaceOwner(
  owner: unknown,
): owner is WindowWorkspaceOwner {
  if (!isRecord(owner)) return false;
  return [owner.userId, owner.officeId].every(
    (value) =>
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 256 &&
      ![...value].some((character) => {
        const code = character.charCodeAt(0);
        return code <= 31 || code === 127;
      }),
  );
}

function isFinitePoint(value: unknown): value is { x: number; y: number } {
  return (
    isRecord(value) &&
    typeof value.x === 'number' &&
    Number.isFinite(value.x) &&
    typeof value.y === 'number' &&
    Number.isFinite(value.y)
  );
}

function isValidSize(
  value: unknown,
): value is { width: number; height: number } {
  return (
    isRecord(value) &&
    typeof value.width === 'number' &&
    Number.isFinite(value.width) &&
    value.width >= 400 &&
    value.width <= 10_000 &&
    typeof value.height === 'number' &&
    Number.isFinite(value.height) &&
    value.height >= 300 &&
    value.height <= 10_000
  );
}

function isValidTransferBase(payload: unknown): payload is {
  transferId: string;
  tab: Tab;
  size?: { width: number; height: number };
} {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.transferId === 'string' &&
    payload.transferId.length > 0 &&
    payload.transferId.length <= 256 &&
    isValidTab(payload.tab) &&
    (payload.size === undefined || isValidSize(payload.size))
  );
}

function isValidDetachPayload(payload: unknown): payload is DetachPayload {
  return (
    isValidTransferBase(payload) &&
    isFinitePoint((payload as Record<string, unknown>).position)
  );
}

function isValidBeginDragPayload(
  payload: unknown,
): payload is BeginDragPayload {
  return (
    isValidTransferBase(payload) &&
    isFinitePoint((payload as Record<string, unknown>).pointerScreen) &&
    isFinitePoint((payload as Record<string, unknown>).mouseOffset)
  );
}

function isValidDragPositionPayload(
  payload: unknown,
): payload is DragPositionPayload {
  return (
    isRecord(payload) &&
    typeof payload.transferId === 'string' &&
    payload.transferId.length > 0 &&
    payload.transferId.length <= 256 &&
    isFinitePoint(payload.pointerScreen)
  );
}

function isValidTransferAck(
  payload: unknown,
): payload is InitialTabTransferAck {
  return (
    isRecord(payload) &&
    typeof payload.transferId === 'string' &&
    payload.transferId.length > 0 &&
    payload.transferId.length <= 256 &&
    typeof payload.tabId === 'string' &&
    payload.tabId.length > 0 &&
    payload.tabId.length <= 256 &&
    typeof payload.accepted === 'boolean' &&
    (payload.error === undefined || typeof payload.error === 'string')
  );
}

function isValidFinalSnapshotAck(
  payload: unknown,
): payload is FinalTabTransferSnapshotAck {
  return (
    isValidTransferAck(payload) &&
    'snapshotId' in payload &&
    typeof payload.snapshotId === 'string' &&
    payload.snapshotId.length > 0 &&
    payload.snapshotId.length <= 256
  );
}

function isValidTransferCommit(payload: unknown): payload is CommitTabTransfer {
  return (
    isRecord(payload) &&
    typeof payload.transferId === 'string' &&
    payload.transferId.length > 0 &&
    payload.transferId.length <= 256 &&
    isValidTab(payload.tab)
  );
}

function isValidOpenPropertyWindowPayload(
  payload: unknown,
): payload is OpenPropertyWindowPayload {
  if (!isRecord(payload)) return false;
  return (
    typeof payload.propertyId === 'string' &&
    payload.propertyId.trim().length > 0 &&
    payload.propertyId.length <= 256 &&
    !hasControlCharacters(payload.propertyId) &&
    typeof payload.title === 'string' &&
    payload.title.trim().length > 0 &&
    payload.title.length <= MAX_TAB_TITLE_LENGTH &&
    !hasControlCharacters(payload.title)
  );
}

function isValidNativeViewportPayload(
  payload: unknown,
): payload is NativeTabViewportPayload {
  if (
    !isRecord(payload) ||
    payload.schemaVersion !== 1 ||
    typeof payload.leaseId !== 'string' ||
    payload.leaseId.length === 0 ||
    payload.leaseId.length > 256
  )
    return false;
  if (
    !Array.isArray(payload.nativeTabIds) ||
    payload.nativeTabIds.length > 100
  ) {
    return false;
  }
  if (
    !payload.nativeTabIds.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 256,
    ) ||
    new Set(payload.nativeTabIds).size !== payload.nativeTabIds.length
  ) {
    return false;
  }
  if (
    !isRecord(payload.bounds) ||
    typeof payload.bounds.x !== 'number' ||
    !Number.isFinite(payload.bounds.x) ||
    typeof payload.bounds.y !== 'number' ||
    !Number.isFinite(payload.bounds.y) ||
    typeof payload.bounds.width !== 'number' ||
    !Number.isFinite(payload.bounds.width) ||
    payload.bounds.width < 0 ||
    payload.bounds.width > 10_000 ||
    typeof payload.bounds.height !== 'number' ||
    !Number.isFinite(payload.bounds.height) ||
    payload.bounds.height < 0 ||
    payload.bounds.height > 10_000
  ) {
    return false;
  }
  if (payload.activeTab === null) return true;
  return (
    isValidTab(payload.activeTab) &&
    payload.nativeTabIds.includes(payload.activeTab.id) &&
    resolveNativeTabRoute(payload.activeTab.route) !== null
  );
}

function isValidNativeViewportReleasePayload(
  payload: unknown,
): payload is NativeTabViewportReleasePayload {
  return (
    isRecord(payload) &&
    payload.schemaVersion === 1 &&
    typeof payload.leaseId === 'string' &&
    payload.leaseId.length > 0 &&
    payload.leaseId.length <= 256 &&
    Array.isArray(payload.nativeTabIds) &&
    payload.nativeTabIds.length <= 100 &&
    payload.nativeTabIds.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 256,
    ) &&
    new Set(payload.nativeTabIds).size === payload.nativeTabIds.length
  );
}

function isValidNativeTabRetentionUpdate(
  payload: unknown,
): payload is NativeTabRetentionUpdate {
  if (
    !isRecord(payload) ||
    payload.schemaVersion !== 1 ||
    typeof payload.protected !== 'boolean' ||
    !isRecord(payload.reasons) ||
    typeof payload.reasons.mutating !== 'boolean' ||
    typeof payload.reasons.transientEditor !== 'boolean' ||
    typeof payload.reasons.explicitDirty !== 'boolean'
  ) {
    return false;
  }
  if (payload.viewState !== undefined) {
    if (!isRecord(payload.viewState)) return false;
    if (
      payload.viewState.scrollY !== undefined &&
      (typeof payload.viewState.scrollY !== 'number' ||
        !Number.isFinite(payload.viewState.scrollY) ||
        payload.viewState.scrollY < 0 ||
        payload.viewState.scrollY > 10_000_000)
    ) {
      return false;
    }
  }
  return (
    payload.protected ===
    (payload.reasons.mutating ||
      payload.reasons.transientEditor ||
      payload.reasons.explicitDirty)
  );
}

function isValidAuthSessionPublish(
  payload: unknown,
): payload is Omit<DesktopAuthSessionSnapshot, 'revision'> {
  return (
    isRecord(payload) &&
    typeof payload.authenticated === 'boolean' &&
    (payload.user === null || isJsonValue(payload.user)) &&
    (payload.providerSessionId === undefined ||
      payload.providerSessionId === null ||
      (typeof payload.providerSessionId === 'number' &&
        Number.isSafeInteger(payload.providerSessionId)))
  );
}

/** Auth0 모드의 셸이 토큰을 받을 때 함께 보내는 세션 번호. */
function parseTokenScopeSessionId(payload: unknown): number | null {
  return isRecord(payload) &&
    typeof payload.sessionId === 'number' &&
    Number.isSafeInteger(payload.sessionId)
    ? payload.sessionId
    : null;
}

function isValidAuthTokenResponse(
  payload: unknown,
): payload is DesktopAuthTokenResponse {
  return (
    isRecord(payload) &&
    typeof payload.requestId === 'string' &&
    payload.requestId.length > 0 &&
    payload.requestId.length <= 256 &&
    (payload.token === null ||
      (typeof payload.token === 'string' && payload.token.length <= 16_384))
  );
}

function isValidAuthSignOutResponse(
  payload: unknown,
): payload is DesktopAuthSignOutResponse {
  return (
    isRecord(payload) &&
    typeof payload.requestId === 'string' &&
    payload.requestId.length > 0 &&
    payload.requestId.length <= 256 &&
    typeof payload.ok === 'boolean' &&
    (payload.error === undefined ||
      (typeof payload.error === 'string' && payload.error.length <= 2_048))
  );
}

function isValidRealtimeClaim(
  payload: unknown,
): payload is RealtimeAuthorityClaim {
  return (
    isRecord(payload) &&
    payload.schemaVersion === 1 &&
    typeof payload.claimId === 'string' &&
    payload.claimId.length > 0 &&
    payload.claimId.length <= 256
  );
}

function isValidRealtimeRelease(
  payload: unknown,
): payload is RealtimeAuthorityRelease {
  const leaseId = isRecord(payload) ? payload.leaseId : undefined;
  return (
    isValidRealtimeClaim(payload) &&
    (leaseId === null ||
      (typeof leaseId === 'string' && leaseId.length <= 256))
  );
}

function isValidGlobalOverlayVisibilityPayload(
  payload: unknown,
): payload is GlobalOverlayVisibilityPayload {
  return (
    isRecord(payload) &&
    payload.schemaVersion === 1 &&
    (payload.source === 'cti' || payload.source === 'updater') &&
    typeof payload.visible === 'boolean'
  );
}

function tabSnapshotFingerprint(tab: Tab): string {
  return JSON.stringify(tab);
}

export class WindowManager {
  private windows = new Map<number, WindowEntry>();
  private transfers = new Map<string, TransferRecord>();
  private mainWindowId: number | null = null;
  private dragState: DragState | null = null;
  private readonly nativeViewportRevision = new Map<number, number>();
  private readonly suspendedNativeHosts = new Set<number>();
  private readonly rendererSuspendedNativeHosts = new Set<number>();
  private readonly overlaySuspendedActiveTabs = new Map<number, string | null>();
  private readonly globalOverlaySources = new Map<
    number,
    Set<GlobalOverlaySource>
  >();
  private readonly nativeTransferMoves = new Map<string, NativeTabMove>();
  private readonly nativeTabs: NativeTabHost;
  private readonly authBroker: AuthBroker;
  /**
   * Auth0 모드에서 main이 가진 로그인 세션. 접근 토큰은 여기서 셸·탭 화면·
   * 팝업 층으로 나간다. Clerk 모드면 null이고 토큰은 셸이 가진다.
   */
  private readonly providerAuth: Auth0DesktopSession | null;
  private readonly realtimeBroker = new RealtimeLeaseBroker();
  private pendingSignOut: PendingSignOut | null = null;
  /** 새 창은 마지막으로 고른 사이드바 상태로 연다. */
  private lastSidebarOpen = true;
  /** 탭 화면 위에 뜨는 전화 수신 팝업 층. 통화 중에도 탭 화면을 숨기지 않는다. */
  private readonly callOverlays = new CallOverlayHost({
    titlebarHeight: DETACHED_TITLEBAR_HEIGHT,
    onInsetChange: (windowId) => this.publishCallOverlayInset(windowId),
    createView: () => {
      const view = new WebContentsView({
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          sandbox: true,
          additionalArguments: [`${RENDERER_SURFACE_ARGUMENT}call-overlay`],
        },
      });
      view.setBackgroundColor('#00000000');
      view.webContents.setWindowOpenHandler(({ url }) => {
        if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      // 팝업 층은 다른 문서로 옮겨 가지 않는다. 링크는 셸 창에서 연다.
      view.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
      });
      const destination = nativeTabDestinationFor('/call-overlay');
      const load =
        'url' in destination
          ? view.webContents.loadURL(destination.url)
          : view.webContents.loadFile(destination.filePath, destination.options);
      void load.catch((error: unknown) => {
        console.warn('[call-overlay] failed to load', error);
      });
      return view;
    },
  });

  constructor() {
    this.authBroker = new AuthBroker({
      sendTokenRequest: (shellWebContentsId, request) => {
        const contents = webContents.fromId(shellWebContentsId);
        if (!contents || contents.isDestroyed()) return false;
        contents.send('auth:tokenRequest', request);
        return true;
      },
    });
    this.providerAuth =
      AUTH_PROVIDER === 'auth0' ? this.createAuth0Session() : null;
    this.nativeTabs = new NativeTabHost(
      new ElectronNativeTabViewFactory({
        backgroundColor: '#f8f9fa',
        webPreferences: (tab) => ({
          preload: path.join(__dirname, 'preload.js'),
          contextIsolation: true,
          sandbox: true,
          additionalArguments: [
            `${RENDERER_SURFACE_ARGUMENT}native-tab`,
            `${RENDERER_TAB_ID_ARGUMENT}${tab.id}`,
          ],
        }),
        resolveDestination: nativeTabDestinationFor,
        onCreated: (view) => {
          const guardNavigation = (event: Electron.Event, url: string) => {
            const route = internalHrefFromRendererUrl(url);
            if (route && resolveNativeTabRoute(route)) return;
            event.preventDefault();
            if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
          };
          const publishFailure = () => {
            const beforeFailure = this.nativeTabs.peekSender(
              view.webContents.id,
            );
            if (!beforeFailure) return;
            const inFlightTransfer = [...this.transfers.values()].find(
              (transfer) =>
                transfer.mode === 'native' &&
                transfer.state !== 'committed' &&
                transfer.tabId === beforeFailure.tabId,
            );
            if (inFlightTransfer) {
              inFlightTransfer.appliedTab = beforeFailure.tab;
              inFlightTransfer.appliedSnapshotFingerprint =
                tabSnapshotFingerprint(beforeFailure.tab);
              // target shell이 아직 Splash라 lifecycle listener가 없을 수 있다.
              // 먼저 live view를 source로 rollback한 뒤 failed renderer record를 없애고,
              // source shell에 fallback/recreate 신호를 보낸다.
              this.rollbackNativeTransfer(inFlightTransfer.transferId);
            }
            const identity = this.nativeTabs.removeFailedSender(
              view.webContents.id,
            );
            if (!identity) return;
            const recoveryHostId =
              inFlightTransfer?.sourceWindowId ?? identity.hostId;
            if (inFlightTransfer) {
              this.abortTransfer(inFlightTransfer.transferId);
            }
            if (inFlightTransfer) return;
            const host = BrowserWindow.fromId(recoveryHostId);
            if (!host || host.isDestroyed()) return;
            const update: NativeTabLifecycleUpdate = {
              tabId: identity.tabId,
              status: 'renderer-failed',
            };
            host.webContents.send('tabs:nativeTabLifecycle', update);
          };
          const publishNavigation = (rawUrl: string) => {
            const route = internalHrefFromRendererUrl(rawUrl);
            const descriptor = route ? resolveNativeTabRoute(route) : null;
            if (!route || !descriptor) {
              const identity = this.nativeTabs.peekSender(view.webContents.id);
              if (identity && !view.webContents.isDestroyed()) {
                const destination = nativeTabDestinationFor(identity.tab.route);
                const recovery =
                  'url' in destination
                    ? view.webContents.loadURL(destination.url)
                    : view.webContents.loadFile(
                        destination.filePath,
                        destination.options,
                      );
                void recovery.catch(publishFailure);
              }
              return;
            }
            // 종류·제목·resourceKey는 셸이 route로 다시 계산한다. main은 주소만 기록한다.
            const identity = this.nativeTabs.updateRendererState(
              view.webContents.id,
              {
                route,
                ...(descriptor.kind === 'property-detail'
                  ? {
                      kind: 'property' as const,
                      resourceKey: `entity:property:${encodeURIComponent(
                        descriptor.entityId,
                      )}`,
                    }
                  : {}),
              },
            );
            if (!identity) return;
            const entry = this.windows.get(identity.hostId);
            if (entry?.workspace) {
              entry.workspace = {
                ...entry.workspace,
                tabs: entry.workspace.tabs.map((tab) =>
                  tab.id === identity.tabId ? identity.tab : tab,
                ),
              };
            }
            const host = BrowserWindow.fromId(identity.hostId);
            if (!host || host.isDestroyed()) return;
            const update: NativeTabStateUpdate = {
              tabId: identity.tabId,
              route,
            };
            host.webContents.send('tabs:nativeTabState', update);
          };
          view.webContents.on('did-navigate', (_event, url) => {
            publishNavigation(url);
          });
          view.webContents.on('did-navigate-in-page', (_event, url) => {
            publishNavigation(url);
          });
          view.webContents.on('will-navigate', guardNavigation);
          view.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
            if (!isPostcodeFrameRedirect(url, isMainFrame)) guardNavigation(event, url);
          });
          view.webContents.on(
            'did-fail-load',
            (_event, code, _description, _url, isMainFrame) => {
              if (isMainFrame && code !== -3) publishFailure();
            },
          );
          view.webContents.on('render-process-gone', publishFailure);
          // 매물 상세처럼 native view에 focus가 있어도 탭 단축키는 셸 탭바가 처리한다.
          view.webContents.on('before-input-event', (event, input) => {
            const command = tabCommandForInput(input, process.platform);
            if (!command) return;
            const identity = this.nativeTabs.peekSender(view.webContents.id);
            const host = identity ? BrowserWindow.fromId(identity.hostId) : null;
            if (!host || host.isDestroyed()) return;
            event.preventDefault();
            this.sendTabCommand(host, command);
          });
          view.webContents.setWindowOpenHandler(({ url }) => {
            if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
            return { action: 'deny' };
          });
        },
      }),
      {
        // Logical tabs remain unlimited. Only the five most-recent eligible
        // native renderer surfaces stay resident; active/protected views may
        // temporarily take the global count above this soft cap.
        maxLiveTabs: 5,
        inactiveGraceMs: 30_000,
        // 새 탭이 앱을 처음부터 띄우지 않게 하나를 미리 띄워 둔다.
        spare: {
          createTab: () => ({
            schemaVersion: 1,
            id: `${NATIVE_SPARE_TAB_ID_PREFIX}${randomUUID()}`,
            kind: 'dashboard',
            title: '',
            route: '/dashboard',
            createdAt: Date.now(),
          }),
        },
        onCleanupError: (error) => {
          console.warn('[native-tabs] cleanup failed', error);
        },
      },
    );
  }

  private registerNativeHost(win: BrowserWindow): void {
    this.nativeTabs.registerHost(
      new ElectronNativeTabWindowHost(win, () => {
        this.callOverlays.raise(win.id);
        // 통화 중에 붙은 탭 화면도 알림을 팝업 위로 올리게 한다.
        this.publishCallOverlayInset(win.id);
      }),
    );
    this.authBroker.registerShell(win.webContents.id);
    // BrowserWindow 자체는 살아 있어도 renderer process만 죽고 다시 로드될 수 있다.
    // 죽은 webContents를 token authority로 남기지 않고, reload가 끝난 shell은 다시
    // broker 후보로 등록한다. publishSession이 실제 인증 상태를 곧 재확인한다.
    const suspendNativeHost = () => {
      this.rendererSuspendedNativeHosts.add(win.id);
      this.nativeViewportRevision.set(
        win.id,
        (this.nativeViewportRevision.get(win.id) ?? 0) + 1,
      );
      try {
        this.nativeTabs.activate(win.id, null);
      } catch {
        // host close와 renderer crash가 같은 turn에 겹친 경우에는 이미 정리됐다.
      }
      const entry = this.windows.get(win.id);
      if (entry) entry.nativeViewportLeaseId = undefined;
    };
    let completedInitialLoad = false;
    win.webContents.on(
      'did-start-navigation',
      (_event, url, isInPlace, isMainFrame) => {
        if (
          !completedInitialLoad ||
          !isMainFrame ||
          isInPlace ||
          !isTrustedRendererDocumentUrl(url)
        ) {
          return;
        }
        suspendNativeHost();
        const entry = this.windows.get(win.id);
        const shouldCloseUncommittedTarget =
          entry?.bootstrapMode === 'transfer' &&
          entry.transferCommitted !== true;
        if (entry?.pendingTransfer) {
          this.settleInitialTransfer(
            win.id,
            entry.pendingTransfer.transferId,
            false,
          );
        }
        this.abortTransfersForTarget(win.id);
        this.handleSourceGone(win.webContents.id);
        this.releaseRealtimeAuthority(win.webContents.id);
        this.suspendAuthShell(win.webContents.id);
        if (shouldCloseUncommittedTarget) {
          setTimeout(() => {
            if (!win.isDestroyed()) win.destroy();
          }, 0);
        }
      },
    );
    win.webContents.on('render-process-gone', () => {
      suspendNativeHost();
      this.releaseRealtimeAuthority(win.webContents.id);
      this.suspendAuthShell(win.webContents.id);
    });
    win.webContents.on('did-finish-load', () => {
      completedInitialLoad = true;
      // did-start-navigation에서 이전 renderer lease를 무효화한 뒤, 현재 main
      // frame이 실제로 로드된 시점부터만 새 viewport sync를 허용한다.
      this.rendererSuspendedNativeHosts.delete(win.id);
      this.authBroker.registerShell(win.webContents.id);
    });
    const guardShellNavigation = (event: Electron.Event, url: string) => {
      if (isTrustedRendererDocumentUrl(url)) return;
      event.preventDefault();
      if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
    };
    win.webContents.on('will-navigate', guardShellNavigation);
    win.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
      if (!isPostcodeFrameRedirect(url, isMainFrame)) guardShellNavigation(event, url);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    // 기본 메뉴의 Cmd+W(창 닫기)보다 먼저 받아 탭 단위로 처리한다.
    win.webContents.on('before-input-event', (event, input) => {
      const command = tabCommandForInput(input, process.platform);
      if (!command) return;
      event.preventDefault();
      this.sendTabCommand(win, command);
    });
    // Windows 마우스 사이드 버튼. macOS는 renderer가 mouseup 버튼 3/4로 받는다.
    win.on('app-command', (_event, command) => {
      if (command === 'browser-backward') {
        this.sendTabCommand(win, { type: 'history', direction: 'back' });
      } else if (command === 'browser-forward') {
        this.sendTabCommand(win, { type: 'history', direction: 'forward' });
      }
    });
  }

  sendTabCommand(win: BrowserWindow, command: TabCommand): void {
    if (win.isDestroyed() || !this.isRegisteredShellSender(win.webContents.id)) {
      return;
    }
    win.webContents.send('tabs:command', command);
  }

  /** native 탭 renderer가 보낸 명령은 그 탭을 가진 셸 창으로 보낸다. */
  forwardTabCommandFromSender(
    senderWebContentsId: number,
    command: TabCommand,
  ): void {
    if (this.isRegisteredShellSender(senderWebContentsId)) {
      const contents = webContents.fromId(senderWebContentsId);
      const win = contents ? BrowserWindow.fromWebContents(contents) : null;
      if (win) this.sendTabCommand(win, command);
      return;
    }
    if (!this.isAuthorizedNativeSender(senderWebContentsId)) return;
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    const host = identity ? BrowserWindow.fromId(identity.hostId) : null;
    if (host) this.sendTabCommand(host, command);
  }

  createMainWindow(): BrowserWindow {
    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      width: 1440,
      height: 900,
      minWidth: 1200,
      minHeight: 760,
    });
    this.registerNativeHost(win);
    const sourceWebContentsId = win.webContents.id;
    this.windows.set(win.id, { kind: 'main' });
    this.mainWindowId = win.id;

    const target = rendererUrlFor();
    if (target.isDev && target.url) {
      win.loadURL(target.url);
    } else if (target.url) {
      win.loadURL(target.url);
    } else if (target.filePath) {
      win.loadFile(target.filePath);
    }

    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' });
    }

    win.on('enter-full-screen', () => {
      win.webContents.send('fullscreen-changed', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('fullscreen-changed', false);
    });

    win.on('closed', () => {
      if (this.dragState?.sourceWebContentsId === sourceWebContentsId) {
        this.finishDrag();
      }
      this.nativeTabs.unregisterHost(win.id);
      this.handleSourceGone(sourceWebContentsId);
      this.unregisterAuthShell(sourceWebContentsId);
      this.releaseRealtimeAuthority(sourceWebContentsId);
      this.nativeViewportRevision.delete(win.id);
      this.rendererSuspendedNativeHosts.delete(win.id);
      this.suspendedNativeHosts.delete(win.id);
      this.globalOverlaySources.delete(win.id);
      this.overlaySuspendedActiveTabs.delete(win.id);
      this.windows.delete(win.id);
      if (this.mainWindowId === win.id) this.mainWindowId = null;
    });
    win.webContents.on('render-process-gone', () => {
      if (this.dragState?.sourceWebContentsId === sourceWebContentsId) {
        this.finishDrag();
      }
      this.handleSourceGone(sourceWebContentsId);
    });

    return win;
  }

  createDetachedWindow(
    payload: DetachPayload,
    sourceWebContentsId: number,
    sourceWindowId: number,
  ): DetachedWindowCreation {
    const { tab, position, size, transferId } = payload;
    const transferConflict = this.getTransferConflict(
      transferId,
      sourceWebContentsId,
      sourceWindowId,
      tab.id,
    );
    if (transferConflict) throw new Error(transferConflict);
    const width = size?.width ?? 1100;
    const height = size?.height ?? 760;

    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      // 다중 모니터에서는 정상 좌표가 음수일 수 있으므로 0으로 clamp하지 않는다.
      x: Math.round(position.x - 200),
      y: Math.round(position.y - 18),
      title: `${tab.title} — 에스테잇플로우`,
    });
    this.registerNativeHost(win);

    const acceptance = this.registerDetachedWindow(
      win,
      tab,
      transferId,
      sourceWebContentsId,
      sourceWindowId,
    );
    this.loadDetachedRenderer(win, tab, transferId);
    return { windowId: win.id, acceptance };
  }

  /**
   * 기존 탭 ownership을 건드리지 않고 새 focused window를 만든다.
   * renderer shell만 detached와 공유하고 transfer/tombstone에는 참여하지 않는다.
   */
  createPropertyWindow(
    payload: OpenPropertyWindowPayload,
    sourceWindow: BrowserWindow,
  ): DetachedWindowCreation {
    const tabId = randomUUID();
    const bootstrapId = `standalone:${randomUUID()}`;
    const tab: Tab = {
      schemaVersion: 1,
      id: tabId,
      resourceKey: `entity:property:${payload.propertyId}`,
      kind: 'property',
      title: payload.title,
      route: `/properties/${encodeURIComponent(payload.propertyId)}`,
      createdAt: Date.now(),
    };
    const sourceBounds = sourceWindow.getBounds();
    const workArea = screen.getDisplayMatching(sourceBounds).workArea;
    const width = Math.min(1180, workArea.width);
    const height = Math.min(820, workArea.height);
    const x = Math.min(
      Math.max(sourceBounds.x + 32, workArea.x),
      workArea.x + workArea.width - width,
    );
    const y = Math.min(
      Math.max(sourceBounds.y + 32, workArea.y),
      workArea.y + workArea.height - height,
    );

    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      show: false,
      width,
      height,
      minWidth: Math.min(800, width),
      minHeight: Math.min(600, height),
      x: Math.round(x),
      y: Math.round(y),
      title: `${tab.title} — 에스테잇플로우`,
    });
    this.registerNativeHost(win);
    const acceptance = this.registerStandaloneWindow(win, tab, bootstrapId);
    this.loadDetachedRenderer(win, tab, bootstrapId);
    return { windowId: win.id, acceptance };
  }

  /**
   * 드래그 detach 시작 — 새 detached 창을 즉시 생성하고 마우스 따라다닐 수 있도록 dragState 설정.
   * 기존 createDetachedWindow와 다른 점: 위치 계산이 mouseOffset 기반이라 마우스가 탭 잡은 그 위치에
   * 정확히 대응하도록 새 창이 등장.
   */
  beginDragDetach(
    payload: BeginDragPayload,
    sourceWebContentsId: number,
    sourceWindowId: number,
  ): BeginDragResult {
    if (this.dragState) {
      return { ok: false, error: 'another tab drag is already active' };
    }

    const { tab, pointerScreen, mouseOffset, size, transferId } = payload;
    const isLiveNativeTransfer =
      this.nativeTabs.getHostId(tab.id) === sourceWindowId;
    const transferConflict = this.getTransferConflict(
      transferId,
      sourceWebContentsId,
      sourceWindowId,
      tab.id,
    );
    if (transferConflict) return { ok: false, error: transferConflict };
    const sourceContentBounds =
      BrowserWindow.fromId(sourceWindowId)?.getContentBounds();
    const width =
      size?.width ??
      (isLiveNativeTransfer ? sourceContentBounds?.width : undefined) ??
      1100;
    const height =
      size?.height ??
      (isLiveNativeTransfer ? sourceContentBounds?.height : undefined) ??
      760;

    // 새 창의 좌측 상단 = pointerScreen - mouseOffset
    const x = Math.round(pointerScreen.x - mouseOffset.x);
    const y = Math.round(pointerScreen.y - mouseOffset.y);

    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      // A live native tab must be attached before the OS is allowed to paint
      // the target window. Otherwise the new shell's SplashScreen wins the
      // first composite frame even though the same WebContentsView follows a
      // moment later. Snapshot tabs retain the existing visible drag window.
      show: !isLiveNativeTransfer,
      width,
      height,
      minWidth: 800,
      minHeight: 600,
      x,
      y,
      title: `${tab.title} — 에스테잇플로우`,
      // 드래그 중에 다른 창 위에 떠있도록
      alwaysOnTop: true,
      focusable: false,
    });
    this.registerNativeHost(win);

    // 드래그 중엔 마우스 이벤트를 통과시켜 source 창이 계속 pointermove를 받게 한다.
    // endDrag 시 ignoreMouseEvents(false)로 복구.
    win.setIgnoreMouseEvents(true);

    const acceptance = this.registerDetachedWindow(
      win,
      tab,
      transferId,
      sourceWebContentsId,
      sourceWindowId,
    );
    if (isLiveNativeTransfer) {
      try {
        const contentBounds = win.getContentBounds();
        this.nativeTabs.updateBounds(win.id, {
          x: 0,
          y: DETACHED_TITLEBAR_HEIGHT,
          width: contentBounds.width,
          height: Math.max(
            0,
            contentBounds.height - DETACHED_TITLEBAR_HEIGHT,
          ),
        });
        const move = this.nativeTabs.reparent(tab.id, win.id);
        this.nativeTransferMoves.set(transferId, move);
        this.pushWindowStateToTab(tab.id);
        const transfer = this.transfers.get(transferId);
        if (transfer) transfer.mode = 'native';

        // Keep the source shell focused while dragging, but expose the target
        // immediately after the live view is visible. The detached React shell
        // loads behind this view, so its auth/bootstrap Splash never becomes a
        // user-visible frame.
        win.showInactive();
      } catch (error) {
        this.abortTransfer(transferId);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'failed to move live native tab',
        };
      }
    }
    this.dragState = {
      windowId: win.id,
      transferId,
      sourceWebContentsId,
      mouseOffset,
      recoveryTimer: setTimeout(() => {
        if (this.dragState?.transferId === transferId) this.finishDrag();
      }, DRAG_HARD_TIMEOUT_MS),
    };
    this.loadDetachedRenderer(win, tab, transferId);
    return { ok: true, windowId: win.id, acceptance };
  }

  /**
   * 드래그 중 마우스 좌표(screen 기준)를 받아 dragging 중인 창을 그 좌표로 옮긴다.
   * 새 창의 좌측 상단 = pointerScreen - mouseOffset.
   */
  updateDragPosition(
    payload: DragPositionPayload,
    sourceWebContentsId: number,
  ) {
    if (
      !this.dragState ||
      payload.transferId !== this.dragState.transferId ||
      sourceWebContentsId !== this.dragState.sourceWebContentsId
    ) {
      return;
    }
    const win = BrowserWindow.fromId(this.dragState.windowId);
    if (!win || win.isDestroyed()) {
      this.dragState = null;
      return;
    }
    // payload 방어: undefined/NaN/Infinity가 들어오면 setPosition이 throw하므로 무시.
    if (!isFinitePoint(payload.pointerScreen)) {
      return;
    }
    const offset = this.dragState.mouseOffset;
    if (!offset || !Number.isFinite(offset.x) || !Number.isFinite(offset.y)) {
      return;
    }
    const x = Math.round(payload.pointerScreen.x - offset.x);
    const y = Math.round(payload.pointerScreen.y - offset.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    try {
      win.setPosition(x, y, false);
    } catch {
      // setPosition이 OS 단계에서 거부할 수 있음 (음수/너무 큰 좌표 등). 무시.
    }
  }

  /**
   * 드래그 종료 — alwaysOnTop 해제, ignoreMouseEvents 복구, dragState clear.
   */
  endDrag(transferId: string, sourceWebContentsId: number) {
    if (
      !this.dragState ||
      transferId !== this.dragState.transferId ||
      sourceWebContentsId !== this.dragState.sourceWebContentsId
    ) {
      return;
    }
    this.finishDrag();
  }

  private finishDrag() {
    const dragState = this.dragState;
    if (!dragState) return;
    // Native focus/setter can throw while the target is crashing. Clear the
    // coordinator first so one best-effort failure cannot block future drags.
    this.dragState = null;
    clearTimeout(dragState.recoveryTimer);
    const win = BrowserWindow.fromId(dragState.windowId);
    if (win && !win.isDestroyed()) {
      try {
        win.setIgnoreMouseEvents(false);
      } catch {
        // best effort while the native window is closing
      }
      try {
        win.setAlwaysOnTop(false);
      } catch {
        // best effort while the native window is closing
      }
      try {
        win.setFocusable(true);
      } catch {
        // best effort while the native window is closing
      }
      try {
        win.focus();
      } catch {
        // best effort while the native window is closing
      }
      const activeNativeTabId = this.nativeTabs.getActiveTabId(win.id);
      if (activeNativeTabId) {
        try {
          this.nativeTabs.focus(activeNativeTabId);
        } catch {
          // the view may have crashed between lookup and focus
        }
      }
    }
  }

  private registerStandaloneWindow(
    win: BrowserWindow,
    tab: Tab,
    bootstrapId: string,
  ): Promise<boolean> {
    const webContentsId = win.webContents.id;
    let resolveAcceptance!: (accepted: boolean) => void;
    const acceptance = new Promise<boolean>((resolve) => {
      resolveAcceptance = resolve;
    });
    const pendingTransfer: PendingTransfer = {
      transferId: bootstrapId,
      tabId: tab.id,
      sourceWebContentsId: webContentsId,
      acceptance,
      resolveAcceptance,
      timeout: setTimeout(() => {
        this.settleInitialTransfer(win.id, bootstrapId, false);
      }, TRANSFER_ACCEPT_TIMEOUT_MS),
    };

    this.windows.set(win.id, {
      kind: 'detached',
      bootstrapMode: 'standalone',
      workspacePrincipal: this.authBroker.getSessionPrincipal() ?? undefined,
      workspace: {
        schemaVersion: 1,
        tabs: [tab],
        activeTabId: tab.id,
      },
      transferTabId: tab.id,
      transferId: bootstrapId,
      pendingTransfer,
      // standalone은 source ownership 이전 없이 처음부터 이 창이 소유한다.
      transferCommitted: true,
    });

    win.on('enter-full-screen', () => {
      win.webContents.send('fullscreen-changed', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('fullscreen-changed', false);
    });
    win.webContents.on(
      'did-fail-load',
      (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          this.settleInitialTransfer(win.id, bootstrapId, false);
        }
      },
    );
    win.webContents.on('render-process-gone', () => {
      const wasAccepted =
        this.windows.get(win.id)?.acceptedTransferId === bootstrapId;
      this.handleSourceGone(webContentsId);
      if (!wasAccepted) {
        this.settleInitialTransfer(win.id, bootstrapId, false);
        if (!win.isDestroyed()) win.destroy();
      }
    });
    win.on('closed', () => {
      this.nativeTabs.unregisterHost(win.id);
      this.handleSourceGone(webContentsId);
      this.settleInitialTransfer(win.id, bootstrapId, false);
      this.unregisterAuthShell(webContentsId);
      this.releaseRealtimeAuthority(webContentsId);
      this.nativeViewportRevision.delete(win.id);
      this.rendererSuspendedNativeHosts.delete(win.id);
      this.suspendedNativeHosts.delete(win.id);
      this.globalOverlaySources.delete(win.id);
      this.overlaySuspendedActiveTabs.delete(win.id);
      this.windows.delete(win.id);
    });

    return acceptance;
  }

  private registerDetachedWindow(
    win: BrowserWindow,
    tab: Tab,
    transferId: string,
    sourceWebContentsId: number,
    sourceWindowId: number,
  ): Promise<boolean> {
    const detachedWebContentsId = win.webContents.id;
    let resolveAcceptance!: (accepted: boolean) => void;
    const acceptance = new Promise<boolean>((resolve) => {
      resolveAcceptance = resolve;
    });
    const pendingTransfer: PendingTransfer = {
      transferId,
      tabId: tab.id,
      sourceWebContentsId,
      acceptance,
      resolveAcceptance,
      timeout: setTimeout(() => {
        this.settleInitialTransfer(win.id, transferId, false);
      }, TRANSFER_ACCEPT_TIMEOUT_MS),
    };

    this.windows.set(win.id, {
      kind: 'detached',
      bootstrapMode: 'transfer',
      workspacePrincipal: this.authBroker.getSessionPrincipal() ?? undefined,
      workspace: {
        schemaVersion: 1,
        tabs: [tab],
        activeTabId: tab.id,
      },
      transferTabId: tab.id,
      transferId,
      pendingTransfer,
    });
    this.transfers.set(transferId, {
      transferId,
      tabId: tab.id,
      sourceWebContentsId,
      sourceWindowId,
      targetWindowId: win.id,
      state: 'pending',
      mode: 'snapshot',
    });

    win.on('enter-full-screen', () => {
      win.webContents.send('fullscreen-changed', true);
    });
    win.on('leave-full-screen', () => {
      win.webContents.send('fullscreen-changed', false);
    });
    win.webContents.on(
      'did-fail-load',
      (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          this.settleInitialTransfer(win.id, transferId, false);
        }
      },
    );
    win.webContents.on('render-process-gone', () => {
      const transferWasCommitted =
        this.windows.get(win.id)?.transferCommitted === true;
      if (
        this.dragState?.sourceWebContentsId === detachedWebContentsId ||
        this.dragState?.windowId === win.id
      ) {
        this.finishDrag();
      }
      // 이 창이 다른 transfer의 target이면 live WCV를 source로 먼저 돌려놓는다.
      // source 역할 정리는 그 뒤에 해야 target host unregister/close가 이동 중인
      // WCV를 먼저 파괴하지 않는다.
      this.settleInitialTransfer(win.id, transferId, false);
      this.abortTransfersForTarget(win.id);
      this.handleSourceGone(detachedWebContentsId);
      // ownership 확정 전 target renderer가 죽으면 source가 계속 원본을 소유한다.
      // 깨진 detached shell을 남겨 수동 reload 시 committed=false Splash에
      // 영구 정착하지 않도록 target 창 자체를 종료한다.
      if (!transferWasCommitted && !win.isDestroyed()) win.destroy();
    });
    win.on('closed', () => {
      if (
        this.dragState?.sourceWebContentsId === detachedWebContentsId ||
        this.dragState?.windowId === win.id
      ) {
        this.finishDrag();
      }
      // target rollback이 live view를 source host로 되돌릴 마지막 기회다.
      // unregisterHost는 이 창에 남아 있는 view를 명시적으로 destroy하므로 반드시
      // target transfer를 먼저 중단한다.
      this.settleInitialTransfer(win.id, transferId, false);
      this.abortTransfersForTarget(win.id);
      this.nativeTabs.unregisterHost(win.id);
      this.handleSourceGone(detachedWebContentsId);
      this.unregisterAuthShell(detachedWebContentsId);
      this.releaseRealtimeAuthority(detachedWebContentsId);
      this.nativeViewportRevision.delete(win.id);
      this.rendererSuspendedNativeHosts.delete(win.id);
      this.suspendedNativeHosts.delete(win.id);
      this.globalOverlaySources.delete(win.id);
      this.overlaySuspendedActiveTabs.delete(win.id);
      this.windows.delete(win.id);
    });

    return acceptance;
  }

  private getTransferConflict(
    transferId: string,
    sourceWebContentsId: number,
    sourceWindowId: number,
    tabId: string,
  ): string | null {
    if (this.transfers.has(transferId)) return 'duplicate transfer id';
    if (this.windows.get(sourceWindowId)?.outgoingTabIds?.has(tabId)) {
      return 'this tab has already been transferred';
    }
    const duplicateTabTransfer = [...this.transfers.values()].some(
      (transfer) =>
        transfer.sourceWebContentsId === sourceWebContentsId &&
        transfer.tabId === tabId,
    );
    return duplicateTabTransfer
      ? 'this tab is already being transferred'
      : null;
  }

  private loadDetachedRenderer(
    win: BrowserWindow,
    tab: Tab,
    transferId: string,
  ) {
    const target = rendererUrlFor({ window: 'detached', tabId: tab.id });
    let load: Promise<void> | undefined;
    if (target.isDev && target.url) {
      load = win.loadURL(target.url);
    } else if (target.url) {
      load = win.loadURL(target.url);
    } else if (target.filePath) {
      load = win.loadFile(target.filePath, { hash: target.hash });
    }
    void load?.catch(() => {
      this.settleInitialTransfer(win.id, transferId, false);
    });

    if (!app.isPackaged) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }

  private settleInitialTransfer(
    windowId: number,
    transferId: string,
    accepted: boolean,
  ): boolean {
    const entry = this.windows.get(windowId);
    if (!entry) return false;
    if (entry.acceptedTransferId === transferId) return accepted;
    const pending = entry.pendingTransfer;
    if (!pending || pending.transferId !== transferId) return false;

    clearTimeout(pending.timeout);
    entry.pendingTransfer = undefined;
    const transfer = this.transfers.get(transferId);
    if (accepted) {
      entry.acceptedTransferId = transferId;
      if (transfer) {
        transfer.state = 'accepted';
        transfer.cleanupTimer = setTimeout(() => {
          this.abortTransfer(transferId);
        }, TRANSFER_COMMIT_TIMEOUT_MS);
      }
    } else if (transfer) {
      const needsRecovery = this.rollbackNativeTransferOrPrepareRecovery(transfer);
      if (transfer.cleanupTimer) clearTimeout(transfer.cleanupTimer);
      this.notifyTransferAborted(transfer);
      if (needsRecovery) this.notifyNativeRendererFailedToSource(transfer);
      this.transfers.delete(transferId);
    }
    pending.resolveAcceptance(accepted);
    return true;
  }

  private abortTransfersForTarget(windowId: number) {
    for (const [transferId, transfer] of this.transfers) {
      if (transfer.targetWindowId !== windowId) continue;
      // Ownership is already final. A shell renderer reload/crash must not be
      // mistaken for an in-flight target failure: the child WebContentsView is
      // independent and should survive for the fresh shell to reattach.
      if (transfer.state === 'committed') continue;
      if (transfer.cleanupTimer) clearTimeout(transfer.cleanupTimer);
      if (transfer.finalSnapshot) {
        clearTimeout(transfer.finalSnapshot.timeout);
        transfer.finalSnapshot.resolveAcceptance(false);
      }
      const needsRecovery = this.rollbackNativeTransferOrPrepareRecovery(transfer);
      this.notifyTransferAborted(transfer);
      if (needsRecovery) this.notifyNativeRendererFailedToSource(transfer);
      this.transfers.delete(transferId);
    }
  }

  private abortTransfer(transferId: string) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.state === 'committed') return;
    if (transfer.cleanupTimer) clearTimeout(transfer.cleanupTimer);
    if (transfer.finalSnapshot) {
      clearTimeout(transfer.finalSnapshot.timeout);
      transfer.finalSnapshot.resolveAcceptance(false);
    }
    const needsRecovery = this.rollbackNativeTransferOrPrepareRecovery(transfer);
    this.notifyTransferAborted(transfer);
    if (needsRecovery) this.notifyNativeRendererFailedToSource(transfer);
    this.transfers.delete(transferId);
    this.closeWindow(transfer.targetWindowId);
  }

  private handleSourceGone(sourceWebContentsId: number) {
    for (const transfer of [...this.transfers.values()]) {
      if (
        transfer.sourceWebContentsId !== sourceWebContentsId ||
        transfer.state === 'committed'
      ) {
        continue;
      }
      if (transfer.state === 'accepted') {
        if (transfer.finalSnapshot) {
          void transfer.finalSnapshot.acceptance.then((accepted) => {
            const stillCurrent =
              this.transfers.get(transfer.transferId) === transfer;
            const target = BrowserWindow.fromId(transfer.targetWindowId);
            if (
              accepted &&
              stillCurrent &&
              transfer.state === 'accepted' &&
              target &&
              !target.isDestroyed()
            ) {
              this.markTransferCommitted(transfer);
            } else if (!accepted && stillCurrent) {
              this.abortTransfer(transfer.transferId);
            }
          });
        } else {
          this.markTransferCommitted(transfer);
        }
      } else {
        this.abortTransfer(transfer.transferId);
      }
    }
  }

  private markTransferCommitted(transfer: TransferRecord) {
    if (transfer.state === 'committed') return;
    if (transfer.cleanupTimer) clearTimeout(transfer.cleanupTimer);
    const targetEntry = this.windows.get(transfer.targetWindowId);
    if (transfer.mode === 'native') {
      const liveTab = this.nativeTabs.getTabSnapshot(transfer.tabId);
      if (liveTab) {
        transfer.appliedTab = liveTab;
        transfer.appliedSnapshotFingerprint = tabSnapshotFingerprint(liveTab);
        if (targetEntry?.workspace) {
          targetEntry.workspace = {
            ...targetEntry.workspace,
            tabs: targetEntry.workspace.tabs.map((tab) =>
              tab.id === liveTab.id ? liveTab : tab,
            ),
          };
        }
      }
    }
    transfer.state = 'committed';
    const nativeMove = this.nativeTransferMoves.get(transfer.transferId);
    if (nativeMove) this.nativeTabs.settleMove(nativeMove);
    this.nativeTransferMoves.delete(transfer.transferId);
    if (targetEntry) targetEntry.transferCommitted = true;
    const target = BrowserWindow.fromId(transfer.targetWindowId);
    const committedTab =
      transfer.appliedTab ??
      targetEntry?.workspace?.tabs.find((tab) => tab.id === transfer.tabId);
    if (target && !target.isDestroyed() && committedTab) {
      target.webContents.send('tabs:transferCommitted', {
        transferId: transfer.transferId,
        tab: committedTab,
      });
    }

    // detached source가 commit 직후 reload/crash해도 outgoing 탭을 다시 복원하지 않는다.
    const sourceEntry = this.windows.get(transfer.sourceWindowId);
    if (sourceEntry) {
      sourceEntry.outgoingTabIds ??= new Set<string>();
      sourceEntry.outgoingTabIds.add(transfer.tabId);
    }
    if (sourceEntry?.workspace) {
      const tabs = sourceEntry.workspace.tabs.filter(
        (tab) => tab.id !== transfer.tabId,
      );
      const activeTabId =
        sourceEntry.workspace.activeTabId === transfer.tabId
          ? (tabs[0]?.id ?? null)
          : sourceEntry.workspace.activeTabId;
      sourceEntry.workspace = {
        schemaVersion: 1,
        tabs,
        activeTabId,
      };
    }

    transfer.cleanupTimer = setTimeout(() => {
      this.transfers.delete(transfer.transferId);
    }, COMMITTED_TRANSFER_TTL_MS);
  }

  private rollbackNativeTransfer(transferId: string): boolean {
    const move = this.nativeTransferMoves.get(transferId);
    if (!move) return false;
    try {
      const rolledBack = this.nativeTabs.rollback(move);
      if (rolledBack) this.pushWindowStateToTab(move.tabId);
      if (
        rolledBack &&
        this.rendererSuspendedNativeHosts.has(move.sourceHostId)
      ) {
        try {
          this.nativeTabs.activate(move.sourceHostId, null);
        } catch {
          // source host도 같은 turn에 종료되면 closed cleanup이 소유권을 정리한다.
        }
      }
      return rolledBack;
    } finally {
      this.nativeTransferMoves.delete(transferId);
    }
  }

  private rollbackNativeTransferOrPrepareRecovery(
    transfer: TransferRecord,
  ): boolean {
    if (transfer.mode !== 'native') return false;
    const rolledBack = this.rollbackNativeTransfer(transfer.transferId);
    if (rolledBack) return false;
    const currentHostId = this.nativeTabs.getHostId(transfer.tabId);
    if (currentHostId === transfer.sourceWindowId) return false;
    const snapshot =
      this.nativeTabs.getTabSnapshot(transfer.tabId) ?? transfer.appliedTab;
    if (snapshot) {
      transfer.appliedTab = snapshot;
      transfer.appliedSnapshotFingerprint = tabSnapshotFingerprint(snapshot);
    }
    if (currentHostId !== null) this.nativeTabs.close(transfer.tabId);
    return true;
  }

  private notifyNativeRendererFailedToSource(transfer: TransferRecord): void {
    const source = webContents.fromId(transfer.sourceWebContentsId);
    if (!source || source.isDestroyed()) return;
    try {
      const update: NativeTabLifecycleUpdate = {
        tabId: transfer.tabId,
        status: 'renderer-failed',
      };
      source.send('tabs:nativeTabLifecycle', update);
    } catch {
      // Source reload/close will reconstruct from the updated workspace snapshot.
    }
  }

  private notifyTransferAborted(transfer: TransferRecord): void {
    const authoritativeTab =
      this.nativeTabs.getTabSnapshot(transfer.tabId) ??
      transfer.appliedTab ??
      undefined;
    const sourceEntry = this.windows.get(transfer.sourceWindowId);
    if (authoritativeTab && sourceEntry?.workspace) {
      sourceEntry.workspace = {
        ...sourceEntry.workspace,
        tabs: sourceEntry.workspace.tabs.map((tab) =>
          tab.id === authoritativeTab.id ? authoritativeTab : tab,
        ),
      };
    }
    const source = webContents.fromId(transfer.sourceWebContentsId);
    if (!source || source.isDestroyed()) return;
    const payload: TabTransferAborted = {
      transferId: transfer.transferId,
      tabId: transfer.tabId,
      tab: authoritativeTab,
    };
    source.send('tabs:transferAborted', payload);
  }

  acceptInitialTab(windowId: number, ack: InitialTabTransferAck): boolean {
    const entry = this.windows.get(windowId);
    if (
      !entry ||
      entry.kind !== 'detached' ||
      entry.transferId !== ack.transferId ||
      entry.transferTabId !== ack.tabId
    ) {
      return false;
    }
    if (entry.acceptedTransferId === ack.transferId) return ack.accepted;
    return this.settleInitialTransfer(windowId, ack.transferId, ack.accepted);
  }

  acceptTransferSnapshot(
    windowId: number,
    ack: FinalTabTransferSnapshotAck,
  ): boolean {
    const transfer = this.transfers.get(ack.transferId);
    const pending = transfer?.finalSnapshot;
    if (
      transfer &&
      !pending &&
      transfer.targetWindowId === windowId &&
      transfer.tabId === ack.tabId &&
      transfer.appliedSnapshotId === ack.snapshotId
    ) {
      return ack.accepted;
    }
    if (
      !transfer ||
      !pending ||
      transfer.targetWindowId !== windowId ||
      transfer.tabId !== ack.tabId ||
      pending.tab.id !== ack.tabId ||
      pending.snapshotId !== ack.snapshotId
    ) {
      return false;
    }

    clearTimeout(pending.timeout);
    transfer.finalSnapshot = undefined;
    if (ack.accepted) {
      transfer.appliedSnapshotFingerprint = pending.fingerprint;
      transfer.appliedSnapshotId = pending.snapshotId;
      transfer.appliedTab = pending.tab;
      const targetEntry = this.windows.get(windowId);
      if (targetEntry?.workspace) {
        targetEntry.workspace = {
          ...targetEntry.workspace,
          tabs: targetEntry.workspace.tabs.map((tab) =>
            tab.id === pending.tab.id ? pending.tab : tab,
          ),
        };
      }
    }
    pending.resolveAcceptance(ack.accepted);
    return true;
  }

  private requestFinalSnapshot(
    transfer: TransferRecord,
    tab: Tab,
  ): Promise<boolean> {
    const fingerprint = tabSnapshotFingerprint(tab);
    if (transfer.appliedSnapshotFingerprint === fingerprint) {
      return Promise.resolve(true);
    }
    if (transfer.finalSnapshot) {
      return transfer.finalSnapshot.fingerprint === fingerprint
        ? transfer.finalSnapshot.acceptance
        : Promise.resolve(false);
    }

    const target = BrowserWindow.fromId(transfer.targetWindowId);
    const targetEntry = this.windows.get(transfer.targetWindowId);
    if (!target || target.isDestroyed() || !targetEntry?.workspace) {
      return Promise.resolve(false);
    }

    // renderer가 reload되더라도 최신 snapshot을 읽도록 main copy부터 갱신한다.
    targetEntry.workspace = {
      ...targetEntry.workspace,
      tabs: targetEntry.workspace.tabs.map((candidate) =>
        candidate.id === tab.id ? tab : candidate,
      ),
    };

    let resolveAcceptance!: (accepted: boolean) => void;
    const acceptance = new Promise<boolean>((resolve) => {
      resolveAcceptance = resolve;
    });
    const pending: PendingFinalSnapshot = {
      snapshotId: randomUUID(),
      tab,
      fingerprint,
      acceptance,
      resolveAcceptance,
      timeout: setTimeout(() => {
        if (transfer.finalSnapshot !== pending) return;
        transfer.finalSnapshot = undefined;
        resolveAcceptance(false);
      }, FINAL_SNAPSHOT_ACCEPT_TIMEOUT_MS),
    };
    transfer.finalSnapshot = pending;
    target.webContents.send('tabs:applyTransferSnapshot', {
      transferId: transfer.transferId,
      snapshotId: pending.snapshotId,
      tab,
    });
    return acceptance;
  }

  async prepareTransferSnapshot(
    sourceWebContentsId: number,
    commit: CommitTabTransfer,
  ): Promise<boolean> {
    const transfer = this.transfers.get(commit.transferId);
    if (
      !transfer ||
      transfer.state !== 'accepted' ||
      transfer.sourceWebContentsId !== sourceWebContentsId ||
      transfer.tabId !== commit.tab.id
    ) {
      return false;
    }
    const target = BrowserWindow.fromId(transfer.targetWindowId);
    if (!target || target.isDestroyed()) {
      this.abortTransfersForTarget(transfer.targetWindowId);
      return false;
    }

    const authoritativeTab =
      transfer.mode === 'native'
        ? (this.nativeTabs.getTabSnapshot(transfer.tabId) ?? commit.tab)
        : commit.tab;
    const snapshotAccepted = await this.requestFinalSnapshot(
      transfer,
      authoritativeTab,
    );
    if (!snapshotAccepted) {
      if (this.transfers.get(transfer.transferId) === transfer) {
        this.abortTransfer(transfer.transferId);
      }
      return false;
    }
    if (
      this.transfers.get(transfer.transferId) !== transfer ||
      transfer.state !== 'accepted'
    ) {
      return false;
    }
    const currentTarget = BrowserWindow.fromId(transfer.targetWindowId);
    if (!currentTarget || currentTarget.isDestroyed()) return false;
    return true;
  }

  commitTransfer(
    sourceWebContentsId: number,
    commit: CommitTabTransfer,
  ): boolean {
    const transfer = this.transfers.get(commit.transferId);
    if (
      transfer?.mode === 'native' &&
      transfer.state === 'committed' &&
      transfer.sourceWebContentsId === sourceWebContentsId &&
      transfer.tabId === commit.tab.id
    ) {
      // IPC 응답 유실 retry. ownership이 이미 확정된 뒤 live renderer가 route를
      // 바꿨더라도 이전 fingerprint와 비교해 실패시키면 source가 중복 보유한다.
      return true;
    }
    if (
      transfer?.mode === 'native' &&
      transfer.state === 'accepted' &&
      transfer.sourceWebContentsId === sourceWebContentsId &&
      transfer.tabId === commit.tab.id &&
      !transfer.finalSnapshot
    ) {
      const target = BrowserWindow.fromId(transfer.targetWindowId);
      const targetEntry = this.windows.get(transfer.targetWindowId);
      const latestTab = this.nativeTabs.getTabSnapshot(transfer.tabId);
      if (
        !target ||
        target.isDestroyed() ||
        !targetEntry?.workspace ||
        !latestTab
      ) {
        this.abortTransfersForTarget(transfer.targetWindowId);
        return false;
      }

      // Native mode에서는 같은 WebContents가 target에 이미 붙어 있어 그 자체가
      // authoritative state다. prepare ACK와 commit 사이의 navigation을 여기서 한 번
      // 더 읽고, main event-loop의 같은 turn 안에서 workspace 갱신과 ownership commit을
      // 끝낸다. snapshot fingerprint TOCTOU 때문에 정상 분리가 실패하지 않는다.
      transfer.appliedTab = latestTab;
      transfer.appliedSnapshotFingerprint = tabSnapshotFingerprint(latestTab);
      targetEntry.workspace = {
        ...targetEntry.workspace,
        tabs: targetEntry.workspace.tabs.map((tab) =>
          tab.id === latestTab.id ? latestTab : tab,
        ),
      };
      this.markTransferCommitted(transfer);
      return true;
    }
    const authoritativeTab =
      transfer?.mode === 'native'
        ? (this.nativeTabs.getTabSnapshot(commit.tab.id) ??
          transfer.appliedTab ??
          commit.tab)
        : commit.tab;
    const fingerprint = tabSnapshotFingerprint(authoritativeTab);
    if (
      transfer?.state === 'committed' &&
      transfer.sourceWebContentsId === sourceWebContentsId &&
      transfer.tabId === commit.tab.id &&
      transfer.appliedSnapshotFingerprint === fingerprint
    ) {
      return true;
    }
    if (
      !transfer ||
      transfer.state !== 'accepted' ||
      transfer.sourceWebContentsId !== sourceWebContentsId ||
      transfer.tabId !== commit.tab.id ||
      transfer.finalSnapshot ||
      transfer.appliedSnapshotFingerprint !== fingerprint
    ) {
      return false;
    }
    const target = BrowserWindow.fromId(transfer.targetWindowId);
    if (!target || target.isDestroyed()) {
      this.abortTransfersForTarget(transfer.targetWindowId);
      return false;
    }

    this.markTransferCommitted(transfer);
    return true;
  }

  private applyWindowWorkspace(
    entry: WindowEntry,
    workspace: TabWorkspaceSnapshot,
  ): void {
    const incomingIds = new Set(workspace.tabs.map((tab) => tab.id));
    const outgoingTabIds = entry.outgoingTabIds;

    if (outgoingTabIds) {
      // source renderer가 실제 삭제를 반영한 snapshot을 보낸 뒤에만 tombstone을
      // 해제한다. 그 전의 늦은 snapshot은 이동한 탭을 다시 복원하지 못한다.
      for (const tabId of [...outgoingTabIds]) {
        if (!incomingIds.has(tabId)) outgoingTabIds.delete(tabId);
      }
      if (outgoingTabIds.size === 0) entry.outgoingTabIds = undefined;
    }

    const activeTombstones = entry.outgoingTabIds;
    const tabs = activeTombstones
      ? workspace.tabs.filter((tab) => !activeTombstones.has(tab.id))
      : workspace.tabs;
    const activeTabId = tabs.some((tab) => tab.id === workspace.activeTabId)
      ? workspace.activeTabId
      : (tabs[0]?.id ?? null);
    entry.workspace = {
      schemaVersion: 1,
      tabs,
      activeTabId,
    };
  }

  syncWindowTabs(
    windowId: number,
    shellWebContentsId: number,
    owner: WindowWorkspaceOwner,
    workspace: TabWorkspaceSnapshot,
  ): boolean {
    const entry = this.windows.get(windowId);
    const principal = windowWorkspaceOwnerKey(owner);
    if (
      !entry ||
      entry.kind !== 'detached' ||
      !entry.acceptedTransferId ||
      !this.authBroker.isShellAuthenticated(shellWebContentsId) ||
      this.authBroker.getSessionPrincipal() !== principal
    ) {
      return false;
    }
    entry.workspacePrincipal = principal;
    this.applyWindowWorkspace(entry, workspace);
    return true;
  }

  syncMainWindowWorkspace(
    windowId: number,
    owner: WindowWorkspaceOwner,
    workspace: TabWorkspaceSnapshot,
  ): boolean {
    const entry = this.windows.get(windowId);
    const principal = windowWorkspaceOwnerKey(owner);
    if (
      !entry ||
      entry.kind !== 'main' ||
      this.authBroker.getSessionPrincipal() !== principal
    ) {
      return false;
    }
    entry.workspacePrincipal = principal;
    this.applyWindowWorkspace(entry, workspace);
    return true;
  }

  getMainWindowWorkspace(
    windowId: number,
    owner: WindowWorkspaceOwner,
  ): TabWorkspaceSnapshot | null {
    const entry = this.windows.get(windowId);
    const principal = windowWorkspaceOwnerKey(owner);
    if (
      !entry?.workspace ||
      entry.kind !== 'main' ||
      entry.workspacePrincipal !== principal ||
      this.authBroker.getSessionPrincipal() !== principal
    ) {
      return null;
    }
    return structuredClone(entry.workspace);
  }

  closeWindow(windowId: number) {
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) win.close();
  }

  hasWindow(windowId: number): boolean {
    return this.windows.has(windowId);
  }

  hasUnsavedNativeTabWork(windowId: number, tabId: string): boolean {
    return this.nativeTabs.hasUnsavedWork(windowId, tabId);
  }

  getKind(windowId: number): WindowKind | null {
    return this.windows.get(windowId)?.kind ?? null;
  }

  getInitialTab(
    windowId: number,
    owner: WindowWorkspaceOwner,
  ): InitialTabTransfer | null {
    const entry = this.windows.get(windowId);
    const globalPrincipal = this.authBroker.getSessionPrincipal();
    const requestedPrincipal = windowWorkspaceOwnerKey(owner);
    if (
      !entry?.workspace ||
      !entry.transferId ||
      !entry.transferTabId ||
      !globalPrincipal ||
      requestedPrincipal !== globalPrincipal ||
      entry.workspacePrincipal !== requestedPrincipal
    ) return null;
    return {
      transferId: entry.transferId,
      transferTabId: entry.transferTabId,
      workspace: entry.workspace,
      committed: entry.transferCommitted ?? false,
    };
  }

  getMainWindow(): BrowserWindow | null {
    if (this.mainWindowId == null) return null;
    return BrowserWindow.fromId(this.mainWindowId) ?? null;
  }

  setMainOverlayVisible(
    source: GlobalOverlaySource,
    visible: boolean,
  ): void {
    const main = this.getMainWindow();
    if (main) this.setGlobalOverlayVisible(main.id, source, visible);
  }

  async syncNativeViewport(
    windowId: number,
    payload: NativeTabViewportPayload,
  ): Promise<NativeTabViewportResult> {
    if (!this.windows.has(windowId)) {
      return { ok: false, error: 'unregistered native tab host' };
    }
    if (this.rendererSuspendedNativeHosts.has(windowId)) {
      return { ok: false, error: 'native tab host renderer is suspended' };
    }
    const revision = (this.nativeViewportRevision.get(windowId) ?? 0) + 1;
    this.nativeViewportRevision.set(windowId, revision);
    const entry = this.windows.get(windowId);
    if (entry) entry.nativeViewportLeaseId = payload.leaseId;

    try {
      this.nativeTabs.updateBounds(windowId, payload.bounds);
      const wanted = new Set(payload.nativeTabIds);
      for (const tabId of this.nativeTabs.getTabIds(windowId)) {
        if (!wanted.has(tabId)) this.nativeTabs.close(tabId);
      }

      if (this.suspendedNativeHosts.has(windowId)) {
        this.nativeTabs.activate(windowId, null);
        return { ok: true, mountedTabId: null };
      }

      if (!payload.activeTab) {
        this.nativeTabs.activate(windowId, null);
        return { ok: true, mountedTabId: null };
      }

      const previousActiveTabId = this.nativeTabs.getActiveTabId(windowId);
      if (
        previousActiveTabId !== null &&
        previousActiveTabId !== payload.activeTab.id
      ) {
        this.nativeTabs.activate(windowId, null);
      }
      const opened = await this.nativeTabs.openOrUpdateTab(
        windowId,
        payload.activeTab,
        {
          activate: false,
          retainUntilActivation: true,
        },
      );
      try {
        if (this.nativeViewportRevision.get(windowId) !== revision) {
          return {
            ok: true,
            mountedTabId: this.nativeTabs.getActiveTabId(windowId),
          };
        }
        this.nativeTabs.activate(windowId, payload.activeTab.id);
        return { ok: true, mountedTabId: payload.activeTab.id };
      } finally {
        if (opened.activationLease) {
          this.nativeTabs.releaseActivationLease(opened.activationLease);
        }
      }
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'native tab viewport failed',
      };
    }
  }

  releaseNativeViewport(
    windowId: number,
    payload: NativeTabViewportReleasePayload,
  ): void {
    const entry = this.windows.get(windowId);
    if (!entry || entry.nativeViewportLeaseId !== payload.leaseId) return;
    setTimeout(() => {
      const current = this.windows.get(windowId);
      if (!current || current.nativeViewportLeaseId !== payload.leaseId) return;
      current.nativeViewportLeaseId = undefined;
      this.nativeTabs.activate(windowId, null);
      // The current lease is authoritative for the entire viewport. Close the
      // main-owned host projection, not a potentially stale renderer list.
      for (const tabId of this.nativeTabs.getTabIds(windowId)) {
        this.nativeTabs.close(tabId);
      }
    }, 0);
  }

  setGlobalOverlayVisible(
    windowId: number,
    source: GlobalOverlaySource,
    visible: boolean,
  ): void {
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed() || !this.windows.has(windowId)) return;
    const sources =
      this.globalOverlaySources.get(windowId) ?? new Set<GlobalOverlaySource>();
    const wasVisible = sources.size > 0;
    if (visible) sources.add(source);
    else sources.delete(source);
    if (sources.size > 0) this.globalOverlaySources.set(windowId, sources);
    else this.globalOverlaySources.delete(windowId);
    const isVisible = sources.size > 0;
    if (wasVisible === isVisible) return;

    if (isVisible) {
      if (!this.suspendedNativeHosts.has(windowId)) {
        const activeTabId = this.nativeTabs.getActiveTabId(windowId);
        this.overlaySuspendedActiveTabs.set(windowId, activeTabId);
        if (activeTabId) {
          this.nativeTabs.setTabProtection(activeTabId, 'suspended', true);
        }
      }
      this.suspendedNativeHosts.add(windowId);
      this.nativeViewportRevision.set(
        windowId,
        (this.nativeViewportRevision.get(windowId) ?? 0) + 1,
      );
      try {
        this.nativeTabs.activate(windowId, null);
      } catch {
        // host가 동시에 종료 중이면 closed cleanup이 처리한다.
      }
    } else {
      this.suspendedNativeHosts.delete(windowId);
      const wanted = this.overlaySuspendedActiveTabs.get(windowId) ?? null;
      this.overlaySuspendedActiveTabs.delete(windowId);
      if (
        !this.rendererSuspendedNativeHosts.has(windowId) &&
        wanted &&
        this.nativeTabs.getHostId(wanted) === windowId
      ) {
        try {
          this.nativeTabs.activate(windowId, wanted);
        } catch {
          // shell viewport sync가 authoritative recovery를 이어서 수행한다.
        }
      }
      if (wanted) {
        this.nativeTabs.setTabProtection(wanted, 'suspended', false);
      }
    }
  }

  publishAuthSession(
    shellWebContentsId: number,
    snapshot: Omit<DesktopAuthSessionSnapshot, 'revision'>,
  ): DesktopAuthSessionSnapshot | null {
    const previous = this.authBroker.getSession();
    const published = this.authBroker.publishSession(
      shellWebContentsId,
      snapshot,
    );
    if (!published) return null;

    const principalOf = (snapshot: DesktopAuthSessionSnapshot) => {
      if (!snapshot.authenticated || !isRecord(snapshot.user)) return null;
      const userId = snapshot.user.id;
      const office = snapshot.user.office;
      const officeId = isRecord(office) ? office.id : null;
      return typeof userId === 'string'
        ? `${userId}\u0000${typeof officeId === 'string' ? officeId : ''}`
        : null;
    };
    const principalChanged = principalOf(previous) !== principalOf(published);
    if (principalChanged) {
      this.realtimeBroker.revokeOwner();
      this.publishRealtimeAuthority();
      // A live view owns DOM/query state. Never carry it across tenants or a
      // logout boundary; shell stores will be recreated by the auth layout.
      this.nativeTabs.clearTabs();
      this.callOverlays.destroyAll();
      for (const entry of this.windows.values()) {
        entry.workspace = undefined;
        entry.workspacePrincipal = undefined;
        entry.outgoingTabIds?.clear();
      }
      for (const transfer of [...this.transfers.values()]) {
        if (transfer.state !== 'committed') this.abortTransfer(transfer.transferId);
      }
    }

    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.id === shellWebContentsId)
        continue;
      try {
        win.webContents.send('auth:session', published);
      } catch {
        // One crashed shell must not prevent healthy/native recipients.
      }
    }
    this.nativeTabs.broadcast('auth:session', published);
    this.reconcileRealtimeAuthority();
    if (
      published.authenticated &&
      this.pendingSignOut?.shellWebContentsId === -1
    ) {
      this.dispatchPendingSignOut(this.pendingSignOut);
    }
    return published;
  }

  private suspendAuthShell(shellWebContentsId: number): void {
    this.authBroker.suspendShell(shellWebContentsId);
    const pending = this.pendingSignOut;
    if (
      !pending ||
      (pending.shellWebContentsId !== shellWebContentsId &&
        pending.shellWebContentsId !== -1)
    ) {
      return;
    }

    // The old renderer can no longer ACK. Its replacement may keep the same
    // webContents id, so make that id eligible again after it republishes the
    // same principal; if another shell is ready, dispatch switches now.
    pending.shellWebContentsId = -1;
    pending.attemptedShellIds.delete(shellWebContentsId);
    this.dispatchPendingSignOut(pending);
  }

  private unregisterAuthShell(shellWebContentsId: number): void {
    const pending = this.pendingSignOut;
    const shouldRedispatch = Boolean(
      pending &&
        (pending.shellWebContentsId === shellWebContentsId ||
          pending.shellWebContentsId === -1),
    );
    if (shouldRedispatch && pending) pending.shellWebContentsId = -1;
    const changedSession = this.authBroker.unregister(shellWebContentsId);
    if (shouldRedispatch && pending) this.dispatchPendingSignOut(pending);
    if (!changedSession) return;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send('auth:session', changedSession);
      } catch {
        // render-process-gone can precede BrowserWindow destruction.
      }
    }
    this.nativeTabs.broadcast('auth:session', changedSession);
    this.reconcileRealtimeAuthority();
  }

  getAuthSession(): DesktopAuthSessionSnapshot {
    return this.authBroker.getSession();
  }

  /**
   * Auth0 모드: 토큰 주인은 main이다. 다만 토큰은 "화면에 보이는 계정의 세션"에만
   * 준다. 다른 창의 로그아웃·로그인으로 main 세션이 바뀐 뒤에 예전 계정을 보여
   * 주는 화면이 새 계정 토큰으로 요청하지 않게 하기 위해서다.
   * - 셸: 자기가 확인한 세션 번호를 보내고, 현재 번호와 같을 때만 받는다.
   *   (/auth/me 전에도 이 번호로 받을 수 있어 broker 세션을 기다리지 않는다.)
   * - 탭 화면·팝업 층: broker에 알려진 세션 번호가 현재 번호와 같을 때만 받는다.
   */
  async requestAuthToken(
    senderWebContentsId: number,
    scopeSessionId: number | null,
  ): Promise<string | null> {
    const providerAuth = this.providerAuth;
    if (!providerAuth) return this.authBroker.requestToken();

    const expected = expectedTokenSessionId({
      fromShell: this.isWindowShellSender(senderWebContentsId),
      shellScopeSessionId: scopeSessionId,
      brokerSessionId: this.brokerProviderSessionId(),
    });
    if (!mayReceiveToken(expected, providerAuth.sessionId())) return null;
    const token = await providerAuth.getAccessToken();
    // 갱신을 기다리는 사이 로그아웃·재로그인했으면 주지 않는다.
    return mayReceiveToken(expected, providerAuth.sessionId()) ? token : null;
  }

  private brokerProviderSessionId(): number | null {
    const session = this.authBroker.getSession();
    return session.authenticated && typeof session.providerSessionId === 'number'
      ? session.providerSessionId
      : null;
  }

  getAuthProvider(): DesktopAuthProviderKind {
    return AUTH_PROVIDER;
  }

  async getProviderAuthState(): Promise<DesktopProviderAuthState> {
    if (!this.providerAuth) {
      return { provider: AUTH_PROVIDER, hasSession: false, sessionId: null };
    }
    const hasSession = await this.providerAuth.hasSession();
    return {
      provider: AUTH_PROVIDER,
      hasSession,
      sessionId: this.providerAuth.sessionId(),
    };
  }

  /**
   * 셸의 로그인 화면이 받은 아이디·비밀번호로 Auth0 로그인한다. 비밀번호는
   * 이 호출 안에서만 쓰고 남기지 않는다. 성공하면 셸이 /auth/me로 이어 간다.
   */
  async loginWithProvider(
    credentials: DesktopProviderCredentials,
  ): Promise<DesktopProviderLoginResult> {
    if (!this.providerAuth) {
      return { ok: false, error: 'Auth0 로그인이 꺼져 있습니다.' };
    }
    try {
      await this.providerAuth.loginWithPassword(
        credentials.username,
        credentials.password,
      );
      return { ok: true };
    } catch (error) {
      const loginError = toLoginError(error);
      if (loginError.reason === 'already-signed-in') {
        return { ok: false, error: loginError.message, alreadySignedIn: true };
      }
      if (loginError.reason !== 'invalid-credentials') {
        console.warn('[auth0] login failed', loginError.reason, error);
      }
      return { ok: false, error: loginError.message };
    }
  }

  /**
   * 셸의 로그아웃 처리 중에 부른다. 셸이 보여 주는 계정의 세션(sessionId)이 지금
   * 세션일 때만 main의 refresh token을 지우고 Auth0에서도 폐기한다.
   */
  async logoutProvider(sessionId: number | null): Promise<void> {
    if (sessionId === null) return;
    await this.providerAuth?.logout(sessionId);
  }

  private createAuth0Session(): Auth0DesktopSession {
    return new Auth0DesktopSession({
      config: resolveAuth0DesktopConfig(process.env),
      store: new SafeStorageAuth0TokenStore(),
      onSessionEnded: () => this.handleProviderSessionEnded(),
      onSessionChanged: (sessionId) => this.broadcastToShells(
        'auth:providerSessionChanged',
        { sessionId },
      ),
    });
  }

  /**
   * refresh token이 거절됐다(만료·폐기·직원 차단). 셸들이 화면을 로그아웃 상태로
   * 바꾸고 broker에도 로그아웃을 알리게 한다.
   */
  private handleProviderSessionEnded(): void {
    this.broadcastToShells('auth:providerSessionEnded');
  }

  private broadcastToShells(channel: string, payload?: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || !this.isWindowShellSender(win.webContents.id)) {
        continue;
      }
      try {
        win.webContents.send(channel, payload);
      } catch {
        // 닫히는 중인 셸은 다시 열릴 때 main 세션을 새로 확인한다.
      }
    }
  }

  acceptAuthToken(
    shellWebContentsId: number,
    response: DesktopAuthTokenResponse,
  ): boolean {
    return this.authBroker.acceptToken(shellWebContentsId, response);
  }

  isRegisteredShellSender(senderWebContentsId: number): boolean {
    const contents = webContents.fromId(senderWebContentsId);
    if (!contents || contents.isDestroyed()) return false;
    const win = BrowserWindow.fromWebContents(contents);
    return Boolean(
      win &&
      this.windows.has(win.id) &&
      isTrustedRendererDocumentUrl(contents.getURL()),
    );
  }

  /**
   * 창 자체의 화면(셸)인지. 창에 붙은 탭 화면(WebContentsView)도
   * BrowserWindow.fromWebContents로는 그 창을 돌려주므로 isRegisteredShellSender만으로는
   * 셸과 구별되지 않는다. Auth0 로그인·로그아웃·세션 번호 토큰은 셸만 쓰게 한다.
   */
  isWindowShellSender(senderWebContentsId: number): boolean {
    if (!this.isRegisteredShellSender(senderWebContentsId)) return false;
    const contents = webContents.fromId(senderWebContentsId);
    const win = contents ? BrowserWindow.fromWebContents(contents) : null;
    return win?.webContents.id === senderWebContentsId;
  }

  isRegisteredSender(senderWebContentsId: number): boolean {
    return (
      this.isRegisteredShellSender(senderWebContentsId) ||
      this.isAuthorizedNativeSender(senderWebContentsId)
    );
  }

  /** 전화 수신 팝업 층의 WebContents. 로그인 정보와 데이터 갱신 신호만 쓴다. */
  isCallOverlaySender(senderWebContentsId: number): boolean {
    const contents = webContents.fromId(senderWebContentsId);
    return Boolean(
      contents &&
        !contents.isDestroyed() &&
        this.callOverlays.isOverlaySender(senderWebContentsId) &&
        isTrustedRendererDocumentUrl(contents.getURL()),
    );
  }

  isAuthorizedNativeSender(senderWebContentsId: number): boolean {
    if (this.isCallOverlaySender(senderWebContentsId)) return true;
    const contents = webContents.fromId(senderWebContentsId);
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    if (
      !contents ||
      contents.isDestroyed() ||
      (!identity && !this.nativeTabs.isSpareSender(senderWebContentsId))
    ) {
      return false;
    }
    const route = internalHrefFromRendererUrl(contents.getURL());
    return Boolean(route && resolveNativeTabRoute(route));
  }

  getNativeTabSnapshot(senderWebContentsId: number): Tab | null {
    return this.nativeTabs.lookupSender(senderWebContentsId)?.tab ?? null;
  }

  /**
   * 탭 화면이 요청한 탭 작업을 그 탭을 가진 셸 창으로 보낸다.
   * 대상 탭은 보낸 쪽 WebContents로 정해지므로 다른 탭을 건드릴 수 없다.
   * 입력 초안은 main 사본에도 반영해 창 이동·화면 내리기 뒤에도 남게 한다.
   */
  forwardNativeTabAction(
    senderWebContentsId: number,
    action: NativeTabAction,
  ): boolean {
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    if (!identity) return false;
    if (
      action.type === 'update-form-draft' ||
      action.type === 'clear-form-draft'
    ) {
      const { formDraft: currentDraft, ...restUiState } =
        identity.tab.uiState ?? {};
      const formDraft =
        action.type === 'update-form-draft'
          ? { ...currentDraft, [action.key]: action.value }
          : undefined;
      const uiState = formDraft ? { ...restUiState, formDraft } : restUiState;
      const updated = this.nativeTabs.updateTabSnapshot(senderWebContentsId, {
        ...identity.tab,
        uiState: Object.keys(uiState).length > 0 ? uiState : undefined,
      });
      const entry = this.windows.get(identity.hostId);
      if (updated && entry?.workspace) {
        entry.workspace = {
          ...entry.workspace,
          tabs: entry.workspace.tabs.map((tab) =>
            tab.id === updated.tabId ? { ...tab, uiState: updated.tab.uiState } : tab,
          ),
        };
      }
    }
    const host = BrowserWindow.fromId(identity.hostId);
    if (
      !host ||
      host.isDestroyed() ||
      !this.isRegisteredShellSender(host.webContents.id)
    ) {
      return false;
    }
    const envelope: NativeTabActionEnvelope = { tabId: identity.tabId, action };
    host.webContents.send('tabs:nativeTabAction', envelope);
    return true;
  }

  /** 셸 또는 탭 화면이 속한 창의 사이드바 상태. 처음 여는 창은 마지막 선택을 따른다. */
  getSidebarStateForSender(senderWebContentsId: number): NativeSidebarState {
    const windowId = this.isRegisteredShellSender(senderWebContentsId)
      ? this.windowIdForShellSender(senderWebContentsId)
      : (this.nativeTabs.lookupSender(senderWebContentsId)?.hostId ?? null);
    return { open: this.sidebarOpenFor(windowId) };
  }

  setWindowSidebarOpen(windowId: number, open: boolean): void {
    const entry = this.windows.get(windowId);
    if (!entry) return;
    entry.sidebarOpen = open;
    this.lastSidebarOpen = open;
    const state: NativeSidebarState = { open };
    this.nativeTabs.sendToHost(windowId, 'tabs:sidebarState', state);
  }

  /** 탭 화면 안에서 사이드바를 접거나 편 요청. 창 상태의 주인인 셸이 정한다. */
  requestSidebarOpenFromNative(senderWebContentsId: number, open: boolean): void {
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    const host = identity ? BrowserWindow.fromId(identity.hostId) : null;
    if (
      !host ||
      host.isDestroyed() ||
      !this.isRegisteredShellSender(host.webContents.id)
    ) {
      return;
    }
    const state: NativeSidebarState = { open };
    host.webContents.send('tabs:sidebarOpenRequested', state);
  }

  /**
   * 다른 창으로 옮겨 간(또는 되돌아온) 탭 화면이 그 창의 사이드바 상태와 전화
   * 팝업 여백을 따르게 한다. 옮기는 순간에는 아직 새 창 소속으로 기록되기 전이라
   * 창 단위로 보내는 알림이 이 탭에 닿지 않으므로, 소속이 바뀐 뒤 직접 보낸다.
   */
  private pushWindowStateToTab(tabId: string): void {
    const hostId = this.nativeTabs.getHostId(tabId);
    if (hostId === null) return;
    const state: NativeSidebarState = { open: this.sidebarOpenFor(hostId) };
    this.nativeTabs.sendToTab(tabId, 'tabs:sidebarState', state);
    this.nativeTabs.sendToTab(
      tabId,
      'tabs:overlayInset',
      this.callOverlays.getInset(hostId),
    );
  }

  private sidebarOpenFor(windowId: number | null): boolean {
    if (windowId === null) return this.lastSidebarOpen;
    return this.windows.get(windowId)?.sidebarOpen ?? this.lastSidebarOpen;
  }

  private windowIdForShellSender(senderWebContentsId: number): number | null {
    const contents = webContents.fromId(senderWebContentsId);
    const win = contents ? BrowserWindow.fromWebContents(contents) : null;
    return win && this.windows.has(win.id) ? win.id : null;
  }

  setCallOverlayState(windowId: number, state: unknown): void {
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) this.callOverlays.setState(win, state);
  }

  getCallOverlayState(senderWebContentsId: number): unknown {
    return this.callOverlays.getStateForSender(senderWebContentsId);
  }

  setCallOverlaySize(
    senderWebContentsId: number,
    size: { width: number; height: number },
  ): void {
    this.callOverlays.setSizeFromSender(senderWebContentsId, size);
  }

  /** 팝업 층에서 누른 버튼(닫기, 다시 조회, 링크)은 통화 상태의 주인인 셸이 처리한다. */
  forwardCallOverlayAction(
    senderWebContentsId: number,
    action: CallOverlayAction,
  ): void {
    const windowId = this.callOverlays.windowIdForSender(senderWebContentsId);
    const win = windowId === null ? null : BrowserWindow.fromId(windowId);
    if (
      !win ||
      win.isDestroyed() ||
      !this.isRegisteredShellSender(win.webContents.id)
    ) {
      return;
    }
    if (action.type === 'open-route') {
      win.focus();
      win.webContents.send('tabs:openRoute', action.route);
      return;
    }
    win.webContents.send('cti:overlayAction', action);
  }

  /**
   * 팝업 층이 창 아래쪽을 차지한 높이를 그 창의 셸과 탭 화면에 알린다.
   * 알림(toast)이 같은 오른쪽 아래에 뜨므로 그동안 팝업 위로 올린다.
   */
  publishCallOverlayInset(windowId: number): void {
    const inset = this.callOverlays.getInset(windowId);
    this.nativeTabs.sendToHost(windowId, 'tabs:overlayInset', inset);
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) win.webContents.send('tabs:overlayInset', inset);
  }

  getCallOverlayInsetForSender(senderWebContentsId: number): CallOverlayInset {
    const windowId = this.isRegisteredShellSender(senderWebContentsId)
      ? this.windowIdForShellSender(senderWebContentsId)
      : (this.nativeTabs.lookupSender(senderWebContentsId)?.hostId ?? null);
    return windowId === null ? { bottom: 0 } : this.callOverlays.getInset(windowId);
  }

  /** 알림을 보낸 셸·팝업 층이 속한 창. */
  windowIdForToastSender(senderWebContentsId: number): number | null {
    if (this.isRegisteredShellSender(senderWebContentsId)) {
      return this.windowIdForShellSender(senderWebContentsId);
    }
    return this.isCallOverlaySender(senderWebContentsId)
      ? this.callOverlays.windowIdForSender(senderWebContentsId)
      : null;
  }

  /**
   * 셸 창의 알림은 탭 화면 아래에 가려지므로 지금 보이는 탭 화면에서 띄운다.
   * 보이는 탭 화면이 없으면 셸이 직접 띄운다.
   */
  deliverWindowToast(windowId: number, toast: WindowToast): void {
    const activeTabId = this.nativeTabs.getActiveTabId(windowId);
    if (activeTabId && this.nativeTabs.sendToTab(activeTabId, 'tabs:toast', toast)) {
      return;
    }
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) win.webContents.send('tabs:toast', toast);
  }

  /** 탭 화면이 속한 창. 매물 상세 새 창 열기처럼 창을 기준으로 하는 요청에 쓴다. */
  getNativeTabHostWindow(senderWebContentsId: number): BrowserWindow | null {
    const hostId = this.nativeTabs.lookupSender(senderWebContentsId)?.hostId;
    const host = hostId === undefined ? null : BrowserWindow.fromId(hostId);
    return host && !host.isDestroyed() && this.windows.has(host.id) ? host : null;
  }

  reportNativeTabRetention(
    senderWebContentsId: number,
    update: NativeTabRetentionUpdate,
  ): boolean {
    if (update.viewState) {
      const identity = this.nativeTabs.lookupSender(senderWebContentsId);
      if (identity) {
        const uiState = {
          ...identity.tab.uiState,
          ...(update.viewState.scrollY !== undefined
            ? { scrollY: update.viewState.scrollY }
            : {}),
        };
        const updated = this.nativeTabs.updateTabSnapshot(senderWebContentsId, {
          ...identity.tab,
          uiState,
        });
        const entry = this.windows.get(identity.hostId);
        if (updated && entry?.workspace) {
          entry.workspace = {
            ...entry.workspace,
            tabs: entry.workspace.tabs.map((tab) =>
              tab.id === updated.tabId
                ? { ...tab, uiState: updated.tab.uiState }
                : tab,
            ),
          };
        }
        const host = BrowserWindow.fromId(identity.hostId);
        if (updated && host && !host.isDestroyed()) {
          try {
            host.webContents.send('tabs:nativeTabSnapshot', updated.tab);
          } catch {
            // A concurrent shell reload still has the main-owned workspace copy.
          }
        }
      }
    }
    return Boolean(
      this.nativeTabs.reportTabRetention(senderWebContentsId, update.reasons),
    );
  }

  isAuthenticatedShellSender(senderWebContentsId: number): boolean {
    return (
      this.isRegisteredShellSender(senderWebContentsId) &&
      this.authBroker.isAuthoritativeShell(senderWebContentsId) &&
      this.authBroker.isShellAuthenticated(senderWebContentsId)
    );
  }

  requestShellSignOut(): Promise<boolean> {
    if (this.pendingSignOut) return this.pendingSignOut.promise;
    const requestId = randomUUID();
    let resolve!: (ok: boolean) => void;
    const promise = new Promise<boolean>((accept) => {
      resolve = accept;
    });
    const pending: PendingSignOut = {
      requestId,
      shellWebContentsId: -1,
      attemptedShellIds: new Set<number>(),
      promise,
      resolve,
      timeout: setTimeout(() => this.finishPendingSignOut(false), 12_000),
    };
    this.pendingSignOut = pending;
    this.dispatchPendingSignOut(pending);
    return promise;
  }

  acceptShellSignOut(
    shellWebContentsId: number,
    response: DesktopAuthSignOutResponse,
  ): boolean {
    const pending = this.pendingSignOut;
    if (
      !pending ||
      pending.requestId !== response.requestId ||
      pending.shellWebContentsId !== shellWebContentsId
    ) {
      return false;
    }
    let committed = response.ok;
    if (response.ok && this.providerAuth?.isSignedInNow()) {
      // Auth0 모드: 셸은 자기 세션을 지웠지만, 이 확인이 오기 전에 새로 로그인했다.
      // 로그아웃 자체는 끝났으므로 성공으로 끝내되, 새 세션의 broker 상태와 다른
      // 창은 건드리지 않는다(다른 창은 세션 변경 알림으로 새 계정을 따라간다).
    } else if (response.ok) {
      const signedOut = this.publishAuthSession(shellWebContentsId, {
        authenticated: false,
        user: null,
      });
      committed = Boolean(signedOut && !signedOut.authenticated);
      if (committed) this.broadcastShellSignOutCleanup(shellWebContentsId);
    }
    this.finishPendingSignOut(committed);
    return true;
  }

  private broadcastShellSignOutCleanup(authorityWebContentsId: number): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (
        win.isDestroyed() ||
        win.webContents.id === authorityWebContentsId ||
        !this.isRegisteredShellSender(win.webContents.id)
      ) {
        continue;
      }
      try {
        // The authoritative shell already completed the sign-out transaction.
        // Other Clerk roots only need to clear their local session; their ACK is
        // intentionally ignored because global auth is already fail-closed.
        win.webContents.send('auth:signOutRequest', {
          requestId: `cleanup:${randomUUID()}`,
        });
      } catch {
        // A concurrently closing secondary shell cannot restore global auth.
      }
    }
  }

  private dispatchPendingSignOut(pending: PendingSignOut): void {
    if (this.pendingSignOut !== pending) return;
    if (!this.authBroker.getSession().authenticated) {
      this.finishPendingSignOut(false);
      return;
    }
    const authority = this.authBroker.getAuthoritativeShellId();
    if (authority === null || pending.attemptedShellIds.has(authority)) {
      pending.shellWebContentsId = -1;
      return;
    }
    const contents = webContents.fromId(authority);
    if (!contents || contents.isDestroyed() || !this.isRegisteredShellSender(authority)) {
      pending.attemptedShellIds.add(authority);
      pending.shellWebContentsId = authority;
      this.unregisterAuthShell(authority);
      return;
    }
    if (!this.authBroker.isShellAuthenticated(authority)) {
      // A live shell can be between did-start-navigation and publishSession.
      // Keep the transaction pending; publishAuthSession will resume it.
      pending.shellWebContentsId = -1;
      return;
    }
    pending.attemptedShellIds.add(authority);
    pending.shellWebContentsId = authority;
    try {
      contents.send('auth:signOutRequest', { requestId: pending.requestId });
    } catch {
      this.unregisterAuthShell(authority);
    }
  }

  private finishPendingSignOut(ok: boolean): void {
    const pending = this.pendingSignOut;
    if (!pending) return;
    this.pendingSignOut = null;
    clearTimeout(pending.timeout);
    pending.resolve(ok);
  }

  claimRealtimeAuthority(
    shellWebContentsId: number,
    claim: RealtimeAuthorityClaim,
  ): RealtimeAuthoritySnapshot {
    const snapshot = this.realtimeBroker.claim(
      shellWebContentsId,
      claim.claimId,
      (senderId) => this.isRealtimeCandidateEligible(senderId),
    );
    this.publishRealtimeAuthority();
    return snapshot;
  }

  releaseRealtimeAuthority(
    shellWebContentsId: number,
    release?: RealtimeAuthorityRelease,
  ): void {
    if (release) {
      this.realtimeBroker.release(
        shellWebContentsId,
        release.claimId,
        release.leaseId,
        (senderId) => this.isRealtimeCandidateEligible(senderId),
      );
    } else {
      this.realtimeBroker.unregister(shellWebContentsId, (senderId) =>
        this.isRealtimeCandidateEligible(senderId),
      );
    }
    this.publishRealtimeAuthority();
  }

  private isRealtimeCandidateEligible(senderWebContentsId: number): boolean {
    return (
      this.isRegisteredShellSender(senderWebContentsId) &&
      this.authBroker.isShellAuthenticated(senderWebContentsId)
    );
  }

  private reconcileRealtimeAuthority(): void {
    this.realtimeBroker.reconcile((senderId) =>
      this.isRealtimeCandidateEligible(senderId),
    );
    this.publishRealtimeAuthority();
  }

  private publishRealtimeAuthority(): void {
    for (const senderId of this.realtimeBroker.candidateSenderIds()) {
      const contents = webContents.fromId(senderId);
      if (!contents || contents.isDestroyed()) continue;
      try {
        contents.send(
          'realtime:authority',
          this.realtimeBroker.snapshotFor(senderId),
        );
      } catch {
        // A crashing sender is removed by its lifecycle handler. Continue
        // notifying healthy candidates instead of aborting the broadcast.
      }
    }
  }

  broadcastInvalidate(queryKey: readonly unknown[], sourceWindowId: number) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id === sourceWindowId) continue;
      if (win.isDestroyed()) continue;
      try {
        win.webContents.send('tabs:invalidate', { queryKey, sourceWindowId });
      } catch {
        // continue delivering to healthy renderers
      }
    }
    this.nativeTabs.broadcast(
      'tabs:invalidate',
      { queryKey, sourceWindowId },
      { exceptSenderId: sourceWindowId },
    );
  }
}

/**
 * 탭 메뉴와 방문 기록 메뉴는 native 메뉴로 띄운다. 매물 상세 WebContentsView가
 * 콘텐츠 영역을 덮고 있어도 메뉴가 그 아래에 가려지지 않는다.
 */
function popupTabMenu(
  win: BrowserWindow,
  items: TabMenuItem[],
): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (id: string | null) => {
      if (settled) return;
      settled = true;
      resolve(id);
    };
    const template: MenuItemConstructorOptions[] = items.map((item) =>
      item.type === 'separator'
        ? { type: 'separator' }
        : {
            // Windows 메뉴는 &를 단축 글자 표시로 해석한다.
            label:
              process.platform === 'win32'
                ? item.label.replace(/&/g, '&&')
                : item.label,
            enabled: item.enabled ?? true,
            accelerator: item.accelerator,
            registerAccelerator: false,
            click: () => finish(item.id),
          },
    );
    Menu.buildFromTemplate(template).popup({
      window: win,
      // 메뉴를 닫는 콜백이 click보다 먼저 올 수 있어 한 턴 늦게 취소로 정한다.
      callback: () => setTimeout(() => finish(null), 0),
    });
  });
}

export function registerTabIpcHandlers(manager: WindowManager) {
  const isCurrentMainFrame = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) => event.senderFrame === event.sender.mainFrame;
  const isCurrentTrustedShellEvent = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) =>
    isCurrentMainFrame(event) &&
    manager.isRegisteredShellSender(event.sender.id);
  const isCurrentRegisteredEvent = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) =>
    isCurrentMainFrame(event) && manager.isRegisteredSender(event.sender.id);

  ipcMain.handle('auth:publishSession', (event, payload: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isRegisteredShellSender(event.sender.id) ||
      !isValidAuthSessionPublish(payload)
    ) {
      return { ok: false, error: 'invalid auth session publisher' };
    }
    const snapshot = manager.publishAuthSession(event.sender.id, payload);
    return snapshot
      ? { ok: true, snapshot }
      : { ok: false, error: 'auth session publisher is unavailable' };
  });

  ipcMain.handle('auth:getSession', (event) => {
    return isCurrentRegisteredEvent(event)
      ? manager.getAuthSession()
      : { authenticated: false, user: null, revision: 0 };
  });

  ipcMain.handle('auth:getToken', (event, payload: unknown) => {
    if (
      !isCurrentRegisteredEvent(event) ||
      (!manager.isRegisteredShellSender(event.sender.id) &&
        !manager.isAuthorizedNativeSender(event.sender.id))
    ) {
      return null;
    }
    return manager.requestAuthToken(
      event.sender.id,
      parseTokenScopeSessionId(payload),
    );
  });

  ipcMain.handle('auth:resolveToken', (event, payload: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isAuthenticatedShellSender(event.sender.id) ||
      !isValidAuthTokenResponse(payload)
    ) {
      return { ok: false, error: 'invalid auth token response' };
    }
    return manager.acceptAuthToken(event.sender.id, payload)
      ? { ok: true }
      : { ok: false, error: 'auth token request is no longer pending' };
  });

  ipcMain.handle('auth:requestSignOut', async (event) => {
    if (!isCurrentRegisteredEvent(event)) {
      return { ok: false, error: 'unregistered auth sender' };
    }
    return (await manager.requestShellSignOut())
      ? { ok: true }
      : { ok: false, error: 'authentication shell did not confirm sign-out' };
  });

  // Auth0 모드: 로그인·로그아웃은 main이 하고, 셸은 요청만 한다. 창에 붙은 탭
  // 화면은 같은 창으로 보이므로, 창 자체의 화면에서 온 요청만 받는다.
  const isCurrentWindowShellEvent = (event: Electron.IpcMainInvokeEvent) =>
    isCurrentMainFrame(event) && manager.isWindowShellSender(event.sender.id);
  ipcMain.handle('auth:providerState', async (event) => {
    if (!isCurrentWindowShellEvent(event)) {
      return { provider: manager.getAuthProvider(), hasSession: false, sessionId: null };
    }
    return manager.getProviderAuthState();
  });

  ipcMain.handle('auth:providerLogin', async (event, payload: unknown) => {
    if (!isCurrentWindowShellEvent(event)) {
      return { ok: false, error: 'invalid login requester' };
    }
    const credentials = parseProviderCredentials(payload);
    if (!credentials) {
      return { ok: false, error: '아이디와 비밀번호를 입력해 주세요.' };
    }
    return manager.loginWithProvider(credentials);
  });

  ipcMain.handle('auth:providerLogout', async (event, payload: unknown) => {
    if (!isCurrentWindowShellEvent(event)) {
      return { ok: false, error: 'invalid logout requester' };
    }
    await manager.logoutProvider(parseTokenScopeSessionId(payload));
    return { ok: true };
  });

  ipcMain.handle('auth:resolveSignOut', (event, payload: unknown) => {
    if (
      !isCurrentTrustedShellEvent(event) ||
      !isValidAuthSignOutResponse(payload)
    ) {
      return { ok: false, error: 'invalid sign-out acknowledgement' };
    }
    return manager.acceptShellSignOut(event.sender.id, payload)
      ? { ok: true }
      : { ok: false, error: 'sign-out acknowledgement is no longer pending' };
  });

  ipcMain.handle('realtime:claimAuthority', (event, payload: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isRegisteredShellSender(event.sender.id) ||
      !isValidRealtimeClaim(payload)
    ) {
      return { ok: false, error: 'invalid realtime claim' };
    }
    return {
      ok: true,
      snapshot: manager.claimRealtimeAuthority(event.sender.id, payload),
    };
  });

  ipcMain.on('realtime:releaseAuthority', (event, payload: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isRegisteredShellSender(event.sender.id) ||
      !isValidRealtimeRelease(payload)
    )
      return;
    manager.releaseRealtimeAuthority(event.sender.id, payload);
  });

  ipcMain.on('tabs:setGlobalOverlayVisible', (event, payload: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (
      !isValidGlobalOverlayVisibilityPayload(payload) ||
      !isCurrentMainFrame(event) ||
      !source ||
      !manager.hasWindow(source.id) ||
      !manager.isRegisteredShellSender(event.sender.id)
    ) {
      return;
    }
    manager.setGlobalOverlayVisible(source.id, payload.source, payload.visible);
  });

  ipcMain.handle('tabs:syncNativeViewport', async (event, payload: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (
      !source ||
      !manager.hasWindow(source.id) ||
      !isCurrentMainFrame(event) ||
      !manager.isRegisteredShellSender(event.sender.id) ||
      !isValidNativeViewportPayload(payload)
    ) {
      return { ok: false, error: 'invalid native tab viewport' };
    }
    return manager.syncNativeViewport(source.id, payload);
  });

  ipcMain.handle(
    'tabs:hasUnsavedNativeTabWork',
    (event, tabId: unknown): boolean => {
      const source = BrowserWindow.fromWebContents(event.sender);
      if (
        !source ||
        !manager.hasWindow(source.id) ||
        !isCurrentMainFrame(event) ||
        !manager.isRegisteredShellSender(event.sender.id) ||
        typeof tabId !== 'string' ||
        tabId.length === 0 ||
        tabId.length > 200
      ) {
        return false;
      }
      return manager.hasUnsavedNativeTabWork(source.id, tabId);
    },
  );

  ipcMain.on('tabs:releaseNativeViewport', (event, payload: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (
      !source ||
      !manager.hasWindow(source.id) ||
      !isCurrentMainFrame(event) ||
      !manager.isRegisteredShellSender(event.sender.id) ||
      !isValidNativeViewportReleasePayload(payload)
    ) {
      return;
    }
    manager.releaseNativeViewport(source.id, payload);
  });

  ipcMain.on('tabs:setNativeTabRetention', (event, payload: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isAuthorizedNativeSender(event.sender.id) ||
      !isValidNativeTabRetentionUpdate(payload)
    ) {
      return;
    }
    manager.reportNativeTabRetention(event.sender.id, payload);
  });

  ipcMain.handle('tabs:getNativeTabSnapshot', (event) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isAuthorizedNativeSender(event.sender.id)
    ) {
      return null;
    }
    return manager.getNativeTabSnapshot(event.sender.id);
  });

  ipcMain.on('cti:setOverlayState', (event, payload: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (
      !isCurrentTrustedShellEvent(event) ||
      !source ||
      !manager.hasWindow(source.id) ||
      !isCallOverlayState(payload)
    ) {
      return;
    }
    manager.setCallOverlayState(source.id, payload);
  });

  ipcMain.handle('cti:getOverlayState', (event) =>
    isCurrentMainFrame(event) && manager.isCallOverlaySender(event.sender.id)
      ? manager.getCallOverlayState(event.sender.id)
      : null,
  );

  ipcMain.on('cti:overlayAction', (event, payload: unknown) => {
    if (!isCurrentMainFrame(event) || !manager.isCallOverlaySender(event.sender.id)) {
      return;
    }
    const action = parseCallOverlayAction(payload);
    if (action) manager.forwardCallOverlayAction(event.sender.id, action);
  });

  ipcMain.on('cti:overlaySize', (event, payload: unknown) => {
    if (!isCurrentMainFrame(event) || !manager.isCallOverlaySender(event.sender.id)) {
      return;
    }
    const size = parseCallOverlaySize(payload);
    if (size) manager.setCallOverlaySize(event.sender.id, size);
  });

  ipcMain.handle('tabs:getOverlayInset', (event): CallOverlayInset =>
    isCurrentRegisteredEvent(event)
      ? manager.getCallOverlayInsetForSender(event.sender.id)
      : { bottom: 0 },
  );

  ipcMain.on('tabs:showToast', (event, payload: unknown) => {
    if (!isCurrentMainFrame(event)) return;
    const toast = parseWindowToast(payload);
    if (!toast) return;
    const windowId = manager.windowIdForToastSender(event.sender.id);
    if (windowId !== null) manager.deliverWindowToast(windowId, toast);
  });

  ipcMain.on('tabs:nativeTabAction', (event, payload: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isAuthorizedNativeSender(event.sender.id)
    ) {
      return;
    }
    const action = parseNativeTabAction(payload);
    if (!action) return;
    manager.forwardNativeTabAction(event.sender.id, action);
  });

  ipcMain.handle('tabs:getSidebarState', (event): NativeSidebarState => {
    if (!isCurrentRegisteredEvent(event)) return { open: true };
    return manager.getSidebarStateForSender(event.sender.id);
  });

  ipcMain.on('tabs:setSidebarOpen', (event, open: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (
      !isCurrentTrustedShellEvent(event) ||
      typeof open !== 'boolean' ||
      !source ||
      !manager.hasWindow(source.id)
    ) {
      return;
    }
    manager.setWindowSidebarOpen(source.id, open);
  });

  ipcMain.on('tabs:requestSidebarOpen', (event, open: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !manager.isAuthorizedNativeSender(event.sender.id) ||
      typeof open !== 'boolean'
    ) {
      return;
    }
    manager.requestSidebarOpenFromNative(event.sender.id, open);
  });

  ipcMain.handle('tabs:openPropertyWindow', async (event, payload: unknown) => {
    // 셸과 탭 화면(native 탭) 양쪽에서 열 수 있다. 탭 화면이면 그 탭을 가진 창이 기준이다.
    const source = isCurrentTrustedShellEvent(event)
      ? BrowserWindow.fromWebContents(event.sender)
      : isCurrentMainFrame(event) &&
          manager.isAuthorizedNativeSender(event.sender.id)
        ? manager.getNativeTabHostWindow(event.sender.id)
        : null;
    if (!source || !manager.hasWindow(source.id)) {
      return { ok: false, error: 'unregistered source window' };
    }
    if (!isValidOpenPropertyWindowPayload(payload)) {
      return { ok: false, error: 'invalid property window payload' };
    }

    try {
      const result = manager.createPropertyWindow(payload, source);
      const accepted = await result.acceptance;
      const target = BrowserWindow.fromId(result.windowId);
      if (!accepted || !target || target.isDestroyed()) {
        manager.closeWindow(result.windowId);
        return { ok: false, error: 'property window did not finish loading' };
      }
      target.show();
      target.focus();
      return { ok: true, windowId: result.windowId };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'failed to open property window',
      };
    }
  });

  ipcMain.handle('tabs:detach', async (event, payload: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (!source || !manager.hasWindow(source.id) || !isCurrentTrustedShellEvent(event)) {
      return { ok: false, error: 'unregistered source window' };
    }
    if (!isValidDetachPayload(payload)) {
      return { ok: false, error: 'invalid detach payload' };
    }

    try {
      const result = manager.createDetachedWindow(
        payload,
        event.sender.id,
        source.id,
      );
      const accepted = await result.acceptance;
      if (!accepted) {
        manager.closeWindow(result.windowId);
        return { ok: false, error: 'detached renderer did not accept the tab' };
      }
      return { ok: true, windowId: result.windowId };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : 'failed to create detached window',
      };
    }
  });

  ipcMain.handle('tabs:beginDrag', async (event, payload: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (!source || !manager.hasWindow(source.id) || !isCurrentTrustedShellEvent(event)) {
      return { ok: false, error: 'unregistered source window' };
    }
    if (!isValidBeginDragPayload(payload)) {
      return { ok: false, error: 'invalid drag payload' };
    }

    try {
      const result = manager.beginDragDetach(
        payload,
        event.sender.id,
        source.id,
      );
      if (!result.ok) return result;
      const accepted = await result.acceptance;
      if (!accepted) {
        manager.closeWindow(result.windowId);
        return { ok: false, error: 'detached renderer did not accept the tab' };
      }
      return { ok: true, windowId: result.windowId };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'failed to begin tab drag',
      };
    }
  });

  ipcMain.on('tabs:updateDragPosition', (event, payload: unknown) => {
    if (!isCurrentTrustedShellEvent(event) || !isValidDragPositionPayload(payload)) return;
    manager.updateDragPosition(payload, event.sender.id);
  });

  ipcMain.on('tabs:endDrag', (event, transferId: unknown) => {
    if (!isCurrentTrustedShellEvent(event) || typeof transferId !== 'string') return;
    manager.endDrag(transferId, event.sender.id);
  });

  ipcMain.on('tabs:invalidate', (event, queryKey: readonly unknown[]) => {
    if (
      !isCurrentRegisteredEvent(event) ||
      !Array.isArray(queryKey) ||
      queryKey.length > 32 ||
      !isJsonValue(queryKey)
    )
      return;
    manager.broadcastInvalidate(queryKey, event.sender.id);
  });

  ipcMain.handle('tabs:getWindowKind', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !isCurrentTrustedShellEvent(event)) return null;
    return manager.getKind(win.id);
  });

  ipcMain.handle('tabs:getWindowWorkspace', (event, owner: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      !isCurrentTrustedShellEvent(event) ||
      !isValidWindowWorkspaceOwner(owner)
    ) {
      return null;
    }
    return manager.getMainWindowWorkspace(win.id, owner);
  });

  ipcMain.handle('tabs:syncWindowWorkspace', (event, payload: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      !isCurrentTrustedShellEvent(event) ||
      !isRecord(payload) ||
      !isValidWindowWorkspaceOwner(payload.owner) ||
      !isValidWorkspaceSnapshot(payload.workspace)
    ) {
      return { ok: false, error: 'invalid window workspace' };
    }
    return manager.syncMainWindowWorkspace(
      win.id,
      payload.owner,
      payload.workspace,
    )
      ? { ok: true }
      : { ok: false, error: 'workspace principal did not match' };
  });

  ipcMain.handle('tabs:getInitialTab', (event, owner: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      !isCurrentTrustedShellEvent(event) ||
      !isValidWindowWorkspaceOwner(owner)
    ) {
      return null;
    }
    return manager.getInitialTab(win.id, owner);
  });

  ipcMain.handle('tabs:acceptInitialTab', (event, ack: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !isCurrentTrustedShellEvent(event) || !isValidTransferAck(ack)) {
      return { ok: false, error: 'invalid transfer acknowledgement' };
    }
    const accepted = manager.acceptInitialTab(win.id, ack);
    return accepted
      ? { ok: true }
      : { ok: false, error: 'transfer acknowledgement did not match' };
  });

  ipcMain.handle('tabs:acceptTransferSnapshot', (event, ack: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !isCurrentTrustedShellEvent(event) || !isValidFinalSnapshotAck(ack)) {
      return { ok: false, error: 'invalid final snapshot acknowledgement' };
    }
    const accepted = manager.acceptTransferSnapshot(win.id, ack);
    return accepted
      ? { ok: true }
      : { ok: false, error: 'final snapshot acknowledgement did not match' };
  });

  ipcMain.handle(
    'tabs:prepareTransferSnapshot',
    async (event, commit: unknown) => {
      const source = BrowserWindow.fromWebContents(event.sender);
      if (
        !source ||
        !manager.hasWindow(source.id) ||
        !isCurrentTrustedShellEvent(event) ||
        !isValidTransferCommit(commit)
      ) {
        return { ok: false, error: 'invalid final transfer snapshot' };
      }
      return (await manager.prepareTransferSnapshot(event.sender.id, commit))
        ? { ok: true }
        : {
            ok: false,
            error: 'target did not accept the final transfer snapshot',
          };
    },
  );

  ipcMain.handle('tabs:commitTransfer', async (event, commit: unknown) => {
    const source = BrowserWindow.fromWebContents(event.sender);
    if (
      !source ||
      !manager.hasWindow(source.id) ||
      !isCurrentTrustedShellEvent(event) ||
      !isValidTransferCommit(commit)
    ) {
      return { ok: false, error: 'invalid transfer commit' };
    }
    return manager.commitTransfer(event.sender.id, commit)
      ? { ok: true }
      : { ok: false, error: 'transfer is no longer available to commit' };
  });

  ipcMain.on('tabs:syncWindowTabs', (event, payload: unknown) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      !win ||
      !isCurrentTrustedShellEvent(event) ||
      !isRecord(payload) ||
      !isValidWindowWorkspaceOwner(payload.owner) ||
      !isValidWorkspaceSnapshot(payload.workspace)
    ) {
      return;
    }
    manager.syncWindowTabs(
      win.id,
      event.sender.id,
      payload.owner,
      payload.workspace,
    );
  });

  ipcMain.on('tabs:closeWindow', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (
      isCurrentTrustedShellEvent(event) &&
      win &&
      !win.isDestroyed() &&
      manager.getKind(win.id) === 'detached'
    ) {
      win.close();
    }
  });

  ipcMain.on('tabs:requestCommand', (event, payload: unknown) => {
    if (!isCurrentMainFrame(event) || !isTabCommand(payload)) return;
    manager.forwardTabCommandFromSender(event.sender.id, payload);
  });

  ipcMain.handle('tabs:showMenu', (event, items: unknown) => {
    if (!isCurrentTrustedShellEvent(event) || !isTabMenuItems(items)) {
      return null;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return null;
    return popupTabMenu(win, items);
  });

  ipcMain.handle('tabs:openInMainWindow', (event, route: string) => {
    if (
      !isCurrentRegisteredEvent(event) ||
      typeof route !== 'string' ||
      !route.startsWith('/') ||
      route.length > MAX_TAB_ROUTE_LENGTH
    ) {
      return { ok: false, error: 'invalid main-window route' };
    }
    const main = manager.getMainWindow();
    if (!main) return { ok: false, error: 'no main window' };
    main.focus();
    main.webContents.send('tabs:openRoute', route);
    return { ok: true };
  });
}
