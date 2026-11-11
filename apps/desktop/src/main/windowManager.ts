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
  isTabScreenCommand,
  tabCommandForInput,
  type TabCommand,
  type TabMenuItem,
} from '../common/tabCommands';
import { randomUUID } from 'node:crypto';
import type {
  OpenPropertyWindowPayload,
  Tab,
  WindowKind,
} from '@estate-erp/shared';
import {
  TAB_BAR_CHANNELS,
  emptyTabBarState,
  parseTabBarActionEnvelope,
  type TabBarActionEnvelope,
  type TabBarState,
} from '../common/tabs/tabBarContract';
import {
  appRouteTarget,
  internalHrefFromDocumentUrl,
  isAbortOfAnotherLoad,
  isTrustedDocumentUrl,
  windowPageTarget,
  type RendererLocation,
  type WindowPageKind,
} from './rendererDocuments';
import {
  NO_WINDOW_PAGE_FAILURES,
  allowsWindowPageNavigation,
  planWindowPageRecovery,
  windowPageNeedsRecovery,
  windowPageReceivesAppBroadcasts,
  windowPageRoleOfDocument,
  type WindowPageRecoveryState,
  type WindowPageRole,
} from './windowPageRole';
import type { UpdaterSenderKind } from './updaterAccess';
import { tabResourceKeys } from '../common/tabs/tabResource';
import { APP_WINDOW_TITLE, windowTitleForTabs } from '../common/tabs/windowTitle';
import {
  TabRegistry,
  type CreateTabWindowRequest,
  type TabWindowPlacement,
} from './tabs/tabRegistry';
import {
  keepWindowOnScreen,
  planTabDrop,
  type ScreenPoint,
  type TabDropScene,
} from './tabs/tabDrop';
import { detachedTabOrigin } from '../common/tabs/tabBarModel';
import { TabViewCoordinator } from './tabs/tabViewCoordinator';
import { recordViewLocation } from './tabs/viewLocation';
import {
  SIGNED_OUT_AUTH_SESSION,
  authSessionPrincipal,
  parseAuthCredentials,
  parseAuthSessionScope,
  parseAuthSignupInput,
  type DesktopAuthLoginResult,
  type DesktopAuthRefreshResult,
  type DesktopAuthSessionSnapshot,
  type DesktopAuthSignupInput,
  type DesktopAuthSignupResult,
} from '../common/desktopAuth';
import {
  parseRealtimeRoomRequest,
  type RealtimeEventMessage,
  type RealtimeRoom,
  type RealtimeStatus,
} from '../common/desktopRealtime';
import {
  parseNativeTabAction,
  type NativeTabAction,
} from '../common/nativeTabActions';
import {
  NATIVE_SPARE_TAB_ID_PREFIX,
  isTabScreenRoute,
  resolveTabScreenRoute,
  type NativeSidebarState,
  type NativeTabRetentionUpdate,
} from '../common/nativeTabs';
import {
  RENDERER_SURFACE_ARGUMENT,
  RENDERER_TAB_ID_ARGUMENT,
} from '../common/rendererSurface';
import { isPostcodeFrameRedirect } from './embeddedAddressNavigation';
import {
  ElectronNativeTabViewFactory,
  ElectronNativeTabWindowHost,
} from './electronNativeTabAdapter';
import { NativeTabHost, type NativeTabBounds } from './nativeTabHost';
import { CallOverlayHost } from './callOverlayHost';
import {
  parseCallOverlayAction,
  parseCallOverlaySize,
  parseWindowToast,
  type CallOverlayAction,
  type CallOverlayInset,
  type WindowToast,
} from '../common/callOverlay';
import {
  RealtimeConnection,
  realtimeTargetForSession,
  resolveRealtimeUrl,
} from './realtime/realtimeConnection';
import { createSocketIoRealtimeSocket } from './realtime/socketIoRealtimeSocket';
import { createSessionApiClient } from './api/sessionApiClient';
import { electronFetch } from './api/electronFetch';
import { CallController, selectCallPopupWindow } from './cti/callController';
import { createCtiApi } from './cti/ctiApi';
import { CtiBridgeClient, resolveCtiBridgeUrl } from './cti/ctiBridgeClient';
import {
  CTI_DISCONNECTED_STATUS,
  parseCtiDialRequest,
  type ActiveCall,
  type CtiDialRequest,
  type CtiDialResult,
  type CtiStatus,
} from '../common/desktopCti';
import { resolveAuth0ConfigForMain } from './auth/auth0MainConfig';
import { Auth0DesktopSession } from './auth/auth0DesktopSession';
import { SafeStorageAuth0TokenStore } from './auth/auth0TokenStore';
import { DesktopAuthController } from './auth/desktopAuthController';
import {
  createSessionUserFetcher,
  resolveMainApiBaseUrl,
} from './auth/sessionUserClient';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let packagedRendererBaseUrl: string | null = null;

export function setPackagedRendererBaseUrl(baseUrl: string | null) {
  packagedRendererBaseUrl = baseUrl;
}

interface WindowEntry {
  kind: WindowKind;
  /** main이 창의 화면에 불러오라고 한 문서. */
  page: WindowPageKind | null;
  /**
   * 창의 화면에 실제로 들어서 있는 문서의 역할. 문서가 바뀌는 이동이 끝났을 때만
   * 바뀐다. 창의 화면이 보낸 요청은 이 값으로 가린다(문서가 떠 있는 동안의 주소로
   * 가리지 않는다: src/main/windowPageRole.ts).
   */
  committed: WindowPageRole;
  /** main이 시작한 로드 가운데 아직 끝나지 않은 것의 수. */
  pendingLoads: number;
  /** 창의 화면을 다시 불러온 횟수와 마지막 실패 시각. */
  recovery: WindowPageRecoveryState;
  recoveryTimer: ReturnType<typeof setTimeout> | null;
}

const DETACHED_TITLEBAR_HEIGHT = 40;

/**
 * Escape를 누른 흔적을 이 시간 동안 기억한다. 앱 창 밖에서 끝난 끌기가 "손을 뗀 것"인지
 * "Escape로 취소한 것"인지는 끌기 이벤트로 구별되지 않는다. macOS는 취소한 끌기의 그림을
 * 제자리로 되돌린 뒤에 끝을 알리므로, 그사이 main에 닿은 Escape 입력이 있으면 취소로 본다.
 * (끄는 동안 키 입력이 main에 닿는지는 OS에 달려 있다. 닿지 않으면 손을 뗀 것으로 본다.)
 */
const ESCAPE_EVIDENCE_MS = 1_000;

/**
 * 개발 실행에서는 창마다 DevTools를 자동으로 연다. 창이 뜨는 시간을 잴 때는 DevTools가
 * 결과를 흐리므로 `ESTATE_NO_AUTO_DEVTOOLS=1`로 끌 수 있다.
 */
function shouldAutoOpenDevTools(): boolean {
  return !app.isPackaged && process.env.ESTATE_NO_AUTO_DEVTOOLS !== '1';
}

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
      // 창 자체의 화면이라는 역할은 main이 여기서 정해 준다. 역할을 받지 못한 문서에는
      // preload가 아무 통로도 내주지 않는다.
      additionalArguments: [`${RENDERER_SURFACE_ARGUMENT}window-shell`],
    },
    ...platformOptions,
  };
}

