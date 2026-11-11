import { app, dialog, net, protocol } from 'electron';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { existsSync } from 'node:fs';
import {
  WindowManager,
  registerTabIpcHandlers,
  setPackagedRendererBaseUrl,
} from './main/windowManager';
import {
  APP_DOCUMENT,
  fallsBackToAppDocument,
  missingRendererDocuments,
  resolvePackagedRequest,
} from './main/rendererDocuments';
import { runStartup } from './main/startup';
import { allowsUpdaterRequest } from './main/updaterAccess';
import { UpdaterService } from './main/updaterService';
import { APP_WINDOW_TITLE } from './common/tabs/windowTitle';

const APP_PROTOCOL = 'estate-erp';

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_PROTOCOL,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      // 패키지 앱에서 한 번 컴파일한 스크립트를 다시 쓴다(새 창의 탭바가 빨리 뜬다).
      codeCache: true,
    },
  },
]);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// 앱은 한 번만 뜬다. 같은 사용자 데이터 폴더로 두 프로세스가 뜨면 둘이 같은 로그인
// 토큰을 갱신하고, Auth0는 그것을 토큰 재사용으로 보고 양쪽 로그인을 모두 끊는다.
// 두 번째로 뜬 프로세스는 바로 끝나고, 먼저 뜬 앱이 앞으로 나온다(second-instance).
const isPrimaryInstance = app.requestSingleInstanceLock();
if (!isPrimaryInstance) {
  app.quit();
}

