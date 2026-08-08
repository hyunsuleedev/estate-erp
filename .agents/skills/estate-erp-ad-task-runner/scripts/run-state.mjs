#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const args = process.argv.slice(2);
const command = args.shift();

function fail(message) {
  process.stderr.write(`${JSON.stringify({ error: message })}\n`);
  process.exit(1);
}

function flags(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}`);
    result[key] = value;
    index += 1;
  }
  return result;
}

function required(options, key) {
  const value = options[key];
  if (!value) fail(`--${key} is required`);
  return value;
}

function parseJson(value, label) {
  if (value === undefined) return null;
  try {
    return JSON.parse(value);
  } catch {
    fail(`${label} must be valid JSON`);
  }
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (!command || command === 'help' || command === '--help') {
  print({
    commands: {
      begin: '--task-id ID [--provider NAME] [--task-json JSON]',
      step: '--run-id ID --key KEY --status running|succeeded|failed|needs_input [--attempt N] [--message TEXT] [--details-json JSON]',
      finish: '--run-id ID --status completed|failed|needs_input|cancelled [--result-json JSON] [--error TEXT]',
      show: '--run-id ID | --task-id ID',
      list: '[--status STATUS] [--limit N]',
    },
  });
  process.exit(0);
}

const options = flags(args);
const dbPath = process.env.ESTATE_ERP_AD_TASK_DB_PATH
  ?? join(homedir(), '.agents', 'data', 'estate-erp-ad-task-runner', 'state.sqlite');
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    provider TEXT,
    status TEXT NOT NULL CHECK (status IN ('running','completed','failed','needs_input','cancelled')),
    task_json TEXT,
    result_json TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    finished_at TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS runs_one_active_per_task
    ON runs(task_id) WHERE status = 'running';
  CREATE INDEX IF NOT EXISTS runs_task_created ON runs(task_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    step_key TEXT NOT NULL,
    attempt INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running','succeeded','failed','needs_input')),
    message TEXT,
    details_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(run_id, step_key, attempt)
  );
`);

function hydrateRun(row) {
  if (!row) return null;
  return {
    ...row,
    task: row.task_json ? JSON.parse(row.task_json) : null,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    task_json: undefined,
    result_json: undefined,
  };
}

function getRun(runId) {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(runId);
}

try {
  if (command === 'begin') {
    const taskId = required(options, 'task-id');
    const task = parseJson(options['task-json'], '--task-json');
    const active = db.prepare("SELECT * FROM runs WHERE task_id = ? AND status = 'running'").get(taskId);
    if (active) {
      print({ reused: true, run: hydrateRun(active) });
    } else {
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO runs
        (id, task_id, provider, status, task_json, created_at, updated_at)
        VALUES (?, ?, ?, 'running', ?, ?, ?)`)
        .run(id, taskId, options.provider ?? null, task === null ? null : JSON.stringify(task), now, now);
      print({ reused: false, run: hydrateRun(getRun(id)) });
    }
  } else if (command === 'step') {
    const runId = required(options, 'run-id');
    const stepKey = required(options, 'key');
    const status = required(options, 'status');
    if (!['running', 'succeeded', 'failed', 'needs_input'].includes(status)) fail('Invalid step status');
    const run = getRun(runId);
    if (!run) fail('Run not found');
    if (run.status !== 'running') fail('Run is not active');
    const latest = db.prepare('SELECT * FROM steps WHERE run_id = ? AND step_key = ? ORDER BY attempt DESC LIMIT 1').get(runId, stepKey);
    let attempt = options.attempt ? Number(options.attempt) : null;
    if (attempt !== null && (!Number.isInteger(attempt) || attempt < 1)) fail('--attempt must be a positive integer');
    if (attempt === null) {
      attempt = status === 'running' && latest && latest.status !== 'running'
        ? latest.attempt + 1
        : latest?.attempt ?? 1;
    }
    const details = parseJson(options['details-json'], '--details-json');
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO steps
      (run_id, step_key, attempt, status, message, details_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, step_key, attempt) DO UPDATE SET
        status = excluded.status,
        message = excluded.message,
        details_json = excluded.details_json,
        updated_at = excluded.updated_at`)
      .run(runId, stepKey, attempt, status, options.message ?? null, details === null ? null : JSON.stringify(details), now, now);
    db.prepare('UPDATE runs SET updated_at = ? WHERE id = ?').run(now, runId);
    const step = db.prepare('SELECT * FROM steps WHERE run_id = ? AND step_key = ? AND attempt = ?').get(runId, stepKey, attempt);
    print({ step: { ...step, details: step.details_json ? JSON.parse(step.details_json) : null, details_json: undefined } });
  } else if (command === 'finish') {
    const runId = required(options, 'run-id');
    const status = required(options, 'status');
    if (!['completed', 'failed', 'needs_input', 'cancelled'].includes(status)) fail('Invalid finish status');
    if (!getRun(runId)) fail('Run not found');
    const result = parseJson(options['result-json'], '--result-json');
    const now = new Date().toISOString();
    db.prepare(`UPDATE runs SET status = ?, result_json = ?, error = ?, updated_at = ?, finished_at = ?
      WHERE id = ?`)
      .run(status, result === null ? null : JSON.stringify(result), options.error ?? null, now, now, runId);
    print({ run: hydrateRun(getRun(runId)) });
  } else if (command === 'show') {
    const runId = options['run-id'];
    const taskId = options['task-id'];
    if (!runId && !taskId) fail('--run-id or --task-id is required');
    const run = runId
      ? getRun(runId)
      : db.prepare('SELECT * FROM runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 1').get(taskId);
    if (!run) fail('Run not found');
    const steps = db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY id').all(run.id)
      .map((step) => ({ ...step, details: step.details_json ? JSON.parse(step.details_json) : null, details_json: undefined }));
    print({ run: hydrateRun(run), steps });
  } else if (command === 'list') {
    const limit = options.limit ? Number(options.limit) : 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) fail('--limit must be between 1 and 500');
    const rows = options.status
      ? db.prepare('SELECT * FROM runs WHERE status = ? ORDER BY created_at DESC LIMIT ?').all(options.status, limit)
      : db.prepare('SELECT * FROM runs ORDER BY created_at DESC LIMIT ?').all(limit);
    print({ runs: rows.map(hydrateRun) });
  } else {
    fail(`Unknown command: ${command}`);
  }
} finally {
  db.close();
}