/** 지금 실행에서 문서를 불러오는 곳(개발 서버, 패키지 앱의 전용 주소, 아니면 파일). */
function rendererLocation(): RendererLocation {
  return {
    devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    packagedBaseUrl: packagedRendererBaseUrl,
    rendererDir: path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`),
  };
}

/** 탭 화면·팝업 층에 불러올 문서. 앱 밖을 가리키는 주소면 던진다. */
function nativeTabDestinationFor(
  route: string,
): { url: string } | { filePath: string; options: Electron.LoadFileOptions } {
  const target = appRouteTarget(rendererLocation(), route);
  return 'url' in target
    ? target
    : { filePath: target.filePath, options: { hash: target.hash } };
}

const isTrustedRendererDocumentUrl = (rawUrl: string) =>
  isTrustedDocumentUrl(rendererLocation(), rawUrl);
const internalHrefFromRendererUrl = (rawUrl: string) =>
  internalHrefFromDocumentUrl(rendererLocation(), rawUrl);

const MAX_TAB_TITLE_LENGTH = 500;
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

export class WindowManager {
  private windows = new Map<number, WindowEntry>();
  private mainWindowId: number | null = null;
  /** 탭 화면(WebContentsView)들. 만들고 붙이고 옮기고 내리는 일을 맡는다. */
  private readonly nativeTabs: NativeTabHost;
  /** 탭 목록이 정한 것을 탭 화면에 반영한다. */
  private readonly tabViews: TabViewCoordinator;
  /**
   * 탭 목록의 주인. 창마다의 탭·활성 탭·방문 기록·닫은 탭을 갖고, 탭바 화면과 탭
   * 화면의 요청을 여기서 적용한다. 화면들은 결과 상태를 받아 그리기만 한다.
   */
  private readonly tabRegistry: TabRegistry;
  /** 아직 보여 주지 않은 새 창을 보여 주는 함수. 탭 화면이 붙거나 창의 화면이 준비되면 부른다. */
  private readonly pendingWindowReveals = new Map<number, () => void>();
  /**
   * 로그인 세션의 주인. 토큰과 로그인한 사용자를 main이 갖고, 바뀔 때마다 모든
   * 화면에 알린다. 화면은 로그인·로그아웃·새로 고침을 요청만 한다.
   */
  private readonly auth: DesktopAuthController;
  /** main이 쓰는 API 서버 주소. 화면과 같은 빌드 값이다. */
  private readonly apiBaseUrl: string;
  /**
   * 서버 실시간 연결. 앱 전체에 하나이고 main이 갖는다. 화면은 여기서 보내 주는
   * 이벤트만 받는다.
   */
  private readonly realtime: RealtimeConnection;
  /** 방 구독을 요청한 화면. 화면이 사라지면 그 구독을 놓으려고 한 번만 지켜본다. */
  private readonly realtimeSubscribers = new Set<number>();
  /** CTI Bridge(같은 PC의 전화 연동 프로그램)와의 연결. */
  private readonly ctiBridge: CtiBridgeClient;
  /**
   * 통화 흐름의 주인. Bridge 이벤트로 통화 상태를 만들고 서버 조회·기록을 직접 한다.
   * 팝업 층과 화면은 여기서 보내 주는 상태만 그린다.
   */
  private readonly cti: CallController;
  /** 지금 전화 팝업을 띄운 창과 그 통화. 한 통화는 처음 띄운 창에 머문다. */
  private callPopup: { windowId: number; key: number } | null = null;
  /** 창이 앞으로 온 순서(클수록 최근). 메인 창이 없을 때 팝업을 띄울 창을 고른다. */
  private readonly windowFocusOrder = new Map<number, number>();
  private windowFocusSequence = 0;
  /** 마지막으로 Escape 입력이 main에 닿은 시각. 끌기를 취소했는지 가릴 때 쓴다. */
  private lastEscapeInputAt = 0;
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
      // 팝업에 focus가 있어도(메모 입력 중 등) 탭 단축키는 그 창의 탭 목록에 적용한다.
      // 가로채지 않으면 Cmd/Ctrl+W가 기본 메뉴의 "창 닫기"로 가서 창과 모든 탭이 닫힌다.
      view.webContents.on('before-input-event', (event, input) => {
        this.handleTabShortcut(
          event,
          input,
          this.callOverlays.windowIdForSender(view.webContents.id),
        );
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
    this.apiBaseUrl = resolveMainApiBaseUrl({
      configured: import.meta.env.VITE_API_BASE_URL as string | undefined,
      devServerUrl: MAIN_WINDOW_VITE_DEV_SERVER_URL,
    });
    console.info(`[auth] API server: ${this.apiBaseUrl}`);
    this.auth = this.createAuthController();
    this.realtime = new RealtimeConnection({
      url: resolveRealtimeUrl(this.apiBaseUrl),
      createSocket: createSocketIoRealtimeSocket,
      getAccessToken: (sessionId) => this.auth.getAccessToken(sessionId),
      // 서버가 연결을 받아 주지 않으면 로그인 세션 쪽이 `/auth/me`로 직접 확인한다.
      // 거기서도 거절될 때만 로그아웃이고, 그때는 세션 변경으로 이 연결도 끊긴다.
      verifySession: (sessionId) => this.auth.reportUnauthorized(sessionId),
      onEvent: (event) => this.handleRealtimeEvent(event),
      onStateChange: (state) => console.info(`[realtime] ${state}`),
    });
    this.ctiBridge = new CtiBridgeClient({
      url: resolveCtiBridgeUrl(process.env),
      onEvent: (event) => this.cti.handleBridgeEvent(event),
      onStatus: () => this.publishCtiStatus(),
    });
    this.cti = new CallController({
      api: createCtiApi(
        createSessionApiClient({
          apiBaseUrl: this.apiBaseUrl,
          fetch: electronFetch,
          getAccessToken: (sessionId) => this.auth.getAccessToken(sessionId),
          // 401은 로그인 세션 쪽이 `/auth/me`로 확인한다. 여기서 로그아웃시키지 않는다.
          reportUnauthorized: (sessionId) => this.auth.reportUnauthorized(sessionId),
        }),
      ),
      bridge: this.ctiBridge,
      onCallChange: (call) => this.handleCallChanged(call),
      onCallLogsChanged: () =>
        this.broadcastToRenderers('tabs:invalidate', {
          queryKey: ['cti', 'call-logs'],
          sourceWindowId: 0,
        }),
      onError: (what, error) => console.error(`[cti] ${what}:`, error),
    });
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
            if (route && resolveTabScreenRoute(route)) return;
            event.preventDefault();
            if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
          };
          // 탭 화면을 띄우지 못했거나 화면이 죽었다. 다시 띄울지는 탭 목록이 정한다.
          const publishFailure = () => {
            const identity = this.nativeTabs.removeFailedSender(
              view.webContents.id,
            );
            if (identity) this.tabRegistry.reportViewFailure(identity.tabId);
          };
          const publishNavigation = (rawUrl: string) => {
            // 탭 목록이 받지 않은 주소는 탭 화면 관리에도 기록하지 않는다(둘이 어긋나면
            // 탭을 다시 고를 때 화면을 예전 주소로 되돌려 보낸다).
            const outcome = recordViewLocation(
              this.nativeTabs,
              this.tabRegistry,
              view.webContents.id,
              internalHrefFromRendererUrl(rawUrl),
            );
            if (outcome !== 'not-a-tab-screen') return;
            // 탭 화면이 있을 수 없는 주소로 갔다. 그 탭의 주소로 되돌린다.
            const identity = this.nativeTabs.peekSender(view.webContents.id);
            if (!identity || view.webContents.isDestroyed()) return;
            try {
              const destination = nativeTabDestinationFor(identity.tab.route);
              const recovery =
                'url' in destination
                  ? view.webContents.loadURL(destination.url)
                  : view.webContents.loadFile(
                      destination.filePath,
                      destination.options,
                    );
              void recovery.catch(publishFailure);
            } catch {
              publishFailure();
            }
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
          // 탭 화면에 focus가 있어도 탭 단축키는 그 탭을 가진 창의 탭 목록에 적용한다.
          view.webContents.on('before-input-event', (event, input) => {
            this.handleTabShortcut(
              event,
              input,
              this.nativeTabs.peekSender(view.webContents.id)?.hostId ?? null,
            );
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
    this.tabViews = new TabViewCoordinator(this.nativeTabs, {
      onPresentFailed: (_windowId, tabId, error) => {
        console.warn('[tabs] failed to show the tab view', error);
        this.tabRegistry.reportViewFailure(tabId);
      },
      onViewAttached: (tabId, windowId) => {
        // 붙은 창의 사이드바 상태와 전화 팝업 여백을 따르게 한다.
        this.pushWindowStateToTab(tabId);
        // 새 창은 탭 화면이 붙은 뒤에 보여 준다. 빈 창이 먼저 보이지 않게.
        this.pendingWindowReveals.get(windowId)?.();
      },
    });
    this.tabRegistry = new TabRegistry({
      platform: process.platform,
      views: this.tabViews,
      publishState: (windowId, state) => this.publishTabBarState(windowId, state),
      publishSidebar: (windowId, open) => {
        const state: NativeSidebarState = { open };
        this.nativeTabs.sendToHost(windowId, 'tabs:sidebarState', state);
      },
      showToast: (windowId, toast) => this.deliverWindowToast(windowId, toast),
      showMenu: (windowId, items) => {
        const win = BrowserWindow.fromId(windowId);
        return win && !win.isDestroyed()
          ? popupTabMenu(win, items)
          : Promise.resolve(null);
      },
      createWindow: (request) => this.createTabWindow(request),
      // 세션이 끝난 뒤에 불린다: 새 메인 창은 로그인 화면을 불러온다.
      openMainWindow: () => {
        this.createMainWindow();
      },
      closeWindow: (windowId) => this.closeWindow(windowId),
      tabDropScene: (sourceWindowId) => this.tabDropScene(sourceWindowId),
      moveWindow: (windowId, placement) => this.moveWindowToDrop(windowId, placement),
      focusWindow: (windowId) => this.focusWindow(windowId),
    });
  }

  /**
   * 앱의 창들 가운데 가장 최근에 앞에 온(또는 방금 앞으로 가져오기로 한) 창인지.
   * OS가 focus를 실제로 옮기는 시점과 상관없이, 우리가 정한 순서로 답한다.
   */
  private isFrontAppWindow(windowId: number): boolean {
    const mine = this.windowFocusOrder.get(windowId);
    if (mine === undefined) return false;
    for (const order of this.windowFocusOrder.values()) {
      if (order > mine) return false;
    }
    return true;
  }

  /** 그 창을 앞으로 가져오기로 했다. 뒤따르는 다른 창의 탭 화면이 focus를 가져가지 않게 먼저 기록한다. */
  private noteWindowBroughtForward(windowId: number): void {
    if (this.windows.has(windowId)) {
      this.windowFocusOrder.set(windowId, ++this.windowFocusSequence);
    }
  }

  /** 탭 화면이 차지하는 자리: 창 안쪽에서 탭바(위 40px) 아래 전부. */
  private tabViewBoundsFor(win: BrowserWindow): NativeTabBounds {
    const { width, height } = win.getContentBounds();
    return {
      x: 0,
      y: DETACHED_TITLEBAR_HEIGHT,
      width,
      height: Math.max(0, height - DETACHED_TITLEBAR_HEIGHT),
    };
  }

  /**
   * 앱 창 하나를 등록한다: 탭 화면을 붙일 자리, 창 단위 입력(탭 단축키), 창이 닫힐 때의
   * 정리. 탭 목록에 창을 알리는 일은 부른 쪽이 한다(메인 창은 여기서 만든 직후,
   * 탭을 옮겨 받는 새 창은 탭 목록이 직접).
   */
  private registerNativeHost(win: BrowserWindow, kind: WindowKind): void {
    // 새로 뜬 창이 가장 최근 창이다.
    const windowId = win.id;
    const noteFocus = () =>
      this.windowFocusOrder.set(windowId, ++this.windowFocusSequence);
    noteFocus();
    win.on('focus', noteFocus);
    const entry: WindowEntry = {
      kind,
      page: null,
      committed: null,
      pendingLoads: 0,
      recovery: NO_WINDOW_PAGE_FAILURES,
      recoveryTimer: null,
    };
    this.windows.set(windowId, entry);
    win.once('closed', () => {
      if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
      this.windowFocusOrder.delete(windowId);
      this.pendingWindowReveals.delete(windowId);
      // 탭 목록이 그 창의 탭을 잊으면서 탭 화면도 함께 없앤다.
      this.tabRegistry.unregisterWindow(windowId);
      this.tabViews.forgetWindow(windowId);
      this.nativeTabs.unregisterHost(windowId);
      this.windows.delete(windowId);
      if (this.mainWindowId === windowId) this.mainWindowId = null;
      // 팝업을 띄운 창이 닫혔으면 통화가 이어지는 동안 다른 창에 다시 띄운다.
      this.syncCallPopupWindow();
    });
    // 통화 중에 처음 창이 생겼으면(창이 하나도 없었으면) 그 창에 팝업을 띄운다.
    queueMicrotask(() => this.syncCallPopupWindow());
    this.nativeTabs.registerHost(
      new ElectronNativeTabWindowHost(
        win,
        () => {
          this.callOverlays.raise(win.id);
          // 통화 중에 붙은 탭 화면도 알림을 팝업 위로 올리게 한다.
          this.publishCallOverlayInset(win.id);
        },
        // 뒤에 있는 창의 탭이 바뀌었다고(탭을 다른 창으로 옮긴 뒤 남은 탭을 보여 줄 때 등)
        // 그 창이 쓰고 있는 창 앞으로 튀어나오지 않게 한다.
        () => this.isFrontAppWindow(windowId),
      ),
      this.tabViewBoundsFor(win),
    );
    // 탭 화면의 자리는 main이 창 크기로 정한다. 창의 화면이 알려 주기를 기다리지 않는다.
    const syncTabViewBounds = () => {
      if (win.isDestroyed()) return;
      try {
        this.nativeTabs.updateBounds(windowId, this.tabViewBoundsFor(win));
      } catch {
        // 창이 닫히는 중이면 closed 정리가 이어서 처리한다.
      }
    };
    win.on('resize', syncTabViewBounds);
    win.on('enter-full-screen', () => {
      syncTabViewBounds();
      this.tabRegistry.setFullscreen(windowId, true);
    });
    win.on('leave-full-screen', () => {
      syncTabViewBounds();
      this.tabRegistry.setFullscreen(windowId, false);
    });

    // 창의 화면을 다른 문서로 바꾸는 것은 main만 한다(로그인 세션이 시작되고 끝날 때).
    // 문서 스스로는 지금 문서를 다시 불러오는 것만 할 수 있다: 탭바 문서가 로그인 화면으로,
    // 로그인 화면이 탭바 문서로 스스로 옮겨 가지 못한다.
    const guardShellNavigation = (event: Electron.Event, url: string) => {
      if (
        allowsWindowPageNavigation(
          rendererLocation(),
          { requested: entry.page, committed: entry.committed },
          url,
        )
      ) {
        return;
      }
      event.preventDefault();
      if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
    };
    win.webContents.on('will-navigate', guardShellNavigation);
    win.webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
      if (!isPostcodeFrameRedirect(url, isMainFrame)) guardShellNavigation(event, url);
    });
    // 문서가 바뀌는 이동이 끝났다(main frame). 이때 들어선 문서의 역할을 기록한다.
    win.webContents.on('did-navigate', (_event, url, httpResponseCode) => {
      entry.committed = windowPageRoleOfDocument(
        rendererLocation(),
        url,
        httpResponseCode,
      );
      if (
        windowPageNeedsRecovery({
          requested: entry.page,
          committed: entry.committed,
          loading: entry.pendingLoads > 0,
        })
      ) {
        this.recoverWindowPage(windowId, `unexpected document (${httpResponseCode})`);
      }
    });
    // 창의 화면을 불러오지 못했거나 화면의 프로세스가 죽었다. 그대로 두면 탭바(또는
    // 로그인 화면)가 빈 채로 남으므로 다시 불러온다. 끊긴 로드(-3)는 다른 로드에 밀린 것이다.
    win.webContents.on(
      'did-fail-load',
      (_event, code, _description, _url, isMainFrame) => {
        if (isMainFrame && code !== -3) {
          this.recoverWindowPage(windowId, `load failed (${code})`);
        }
      },
    );
    win.webContents.on('render-process-gone', (_event, details) => {
      entry.committed = null;
      this.recoverWindowPage(windowId, `renderer gone (${details.reason})`);
    });
    // 창 제목은 main이 탭 상태로 정한다. 문서의 <title>(모든 창이 같다)이 덮어쓰지 못하게 한다.
    win.on('page-title-updated', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^(https?:|tel:)/i.test(url)) void shell.openExternal(url);
      return { action: 'deny' };
    });
    // 기본 메뉴의 Cmd+W(창 닫기)보다 먼저 받아 탭 단위로 처리한다. 로그인 전에는 탭이
    // 없으므로 가로채지 않는다(Cmd+W는 창을 닫는다).
    win.webContents.on('before-input-event', (event, input) => {
      this.handleTabShortcut(event, input, windowId);
    });
    // Windows 마우스 사이드 버튼. macOS는 화면이 mouseup 버튼 3/4로 받아 보낸다.
    win.on('app-command', (_event, command) => {
      if (command === 'browser-backward') {
        this.tabRegistry.runCommand(windowId, { type: 'history', direction: 'back' });
      } else if (command === 'browser-forward') {
        this.tabRegistry.runCommand(windowId, { type: 'history', direction: 'forward' });
      }
    });
  }

  /**
   * 탭 단축키(새 탭, 탭 닫기, 탭 전환, 뒤로/앞으로)를 그 창의 탭 목록에 적용하고 기본
   * 동작을 막는다. 창의 화면, 탭 화면, 전화 팝업 층 어디에 focus가 있어도 같다. 로그인
   * 전에는 탭이 없으므로 가로채지 않는다(Cmd+W는 창을 닫는다).
   */
  private handleTabShortcut(
    event: Electron.Event,
    input: Electron.Input,
    windowId: number | null,
  ): void {
    // 탭을 끄는 중에 누른 Escape는 끌기를 취소한다(tabDropScene이 본다).
    if (input.key === 'Escape') this.lastEscapeInputAt = Date.now();
    const command = tabCommandForInput(input, process.platform);
    if (!command || windowId === null || !this.windows.has(windowId)) return;
    if (!this.tabRegistry.isSessionActive()) return;
    event.preventDefault();
    this.tabRegistry.runCommand(windowId, command);
  }

  /**
   * 창 자체의 화면에 그 문서를 불러온다. 이미 그 문서를 불러오라고 했으면 아무것도 하지
   * 않는다(`force`는 실패한 문서를 다시 불러올 때 쓴다).
   * 로그인 전에는 로그인 화면(gate), 로그인 뒤에는 탭바 문서다.
   */
  private loadWindowPage(
    win: BrowserWindow,
    kind: WindowPageKind,
    options: { force?: boolean } = {},
  ): void {
    const entry = this.windows.get(win.id);
    if (!entry || win.isDestroyed()) return;
    if (entry.page === kind && !options.force) return;
    const isFirstLoad = entry.page === null;
    if (!options.force) {
      // main이 다른 문서를 불러오라고 했다. 이전 문서의 실패 횟수는 이어 세지 않는다.
      if (entry.recoveryTimer) clearTimeout(entry.recoveryTimer);
      entry.recoveryTimer = null;
      entry.recovery = NO_WINDOW_PAGE_FAILURES;
    }
    entry.page = kind;
    const target = windowPageTarget(rendererLocation(), kind);
    entry.pendingLoads += 1;
    const load =
      'url' in target ? win.loadURL(target.url) : win.loadFile(target.filePath);
    const settled = () => {
      entry.pendingLoads = Math.max(0, entry.pendingLoads - 1);
    };
    void load.then(settled, (error: unknown) => {
      settled();
      // 다른 문서로 바꾸는 중에 끊긴 이전 로드(ERR_ABORTED)는 실패가 아니다. 이 로드가
      // 밀려난 경우와, 이 로드가 앞의 로드를 밀어내며 그 끊김을 대신 통보받은 경우 모두다.
      if (this.windows.get(win.id)?.page !== kind) return;
      if (isAbortOfAnotherLoad(error, target)) return;
      // 다시 불러오는 일은 did-fail-load가 맡는다(recoverWindowPage).
      console.warn(`[window] failed to load the ${kind} page`, error);
    });
    if (isFirstLoad && shouldAutoOpenDevTools()) {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  }

  /**
   * 창의 화면을 불러오지 못했거나, 화면의 프로세스가 죽었거나, main이 불러오라고 하지 않은
   * 문서가 들어섰다. main이 정한 문서를 다시 불러온다. 연달아 실패하면 몇 번만 하고
   * 그만둔다(끝없이 다시 불러오며 깜빡이지 않게).
   */
  private recoverWindowPage(windowId: number, reason: string): void {
    const entry = this.windows.get(windowId);
    if (!entry || entry.page === null || entry.recoveryTimer) return;
    const plan = planWindowPageRecovery(entry.recovery, Date.now());
    if (!plan) {
      console.error(
        `[window] the ${entry.page} page could not be restored (${reason}); giving up`,
      );
      return;
    }
    console.warn(
      `[window] reloading the ${entry.page} page in ${plan.delayMs} ms (${reason})`,
    );
    entry.recovery = plan.next;
    entry.recoveryTimer = setTimeout(() => {
      entry.recoveryTimer = null;
      const win = BrowserWindow.fromId(windowId);
      const current = this.windows.get(windowId);
      if (!win || win.isDestroyed() || current !== entry || entry.page === null) return;
      this.loadWindowPage(win, entry.page, { force: true });
    }, plan.delayMs);
  }

  /** 로그인 세션이 시작됐다: 열려 있는 창의 화면을 탭바 문서로 바꾼다. */
  private showTabBarPages(): void {
    for (const windowId of this.windows.keys()) {
      const win = BrowserWindow.fromId(windowId);
      if (win && !win.isDestroyed()) this.loadWindowPage(win, 'tab-bar');
    }
  }

  /**
   * 로그인 세션이 끝났다: 메인 창의 화면을 로그인 화면으로 되돌린다. 메인 창이 아닌 창은
   * 탭 목록이 닫는다.
   */
  private showGatePages(): void {
    for (const [windowId, entry] of this.windows) {
      const win = BrowserWindow.fromId(windowId);
      if (entry.kind === 'main' && win && !win.isDestroyed()) {
        this.loadWindowPage(win, 'gate');
      }
    }
  }

  /**
   * 탭 화면이 보낸 탭 명령(마우스 사이드 버튼의 뒤로/앞으로). 명령은 그 창에서 보고 있는
   * 탭에 적용되므로, 그 탭의 화면이 보낸 것만 받는다: 뒤에 있는 탭 화면이 보고 있는 탭을
   * 움직이거나 닫을 수 없다. 탭 닫기·새 탭 같은 명령은 탭 화면이 보낼 일이 없어 받지 않는다
   * (단축키는 main이 입력을 직접 받는다).
   */
  runTabCommandFromSender(senderWebContentsId: number, command: TabCommand): void {
    if (!isTabScreenCommand(command)) return;
    const identity = this.visibleTabSender(senderWebContentsId);
    if (identity) this.tabRegistry.runCommand(identity.hostId, command);
  }

  /** 보낸 쪽이 자기 창에서 지금 보이는 탭의 화면이면 그 탭과 창. 아니면 null. */
  private visibleTabSender(
    senderWebContentsId: number,
  ): { tabId: string; hostId: number } | null {
    if (this.isCallOverlaySender(senderWebContentsId)) return null;
    if (!this.isAuthorizedNativeSender(senderWebContentsId)) return null;
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    if (!identity || !this.windows.has(identity.hostId)) return null;
    return this.tabRegistry.getActiveTabId(identity.hostId) === identity.tabId
      ? { tabId: identity.tabId, hostId: identity.hostId }
      : null;
  }

  createMainWindow(): BrowserWindow {
    // 창은 앱이 준비된 뒤에 만든다. 이때부터 OS 키체인을 읽을 수 있다.
    this.startAuth();
    const win = new BrowserWindow({
      ...getBaseWindowOptions(),
      width: 1440,
      height: 900,
      minWidth: 1200,
      minHeight: 760,
      title: APP_WINDOW_TITLE,
    });
    this.registerNativeHost(win, 'main');
    this.mainWindowId = win.id;
    // 로그인해 있으면 탭 목록이 이 창에 첫 탭을 만든다.
    this.tabRegistry.registerWindow(win.id, 'main', {
      fullscreen: win.isFullScreen(),
    });
    // 로그인해 있으면(창만 닫았다 다시 연 경우) 바로 탭바 문서를, 아니면 로그인 화면을 불러온다.
    this.loadWindowPage(win, this.tabRegistry.isSessionActive() ? 'tab-bar' : 'gate');
    return win;
  }

  /**
   * 탭 하나를 받을 새 창을 만든다(탭을 탭 줄 밖에 놓았거나, 매물 상세를 새 창으로 열었을 때).
   * 탭 목록이 이 함수가 돌아오자마자 탭과 떠 있는 탭 화면을 이 창으로 옮기므로, 탭
   * 화면을 붙일 자리까지 준비해서 돌려준다. 창은 탭 화면이 붙거나 창의 화면이 준비된
   * 뒤에 보여 준다.
   */
  private createTabWindow(request: CreateTabWindowRequest): number | null {
    const source =
      request.sourceWindowId === null
        ? null
        : BrowserWindow.fromId(request.sourceWindowId);
    const liveSource = source && !source.isDestroyed() ? source : null;
    let created: BrowserWindow | null = null;
    try {
      let bounds: { x: number; y: number; width: number; height: number };
      /** 탭을 놓은 자리에 맞춘 창의 자리. 창을 보여 준 뒤에 한 번 더 맞춘다(아래 reveal). */
      let dropPosition: ScreenPoint | null = null;
      if (request.reason === 'tab-drop' && request.placement) {
        // 옮겨 온 탭 화면이 크기 변화 없이 그대로 보이도록 원래 창과 같은 크기로 만든다.
        // 원래 창이 전체 화면·최대화면 그 전의 크기를 쓴다.
        const size =
          liveSource && (liveSource.isFullScreen() || liveSource.isMaximized())
            ? liveSource.getNormalBounds()
            : liveSource?.getContentBounds();
        const width = size?.width ?? 1100;
        const height = size?.height ?? 760;
        dropPosition = this.placedPosition(request.placement, { width, height });
        bounds = { ...dropPosition, width, height };
      } else {
        const sourceBounds =
          liveSource?.getBounds() ?? screen.getPrimaryDisplay().workArea;
        const workArea = screen.getDisplayMatching(sourceBounds).workArea;
        const width = Math.min(1180, workArea.width);
        const height = Math.min(820, workArea.height);
        bounds = {
          x: Math.round(
            Math.min(
              Math.max(sourceBounds.x + 32, workArea.x),
              workArea.x + workArea.width - width,
            ),
          ),
          y: Math.round(
            Math.min(
              Math.max(sourceBounds.y + 32, workArea.y),
              workArea.y + workArea.height - height,
            ),
          ),
          width,
          height,
        };
      }

      const win = new BrowserWindow({
        ...getBaseWindowOptions(),
        show: false,
        ...bounds,
        minWidth: Math.min(800, bounds.width),
        minHeight: Math.min(600, bounds.height),
        title: windowTitleForTabs({
          tabs: [request.tab],
          activeTabId: request.tab.id,
        }),
      });
      created = win;
      this.registerNativeHost(win, 'detached');

      const windowId = win.id;
      const reveal = () => {
        if (!this.pendingWindowReveals.delete(windowId) || win.isDestroyed()) return;
        this.noteWindowBroughtForward(windowId);
        win.show();
        // 처음 보여 줄 때 OS가 창의 자리를 바꿨으면(macOS는 화면에 다 들어오지 않는 창을
        // 화면 안으로 끌어다 놓는다) 우리가 정한 자리로 다시 맞춘다.
        if (dropPosition) win.setPosition(dropPosition.x, dropPosition.y, false);
        win.focus();
        this.focusActiveTabView(windowId);
      };
      this.pendingWindowReveals.set(windowId, reveal);
      win.once('ready-to-show', reveal);
      // 탭을 받는 창은 로그인한 동안에만 생긴다: 탭바 문서를 바로 불러온다.
      this.loadWindowPage(win, 'tab-bar');
      return windowId;
    } catch (error) {
      console.warn('[window] failed to create a tab window', error);
      // 만들다 만 창을 보이지 않는 채로 남기지 않는다. 등록까지 됐으면 closed 정리가 이어진다.
      if (created && !created.isDestroyed()) {
        this.pendingWindowReveals.delete(created.id);
        try {
          created.destroy();
        } catch {
          // 이미 닫히는 중이다.
        }
      }
      return null;
    }
  }

  /**
   * 탭을 탭 줄 밖에 놓았을 때 그 자리를 따지는 데 쓰는 것: 끌기를 시작한 창의 자리와
   * 확대 비율, 보이는 앱 창들의 자리(가장 최근에 앞에 있던 창부터).
   */
  private tabDropScene(sourceWindowId: number): TabDropScene | null {
    const source = BrowserWindow.fromId(sourceWindowId);
    if (!source || source.isDestroyed() || !this.windows.has(sourceWindowId)) return null;
    const windows: Array<{ id: number; content: Electron.Rectangle; order: number }> = [];
    for (const id of this.windows.keys()) {
      const win = BrowserWindow.fromId(id);
      if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) continue;
      windows.push({
        id,
        content: win.getContentBounds(),
        order: this.windowFocusOrder.get(id) ?? 0,
      });
    }
    windows.sort((a, b) => b.order - a.order);
    return {
      sourceContent: source.getContentBounds(),
      zoomFactor: source.webContents.getZoomFactor(),
      windows: windows.map(({ id, content }) => ({ id, content })),
      stripHeight: DETACHED_TITLEBAR_HEIGHT,
      escapePressed: Date.now() - this.lastEscapeInputAt < ESCAPE_EVIDENCE_MS,
    };
  }

  /**
   * 탭을 놓은 자리에 맞춘 창의 자리: 탭이 마우스 밑에 오는 자리를, 손을 뗀 화면 밖으로
   * 걸치지 않게 다듬은 것.
   */
  private placedPosition(
    placement: TabWindowPlacement,
    size: { width: number; height: number },
  ): ScreenPoint {
    return keepWindowOnScreen(
      placement.position,
      size,
      screen.getDisplayNearestPoint(placement.point).workArea,
    );
  }

  /** 탭 하나뿐인 창의 탭을 탭 줄 밖에 놓았다: 새 창을 만들지 않고 그 창을 옮긴다. */
  private moveWindowToDrop(windowId: number, placement: TabWindowPlacement): void {
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) return;
    try {
      // 전체 화면·최대화인 창은 옮길 자리가 없다.
      if (win.isFullScreen() || win.isMaximized()) return;
      const { width, height } = win.getBounds();
      const position = this.placedPosition(placement, { width, height });
      win.setPosition(position.x, position.y, false);
    } catch {
      // 닫히는 중이거나 OS가 거부한 좌표다.
    }
  }

  /**
   * 창을 앞으로 가져온다. 아직 보여 주지 않은 새 창은 탭 화면이 붙을 때 보이면서 앞으로
   * 나오므로 여기서는 건드리지 않는다.
   */
  private focusWindow(windowId: number): void {
    if (this.pendingWindowReveals.has(windowId)) return;
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) return;
    try {
      this.noteWindowBroughtForward(windowId);
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
      this.focusActiveTabView(windowId);
    } catch {
      // 닫히는 중인 창이다.
    }
  }

  /**
   * 앞으로 가져온 창에서 보이는 탭 화면이 키보드 입력을 받게 한다. 탭 화면은 그 창이 앞에
   * 있을 때만 입력을 받으므로(NativeTabHost.activate), 창을 앞으로 가져오기 전에 이미
   * 보이게 된 탭 화면은 여기서 받는다.
   */
  private focusActiveTabView(windowId: number): void {
    const activeTabId = this.nativeTabs.getActiveTabId(windowId);
    if (activeTabId) this.nativeTabs.focus(activeTabId);
  }

  closeWindow(windowId: number) {
    const win = BrowserWindow.fromId(windowId);
    if (win && !win.isDestroyed()) win.close();
  }

  hasWindow(windowId: number): boolean {
    return this.windows.has(windowId);
  }

  getKind(windowId: number): WindowKind | null {
    return this.windows.get(windowId)?.kind ?? null;
  }

  getMainWindow(): BrowserWindow | null {
    if (this.mainWindowId == null) return null;
    return BrowserWindow.fromId(this.mainWindowId) ?? null;
  }

  // ---------------------------------------------------------------------------
  // 탭바 화면(창 자체의 화면)과 주고받는 것
  // ---------------------------------------------------------------------------

  private publishTabBarState(windowId: number, state: TabBarState): void {
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) return;
    // 창 제목(작업 표시줄, Mission Control)은 그 창에서 보고 있는 탭을 따른다.
    try {
      win.setTitle(windowTitleForTabs(state));
    } catch {
      // 닫히는 중인 창이다.
    }
    // 탭 상태는 탭바 문서에만 보낸다. 아직 뜨는 중이면 뜨면서 처음 상태를 직접 읽는다.
    if (this.windows.get(windowId)?.committed !== 'tab-bar') return;
    try {
      win.webContents.send(TAB_BAR_CHANNELS.state, state);
    } catch {
      // 창의 화면이 다시 뜨는 중이면 뜨면서 처음 상태를 직접 읽는다.
    }
  }

  /** 창의 화면이 뜨면서 읽는 그 창의 탭바 상태. 첫 화면부터 탭이 그려지게 한다. */
  getTabBarState(windowId: number): TabBarState | null {
    const kind = this.getKind(windowId);
    if (kind === null) return null;
    return (
      this.tabRegistry.getBarState(windowId) ??
      emptyTabBarState(kind, process.platform)
    );
  }

  dispatchTabBarAction(windowId: number, envelope: TabBarActionEnvelope): void {
    if (!this.windows.has(windowId)) return;
    if (envelope.action.type === 'drop-outside' && !app.isPackaged) {
      this.logTabDrop(windowId, envelope.action);
    }
    this.tabRegistry.dispatchBarAction(windowId, envelope);
  }

  /**
   * 개발 실행에서만: 탭을 탭 줄 밖에 놓았을 때 자리를 구하는 세 가지 값과 판단을 남긴다.
   * 쓰는 값은 "문서 안 좌표 + 창의 자리"다. 끌기 이벤트의 화면 좌표와 지금 마우스 위치는
   * 비교용이다(모니터 배치에 따라 어긋나는지 볼 수 있다).
   */
  private logTabDrop(
    windowId: number,
    action: Extract<TabBarActionEnvelope['action'], { type: 'drop-outside' }>,
  ): void {
    const scene = this.tabDropScene(windowId);
    if (!scene) return;
    const plan = planTabDrop(scene, windowId, action, detachedTabOrigin(process.platform));
    const at = (point: ScreenPoint | undefined) =>
      point ? `(${Math.round(point.x)}, ${Math.round(point.y)})` : '(none)';
    const outcome =
      plan.kind === 'place'
        ? `window at ${at(this.placedPosition(plan, scene.sourceContent))} (tab under the pointer at ${at(plan.position)})`
        : `nothing (${plan.reason})`;
    console.info(
      `[tabs] drop outside: client+window=${at(plan.point)} event.screen=${at(action.eventScreen)} ` +
        `cursor now=${at(screen.getCursorScreenPoint())} accepted=${action.accepted} ` +
        `escape=${scene.escapePressed} -> ${outcome}`,
    );
  }

  /** 다른 탭을 건드리지 않고 매물 상세를 새 창으로 연다. */
  openPropertyWindow(
    payload: OpenPropertyWindowPayload,
    sourceWindowId: number,
  ): { ok: true; windowId: number } | { ok: false; error: string } {
    const result = this.tabRegistry.openStandaloneTab(
      {
        route: `/properties/${encodeURIComponent(payload.propertyId)}`,
        kind: 'property',
        title: payload.title,
        resourceKey: tabResourceKeys.entity('property', payload.propertyId),
      },
      sourceWindowId,
    );
    return result.ok ? { ok: true, windowId: result.windowId } : result;
  }

  /** 앱이 준비된 뒤 저장된 로그인을 읽고 사용자를 확인한다. 여러 번 불러도 된다. */
  startAuth(): void {
    void this.auth.start();
  }

  private createAuthController(): DesktopAuthController {
    const apiBaseUrl = this.apiBaseUrl;
    return new DesktopAuthController({
      createProvider: (callbacks) =>
        new Auth0DesktopSession({
          config: resolveAuth0ConfigForMain(),
          store: new SafeStorageAuth0TokenStore(),
          fetch: electronFetch,
          ...callbacks,
        }),
      fetchUser: createSessionUserFetcher({ apiBaseUrl, fetch: electronFetch }),
      onChange: (next, previous) => this.handleAuthSessionChanged(next, previous),
    });
  }

  /**
   * main의 로그인 세션이 바뀌었다. 사람이나 사무소가 바뀌면(로그인·로그아웃 포함)
   * 이전 계정의 화면과 작업 상태를 먼저 치우고, 그다음 모든 화면에 새 세션을 알린다.
   */
  private handleAuthSessionChanged(
    next: DesktopAuthSessionSnapshot,
    previous: DesktopAuthSessionSnapshot,
  ): void {
    // 실시간 연결은 확인된 로그인에만 붙는다. 사람·사무소가 바뀌면 먼저 끊긴다.
    const target = realtimeTargetForSession(next);
    this.realtime.setSession(target);
    // 통화도 사무소가 있는 로그인에서만 받는다. 세션이 바뀌면 통화 상태를 버리고 팝업을 숨긴다.
    this.cti.setSession(target);
    try {
      if (authSessionPrincipal(previous) !== authSessionPrincipal(next)) {
        // 탭과 떠 있는 화면은 이전 사람·사무소의 것이다. 탭·닫은 탭·입력 초안을 모두
        // 버리고 메인 창이 아닌 창은 닫는다. 미리 띄워 둔 예비 화면도 함께 버린다.
        // 한 단계가 실패해도 나머지는 치운다.
        for (const cleanup of [
          () => this.tabRegistry.endSession(),
          () => this.nativeTabs.clearTabs(),
          () => this.callOverlays.destroyAll(),
          // 탭바 문서를 보여 주던 메인 창은 로그인 화면으로 돌아간다.
          () => this.showGatePages(),
        ]) {
          try {
            cleanup();
          } catch (error) {
            console.error('[auth] failed to clear the previous session', error);
          }
        }
      }
    } finally {
      // 치우다 실패해도 새 세션은 반드시 알린다. 알리지 않으면 다른 창이 이전 계정의
      // 화면을 그대로 보여 준다.
      this.broadcastToRenderers('auth:session', next, { overlays: true });
    }

    // 사무소가 있는 로그인이 확인되면 메인 창에 첫 탭을 연다. 한번 확인된 세션은
    // 서버가 잠시 닿지 않아도 그대로이므로 탭도 그대로 남는다.
    if (target && !this.tabRegistry.isSessionActive()) {
      this.tabRegistry.startSession();
      // 로그인 화면이던 창의 화면을 탭바 문서로 바꾼다. 문서가 뜨면서 탭 상태를 읽는다.
      this.showTabBarPages();
    }
  }

  /**
   * 창 자체의 화면 가운데 앱 전체의 상태를 받는 것: 로그인 전 화면(gate)만이다. 탭바 문서는
   * 탭바 상태만 받는다. 로그인 세션(사용자 정보)·실시간 이벤트·통화는 보내지 않는다.
   */
  private gatePages(): Electron.WebContents[] {
    const pages: Electron.WebContents[] = [];
    for (const [windowId, entry] of this.windows) {
      if (!windowPageReceivesAppBroadcasts(entry.committed)) continue;
      const win = BrowserWindow.fromId(windowId);
      if (win && !win.isDestroyed()) pages.push(win.webContents);
    }
    return pages;
  }

  /**
   * 앱 전체가 같이 아는 상태를 화면에 보낸다: 로그인 전 화면, 탭 화면(미리 띄워 둔 여분
   * 포함), 그리고 필요하면 전화 팝업 층. 탭바 문서에는 보내지 않는다.
   */
  broadcastToRenderers(
    channel: string,
    payload: unknown,
    options: { overlays?: boolean } = {},
  ): void {
    for (const page of this.gatePages()) {
      try {
        page.send(channel, payload);
      } catch {
        // One crashed shell must not prevent healthy/native recipients.
      }
    }
    this.nativeTabs.broadcast(channel, payload, { includeSpare: true });
    if (options.overlays) this.callOverlays.broadcast(channel, payload);
  }

  /** 지금 로그인한 세션의 접근 토큰. main 안에서 서버를 부를 때 쓴다. 없으면 null. */
  getSessionAccessToken(): Promise<string | null> {
    return this.auth.getAccessToken(this.auth.getSnapshot().providerSessionId);
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl;
  }

  /** 서버가 보낸 실시간 이벤트를 모든 셸과 탭 화면에 전한다. */
  private handleRealtimeEvent(event: RealtimeEventMessage): void {
    if (event.name === 'cti.incoming' || event.name === 'cti.call.updated') {
      this.cti.handleServerCallEvent();
    }
    this.broadcastToRenderers('realtime:event', event);
  }

  /**
   * 화면이 방(매물 상세 등)의 이벤트를 받고 싶다고 했다. 화면이 보여 주는 세션이
   * 지금 로그인한 세션일 때만 받는다. 화면이 닫히거나 다시 불리면 그 화면의 구독을 놓는다.
   */
  subscribeRealtimeRoom(
    sender: Electron.WebContents,
    room: RealtimeRoom,
    sessionId: number,
  ): boolean {
    if (!this.isCurrentSignedInSession(sessionId)) return false;
    if (!this.realtime.subscribe(sender.id, room)) return false;
    this.watchRealtimeSubscriber(sender);
    return true;
  }

  unsubscribeRealtimeRoom(senderId: number, room: RealtimeRoom): void {
    this.realtime.unsubscribe(senderId, room);
  }

  getRealtimeStatus(): RealtimeStatus {
    return this.realtime.getStatus();
  }

  private isCurrentSignedInSession(sessionId: number): boolean {
    const session = this.auth.getSnapshot();
    return session.authenticated && session.providerSessionId === sessionId;
  }

  private watchRealtimeSubscriber(sender: Electron.WebContents): void {
    const senderId = sender.id;
    if (this.realtimeSubscribers.has(senderId)) return;
    this.realtimeSubscribers.add(senderId);
    const release = () => this.realtime.releaseOwner(senderId);
    // 다른 문서가 실제로 들어섰을 때 놓는다(새로 불러오기 포함): 그 문서가 요청한 구독은
    // 주인이 없다. 시작만 하고 막힌 이동(`tel:` 링크 등)에서는 문서가 그대로이므로
    // 구독도 그대로 둔다. 탭 안에서의 화면 이동은 같은 문서라 여기 해당하지 않고,
    // 화면이 직접 놓는다.
    sender.on('did-navigate', release);
    sender.on('render-process-gone', release);
    sender.once('destroyed', () => {
      this.realtimeSubscribers.delete(senderId);
      release();
    });
  }

  getAuthSession(): DesktopAuthSessionSnapshot {
    return this.auth.getSnapshot();
  }

  /**
   * 화면이 보여 주는 계정의 세션 번호(scopeSessionId)로만 토큰을 준다. 다른 창의
   * 로그아웃·로그인으로 main 세션이 바뀐 뒤에 예전 계정을 보여 주는 화면이 새 계정
   * 토큰으로 요청하지 않게 하기 위해서다.
   */
  requestAuthToken(scopeSessionId: number | null): Promise<string | null> {
    return this.auth.getAccessToken(scopeSessionId);
  }

  /** 로그인 화면이 받은 아이디·비밀번호로 로그인한다. 비밀번호는 남기지 않는다. */
  loginAuth(username: string, password: string): Promise<DesktopAuthLoginResult> {
    return this.auth.login(username, password);
  }

  /** 가입 화면이 받은 값으로 계정을 만들고 바로 로그인한다. */
  signupAuth(input: DesktopAuthSignupInput): Promise<DesktopAuthSignupResult> {
    return this.auth.signup(input.username, input.password, input.name);
  }

  /** 화면이 보여 주던 세션이 지금 세션일 때만 로그아웃한다. */
  logoutAuth(sessionId: number | null): Promise<void> {
    return this.auth.logout(sessionId);
  }

  refreshAuthUser(): Promise<DesktopAuthRefreshResult> {
    return this.auth.refreshUser();
  }

  /** 화면이 받은 401을 main이 `/auth/me`로 직접 확인한다. */
  reportAuthUnauthorized(sessionId: number | null): Promise<void> {
    return this.auth.reportUnauthorized(sessionId);
  }

  retryAuth(): Promise<void> {
    return this.auth.retry();
  }

  /**
   * 앱 창에 속한 믿을 수 있는 앱 문서인지: 로그인 화면(gate)과, 창에 붙은 탭 화면이
   * 해당한다(탭 화면도 BrowserWindow.fromWebContents로는 그 창이 나온다). 탭바 문서는
   * 여기 들지 않는다. 탭바 문서는 탭바 통로만 쓴다.
   *
   * 창 자체의 화면은 문서가 들어설 때 기록한 역할로 가린다. 떠 있는 동안의 주소로 가리지
   * 않는다(문서가 `history.pushState`로 주소를 바꿔도 역할은 그대로다).
   */
  isRegisteredShellSender(senderWebContentsId: number): boolean {
    const contents = webContents.fromId(senderWebContentsId);
    if (!contents || contents.isDestroyed()) return false;
    const win = BrowserWindow.fromWebContents(contents);
    const entry = win ? this.windows.get(win.id) : undefined;
    if (!win || !entry) return false;
    if (!isTrustedRendererDocumentUrl(contents.getURL())) return false;
    if (win.webContents.id !== senderWebContentsId) return true;
    return entry.committed === 'gate';
  }

  /**
   * 창 자체의 화면이 로그인 화면(gate)일 때만 참이다. 로그인·가입·다시 확인은 이 화면만
   * 요청할 수 있다. 창에 붙은 탭 화면도, 로그인 뒤의 탭바 문서도 해당하지 않는다.
   */
  isWindowShellSender(senderWebContentsId: number): boolean {
    if (!this.isRegisteredShellSender(senderWebContentsId)) return false;
    const contents = webContents.fromId(senderWebContentsId);
    const win = contents ? BrowserWindow.fromWebContents(contents) : null;
    return win?.webContents.id === senderWebContentsId;
  }

  /** 창 자체의 화면이 탭바 문서일 때 그 창의 id. 탭바 통로는 이 문서만 쓴다. */
  windowIdForTabBarSender(senderWebContentsId: number): number | null {
    const contents = webContents.fromId(senderWebContentsId);
    if (!contents || contents.isDestroyed()) return null;
    const win = BrowserWindow.fromWebContents(contents);
    const entry = win ? this.windows.get(win.id) : undefined;
    if (!win || !entry) return null;
    if (win.webContents.id !== senderWebContentsId) return null;
    return entry.committed === 'tab-bar' ? win.id : null;
  }

  /**
   * 업데이트 통로를 쓰려는 화면의 종류. 확인·설치·닫기는 사용자가 보고 있는 화면만 할 수
   * 있다(src/main/updaterAccess.ts).
   */
  updaterSenderKind(senderWebContentsId: number): UpdaterSenderKind {
    if (this.isWindowShellSender(senderWebContentsId)) return 'gate';
    if (this.isCallOverlaySender(senderWebContentsId)) return 'other';
    if (this.visibleTabSender(senderWebContentsId)) return 'visible-tab';
    return this.isAuthorizedNativeSender(senderWebContentsId)
      ? 'background-tab'
      : 'other';
  }

  /** 탭을 가진 탭 화면이 보낸 것인지(미리 띄워 둔 화면과 전화 팝업 층은 아니다). */
  isTabScreenSender(senderWebContentsId: number): boolean {
    return (
      !this.isCallOverlaySender(senderWebContentsId) &&
      this.isAuthorizedNativeSender(senderWebContentsId) &&
      this.nativeTabs.lookupSender(senderWebContentsId) !== null
    );
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
    return Boolean(route && resolveTabScreenRoute(route));
  }

  /**
   * 탭 화면이 뜨면서 읽는 자기 탭(주소·제목·입력 초안·스크롤). 탭 목록의 값이
   * 기준이다. 화면을 내렸다가 다시 띄워도 여기서 받은 것으로 이어 간다.
   */
  getNativeTabSnapshot(senderWebContentsId: number): Tab | null {
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    if (!identity) return null;
    return this.tabRegistry.getTabSnapshot(identity.tabId) ?? identity.tab;
  }

  /**
   * 탭 화면 안의 페이지가 요청한 탭 작업을 탭 목록에 적용한다. 대상 탭은 보낸 쪽
   * WebContents로 정해지므로 다른 탭을 건드릴 수 없다.
   */
  applyNativeTabAction(
    senderWebContentsId: number,
    action: NativeTabAction,
  ): boolean {
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    if (!identity) return false;
    this.tabRegistry.applyTabAction(identity.tabId, action);
    return true;
  }

  /** 창의 화면 또는 탭 화면이 속한 창의 사이드바 상태. 새 창은 마지막 선택을 따른다. */
  getSidebarStateForSender(senderWebContentsId: number): NativeSidebarState {
    const windowId = this.isWindowShellSender(senderWebContentsId)
      ? this.windowIdForShellSender(senderWebContentsId)
      : (this.nativeTabs.lookupSender(senderWebContentsId)?.hostId ?? null);
    return { open: this.tabRegistry.getSidebarOpen(windowId) };
  }

  /** 탭 화면 안에서 사이드바를 접거나 편 요청. 그 창의 모든 탭 화면이 따른다. */
  requestSidebarOpenFromNative(senderWebContentsId: number, open: boolean): void {
    const identity = this.nativeTabs.lookupSender(senderWebContentsId);
    if (identity) this.tabRegistry.requestSidebarOpenFromTab(identity.tabId, open);
  }

  /**
   * 그 창에 붙은(새로 보여 줬거나 다른 창에서 옮겨 온) 탭 화면이 창의 사이드바 상태와
   * 전화 팝업 여백을 따르게 한다.
   */
  private pushWindowStateToTab(tabId: string): void {
    const hostId = this.nativeTabs.getHostId(tabId);
    if (hostId === null) return;
    const state: NativeSidebarState = {
      open: this.tabRegistry.getSidebarOpen(hostId),
    };
    this.nativeTabs.sendToTab(tabId, 'tabs:sidebarState', state);
    this.nativeTabs.sendToTab(
      tabId,
      'tabs:overlayInset',
      this.callOverlays.getInset(hostId),
    );
  }

  private windowIdForShellSender(senderWebContentsId: number): number | null {
    const contents = webContents.fromId(senderWebContentsId);
    const win = contents ? BrowserWindow.fromWebContents(contents) : null;
    return win && this.windows.has(win.id) ? win.id : null;
  }

  startCti(): void {
    this.ctiBridge.start();
  }

  stopCti(): void {
    this.ctiBridge.stop();
    this.cti.dispose();
  }

  /** Bridge 연결 상태. 로그인 전에는 알려 주지 않는다. */
  getCtiStatus(): CtiStatus {
    return this.auth.isAuthenticated() ? this.cti.getStatus() : CTI_DISCONNECTED_STATUS;
  }

  getCtiCall(): ActiveCall | null {
    return this.auth.isAuthenticated() ? this.cti.getCall() : null;
  }

  /** 화면의 발신 요청. 그 화면이 보여 주는 세션이 지금 로그인한 세션일 때만 받는다. */
  dialCti(request: CtiDialRequest): CtiDialResult {
    if (!this.isCurrentSignedInSession(request.sessionId)) {
      return { ok: false, error: 'not-signed-in' };
    }
    return this.cti.dial({
      callee: request.callee,
      ...(request.caller ? { caller: request.caller } : {}),
    });
  }

  private publishCtiStatus(): void {
    if (!this.auth.isAuthenticated()) return;
    this.broadcastToRenderers('cti:status', this.cti.getStatus());
  }

  /** 통화 상태가 바뀌었다. 팝업 층에 그리게 하고 모든 셸·탭 화면에 알린다. */
  private handleCallChanged(call: ActiveCall | null): void {
    this.presentCallPopup(call);
    this.broadcastToRenderers('cti:call', call);
  }

  private isLiveAppWindow(windowId: number): boolean {
    const win = BrowserWindow.fromId(windowId);
    return Boolean(win && !win.isDestroyed() && this.windows.has(windowId));
  }

  /**
   * 전화 팝업을 띄울 창에 통화 상태를 보낸다. 메인 창이 있으면 메인 창, 다른 앱 창만
   * 있으면 가장 최근에 쓰던 창이다. 한 통화는 처음 띄운 창에 머문다(팝업에 입력하던
   * 내용이 창을 옮기다 사라지지 않게). 그 창이 닫히면 다른 창을 다시 고른다.
   */
  private presentCallPopup(call: ActiveCall | null): void {
    const shown = this.callPopup;
    if (call === null) {
      if (shown) this.setCallOverlayState(shown.windowId, null);
      this.callPopup = null;
      return;
    }
    let windowId =
      shown && shown.key === call.key && this.isLiveAppWindow(shown.windowId)
        ? shown.windowId
        : null;
    if (windowId === null) {
      const mainId = this.mainWindowId;
      windowId = selectCallPopupWindow({
        mainWindowId: mainId !== null && this.isLiveAppWindow(mainId) ? mainId : null,
        windows: [...this.windows.keys()]
          .filter((id) => this.isLiveAppWindow(id))
          .map((id) => ({ id, focusOrder: this.windowFocusOrder.get(id) ?? 0 })),
      });
      if (shown && shown.windowId !== windowId) {
        this.setCallOverlayState(shown.windowId, null);
      }
    }
    if (windowId === null) {
      this.callPopup = null;
      return;
    }
    this.callPopup = { windowId, key: call.key };
    this.setCallOverlayState(windowId, call);
  }

  /** 통화가 있는데 팝업을 띄운 창이 없으면(창이 닫혔거나 이제 생겼으면) 다시 띄운다. */
  private syncCallPopupWindow(): void {
    const call = this.cti.getCall();
    if (!call) return;
    if (this.callPopup && this.isLiveAppWindow(this.callPopup.windowId)) return;
    this.presentCallPopup(call);
  }

  private setCallOverlayState(windowId: number, state: unknown): void {
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

  /**
   * 팝업 층에서 누른 버튼. 통화 상태의 주인인 main이 직접 처리한다. 팝업 층이 보낸
   * 것만, 로그인한 동안에만 받는다. 닫기·다시 조회·통화 기록 갱신은 그 버튼이 가리키는
   * 통화(callKey)가 지금 통화일 때만 적용된다. 링크는 팝업을 닫으면서 함께 오므로
   * (닫기 → 열기 순서) 팝업이 이미 닫힌 뒤에도 받는다.
   */
  handleCallOverlayAction(
    senderWebContentsId: number,
    action: CallOverlayAction,
  ): void {
    if (
      !this.auth.isAuthenticated() ||
      !this.isCallOverlaySender(senderWebContentsId)
    ) {
      return;
    }
    switch (action.type) {
      case 'dismiss':
        this.cti.dismiss(action.callKey);
        return;
      case 'refresh-lookup':
        void this.cti.refreshLookup(action.callKey).catch((error: unknown) => {
          console.error('[cti] lookup 갱신 실패:', error);
        });
        return;
      case 'patch-call-log':
        this.cti.patchCallLog(action.patch, action.callKey);
        return;
      case 'open-route':
        this.openRouteInMainWindow(action.route);
        return;
    }
  }

  /**
   * 그 화면을 메인 창의 탭으로 연다. 메인 창에 탭을 여는 요청(전화 팝업의 링크, 다른
   * 창·탭 화면의 "메인 창에서 열기")은 모두 여기를 거친다. 메인 창이 닫혀 있으면
   * 다시 띄워서 연다.
   */
  openRouteInMainWindow(
    route: string,
  ): { ok: true } | { ok: false; error: string } {
    // 탭으로 열 수 있는 앱 화면만 받는다(로그인·온보딩·문서 파일은 탭이 될 수 없다).
    if (!isTabScreenRoute(route)) {
      return { ok: false, error: 'invalid main-window route' };
    }
    if (!this.auth.isAuthenticated()) return { ok: false, error: 'not signed in' };
    const existing = this.getMainWindow();
    // 새 메인 창은 등록되면서 첫 탭을 받는다. 그 뒤에 이 화면을 연다.
    const main =
      existing && !existing.isDestroyed() ? existing : this.createMainWindow();
    main.focus();
    return this.tabRegistry.openRoute(route, main.id)
      ? { ok: true }
      : { ok: false, error: 'not signed in' };
  }

  /**
   * 팝업 층이 창 아래쪽을 차지한 높이를 그 창의 셸과 탭 화면에 알린다.
   * 알림(toast)이 같은 오른쪽 아래에 뜨므로 그동안 팝업 위로 올린다.
   */
  publishCallOverlayInset(windowId: number): void {
    const inset = this.callOverlays.getInset(windowId);
    this.nativeTabs.sendToHost(windowId, 'tabs:overlayInset', inset);
    // 창의 화면은 로그인 전 화면일 때만 알림을 직접 그린다. 탭바 문서에는 보내지 않는다.
    this.sendToGatePage(windowId, 'tabs:overlayInset', inset);
  }

  /** 그 창의 화면이 로그인 전 화면(gate)이면 보낸다. 보냈으면 true. */
  private sendToGatePage(windowId: number, channel: string, payload: unknown): boolean {
    if (this.windows.get(windowId)?.committed !== 'gate') return false;
    const win = BrowserWindow.fromId(windowId);
    if (!win || win.isDestroyed()) return false;
    try {
      win.webContents.send(channel, payload);
      return true;
    } catch {
      return false;
    }
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
   * 그 창의 알림은 보이는 탭 화면에서 띄운다(창의 화면은 탭 화면 아래에 가려진다). 탭을
   * 바꾸는 중이면 바뀐 뒤에 보이는 화면에 띄운다: 그 전에 보내면 곧 가려질 화면에 뜬다.
   * 보이는 탭 화면이 없으면 로그인 전 화면이 직접 띄운다. 탭바 문서는 알림을 그리지 않으므로
   * 보내지 않는다(탭 화면을 띄우지 못한 창에서는 알림이 뜨지 않는다).
   */
  deliverWindowToast(windowId: number, toast: WindowToast): void {
    void this.tabViews
      .sendToPresentedTab(windowId, 'tabs:toast', toast)
      .catch(() => false)
      .then((delivered) => {
        if (!delivered) this.sendToGatePage(windowId, 'tabs:toast', toast);
      });
  }

  /** 탭 화면이 속한 창. 매물 상세 새 창 열기처럼 창을 기준으로 하는 요청에 쓴다. */
  getNativeTabHostWindow(senderWebContentsId: number): BrowserWindow | null {
    const hostId = this.nativeTabs.lookupSender(senderWebContentsId)?.hostId;
    const host = hostId === undefined ? null : BrowserWindow.fromId(hostId);
    return host && !host.isDestroyed() && this.windows.has(host.id) ? host : null;
  }

  /**
   * 탭 화면이 알린 것: 저장 전 입력이 있는지(화면을 내려도 되는지)와 스크롤 위치.
   * 스크롤은 탭 목록에 보관해 화면을 다시 띄울 때 되돌린다.
   */
  reportNativeTabRetention(
    senderWebContentsId: number,
    update: NativeTabRetentionUpdate,
  ): boolean {
    if (update.viewState) {
      const identity = this.nativeTabs.lookupSender(senderWebContentsId);
      if (identity) {
        this.tabRegistry.reportViewState(identity.tabId, update.viewState);
      }
    }
    return Boolean(
      this.nativeTabs.reportTabRetention(senderWebContentsId, update.reasons),
    );
  }

  broadcastInvalidate(queryKey: readonly unknown[], sourceWindowId: number) {
    for (const page of this.gatePages()) {
      if (page.id === sourceWindowId) continue;
      try {
        page.send('tabs:invalidate', { queryKey, sourceWindowId });
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
  const isCurrentRegisteredEvent = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) =>
    isCurrentMainFrame(event) && manager.isRegisteredSender(event.sender.id);

  /**
   * 창 자체의 화면(로그인 화면·탭바)이 보낸 것인지. 창에 붙은 탭 화면도 같은 창의
   * WebContents로 보이므로, 창의 화면만 해야 하는 요청은 이걸로 확인한다.
   */
  const isCurrentWindowShellEvent = (
    event: Electron.IpcMainInvokeEvent | Electron.IpcMainEvent,
  ) => isCurrentMainFrame(event) && manager.isWindowShellSender(event.sender.id);
  /** 탭바 문서(로그인 뒤의 창 화면)가 보낸 것이면 그 창의 id. */
  const windowIdOfTabBarEvent = (event: Electron.IpcMainEvent): number | null =>
    isCurrentMainFrame(event)
      ? manager.windowIdForTabBarSender(event.sender.id)
      : null;

  // 탭 목록의 주인은 main이다. 탭바 문서는 상태를 받아 그리고, 사용자가 한 동작을 보낸다.
  // 이 두 통로는 탭바 문서만 쓴다. 로그인 화면과 탭 화면은 쓸 수 없다.
  ipcMain.on(TAB_BAR_CHANNELS.bootstrap, (event) => {
    const windowId = windowIdOfTabBarEvent(event);
    event.returnValue = windowId === null ? null : manager.getTabBarState(windowId);
  });

  ipcMain.on(TAB_BAR_CHANNELS.action, (event, payload: unknown) => {
    const windowId = windowIdOfTabBarEvent(event);
    const envelope = windowId === null ? null : parseTabBarActionEnvelope(payload);
    if (windowId !== null && envelope) manager.dispatchTabBarAction(windowId, envelope);
  });

  // 로그인 세션의 주인은 main이다. 화면은 읽고(getSession·session 알림) 요청만 한다.

  ipcMain.handle('auth:getSession', (event) => {
    return isCurrentRegisteredEvent(event)
      ? manager.getAuthSession()
      : SIGNED_OUT_AUTH_SESSION;
  });

  ipcMain.handle('auth:getToken', (event, payload: unknown) => {
    if (!isCurrentRegisteredEvent(event)) return null;
    return manager.requestAuthToken(parseAuthSessionScope(payload));
  });

  // 로그인 화면은 창 자체의 화면(셸)에만 있다. 창에 붙은 탭 화면은 같은 창으로
  // 보이므로 isWindowShellSender로 가른다.
  ipcMain.handle('auth:login', async (event, payload: unknown) => {
    if (!isCurrentWindowShellEvent(event)) {
      return { ok: false, error: 'invalid login requester' };
    }
    const credentials = parseAuthCredentials(payload);
    if (!credentials) {
      return { ok: false, error: '아이디와 비밀번호를 입력해 주세요.' };
    }
    return manager.loginAuth(credentials.username, credentials.password);
  });

  ipcMain.handle('auth:signup', async (event, payload: unknown) => {
    if (!isCurrentWindowShellEvent(event)) {
      return { ok: false, error: 'invalid signup requester' };
    }
    const input = parseAuthSignupInput(payload);
    if (!input) {
      return { ok: false, error: '아이디와 비밀번호를 입력해 주세요.' };
    }
    return manager.signupAuth(input);
  });

  ipcMain.handle('auth:retry', async (event) => {
    if (!isCurrentWindowShellEvent(event)) {
      return { ok: false, error: 'invalid retry requester' };
    }
    await manager.retryAuth();
    return { ok: true };
  });

  // 로그아웃 버튼은 탭 화면(사이드바)에도 있다. 화면이 보여 주던 세션만 끝낸다.
  ipcMain.handle('auth:logout', async (event, payload: unknown) => {
    if (!isCurrentRegisteredEvent(event)) {
      return { ok: false, error: 'unregistered auth sender' };
    }
    await manager.logoutAuth(parseAuthSessionScope(payload));
    return { ok: true };
  });

  ipcMain.handle('auth:refreshUser', async (event) => {
    if (!isCurrentRegisteredEvent(event)) {
      return {
        ok: false,
        error: 'unregistered auth sender',
        snapshot: SIGNED_OUT_AUTH_SESSION,
      };
    }
    return manager.refreshAuthUser();
  });

  ipcMain.handle('auth:reportUnauthorized', async (event, payload: unknown) => {
    if (!isCurrentRegisteredEvent(event)) {
      return { ok: false, error: 'unregistered auth sender' };
    }
    await manager.reportAuthUnauthorized(parseAuthSessionScope(payload));
    return { ok: true };
  });

  // 실시간 연결의 주인은 main이다. 화면은 이벤트를 받고(realtime:event), 방 구독만
  // 요청한다. 셸·탭 화면 어디서든 요청할 수 있다.
  ipcMain.handle('realtime:subscribe', (event, payload: unknown) => {
    const request = parseRealtimeRoomRequest(payload);
    if (!isCurrentRegisteredEvent(event) || !request) {
      return { ok: false, error: 'invalid realtime subscription' };
    }
    return {
      ok: manager.subscribeRealtimeRoom(
        event.sender,
        request.room,
        request.sessionId,
      ),
    };
  });

  ipcMain.on('realtime:unsubscribe', (event, payload: unknown) => {
    const request = parseRealtimeRoomRequest(payload);
    if (!isCurrentRegisteredEvent(event) || !request) return;
    manager.unsubscribeRealtimeRoom(event.sender.id, request.room);
  });

  ipcMain.handle('realtime:getStatus', (event) => {
    return isCurrentRegisteredEvent(event)
      ? manager.getRealtimeStatus()
      : { state: 'offline', rooms: [] };
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

  // 전화(CTI): 통화 상태의 주인은 main이다. 셸·탭 화면은 읽고 발신만 요청하고,
  // 팝업 층만 팝업의 버튼(닫기·다시 조회·통화 기록 갱신·링크)을 보낸다.
  ipcMain.handle('cti:getStatus', (event) =>
    isCurrentRegisteredEvent(event) ? manager.getCtiStatus() : CTI_DISCONNECTED_STATUS,
  );

  ipcMain.handle('cti:getCall', (event) =>
    isCurrentRegisteredEvent(event) ? manager.getCtiCall() : null,
  );

  ipcMain.handle('cti:dial', (event, payload: unknown): CtiDialResult => {
    const request = parseCtiDialRequest(payload);
    if (!isCurrentRegisteredEvent(event) || !request) {
      return { ok: false, error: 'invalid-request' };
    }
    return manager.dialCti(request);
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
    if (action) manager.handleCallOverlayAction(event.sender.id, action);
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
    manager.applyNativeTabAction(event.sender.id, action);
  });

  ipcMain.handle('tabs:getSidebarState', (event): NativeSidebarState => {
    if (!isCurrentRegisteredEvent(event)) return { open: true };
    return manager.getSidebarStateForSender(event.sender.id);
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

  ipcMain.handle('tabs:openPropertyWindow', (event, payload: unknown) => {
    // 탭 화면이 요청한다. 그 탭을 가진 창이 기준이다.
    const source =
      isCurrentMainFrame(event) && manager.isAuthorizedNativeSender(event.sender.id)
        ? manager.getNativeTabHostWindow(event.sender.id)
        : null;
    if (!source || !manager.hasWindow(source.id)) {
      return { ok: false, error: 'unregistered source window' };
    }
    if (!isValidOpenPropertyWindowPayload(payload)) {
      return { ok: false, error: 'invalid property window payload' };
    }
    // 새 창은 탭 화면이 붙거나 창의 화면이 준비되면 스스로 보인다. 기다리지 않는다.
    return manager.openPropertyWindow(payload, source.id);
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

  ipcMain.on('tabs:requestCommand', (event, payload: unknown) => {
    if (!isCurrentMainFrame(event) || !isTabCommand(payload)) return;
    manager.runTabCommandFromSender(event.sender.id, payload);
  });

  // 메인 창에서 열기는 탭 화면과 전화 팝업 층만 요청한다. 로그인 전 화면과 탭바 문서,
  // 미리 띄워 둔 화면은 요청할 수 없다. 주소는 openRouteInMainWindow가 가린다.
  ipcMain.handle('tabs:openInMainWindow', (event, route: unknown) => {
    if (
      !isCurrentMainFrame(event) ||
      !(
        manager.isTabScreenSender(event.sender.id) ||
        manager.isCallOverlaySender(event.sender.id)
      ) ||
      typeof route !== 'string'
    ) {
      return { ok: false, error: 'invalid main-window route' };
    }
    return manager.openRouteInMainWindow(route);
  });
}
