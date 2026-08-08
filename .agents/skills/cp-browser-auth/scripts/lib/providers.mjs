export const CP_PROVIDERS = ["esiljang", "budongsanbank"];

const PROVIDER_CONFIGS = {
  esiljang: {
    label: "이실장",
    loginUrl:
      "https://www.aipartner.com/integrated/login?serviceCode=1000",
    authenticatedUrl: "https://www.aipartner.com/offerings/ad_list",
    allowedHostSuffixes: ["aipartner.com"],
    usernameSelectors: ["#member-id"],
    passwordSelectors: ["#member-pw", 'input[type="password"]'],
    submitSelectors: [
      "#integrated-login > a",
      ".btn-login",
      'button[type="submit"]',
    ],
  },
  budongsanbank: {
    label: "부동산뱅크",
    loginUrl:
      "https://www.neonet.co.kr/novo-rebank/view/member/MemberLogin.neo?login_check=yes&return_url=/novo-rebank/index.neo",
    authenticatedUrl:
      "https://www.neonet.co.kr/novo-rebank/view/offerings/ad_list.neo",
    allowedHostSuffixes: ["neonet.co.kr"],
    usernameSelectors: ['input[name="user_id"]', "#user_id"],
    passwordSelectors: [
      'input[name="user_pwd"]',
      "#user_pwd",
      'input[type="password"]',
    ],
    submitSelectors: [
      'button[type="submit"]',
      ".btn-login",
      'input[type="submit"]',
    ],
  },
};

export function normalizeProvider(provider) {
  if (!CP_PROVIDERS.includes(provider)) {
    throw new Error("지원하지 않는 CP사입니다.");
  }
  return provider;
}

export function getProviderConfig(provider) {
  return PROVIDER_CONFIGS[normalizeProvider(provider)];
}

export function isAllowedProviderUrl(rawUrl, allowedHostSuffixes) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    return allowedHostSuffixes.some(
      (suffix) =>
        url.hostname === suffix || url.hostname.endsWith(`.${suffix}`),
    );
  } catch {
    return false;
  }
}

export function isExactProviderPage(
  rawUrl,
  expectedUrl,
  allowedHostSuffixes,
) {
  if (!isAllowedProviderUrl(rawUrl, allowedHostSuffixes)) return false;
  try {
    const current = new URL(rawUrl);
    const expected = new URL(expectedUrl);
    return (
      current.origin === expected.origin &&
      normalizePathname(current.pathname) ===
        normalizePathname(expected.pathname) &&
      current.search === expected.search &&
      current.hash === expected.hash
    );
  } catch {
    return false;
  }
}

function normalizePathname(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "");
}
