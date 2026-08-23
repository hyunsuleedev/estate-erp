#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { normalizeSnapshot } from './normalize-snapshot.mjs';
import {
  DEFAULT_SNAPSHOT_DIRECTORY,
  persistSnapshotJson,
} from './snapshot-store.mjs';
import { validateSnapshot } from './validate-snapshot.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(scriptDirectory, '..');
const authSkillRoot = path.resolve(skillRoot, '..', 'cp-browser-auth');

const LOGIN_URL =
  'https://www.aipartner.com/integrated/login?serviceCode=1000';
const LIST_URL = 'https://www.aipartner.com/offerings/ad_list';
const ACTIVE_SELECTOR =
  '.statusWrap.ver3 .statusItem.statusIng.GTM_offerings_ad_list_ad_ing[data-value="ad"]';
const NEXT_SELECTOR =
  '.singleSection.listSection .pagination a.btnArrow.next';
const MAX_OUTPUT_BYTES = 24 * 1024 * 1024;
const AGENT_RECOVERABLE_CODES = new Set([
  'active_filter_mismatch',
  'layout_mismatch',
  'browser_login_unavailable',
  'provider_unavailable',
]);

class ReaderFailure extends Error {
  constructor(status, reasonCode, message, diagnostics = {}, keepBrowser = false) {
    super(message);
    this.name = 'ReaderFailure';
    this.status = status;
    this.reasonCode = reasonCode;
    this.diagnostics = diagnostics;
    this.keepBrowser = keepBrowser;
  }

  toResult() {
    const result = {
      status: this.status,
      reasonCode: this.reasonCode,
      message: this.message,
    };
    if (Object.keys(this.diagnostics).length > 0) {
      result.diagnostics = this.diagnostics;
    }
    return result;
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function safeMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export function shouldYieldToAgent(reasonCode, browserInspectable) {
  return browserInspectable && AGENT_RECOVERABLE_CODES.has(reasonCode);
}

function processFailure(command, code, signal) {
  return new Error(
    `${path.basename(command)} exited with ${code ?? signal ?? 'an error'}`,
  );
}

export function runProcess(
  command,
  args,
  {
    cwd = skillRoot,
    input = null,
    timeoutMs = 45_000,
    allowNonZero = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const append = (target, chunk) => {
      const next = target + chunk.toString('utf8');
      if (Buffer.byteLength(next, 'utf8') > MAX_OUTPUT_BYTES) {
        child.kill('SIGTERM');
        finish(reject, new Error(`${path.basename(command)} output was too large`));
        return target;
      }
      return next;
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      finish(
        reject,
        new Error(`${path.basename(command)} timed out after ${timeoutMs}ms`),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.on('error', (error) => finish(reject, error));
    child.on('close', (code, signal) => {
      const result = { code, signal, stdout, stderr };
      if (code === 0 || allowNonZero) finish(resolve, result);
      else finish(reject, processFailure(command, code, signal));
    });

    child.stdin.on('error', () => {});
    child.stdin.end(input ?? undefined);
  });
}

function parseJsonCandidates(output) {
  const candidates = [output.trim()];
  candidates.push(
    ...output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .reverse(),
  );
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next complete JSON candidate.
    }
  }
  return null;
}

export function parseAgentBrowserEvaluation(output) {
  let parsed = parseJsonCandidates(output);
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      throw new Error('agent-browser evaluation returned invalid JSON');
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('agent-browser evaluation returned no JSON object');
  }
  return parsed;
}

