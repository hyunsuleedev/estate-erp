#!/usr/bin/env node

import {
  buildCollectionPlan,
  formatFailure,
  readJsonFile,
} from "./lib/duplicate-snapshot.mjs";

function parseSourcePath(args) {
  if (args.length !== 2 || args[0] !== "--source" || !args[1]) {
    throw new Error(
      "Usage: prepare-collection.mjs --source <esiljang-snapshot.json|->",
    );
  }
  return args[1];
}

async function main() {
  const sourcePath = parseSourcePath(process.argv.slice(2));
  const snapshot = await readJsonFile(sourcePath);
  const plan = buildCollectionPlan(snapshot);
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatFailure(error), null, 2)}\n`);
  process.exitCode = 1;
});
