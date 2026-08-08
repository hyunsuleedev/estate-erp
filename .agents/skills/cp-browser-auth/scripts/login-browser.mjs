#!/usr/bin/env node
import { authenticateBrowser } from "./lib/browser-auth.mjs";
import { failJson, parseSkillArgs, printJson } from "./lib/cli.mjs";
import {
  getCredentialStatus,
  loadCredential,
  markCredentialVerified,
} from "./lib/config-store.mjs";
import { getProviderConfig, normalizeProvider } from "./lib/providers.mjs";

try {
  const args = parseSkillArgs({
    provider: { type: "string" },
    "browser-cdp-url": { type: "string" },
  });
  const provider = normalizeProvider(args.provider);
  const config = getProviderConfig(provider);
  const status = await getCredentialStatus();
  const credential = await loadCredential(provider);

  if (!credential) {
    printJson({
      provider,
      browserOwner: "skill",
      status: "credentials_missing",
      targetUrl: null,
      message: `${config.label} 계정이 독립 Skill에 설정되어 있지 않습니다.`,
    });
    process.exitCode = 2;
  } else {
    const result = await authenticateBrowser({
      browserCdpUrl: args["browser-cdp-url"],
      loginUrl: config.loginUrl,
      authenticatedUrl: config.authenticatedUrl,
      allowedHostSuffixes: config.allowedHostSuffixes,
      usernameSelectors: config.usernameSelectors,
      passwordSelectors: config.passwordSelectors,
      submitSelectors: config.submitSelectors,
      username: credential.username,
      password: credential.password,
    });
    if (result.status === "authenticated") {
      await markCredentialVerified(provider);
    }
    printJson({
      provider,
      browserOwner: "skill",
      status: result.status,
      targetUrl: result.targetUrl,
      message:
        result.message ?? `${config.label} Skill 브라우저 로그인이 완료되었습니다.`,
    });
  }
} catch (error) {
  failJson(error);
}
