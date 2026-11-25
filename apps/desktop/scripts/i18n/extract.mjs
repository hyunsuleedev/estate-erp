#!/usr/bin/env node
/**
 * 화면 코드에서 번역할 문구를 모아 본다.
 *
 *   node scripts/i18n/extract.mjs --check            영역마다 번역이 빠진 문구 수
 *   node scripts/i18n/extract.mjs --missing <영역>    그 영역에서 빠진 문구 목록
 *   node scripts/i18n/extract.mjs --out <폴더>        번역할 때 볼 목록을 영역마다 파일로 (문구, 쓰인 자리, 지금 번역)
 *   node scripts/i18n/extract.mjs --excluded          번역하지 않기로 한 자리(비교·검사에 쓰는 문구) 목록
 *
 * 무엇을 문구로 보는지는 core.mjs가 정한다(빌드가 바꾸는 것과 같은 규칙).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze, scopeOf } from './core.mjs';

const DESKTOP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const REPO = path.resolve(DESKTOP, '../..');
const ROOTS = [path.join(DESKTOP, 'src/renderer'), path.join(REPO, 'packages/shared/src'), path.join(REPO, 'packages/api-client/src'), path.join(DESKTOP, 'src/common')];
const DICTIONARY_DIR = path.join(DESKTOP, 'src/renderer/i18n/en');
/** 이만큼의 영역에서 같은 문구가 나오면 공통 문구로 본다 */
const COMMON_AREAS = 3;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') walk(full, out);
    } else out.push(full);
  }
  return out;
}

export function collect() {
  /** @type {Map<string, Map<string, { text: string, kinds: Set<string>, where: string[], scopes: Set<string>, count: number }>>} */
  const byArea = new Map();
  const excluded = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const where = scopeOf(file);
      if (!where) continue;
      const code = fs.readFileSync(file, 'utf8');
      const { sites } = analyze(code, file);
      for (const site of sites) {
        if (site.excluded) {
          excluded.push({ file: where.scope, line: site.line, reason: site.excluded, text: site.text });
          continue;
        }
        if (!byArea.has(where.area)) byArea.set(where.area, new Map());
        const strings = byArea.get(where.area);
        if (!strings.has(site.text)) strings.set(site.text, { text: site.text, kinds: new Set(), where: [], scopes: new Set(), count: 0 });
        const item = strings.get(site.text);
        item.kinds.add(site.kind);
        item.count += 1;
        item.scopes.add(where.scope);
        if (item.where.length < 4) item.where.push(`${where.scope}:${site.line}`);
      }
    }
  }
  return { byArea, excluded };
}

export function readDictionaries() {
  const dictionaries = {};
  if (!fs.existsSync(DICTIONARY_DIR)) return dictionaries;
  for (const name of fs.readdirSync(DICTIONARY_DIR)) {
    if (name.endsWith('.json')) dictionaries[name.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(DICTIONARY_DIR, name), 'utf8'));
  }
  return dictionaries;
}

/** 그 영역의 그 문구가 번역돼 있는가 (파일마다 따로 둔 번역만 있으면, 그 문구가 쓰인 파일이 모두 덮여야 한다) */
export function translationOf(dictionaries, area, item) {
  const dictionary = dictionaries[area];
  const general = dictionary?.strings?.[item.text] ?? dictionaries._common?.strings?.[item.text];
  if (general !== undefined) return general;
  const perFile = [...item.scopes].map((scope) => dictionary?.files?.[scope]?.[item.text]);
  return perFile.every((value) => value !== undefined) ? perFile[0] : undefined;
}

function main() {
  const args = process.argv.slice(2);
  const { byArea, excluded } = collect();
  const dictionaries = readDictionaries();
  const areaCount = new Map();
  for (const strings of byArea.values()) for (const text of strings.keys()) areaCount.set(text, (areaCount.get(text) ?? 0) + 1);
  const isCommon = (text) => dictionaries._common?.strings?.[text] !== undefined || (areaCount.get(text) ?? 0) >= COMMON_AREAS;

  if (args.includes('--excluded')) {
    for (const item of excluded) console.log(`${item.reason}\t${item.file}:${item.line}\t${JSON.stringify(item.text)}`);
    return;
  }
  if (args.includes('--out')) {
    const out = path.resolve(args[args.indexOf('--out') + 1]);
    fs.mkdirSync(out, { recursive: true });
    const commonItems = new Map();
    const summary = {};
    for (const [area, strings] of [...byArea].sort()) {
      const own = [];
      for (const item of strings.values()) {
        const row = { text: item.text, kinds: [...item.kinds], count: item.count, where: item.where, en: translationOf(dictionaries, area, item) ?? null };
        if (isCommon(item.text)) {
          const merged = commonItems.get(item.text) ?? { text: item.text, kinds: [], count: 0, where: [], areas: [], en: dictionaries._common?.strings?.[item.text] ?? null };
          merged.count += item.count;
          merged.areas.push(area);
          merged.kinds = [...new Set([...merged.kinds, ...item.kinds])];
          if (merged.where.length < 4) merged.where.push(item.where[0]);
          commonItems.set(item.text, merged);
        } else own.push(row);
      }
      own.sort((a, b) => a.where[0].localeCompare(b.where[0]));
      fs.writeFileSync(path.join(out, `${area}.json`), `${JSON.stringify({ area, strings: own }, null, 1)}\n`);
      summary[area] = own.length;
    }
    const commonList = [...commonItems.values()].sort((a, b) => b.count - a.count);
    fs.writeFileSync(path.join(out, '_common.json'), `${JSON.stringify({ area: '_common', strings: commonList }, null, 1)}\n`);
    summary._common = commonList.length;
    fs.writeFileSync(path.join(out, '_summary.json'), `${JSON.stringify(summary, null, 1)}\n`);
    console.log(summary);
    return;
  }
  const only = args.includes('--missing') ? args[args.indexOf('--missing') + 1] : null;
  let total = 0;
  let missingTotal = 0;
  for (const [area, strings] of [...byArea].sort()) {
    const missing = [...strings.values()].filter((item) => translationOf(dictionaries, area, item) === undefined);
    total += strings.size;
    missingTotal += missing.length;
    if (only === area) for (const item of missing) console.log(`${item.where[0]}\t${JSON.stringify(item.text)}`);
    else if (!only) console.log(`${area.padEnd(24)} ${String(strings.size).padStart(5)} 문구, 번역 없음 ${String(missing.length).padStart(5)}`);
  }
  if (!only) console.log(`${'합계'.padEnd(24)} ${String(total).padStart(5)} 문구, 번역 없음 ${String(missingTotal).padStart(5)} (비교·검사에 쓰여 번역하지 않는 자리 ${excluded.length})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
