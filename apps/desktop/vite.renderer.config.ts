import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { resolveMainAuth0Config } from './src/common/auth0DesktopConfig';

export default defineConfig(({ mode }) => {
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
  envDir: __dirname,
  define: {
    __ESTATE_DEV_AUTH0_CONFIG__: JSON.stringify(devAuth0),
  },
  build: {
    rollupOptions: {
      // 창 자체의 화면은 두 문서다: 앱 문서(로그인 화면·탭 화면)와 탭바 문서.
      // 같은 빌드에서 나란히 나온다(index.html 옆에 tabbar.html).
      input: {
        index: path.resolve(__dirname, 'index.html'),
        tabbar: path.resolve(__dirname, 'tabbar.html'),
      },
    },
  },
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/renderer/routes',
      generatedRouteTree: './src/renderer/routeTree.gen.ts',
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
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
  };
});
