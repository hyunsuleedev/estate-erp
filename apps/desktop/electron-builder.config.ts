import type { Configuration } from 'electron-builder';

/**
 * 설치 파일을 만드는 설정(electron-builder). `electron-vite build`가 out/ 에 만든 결과를 담는다.
 *
 * electron-builder가 스스로 찾는 이름(electron-builder.yml 등)이 아니므로 `--config`로 넘긴다
 * (package.json의 package·make).
 */

// 자동 업데이트 파일을 올려 둔 곳의 주소. 설치 파일을 만들 때 읽는다(.env.example 참고).
const updateBaseUrl = process.env.ESTATE_ERP_UPDATE_BASE_URL?.trim().replace(/\/+$/, '');
// 업데이트로 받은 파일은 이 주소에서 받은 목록(latest*.yml)의 해시로만 확인한다. 암호화하지
// 않은 주소면 중간에서 목록과 파일을 함께 바꿀 수 있으므로 https만 받는다.
if (updateBaseUrl && !updateBaseUrl.startsWith('https://')) {
  throw new Error('ESTATE_ERP_UPDATE_BASE_URL must start with https://');
}

// macOS 서명에 쓸 인증서의 이름. 정하지 않으면 서명하지 않는다. electron-builder는 이 값을
// 비워 두면 키체인에서 인증서를 알아서 골라 쓰는데, 어떤 인증서로 서명됐는지 모르는 빌드가
// 나오지 않게 여기서 정한 것만 쓴다.
const macIdentity = process.env.ESTATE_ERP_MAC_IDENTITY?.trim() || null;

// Windows 서명(Azure Artifact Signing, 옛 Trusted Signing). 네 값을 모두 정한 빌드만 서명한다.
// 네 값은 비밀이 아니다(계정·프로필의 이름과 주소). 서명 권한은 빌드하는 셸이나 CI의 환경
// 변수 AZURE_TENANT_ID · AZURE_CLIENT_ID · AZURE_CLIENT_SECRET 로 따로 준다(.env.example 참고).
// 서명은 Windows에서만 된다(PowerShell의 TrustedSigning 모듈을 쓴다).
const winSign = {
  // 인증서에 적힌 회사 이름(CN) 그대로. 앱 안의 업데이트 설정(app-update.yml)에도 들어가서,
  // 설치된 앱은 업데이트로 받은 설치 파일의 서명이 이 이름인지 확인한 뒤에만 설치한다.
  // 그래서 배포한 뒤에 이 이름이 달라지면 이미 설치된 앱은 업데이트를 받지 못한다.
  publisherName: process.env.ESTATE_ERP_WIN_PUBLISHER_NAME?.trim() || null,
  // 서명 계정을 만든 리전의 주소. 예: https://krc.codesigning.azure.net (한국 중부)
  endpoint: process.env.ESTATE_ERP_WIN_SIGN_ENDPOINT?.trim() || null,
  codeSigningAccountName: process.env.ESTATE_ERP_WIN_SIGN_ACCOUNT?.trim() || null,
  certificateProfileName: process.env.ESTATE_ERP_WIN_SIGN_PROFILE?.trim() || null,
};
const winSignValues = Object.values(winSign);
// 일부만 정해진 것은 빠뜨린 것이다. 서명 없이 조용히 넘어가지 않게 빌드를 멈춘다.
if (winSignValues.some(Boolean) && !winSignValues.every(Boolean)) {
  throw new Error(
    'Windows signing needs all of ESTATE_ERP_WIN_PUBLISHER_NAME, ESTATE_ERP_WIN_SIGN_ENDPOINT, ESTATE_ERP_WIN_SIGN_ACCOUNT, ESTATE_ERP_WIN_SIGN_PROFILE',
  );
}
if (winSign.endpoint && !winSign.endpoint.startsWith('https://')) {
  throw new Error('ESTATE_ERP_WIN_SIGN_ENDPOINT must start with https://');
}
const winAzureSignOptions =
  winSign.publisherName &&
  winSign.endpoint &&
  winSign.codeSigningAccountName &&
  winSign.certificateProfileName
    ? {
        publisherName: winSign.publisherName,
        endpoint: winSign.endpoint,
        codeSigningAccountName: winSign.codeSigningAccountName,
        certificateProfileName: winSign.certificateProfileName,
      }
    : null;

