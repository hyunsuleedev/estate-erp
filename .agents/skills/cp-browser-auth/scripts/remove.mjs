#!/usr/bin/env node
import { failJson, parseSkillArgs, printJson } from "./lib/cli.mjs";
import { removeCredential } from "./lib/config-store.mjs";

try {
  const args = parseSkillArgs({
    provider: { type: "string" },
  });
  const status = await removeCredential(args.provider);
  printJson({ status: "removed", ...status });
} catch (error) {
  failJson(error);
}
