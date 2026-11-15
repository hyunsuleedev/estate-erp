/**
 * 화면을 불러올 개발 서버의 주소. Electron에 의존하지 않는다.
 *
 * 개발 실행(`electron-vite dev`)은 화면 개발 서버의 주소를 실행 환경 변수
 * `ELECTRON_RENDERER_URL`로 넘겨준다. 빌드할 때 박히는 값이 아니라 실행할 때 읽는
 * 값이므로, 패키지 앱은 이 값을 듣지 않는다. 듣는다면 설치된 앱을 환경 변수 하나로
 * 아무 주소나 열게 만들 수 있고, 그 화면에 preload가 붙는다.
 */
export const DEV_SERVER_URL_ENV = 'ELECTRON_RENDERER_URL';

export function resolveDevServerUrl(options: {
  /** 패키지 앱인지(`app.isPackaged`). */
  packaged: boolean;
  env: Record<string, string | undefined>;
}): string | undefined {
  if (options.packaged) return undefined;
  const raw = options.env[DEV_SERVER_URL_ENV]?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    // 개발 서버는 http(s)로만 뜬다. 다른 종류의 주소(file:, javascript: 등)는 받지 않는다.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
    // 문서 주소는 이 값 뒤에 `/`를 붙여 만든다(src/main/rendererDocuments.ts).
    return url.origin;
  } catch {
    return undefined;
  }
}