// Enable Chrome DevTools Protocol in development so agent-browser / Playwright
// can attach to the renderer. Must run before app.on('ready').
if (!app.isPackaged) {
  const port = process.env.ELECTRON_REMOTE_DEBUGGING_PORT ?? '9333';
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

const windowManager = new WindowManager();
/** 앱을 시작하지 못했다(필요한 문서가 없는 빌드 등). 창을 다시 만들려 하지 않는다. */
let startupFailed = false;
// 업데이트 안내는 탭 화면이 그린다: 창의 화면뿐 아니라 탭 화면에도 상태를 보낸다.
const updaterService: UpdaterService = new UpdaterService(
  (channel, payload) => {
    windowManager.broadcastToRenderers(channel, payload);
    // 시작하지 못한 빌드는 고친 버전이 내려받아지는 대로 설치하고 다시 시작한다.
    if (startupFailed && channel === 'updater:status') installDownloadedUpdate();
  },
  // 보낸 화면이 어떤 화면인지에 따라 가린다. main frame이 아닌 frame은 받지 않는다.
  (event, request) =>
    allowsUpdaterRequest(
      request,
      event.senderFrame === event.sender.mainFrame
        ? windowManager.updaterSenderKind(event.sender.id)
        : 'other',
    ),
);
let packagedRendererProtocolRegistered = false;

function installDownloadedUpdate(): void {
  if (updaterService.getStatus().state === 'downloaded') updaterService.installUpdate();
}

/**
 * 앱을 시작하지 못했다. 조용히 창 없이 남지 않고, 알린 뒤 끝낸다(종료 코드 1). 업데이트
 * 확인은 이미 걸려 있으므로, 알림이 떠 있는 동안 고친 버전이 내려받아지면 바로 설치한다.
 */
async function reportStartupFailure(error: unknown): Promise<void> {
  startupFailed = true;
  console.error('[startup] the app could not start', error);
  installDownloadedUpdate();
  const updating = updaterService.getStatus().state !== 'disabled';
  await dialog.showMessageBox({
    type: 'error',
    title: APP_WINDOW_TITLE,
    message: '앱을 시작할 수 없습니다.',
    detail: [
      '앱에 필요한 파일이 없거나 손상되었습니다.',
      updating
        ? '새 버전을 확인하고 있습니다. 준비되면 자동으로 설치하고 다시 시작합니다. 계속 안 되면 앱을 다시 설치해 주세요.'
        : '앱을 다시 설치해 주세요.',
      '',
      error instanceof Error ? error.message : String(error),
    ].join('\n'),
    buttons: ['종료'],
    defaultId: 0,
    noLink: true,
  });
  app.exit(1);
}

function registerPackagedRendererProtocol() {
  if (!app.isPackaged) return null;
  if (packagedRendererProtocolRegistered) return `${APP_PROTOCOL}://app`;

  const rendererRoot = path.join(
    app.getAppPath(),
    '.vite',
    'renderer',
    'main_window',
  );

  // 문서가 빠진 빌드는 쓸 수 없다. 조용히 넘어가지 않고 바로 알린다(로그인 뒤에야 빈
  // 창으로 드러나지 않게). 주소 처리를 등록하기 전에 확인해, 실패해도 상태가 어중간하지 않다.
  const missing = missingRendererDocuments(rendererRoot, existsSync);
  if (missing.length > 0) {
    throw new Error(
      `documents are missing from the packaged renderer: ${missing.join(', ')}`,
    );
  }

  protocol.handle(APP_PROTOCOL, (request) => {
    const requested = resolvePackagedRequest(rendererRoot, request.url);
    if ('forbidden' in requested) {
      return new Response('Forbidden', { status: 403 });
    }

    // 파일이 없을 때: 화면 주소(/properties/…)는 앱 문서가 받아 그린다. 없는 .html 문서는
    // 앱 문서로 대신하지 않고 404로 답한다.
    const whenMissing = () =>
      fallsBackToAppDocument(requested.relativePath)
        ? net.fetch(pathToFileURL(path.join(rendererRoot, APP_DOCUMENT)).toString())
        : new Response('Not Found', { status: 404 });
    return net.fetch(pathToFileURL(requested.filePath).toString()).then(
      (response) => (response.ok ? response : whenMissing()),
      () => whenMissing(),
    );
  });
  packagedRendererProtocolRegistered = true;

  return `${APP_PROTOCOL}://app`;
}

const createWindow = () => {
  setPackagedRendererBaseUrl(registerPackagedRendererProtocol());
  windowManager.createMainWindow();
};

registerTabIpcHandlers(windowManager);
updaterService.initialize();

const LEGACY_CP_CREDENTIAL_VAULT = path.join(
  'credentials',
  'cp-credentials.v1.json',
);

async function removeLegacyCpCredentialVault(): Promise<void> {
  try {
    await rm(path.join(app.getPath('userData'), LEGACY_CP_CREDENTIAL_VAULT), {
      force: true,
    });
  } catch (error) {
    console.warn(
      'Legacy Electron CP credential vault cleanup failed:',
      error instanceof Error ? error.message : error,
    );
  }
}

app.on('second-instance', () => {
  if (startupFailed) return;
  // 앱을 한 번 더 띄우려 했다. 메인 창을 앞으로 가져오고, 닫혀 있으면 다시 띄운다.
  const main = windowManager.getMainWindow();
  if (!main) {
    if (app.isReady()) createWindow();
    return;
  }
  if (main.isMinimized()) main.restore();
  main.show();
  main.focus();
});

app.on('before-quit', () => {
  windowManager.stopCti();
});

app.on('ready', () => {
  // 두 번째로 뜬 프로세스는 창도, 로그인 복원도, 전화 연결도 시작하지 않고 끝난다.
  if (!isPrimaryInstance) return;
  // 순서는 src/main/startup.ts: 업데이트 확인을 창보다 먼저 시작하고, 창을 만들지 못하면
  // 알린 뒤 끝낸다.
  void runStartup({
    prepare: removeLegacyCpCredentialVault,
    checkForUpdates: () => {
      updaterService.checkForUpdates();
    },
    createWindow,
    // 전화(CTI) Bridge 연결과 통화 상태는 main이 갖는다.
    startServices: () => windowManager.startCti(),
    reportFailure: reportStartupFailure,
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (startupFailed) return;
  // focused detail/detached 창만 남아 있어도 Dock 재활성화는 메인 창을 복원한다.
  if (!windowManager.getMainWindow()) {
    createWindow();
  }
});