function parseCommandJson(output, label) {
  const parsed = parseJsonCandidates(output);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} returned no JSON object`);
  }
  return parsed;
}

function credentialStatus(result) {
  return result?.providers?.find((entry) => entry?.provider === 'esiljang');
}

async function ensureCredentials() {
  const statusScript = path.join(authSkillRoot, 'scripts', 'status.mjs');
  const configureScript = path.join(authSkillRoot, 'scripts', 'configure.mjs');
  await Promise.all([access(statusScript), access(configureScript)]).catch(() => {
    throw new ReaderFailure(
      'failed',
      'browser_login_unavailable',
      '독립 CP 인증 Skill을 찾을 수 없습니다.',
    );
  });

  const readStatus = async () => {
    const run = await runProcess(
      process.execPath,
      [statusScript, '--provider', 'esiljang'],
      { cwd: authSkillRoot, allowNonZero: true },
    );
    return parseCommandJson(run.stdout, 'credential status');
  };

  let status = await readStatus();
  if (credentialStatus(status)?.hasCredentials === true) return;

  const configured = await runProcess(
    process.execPath,
    [configureScript, '--provider', 'esiljang'],
    {
      cwd: authSkillRoot,
      allowNonZero: true,
      timeoutMs: 300_000,
    },
  ).catch(() => null);
  const configuredResult = configured
    ? parseCommandJson(configured.stdout, 'credential configuration')
    : null;
  if (configuredResult?.status !== 'configured') {
    throw new ReaderFailure(
      'needs_input',
      'credentials_missing',
      '로컬 설정창에서 이실장 계정을 저장해 주세요.',
    );
  }

  status = await readStatus();
  if (credentialStatus(status)?.hasCredentials !== true) {
    throw new ReaderFailure(
      'needs_input',
      'credentials_missing',
      '저장된 이실장 계정을 확인할 수 없습니다.',
    );
  }
}

async function runAgent(args, options = {}) {
  return runProcess('agent-browser', args, {
    cwd: skillRoot,
    ...options,
  });
}

async function evaluate(sessionName, expression) {
  const result = await runAgent([
    '--session',
    sessionName,
    'eval',
    expression,
  ]);
  return parseAgentBrowserEvaluation(result.stdout);
}

const PAGE_STATE_EXPRESSION = `JSON.stringify((() => {
  const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\\s+/g, " ").trim();
  const active = document.querySelector(${JSON.stringify(ACTIVE_SELECTOR)});
  const countText = clean(active?.querySelector(":scope > .cnt")?.textContent);
  const countDigits = countText.replace(/[^0-9]/g, "");
  const root = document.querySelector(".singleSection.listSection");
  const tables = Array.from(root?.querySelectorAll("table") ?? []);
  const table = tables.find((candidate) =>
    Array.from(candidate.querySelectorAll("thead th")).some((th) => clean(th.innerText) === "매물번호")
  );
  const rows = Array.from(table?.querySelectorAll("tbody tr") ?? []);
  const ids = rows
    .filter((row) => row.querySelectorAll(".numberA").length === 1)
    .map((row) => clean(row.querySelector(".numberA")?.textContent))
    .filter(Boolean)
    .sort();
  const pageNumbers = Array.from(root?.querySelectorAll(".pagination .btnPage[data-value]") ?? [])
    .map((link) => Number(link.getAttribute("data-value")))
    .filter((value) => Number.isInteger(value) && value > 0);
  const activePageMarker = root?.querySelector(".pagination .btnPage.on[data-value]");
  const activePageValue = Number(activePageMarker?.getAttribute("data-value"));
  const activePage = Number.isInteger(activePageValue) && activePageValue > 0
    ? activePageValue
    : table ? 1 : null;
  const describeControl = (selector) => {
    const control = root?.querySelector(selector);
    if (!control) return { exists: false };
    const style = getComputedStyle(control);
    return {
      exists: true,
      visible: style.display !== "none" && style.visibility !== "hidden",
      disabled:
        control.getAttribute("aria-disabled") === "true" ||
        /(?:^|\\s)(?:disabled|off)(?:\\s|$)/i.test(control.className) ||
        style.pointerEvents === "none",
      dataValue: control.getAttribute("data-value"),
      className: control.className
    };
  };
  return {
    url: location.href,
    loginFormPresent: !!document.querySelector("#member-id, #member-pw"),
    activeFilter: {
      exists: !!active,
      title: clean(active?.querySelector(".title")?.textContent),
      dataValue: active?.getAttribute("data-value") ?? null,
      dataUrl: active?.getAttribute("data-url") ?? null,
      selected: active?.getAttribute("aria-selected") === "true",
      count: countDigits ? Number(countDigits) : null
    },
    tableExists: !!table,
    activePage,
    pageNumbers: [...new Set(pageNumbers)].sort((a, b) => a - b),
    rowCount: ids.length,
    ambiguousIdentityRows: rows.filter((row) => row.querySelectorAll(".numberA").length > 1).length,
    rowIdentity: ids.join("|"),
    next: describeControl(".pagination a.btnArrow.next"),
    last: describeControl(".pagination a.btnArrow.last")
  };
})())`;

const EXTRACT_PAGE_EXPRESSION = `JSON.stringify((() => {
  const clean = (value) => String(value ?? "").normalize("NFKC").replace(/\\s+/g, " ").trim();
  const root = document.querySelector(".singleSection.listSection");
  const table = Array.from(root?.querySelectorAll("table") ?? []).find((candidate) =>
    Array.from(candidate.querySelectorAll("thead th")).some((th) => clean(th.innerText) === "매물번호")
  );
  if (!root || !table) return { error: "layout_mismatch", message: "active advertisement table not found" };
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) => clean(th.innerText));
  const headerIndex = new Map(headers.map((label, index) => [label, index]));
  const indexOf = (...labels) => {
    for (const label of labels) if (headerIndex.has(label)) return headerIndex.get(label);
    return -1;
  };
  const required = {
    propertyType: indexOf("매물종류"),
    address: indexOf("단지명/상세주소"),
    area: indexOf("면적"),
    terms: indexOf("거래유형/ 가격(만원)", "거래유형/가격(만원)"),
    exposure: indexOf("노출채널/ 검증방식", "노출채널/검증방식"),
    status: indexOf("광고상태"),
    period: indexOf("등록기간")
  };
  if (Object.values(required).some((value) => value < 0)) {
    return { error: "layout_mismatch", message: "required visible headers changed", headers };
  }
  const optional = {
    complexName: indexOf("단지명"),
    fullAddress: indexOf("상세주소", "주소"),
    dong: indexOf("동"),
    floor: indexOf("층"),
    ho: indexOf("호"),
    unitType: indexOf("타입", "평형"),
    direction: indexOf("방향"),
    features: indexOf("매물특징", "특징"),
    memo: indexOf("메모"),
    registeredAt: indexOf("등록일")
  };
  const activePageValue = Number(root.querySelector(".pagination .btnPage.on[data-value]")?.getAttribute("data-value"));
  const activePage = Number.isInteger(activePageValue) && activePageValue > 0 ? activePageValue : 1;
  const rawRows = Array.from(table.querySelectorAll("tbody tr"));
  const ambiguousIdentityRows = rawRows.filter((row) => row.querySelectorAll(".numberA").length > 1).length;
  const rows = rawRows.filter((row) => row.querySelectorAll(".numberA").length === 1);
  const toDate = (value) => {
    const match = clean(value).match(/(?:^|\\s)(\\d{2}|\\d{4})[.\\/-](\\d{1,2})[.\\/-](\\d{1,2})(?:\\s|$)/);
    if (!match) return null;
    const year = match[1].length === 2 ? "20" + match[1] : match[1];
    return year + "-" + match[2].padStart(2, "0") + "-" + match[3].padStart(2, "0");
  };
  const items = rows.map((row) => {
    const cells = Array.from(row.querySelectorAll(":scope > td"));
    const textAt = (index) => index >= 0 ? clean(cells[index]?.innerText) : null;
    const addressCell = cells[required.address] ?? null;
    const ward = clean(addressCell?.querySelector("p.dongInfo")?.innerText);
    const displayedAddress = clean(addressCell?.querySelector("p.fullName span, p.fullName")?.innerText);
    const exactAddress = textAt(optional.fullAddress);
    const fullAddress = exactAddress || clean([ward, displayedAddress].filter(Boolean).join(" "));
    const termLines = String(cells[required.terms]?.innerText ?? "").split(/\\n+/).map(clean).filter(Boolean);
    const transactionType = termLines[0] ?? null;
    const combinedTerms = clean(termLines.slice(1).join(" "));
    const parts = combinedTerms.split("/").map(clean).filter(Boolean);
    let advertisedPrice = null;
    let advertisedDeposit = null;
    let advertisedMonthlyRent = null;
    if (transactionType === "매매") advertisedPrice = parts[0] ?? null;
    else if (transactionType === "전세") advertisedDeposit = parts[0] ?? null;
    else if (transactionType === "월세" || transactionType === "단기") {
      advertisedDeposit = parts[0] ?? null;
      advertisedMonthlyRent = parts[1] ?? null;
    }
    const sourceFields = {};
    const numberM = clean(row.querySelector(".numberM")?.textContent);
    if (numberM) sourceFields["보조번호 (의미 미확정)"] = numberM;
    const sourcePairs = [
      ["면적", textAt(required.area)],
      ["거래유형/가격(만원)", textAt(required.terms)],
      ["노출채널/검증방식", textAt(required.exposure)],
      ["등록기간", textAt(required.period)]
    ];
    for (const [label, value] of sourcePairs) if (value) sourceFields[label] = value;
    return {
      externalAdId: clean(row.querySelector(".numberA")?.textContent),
      naverArticleNo: clean(row.querySelector(".numberN")?.textContent) || null,
      naverUrl: null,
      providerUrl: clean(addressCell?.getAttribute("data-url")) || location.href,
      complexName: textAt(optional.complexName),
      fullAddress: fullAddress || null,
      dong: textAt(optional.dong),
      floor: textAt(optional.floor),
      ho: textAt(optional.ho),
      propertyType: textAt(required.propertyType),
      unitType: textAt(optional.unitType),
      transactionType,
      advertisedPrice,
      advertisedDeposit,
      advertisedMonthlyRent,
      direction: textAt(optional.direction),
      registeredAt: toDate(textAt(optional.registeredAt) || textAt(required.period)),
      providerStatus: textAt(required.status),
      features: textAt(optional.features) || [],
      memo: textAt(optional.memo),
      sourcePage: activePage,
      sourceFields
    };
  });
  return {
    headers,
    activePage,
    rawRowCount: rawRows.length,
    ambiguousIdentityRows,
    acceptedRowCount: items.length,
    rowIdentity: items.map((item) => item.externalAdId).sort().join("|"),
    items
  };
})())`;

function filterDescriptorMatches(state) {
  const filter = state.activeFilter;
  return !(
    state.loginFormPresent ||
    state.url !== LIST_URL ||
    !filter?.exists ||
    filter.title !== '광고중' ||
    filter.dataValue !== 'ad' ||
    filter.dataUrl !== LIST_URL ||
    (filter.count !== null &&
      (!Number.isInteger(filter.count) || filter.count < 0))
  );
}

async function waitForFilterDescriptor(sessionName, attempts = 30) {
  let lastState = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      lastState = await inspectPage(sessionName);
      if (filterDescriptorMatches(lastState)) return lastState;
    } catch {
      // The authenticated POST target may still be replacing the document.
    }
    await delay(200);
  }
  throw new ReaderFailure(
    'failed',
    'active_filter_mismatch',
    '이실장 광고중 필터의 URL·제목·건수를 확인할 수 없습니다.',
    {
      listUrlReached: lastState?.url === LIST_URL,
      activeFilterFound: lastState?.activeFilter?.exists === true,
      loginFormPresent: lastState?.loginFormPresent === true,
    },
  );
}

function stableStateMatches(state, expectedPage, expectedTotal) {
  const ids = state.rowIdentity ? state.rowIdentity.split('|') : [];
  return (
    state.url === LIST_URL &&
    state.activeFilter?.selected === true &&
    state.activeFilter?.dataValue === 'ad' &&
    state.activeFilter?.count === expectedTotal &&
    state.activePage === expectedPage &&
    state.tableExists === true &&
    state.ambiguousIdentityRows === 0 &&
    ids.length === new Set(ids).size
  );
}

async function inspectPage(sessionName) {
  return evaluate(sessionName, PAGE_STATE_EXPRESSION);
}

async function waitForStablePage(
  sessionName,
  expectedPage,
  expectedTotal,
  attempts = 24,
) {
  let lastState = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const first = await inspectPage(sessionName);
      if (!filterDescriptorMatches(first)) {
        lastState = first;
        await delay(200);
        continue;
      }
      await delay(200);
      const second = await inspectPage(sessionName);
      if (!filterDescriptorMatches(second)) {
        lastState = second;
        await delay(200);
        continue;
      }
      lastState = second;
      if (
        stableStateMatches(first, expectedPage, expectedTotal) &&
        stableStateMatches(second, expectedPage, expectedTotal) &&
        first.rowCount === second.rowCount &&
        first.rowIdentity === second.rowIdentity
      ) {
        return second;
      }
    } catch {}
    await delay(200);
  }
  throw new ReaderFailure(
    'failed',
    'active_filter_mismatch',
    `광고중 ${expectedPage}페이지가 안정적으로 표시되지 않았습니다.`,
    {
      expectedPage,
      observedPage: lastState?.activePage ?? null,
      observedRows: lastState?.rowCount ?? null,
    },
  );
}

export function decidePagination(state) {
  const currentPage = Number(state?.activePage);
  if (!Number.isInteger(currentPage) || currentPage < 1) {
    throw new Error('active page is unavailable');
  }
  const pageNumbers = Array.isArray(state?.pageNumbers)
    ? state.pageNumbers.filter((value) => Number.isInteger(value) && value > 0)
    : [];
  const nextTarget = Number(state?.next?.dataValue);
  const lastTarget = Number(state?.last?.dataValue);
  const hasNextNumber = pageNumbers.includes(currentPage + 1);
  const maxNumberedPage = Math.max(currentPage, ...pageNumbers);
  const nextUnavailable =
    !state?.next?.exists || state.next.disabled || state.next.visible === false;

  if (Number.isInteger(nextTarget) && nextTarget === currentPage + 1) {
    return { type: 'advance', targetPage: nextTarget, selector: NEXT_SELECTOR };
  }
  if (hasNextNumber && (!Number.isInteger(nextTarget) || nextTarget <= currentPage)) {
    return {
      type: 'advance',
      targetPage: currentPage + 1,
      selector: `.singleSection.listSection .pagination .btnPage[data-value="${currentPage + 1}"]`,
    };
  }
  if (
    nextUnavailable ||
    (nextTarget === currentPage &&
      maxNumberedPage === currentPage &&
      (!Number.isInteger(lastTarget) || lastTarget === currentPage))
  ) {
    return { type: 'terminal' };
  }
  throw new Error('pagination controls contradict the active page');
}

async function extractPage(sessionName, stableState) {
  const extracted = await evaluate(sessionName, EXTRACT_PAGE_EXPRESSION);
  if (extracted.error) {
    throw new ReaderFailure(
      'failed',
      'layout_mismatch',
      '이실장 광고 테이블의 표시 헤더가 변경되었습니다.',
    );
  }
  if (
    extracted.activePage !== stableState.activePage ||
    extracted.ambiguousIdentityRows !== 0 ||
    extracted.acceptedRowCount !== stableState.rowCount ||
    extracted.rowIdentity !== stableState.rowIdentity
  ) {
    throw new ReaderFailure(
      'failed',
      'layout_mismatch',
      '안정성 확인 후 광고 행 구성이 달라졌습니다.',
      {
        page: stableState.activePage,
        expectedRows: stableState.rowCount,
        observedRows: extracted.acceptedRowCount ?? null,
      },
    );
  }
  return extracted.items;
}

async function advancePage(
  sessionName,
  decision,
  currentState,
  expectedTotal,
) {
  await runAgent([
    '--session',
    sessionName,
    'click',
    decision.selector,
  ]);
  try {
    return await waitForStablePage(
      sessionName,
      decision.targetPage,
      expectedTotal,
      18,
    );
  } catch (firstError) {
    const state = await inspectPage(sessionName).catch(() => null);
    if (state?.activePage !== currentState.activePage) throw firstError;
    const fallbackExpression = `(() => { const control = document.querySelector(${JSON.stringify(decision.selector)}); if (!control) return false; control.click(); return true; })()`;
    const clicked = await evaluate(sessionName, `JSON.stringify({ clicked: ${fallbackExpression} })`);
    if (clicked.clicked !== true) throw firstError;
    return waitForStablePage(
      sessionName,
      decision.targetPage,
      expectedTotal,
      18,
    );
  }
}

async function authenticateBrowser(sessionName) {
  await runAgent([
    '--session',
    sessionName,
    '--headed',
    '--content-boundaries',
    '--allowed-domains',
    'aipartner.com,*.aipartner.com',
    '--no-auto-dialog',
    'open',
    LOGIN_URL,
  ]).catch(() => {
    throw new ReaderFailure(
      'failed',
      'browser_login_unavailable',
      '이실장 전용 브라우저를 열 수 없습니다.',
    );
  });

  const cdpRun = await runAgent([
    '--session',
    sessionName,
    'get',
    'cdp-url',
    '--json',
  ]).catch(() => null);
  const cdpResult = cdpRun
    ? parseCommandJson(cdpRun.stdout, 'agent-browser CDP')
    : null;
  const cdpUrl = cdpResult?.data?.cdpUrl;
  if (cdpResult?.success !== true || typeof cdpUrl !== 'string') {
    throw new ReaderFailure(
      'failed',
      'browser_login_unavailable',
      '전용 브라우저의 로컬 로그인 연결을 만들 수 없습니다.',
    );
  }

  const loginScript = path.join(authSkillRoot, 'scripts', 'login-browser.mjs');
  const loginRun = await runProcess(
    process.execPath,
    [
      loginScript,
      '--provider',
      'esiljang',
      '--browser-cdp-url',
      cdpUrl,
    ],
    { cwd: authSkillRoot, allowNonZero: true, timeoutMs: 60_000 },
  ).catch(() => null);
  const loginResult = loginRun
    ? parseCommandJson(loginRun.stdout, 'browser login')
    : null;
  if (
    loginResult?.status === 'authenticated' &&
    loginResult?.browserOwner === 'skill' &&
    loginResult?.provider === 'esiljang' &&
    loginResult?.targetUrl === LIST_URL
  ) {
    return;
  }

  const reasonCode = loginResult?.reasonCode;
  const humanReasons = new Set([
    'captcha',
    'mfa',
    'account_ambiguous',
    'provider_warning',
  ]);
  if (humanReasons.has(reasonCode)) {
    throw new ReaderFailure(
      'needs_input',
      reasonCode,
      loginResult?.message ?? '열린 이실장 브라우저에서 추가 확인을 완료해 주세요.',
      {},
      true,
    );
  }
  throw new ReaderFailure(
    'failed',
    'browser_login_unavailable',
    '저장된 계정으로 이실장 로그인을 완료하지 못했습니다.',
  );
}

async function selectActiveFilter(sessionName) {
  const before = await waitForFilterDescriptor(sessionName);
  const expectedTotal = before.activeFilter.count;

  await runAgent([
    '--session',
    sessionName,
    'snapshot',
    '-c',
    '-d',
    '4',
    '-s',
    '.statusWrap.ver3',
  ]);
  if (!before.activeFilter.selected) {
    await runAgent([
      '--session',
      sessionName,
      'click',
      ACTIVE_SELECTOR,
    ]);
  } else if (before.activePage !== 1) {
    const pageOneSelector =
      '.singleSection.listSection .pagination .btnPage[data-value="1"]';
    const resetSelector = before.pageNumbers.includes(1)
      ? pageOneSelector
      : ACTIVE_SELECTOR;
    await runAgent([
      '--session',
      sessionName,
      'click',
      resetSelector,
    ]);
  }
  const stable = await waitForStablePage(sessionName, 1, expectedTotal);
  await runAgent([
    '--session',
    sessionName,
    'snapshot',
    '-c',
    '-d',
    '4',
    '-s',
    '.statusWrap.ver3',
  ]);
  return { expectedTotal, stable };
}

async function browserIsInspectable(sessionName) {
  const result = await runAgent([
    '--session',
    sessionName,
    'get',
    'url',
  ], { allowNonZero: true, timeoutMs: 10_000 }).catch(() => null);
  const url = result?.stdout?.trim() ?? '';
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'aipartner.com' || host.endsWith('.aipartner.com');
  } catch {
    return false;
  }
}

export async function readActiveAdvertisements({ resumeSession = null } = {}) {
  if (resumeSession && !/^esiljang-reader-[a-zA-Z0-9-]+$/.test(resumeSession)) {
    throw new ReaderFailure(
      'failed',
      'invalid_input',
      'Reader가 생성한 기술 세션만 재개할 수 있습니다.',
    );
  }
  if (!resumeSession) await ensureCredentials();
  const sessionName =
    resumeSession ??
    `esiljang-reader-${process.pid}-${randomBytes(4).toString('hex')}`;
  let browserOpened = resumeSession !== null;
  let leaveBrowserOpen = false;

  try {
    if (!resumeSession) {
      browserOpened = true;
      await authenticateBrowser(sessionName);
    } else if (!(await browserIsInspectable(sessionName))) {
      throw new ReaderFailure(
        'failed',
        'browser_login_unavailable',
        '재개할 이실장 브라우저 세션을 찾을 수 없습니다.',
      );
    }
    const { expectedTotal, stable: firstPage } =
      await selectActiveFilter(sessionName);
    const observedAt = new Date().toISOString();
    const visitedPages = [];
    const items = [];
    const seenIds = new Set();
    let state = firstPage;

    while (true) {
      if (visitedPages.length >= 1_000) {
        throw new ReaderFailure(
          'failed',
          'partial_snapshot',
          '페이지 반복 가능성이 있어 수집을 중단했습니다.',
          { visitedPageCount: visitedPages.length },
        );
      }
      if (visitedPages.includes(state.activePage)) {
        throw new ReaderFailure(
          'failed',
          'partial_snapshot',
          '동일한 광고 페이지가 반복되었습니다.',
          { page: state.activePage },
        );
      }

      const pageItems = await extractPage(sessionName, state);
      for (const item of pageItems) {
        if (seenIds.has(item.externalAdId)) {
          throw new ReaderFailure(
            'failed',
            'partial_snapshot',
            '페이지 간 이실장 광고번호가 중복되었습니다.',
            { page: state.activePage },
          );
        }
        seenIds.add(item.externalAdId);
        items.push(item);
      }
      visitedPages.push(state.activePage);

      let decision;
      try {
        decision = decidePagination(state);
      } catch {
        throw new ReaderFailure(
          'failed',
          'layout_mismatch',
          '페이지 이동 상태가 현재 페이지와 일치하지 않습니다.',
          { page: state.activePage },
        );
      }
      if (decision.type === 'terminal') break;
      state = await advancePage(
        sessionName,
        decision,
        state,
        expectedTotal,
      );
    }

    if (expectedTotal !== null && expectedTotal !== items.length) {
      throw new ReaderFailure(
        'failed',
        'partial_snapshot',
        `광고중 ${expectedTotal}건 중 ${items.length}건만 확인되었습니다.`,
        {
          expectedTotal,
          observedTotal: items.length,
          visitedPageCount: visitedPages.length,
        },
      );
    }

    const normalized = normalizeSnapshot({
      provider: 'esiljang',
      scope: 'active_advertisements',
      activeFilter: {
        dataValue: 'ad',
        selected: true,
        count: expectedTotal,
      },
      observedAt,
      expectedTotal,
      paginationComplete: true,
      visitedPages,
      items,
    });
    if (normalized.errors.length > 0) {
      throw new ReaderFailure(
        'failed',
        'layout_mismatch',
        '수집된 이실장 값을 표준 광고 형식으로 정규화하지 못했습니다.',
        { errorCount: normalized.errors.length },
      );
    }
    normalized.items.sort((left, right) =>
      String(left.externalAdId ?? '').localeCompare(
        String(right.externalAdId ?? ''),
      ),
    );
    const validation = validateSnapshot(normalized);
    if (!validation.valid) {
      throw new ReaderFailure(
        'failed',
        'partial_snapshot',
        '이실장 현재 광고 스냅샷의 완전성 검증에 실패했습니다.',
        {
          expectedTotal,
          observedTotal: normalized.items.length,
          visitedPageCount: visitedPages.length,
          validationErrorCount: validation.errors.length,
        },
      );
    }

    const snapshot = {
      status: 'succeeded',
      provider: normalized.provider,
      scope: normalized.scope,
      activeFilter: normalized.activeFilter,
      observedAt: normalized.observedAt,
      expectedTotal: normalized.expectedTotal,
      collectedTotal: normalized.items.length,
      pageCount: normalized.visitedPages.length,
      visitedPages: normalized.visitedPages,
      paginationComplete: normalized.paginationComplete,
      manifestHash: validation.manifestHash,
      items: normalized.items,
      warnings: validation.warnings,
    };
    let snapshotFile;
    try {
      snapshotFile = await persistSnapshotJson(snapshot);
    } catch (error) {
      throw new ReaderFailure(
        'failed',
        'snapshot_persistence_failed',
        '검증된 이실장 광고 스냅샷을 로컬 JSON으로 저장하지 못했습니다.',
        { stageError: safeMessage(error) },
      );
    }
    return { ...snapshot, snapshotFile };
  } catch (error) {
    const failure =
      error instanceof ReaderFailure
        ? error
        : new ReaderFailure(
            'failed',
            'provider_unavailable',
            '이실장 광고를 읽는 중 기술 오류가 발생했습니다.',
            { stageError: safeMessage(error) },
          );
    const inspectable = browserOpened
      ? await browserIsInspectable(sessionName)
      : false;
    if (
      failure.status === 'failed' &&
      shouldYieldToAgent(failure.reasonCode, inspectable)
    ) {
      leaveBrowserOpen = true;
      throw new ReaderFailure(
        'needs_agent',
        'ui_obstruction',
        '에이전트가 열린 이실장 화면을 확인한 뒤 현재 읽기 작업과 무관한 UI를 닫고 재개해야 합니다.',
        {
          browserSession: sessionName,
          resumeCommand: `node scripts/read-active-ads.mjs --resume-session ${sessionName}`,
          originalReasonCode: failure.reasonCode,
        },
        true,
      );
    }
    leaveBrowserOpen = failure.keepBrowser;
    throw failure;
  } finally {
    if (browserOpened && !leaveBrowserOpen) {
      await runAgent(
        ['--session', sessionName, 'close'],
        { allowNonZero: true, timeoutMs: 15_000 },
      ).catch(() => {});
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    process.stdout.write(
      'Usage: node scripts/read-active-ads.mjs [--pretty] [--resume-session <skill-session>]\n' +
        'Reads the one saved Esiljang account and stores a validated JSON snapshot.\n' +
        `Default snapshot directory: ${DEFAULT_SNAPSHOT_DIRECTORY}\n`,
    );
    return;
  }
  let resumeSession = null;
  const consumed = new Set();
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--pretty') {
      consumed.add(index);
    } else if (args[index] === '--resume-session' && args[index + 1]) {
      resumeSession = args[index + 1];
      consumed.add(index);
      consumed.add(index + 1);
      index += 1;
    }
  }
  const unknown = args.filter((_, index) => !consumed.has(index));
  if (unknown.length > 0) {
    process.stdout.write(
      `${JSON.stringify({
        status: 'failed',
        reasonCode: 'invalid_input',
        message: '이 Reader는 사무소·워크플로·계정 프로필 입력을 받지 않습니다.',
      })}\n`,
    );
    process.exitCode = 1;
    return;
  }

  let result;
  try {
    result = await readActiveAdvertisements({ resumeSession });
  } catch (error) {
    result =
      error instanceof ReaderFailure
        ? error.toResult()
        : {
            status: 'failed',
            reasonCode: 'provider_unavailable',
            message: '이실장 광고 읽기를 완료하지 못했습니다.',
          };
  }
  process.stdout.write(
    `${JSON.stringify(result, null, args.includes('--pretty') ? 2 : 0)}\n`,
  );
  if (result.status === 'needs_input') process.exitCode = 2;
  else if (result.status === 'needs_agent') process.exitCode = 3;
  else if (result.status !== 'succeeded') process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stdout.write(
      `${JSON.stringify({
        status: 'failed',
        reasonCode: 'provider_unavailable',
        message: safeMessage(error),
      })}\n`,
    );
    process.exitCode = 1;
  });
}
