import { parseArgs } from "node:util";

export function parseSkillArgs(options) {
  const parsed = parseArgs({
    options,
    allowPositionals: false,
    strict: true,
  });
  return parsed.values;
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function failJson(error, code = 1) {
  const message = error instanceof Error ? error.message : "CP Skill 실행에 실패했습니다.";
  process.stderr.write(`${JSON.stringify({ status: "error", message })}\n`);
  process.exitCode = code;
}
