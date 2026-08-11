#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  LocalReportError,
  buildLocalReportModel,
  formatFailure,
  readJson,
  renderLocalReportHtml,
  reportSha256,
  writeHtmlAtomic,
} from "./lib/local-report.mjs";

function parseOptions(args) {
  const options = { open: false, overwrite: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--open") {
      options.open = true;
      continue;
    }
    if (argument === "--overwrite") {
      options.overwrite = true;
      continue;
    }
    if (
      !["--esiljang", "--naver", "--analysis", "--output"].includes(argument)
    ) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  for (const required of ["esiljang", "naver", "output"]) {
    if (!options[required])
      throw new Error(`Missing required option: --${required}`);
  }
  const output = path.resolve(options.output);
  for (const input of [
    options.esiljang,
    options.naver,
    options.analysis,
  ].filter(Boolean)) {
    if (path.resolve(input) === output) {
      throw new LocalReportError(
        "output_matches_input",
        "HTML output path must not replace either JSON input.",
      );
    }
  }
  return options;
}

function openReport(filePath) {
  const command =
    process.platform === "darwin"
      ? { name: "open", args: [filePath] }
      : process.platform === "win32"
        ? { name: "cmd", args: ["/c", "start", "", filePath] }
        : { name: "xdg-open", args: [filePath] };
  const result = spawnSync(command.name, command.args, {
    encoding: "utf8",
    stdio: "ignore",
  });
  if (result.error || result.status !== 0) {
    throw new LocalReportError(
      "open_failed",
      `The report was written but could not be opened with ${command.name}.`,
    );
  }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const [esiljangSnapshot, naverSnapshot, comparisonAnalysis] =
    await Promise.all([
      readJson(options.esiljang),
      readJson(options.naver),
      options.analysis ? readJson(options.analysis) : Promise.resolve(null),
    ]);
  const model = buildLocalReportModel(
    esiljangSnapshot,
    naverSnapshot,
    undefined,
    comparisonAnalysis,
  );
  const html = renderLocalReportHtml(model);
  const outputPath = await writeHtmlAtomic(
    options.output,
    html,
    options.overwrite,
  );
  if (options.open) openReport(outputPath);
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "succeeded",
        outputPath,
        opened: options.open,
        sha256: reportSha256(html),
        counts: model.counts,
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
