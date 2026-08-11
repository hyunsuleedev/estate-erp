#!/usr/bin/env node

import path from "node:path";
import {
  ContractError,
  buildDuplicateSnapshot,
  formatFailure,
  readJsonFile,
  writeJsonAtomic,
} from "./lib/duplicate-snapshot.mjs";

function parseOptions(args) {
  const options = { overwrite: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (!["--source", "--responses", "--output"].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  for (const required of ["source", "responses", "output"]) {
    if (!options[required]) {
      throw new Error(`Missing required option: --${required}`);
    }
  }
  if (options.source === "-" && options.responses === "-") {
    throw new Error("--source and --responses cannot both read stdin");
  }
  if (
    options.source !== "-" &&
    path.resolve(options.source) === path.resolve(options.output)
  ) {
    throw new ContractError(
      "output_matches_source",
      "Output path must not equal the Esiljang source path.",
    );
  }
  return options;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const sourceSnapshot = await readJsonFile(options.source);
  const responseEnvelope = await readJsonFile(options.responses);
  const snapshot = buildDuplicateSnapshot(sourceSnapshot, responseEnvelope);
  const outputPath = await writeJsonAtomic(
    options.output,
    snapshot,
    options.overwrite,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        status: snapshot.status,
        outputPath,
        manifestHash: snapshot.manifestHash,
        counts: {
          requested: snapshot.requestedTotal,
          succeeded: snapshot.succeededTotal,
          failed: snapshot.failedTotal,
          skipped: snapshot.skippedTotal,
        },
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatFailure(error), null, 2)}\n`);
  process.exitCode = 1;
});
