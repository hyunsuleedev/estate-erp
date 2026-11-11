import path from 'node:path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  // main도 화면(vite.renderer.config.ts)과 같은 폴더의 .env를 읽는다. 로그인한 사용자를
  // main이 서버에 직접 확인하므로 API 주소(VITE_API_BASE_URL)가 같아야 한다.
  envDir: __dirname,
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
});
