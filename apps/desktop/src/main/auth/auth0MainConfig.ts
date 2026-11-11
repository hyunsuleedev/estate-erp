import { app } from 'electron';
import {
  resolveMainAuth0Config,
  type Auth0DesktopConfig,
} from '../../common/auth0DesktopConfig';

/**
 * 앱의 main이 쓰는 Auth0 연결 값. 빌드할 때 정해진다(`VITE_AUTH0_*`, API 주소의
 * `VITE_API_BASE_URL`과 같은 방식). 실행 환경 변수(`ESTATE_AUTH0_*`)는 개발 실행에서만
 * 듣고 패키지 앱에서는 무시한다.
 */
export function resolveAuth0ConfigForMain(): Auth0DesktopConfig {
  const build = {
    domain: import.meta.env.VITE_AUTH0_DOMAIN as string | undefined,
    clientId: import.meta.env.VITE_AUTH0_CLIENT_ID as string | undefined,
    audience: import.meta.env.VITE_AUTH0_AUDIENCE as string | undefined,
    realm: import.meta.env.VITE_AUTH0_REALM as string | undefined,
  };
  if (app.isPackaged && !build.domain?.trim()) {
    console.warn(
      '[auth] 빌드할 때 Auth0 테넌트(VITE_AUTH0_DOMAIN)를 정하지 않았습니다. 시험 테넌트로 로그인합니다.',
    );
  }
  return resolveMainAuth0Config({
    build,
    runtimeEnv: process.env,
    packaged: app.isPackaged,
  });
}