const config: Configuration = {
  appId: 'com.estaitt.estaitflow',
  productName: 'EstaitFlow',
  directories: {
    // 아이콘(icon.icns, icon.ico)은 이 폴더에서 이름으로 찾는다.
    buildResources: 'build',
    output: 'dist',
  },
  asar: true,
  // 설치 폴더와 업데이트 임시 폴더의 이름이 된다(Windows: %LOCALAPPDATA%\\Programs\\estaitflow).
  // 저장소의 패키지 이름(@estate-erp/desktop)을 그대로 쓰면 `@estate-erpdesktop`이 된다.
  // 배포한 뒤에는 바꾸기 어렵다.
  extraMetadata: { name: 'estaitflow' },
  // 앱에 들어가는 것은 빌드 결과(out/)와 package.json뿐이다. 쓰는 패키지는 모두 번들에 들어
  // 있어서(electron.vite.config.ts) node_modules는 넣지 않는다. package.json에 dependencies를
  // 두지 않는 것도 그래서다. 거기 적은 패키지는 electron-builder가 앱에 넣는다.
  // out/ 전체가 아니라 빌드가 만드는 세 폴더만 고른다. out/ 에 다른 파일(옛 빌드, 화면 갈무리)이
  // 남아 있어도 앱에 딸려 들어가지 않는다.
  files: [
    'out/main/**',
    'out/preload/**',
    'out/renderer/**',
    'package.json',
    '!**/node_modules/**',
  ],
  // 네이티브 모듈이 없다. 설치된 패키지를 다시 빌드하지 않는다.
  npmRebuild: false,
  // 업데이트 목록(latest*.yml)과 설치 파일을 한 폴더에 나란히 올리므로, 운영체제와 CPU가
  // 이름에 들어가야 서로 겹치지 않는다. 빈칸이 없는 이름이어야 주소로 쓸 때 바뀌지 않는다.
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',

  mac: {
    // zip은 macOS 자동 업데이트가 내려받는 파일이다. dmg만으로는 업데이트되지 않는다.
    // 두 CPU를 한 번에 만든다. 따로 만들어 같은 폴더에 올리면 나중에 올린 latest-mac.yml이
    // 앞의 것을 덮어써, 다른 CPU의 앱은 업데이트 파일을 찾지 못한다.
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'zip', arch: ['arm64', 'x64'] },
    ],
    identity: macIdentity,
  },
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    // 정하지 않으면 서명하지 않는다. 실행 파일, 설치 파일, 제거 프로그램이 모두 서명된다.
    azureSignOptions: winAzureSignOptions,
  },
  nsis: {
    // 사용자별 설치다. 업데이트할 때 관리자 권한 창(UAC)이 뜨지 않는다. 중개사무소 직원 PC는
    // 관리자 권한이 없는 경우가 많다.
    perMachine: false,
    oneClick: true,
    // 설치 화면은 한국어 하나다.
    installerLanguages: ['ko_KR'],
    // 설치 파일의 속성(버전 정보)에 적히는 언어. 1042는 한국어다.
    language: '1042',
  },
  linux: {
    target: ['deb', 'rpm'],
    category: 'Office',
  },

  // Electron 기능 가운데 쓰지 않는 것을 실행 파일에서 꺼 둔다. 서명하기 전에 적용된다.
  electronFuses: {
    runAsNode: false,
    enableCookieEncryption: true,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    // Apple Silicon은 서명이 맞지 않는 실행 파일을 바로 죽인다. 위 값을 바꾸면 Electron의
    // 원래 서명이 깨지므로 임시(ad-hoc) 서명을 다시 한다. 서명 인증서가 있는 빌드는 이 뒤에
    // 정식 서명으로 덮어쓴다.
    resetAdHocDarwinSignature: true,
  },

  // 주소를 정한 빌드에만 업데이트 주소(Resources/app-update.yml)가 들어간다. 그 파일이 없는
  // 앱은 업데이트를 확인하지 않는다(src/main/updaterService.ts).
  publish: updateBaseUrl ? { provider: 'generic', url: updateBaseUrl } : null,
};

export default config;
