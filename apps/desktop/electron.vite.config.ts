import path from 'node:path';
import { defineConfig, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { resolveMainAuth0Config } from './src/common/auth0DesktopConfig';

/**
 * 앱 빌드(electron-vite)의 설정. main·preload·화면 세 빌드를 한 번에 돌린다.
 *
 * 소스와 결과의 자리는 electron-vite의 기본값을 그대로 쓴다.
 *   src/main/index.ts     → out/main/index.js      (package.json의 main)
 *   src/preload/index.ts  → out/preload/index.js   (CommonJS)
 *   src/renderer/*.html   → out/renderer/          (index.html, tabbar.html과 그 자산)
 */
export default defineConfig(({ mode, command }) => {
  // 브라우저 미리보기(개발 서버를 일반 브라우저로 연 경우)의 로그인이 쓰는 Auth0 값.
  // 개발 실행의 main과 같은 규칙이다: 빌드 값(VITE_AUTH0_*, .env 파일 포함)이 기준이고,
  // 실행 환경 변수(ESTATE_AUTH0_*)가 덮어쓰며, 정하지 않으면 시험 테넌트다.
  const buildEnv = loadEnv(mode, __dirname, 'VITE_');
  const devAuth0 = resolveMainAuth0Config({
    build: {
      domain: buildEnv.VITE_AUTH0_DOMAIN,
      clientId: buildEnv.VITE_AUTH0_CLIENT_ID,
      audience: buildEnv.VITE_AUTH0_AUDIENCE,
      realm: buildEnv.VITE_AUTH0_REALM,
    },
    runtimeEnv: process.env,
    packaged: false,
  });

  return {
    main: {
      // main도 화면과 같은 폴더의 .env를 읽는다. 로그인한 사용자를 main이 서버에 직접
      // 확인하므로 API 주소(VITE_API_BASE_URL)가 같아야 한다.
      envDir: __dirname,
      build: {
        // main이 쓰는 패키지(socket.io-client, electron-updater)도 번들 한 파일에 넣는다.
        // electron-vite의 기본값은 밖에 두고 앱의 node_modules에서 불러오는 것이지만, 그러면
        // 패키지 안의 선택 의존성(ws의 bufferutil, debug의 supports-color)을 찾는 require가
        // app.asar 밖의 resources/node_modules까지 올라간다. 사용자별 설치 폴더는 그 사용자가
        // 쓸 수 있는 곳이라, 거기 파일을 두면 main에서 실행된다(asar 무결성 검사 밖이다).
        // 번들에 넣으면 main이 불러오는 것은 electron과 Node 내장 모듈뿐이다.
        externalizeDeps: false,
      },
      resolve: {
        alias: {
          // 실시간 연결(socket.io-client → ws)의 선택 네이티브 의존성. 설치하지 않으며,
          // 그대로 두면 Vite가 넣는 대체 모듈 때문에 main 번들이 깨진다.
          // (src/main/realtime/wsOptionalDeps/bufferutil.ts 설명 참고)
          bufferutil: path.resolve(
            __dirname,
            'src/main/realtime/wsOptionalDeps/bufferutil.ts',
          ),
          'utf-8-validate': path.resolve(
            __dirname,
            'src/main/realtime/wsOptionalDeps/utf-8-validate.ts',
          ),
        },
      },
    },
    preload: {
      build: {
        // sandbox가 켜진 화면의 preload는 electron 말고는 require할 수 없다. 한 파일로 만든다.
        externalizeDeps: false,
      },
    },
    renderer: {
      envDir: __dirname,
      define: {
        __ESTATE_DEV_AUTH0_CONFIG__: JSON.stringify(devAuth0),
      },
      build: {
        // 화면 번들은 내보낼 때 줄인다(electron-vite는 기본으로 줄이지 않는다).
        minify: command === 'build',
        rollupOptions: {
          // 창 자체의 화면은 두 문서다: 앱 문서(로그인 화면·탭 화면)와 탭바 문서.
          // 같은 빌드에서 나란히 나온다(index.html 옆에 tabbar.html).
          input: {
            index: path.resolve(__dirname, 'src/renderer/index.html'),
            tabbar: path.resolve(__dirname, 'src/renderer/tabbar.html'),
          },
        },
      },
      plugins: [
        TanStackRouterVite({
          routesDirectory: path.resolve(__dirname, 'src/renderer/routes'),
          generatedRouteTree: path.resolve(__dirname, 'src/renderer/routeTree.gen.ts'),
        }),
        react(),
        tailwindcss(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src/renderer'),
          '@estate-erp/api-client': path.resolve(__dirname, '../../packages/api-client/src/index.ts'),
          '@estate-erp/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
        },
      },
      optimizeDeps: {
        exclude: ['@estate-erp/api-client', '@estate-erp/shared'],
      },
      server: {
        port: 5174,
        proxy: {
          // 브라우저 미리보기 전용: 페이지가 Auth0를 같은 출처로 부르게 한다(CORS·테넌트
          // 설정 변경 없이). Electron 앱은 main이 Auth0를 직접 부르므로 쓰지 않는다.
          '/__auth0': {
            target: `https://${devAuth0.domain}`,
            changeOrigin: true,
            rewrite: (requestPath) => requestPath.replace(/^\/__auth0/, ''),
            configure: (proxy) => {
              proxy.on('proxyReq', (proxyRequest) => {
                // Auth0에는 서버가 보낸 요청처럼 보이게 한다(브라우저 출처 검사를 타지 않게).
                proxyRequest.removeHeader('origin');
                proxyRequest.removeHeader('referer');
              });
            },
          },
          '/api': {
            target: 'http://localhost:3000',
            changeOrigin: true,
            rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
          },
        },
      },
    },
  };
});
