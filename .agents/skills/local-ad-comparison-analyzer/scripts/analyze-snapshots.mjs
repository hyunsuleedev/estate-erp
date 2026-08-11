#!/usr/bin/env node

import { homedir } from "node:os";
import path from "node:path";
import {
  AnalysisError,
  buildComparisonAnalysis,
  formatFailure,
  readJsonFile,
  writeJsonAtomic,
} from "./lib/comparison-analysis.mjs";

function parseOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (
      !["--esiljang", "--naver", "--output", "--analyzed-at"].includes(argument)
    ) {
      throw new AnalysisError("invalid_option", `Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new AnalysisError(
        "invalid_option",
        `Missing value for ${argument}`,
      );
    }
    options[argument.slice(2).replace("-", "_")] = value;
    index += 1;
  }
  for (const required of ["esiljang", "naver"]) {
    if (!options[required]) {
      throw new AnalysisError(
        "invalid_option",
        `Missing required option: --${required}`,
      );
    }
  }
  return options;
}

function defaultOutputPath(analysis) {
  const timestamp = analysis.analyzedAt.replace(/[:.]/g, "-");
  return path.join(
    homedir(),
    ".agents",
    "data",
    "local-ad-comparison-analyzer",
    "analyses",
    `${timestamp}--${analysis.manifestHash}.json`,
  );
}

function assertDistinctPaths(options, outputPath) {
  const resolvedOutput = path.resolve(outputPath);
  for (const [label, inputPath] of [
    ["Esiljang", options.esiljang],
    ["Naver", options.naver],
  ]) {
    if (resolvedOutput === path.resolve(inputPath)) {
      throw new AnalysisError(
        "output_matches_input",
        `Output path must not replace the ${label} snapshot.`,
      );
    }
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const [esiljangSnapshot, naverSnapshot] = await Promise.all([
    readJsonFile(options.esiljang),
    readJsonFile(options.naver),
  ]);
  const analysis = buildComparisonAnalysis(
    esiljangSnapshot,
    naverSnapshot,
    options.analyzed_at ?? new Date().toISOString(),
  );
  const outputPath = options.output ?? defaultOutputPath(analysis);
  assertDistinctPaths(options, outputPath);
  const writtenPath = await writeJsonAtomic(outputPath, analysis);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: analysis.status,
        outputPath: writtenPath,
        manifestHash: analysis.manifestHash,
        counts: analysis.counts,
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
