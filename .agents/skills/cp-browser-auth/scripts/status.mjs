#!/usr/bin/env node
import { failJson, parseSkillArgs, printJson } from "./lib/cli.mjs";
import { getCredentialStatus } from "./lib/config-store.mjs";
import { normalizeProvider } from "./lib/providers.mjs";

try {
  const args = parseSkillArgs({
    provider: { type: "string" },
  });
  const status = await getCredentialStatus();
  const providers = args.provider
    ? status.providers.filter(
        (item) => item.provider === normalizeProvider(args.provider),
      )
    : status.providers;
  printJson({ ...status, providers });
} catch (error) {
  failJson(error);
}
