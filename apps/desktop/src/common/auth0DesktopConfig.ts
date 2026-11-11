/** 데스크톱 main 프로세스가 로그인에 쓰는 Auth0 연결 값. */
export interface Auth0DesktopConfig {
  /** 테넌트 도메인. 예: estait.jp.auth0.com */
  domain: string;
  /** Native 앱 client ID. 공개 값이다(앱 비밀값 없이 로그인한다). */
  clientId: string;
  /** 우리 API 식별자. 접근 토큰의 aud가 된다. */
  audience: string;
  /** 아이디·비밀번호를 확인할 Auth0 DB 연결 이름. */
  realm: string;
  scope: string;
}

/** 시험 테넌트 값. 개발 기본값이다. 운영 빌드는 빌드 변수(VITE_AUTH0_*)로 정한다. */
const AUTH0_TRIAL_DEFAULTS: Auth0DesktopConfig = {
  domain: 'estait.jp.auth0.com',
  clientId: 'iOIMt1hOFpmyk5IlD1jl0JARuoycUCMF',
  audience: 'https://api.estaitt.com',
  realm: 'Username-Password-Authentication',
  scope: 'openid profile offline_access',
};

type Env = Readonly<Record<string, string | undefined>>;

/** 빌드할 때 정하는 값(VITE_AUTH0_DOMAIN, _CLIENT_ID, _AUDIENCE, _REALM). */
export interface Auth0BuildValues {
  domain?: string;
  clientId?: string;
  audience?: string;
  realm?: string;
}

function firstValue(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function toConfig(values: Auth0BuildValues): Auth0DesktopConfig {
  return {
    domain: (values.domain ?? AUTH0_TRIAL_DEFAULTS.domain)
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, ''),
    clientId: values.clientId ?? AUTH0_TRIAL_DEFAULTS.clientId,
    audience: values.audience ?? AUTH0_TRIAL_DEFAULTS.audience,
    realm: values.realm ?? AUTH0_TRIAL_DEFAULTS.realm,
    scope: AUTH0_TRIAL_DEFAULTS.scope,
  };
}

/**
 * main 프로세스가 쓸 Auth0 연결 값.
 *
 * - 빌드할 때 정한 값(VITE_AUTH0_*)이 기준이다. 정하지 않은 값은 시험 테넌트다.
 * - 실행 환경 변수(ESTATE_AUTH0_*)는 개발 실행에서만 빌드 값을 덮어쓴다. 패키지 앱에서는
 *   무시한다. 로그인 화면에 입력한 아이디·비밀번호가 어디로 갈지를 실행 환경이 바꿀 수
 *   있으면 안 된다.
 */
export function resolveMainAuth0Config(options: {
  build: Auth0BuildValues;
  runtimeEnv: Env;
  packaged: boolean;
}): Auth0DesktopConfig {
  const { build } = options;
  const runtime: Env = options.packaged ? {} : options.runtimeEnv;
  return toConfig({
    domain: firstValue(runtime.ESTATE_AUTH0_DOMAIN, build.domain),
    clientId: firstValue(runtime.ESTATE_AUTH0_CLIENT_ID, build.clientId),
    audience: firstValue(runtime.ESTATE_AUTH0_AUDIENCE, build.audience),
    realm: firstValue(runtime.ESTATE_AUTH0_REALM, build.realm),
  });
}

/**
 * 개발 도구용(Vite 설정의 브라우저 미리보기, 테스트): 환경 변수만으로 정한다.
 * `ESTATE_AUTH0_*`가 `VITE_AUTH0_*`보다 앞선다. 앱의 main은 이 함수를 쓰지 않는다.
 */
export function resolveAuth0DesktopConfig(env: Env): Auth0DesktopConfig {
  return resolveMainAuth0Config({
    build: {
      domain: firstValue(env.VITE_AUTH0_DOMAIN),
      clientId: firstValue(env.VITE_AUTH0_CLIENT_ID),
      audience: firstValue(env.VITE_AUTH0_AUDIENCE),
      realm: firstValue(env.VITE_AUTH0_REALM),
    },
    runtimeEnv: env,
    packaged: false,
  });
}
