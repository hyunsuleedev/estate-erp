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

function parseFlags(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith('--')) fail(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = values[index + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function required(options, key) {
  if (!options[key]) fail(`--${key} is required`);
  return options[key];
}

function parseBoolean(value, label) {
  if (value === undefined) return undefined;
  if (value === 'true' || value === '1') return 1;
  if (value === 'false' || value === '0') return 0;
  fail(`${label} must be true or false`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

if (!command || command === 'help' || command === '--help') {
  print({
    commands: {
      add: '--site-id ID --external-code COMPLEX_NO [--site-name NAME] [--type TYPE] [--provider naver]',
      list: '[--provider naver] [--enabled true|false]',
      update: '--site-id ID [--external-code COMPLEX_NO] [--site-name NAME] [--type TYPE] [--enabled true|false]',
      enable: '--site-id ID',
      disable: '--site-id ID',
      remove: '--site-id ID',
      'mark-collected': '--site-id ID [--at ISO_DATE]',
    },
  });
  process.exit(0);
}

const options = parseFlags(args);
const dbPath = process.env.NAVER_COLLECTION_SCOPE_DB_PATH
  ?? join(homedir(), '.agents', 'data', 'naver-complex-collector', 'scope.sqlite');
mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
db.exec(`
  CREATE TABLE IF NOT EXISTS collection_sources (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    site_name TEXT,
    provider TEXT NOT NULL DEFAULT 'naver',
    external_code TEXT NOT NULL,
    site_type TEXT,
    enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    last_collected_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(provider, site_id),
    UNIQUE(provider, external_code)
  );
  CREATE INDEX IF NOT EXISTS collection_sources_enabled
    ON collection_sources(provider, enabled, site_name);
`);

function source(provider, siteId) {
  return db.prepare('SELECT * FROM collection_sources WHERE provider = ? AND site_id = ?').get(provider, siteId);
}

function present(row) {
  return row ? { ...row, enabled: Boolean(row.enabled) } : null;
}

try {
  const provider = options.provider ?? 'naver';
  if (command === 'add') {
    const siteId = required(options, 'site-id');
    const externalCode = required(options, 'external-code');
    const now = new Date().toISOString();
    try {
      db.prepare(`INSERT INTO collection_sources
        (id, site_id, site_name, provider, external_code, site_type, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`)
        .run(randomUUID(), siteId, options['site-name'] ?? null, provider, externalCode, options.type ?? null, now, now);
    } catch (error) {
      fail(error instanceof Error && error.message.includes('UNIQUE')
        ? 'A mapping already exists for this site or complex code'
        : String(error));
    }
    print({ source: present(source(provider, siteId)) });
  } else if (command === 'list') {
    const enabled = parseBoolean(options.enabled, '--enabled');
    const rows = enabled === undefined
      ? db.prepare('SELECT * FROM collection_sources WHERE provider = ? ORDER BY site_name, site_id').all(provider)
      : db.prepare('SELECT * FROM collection_sources WHERE provider = ? AND enabled = ? ORDER BY site_name, site_id').all(provider, enabled);
    print({ sources: rows.map(present) });
  } else if (command === 'update') {
    const siteId = required(options, 'site-id');
    const current = source(provider, siteId);
    if (!current) fail('Collection source not found');
    const enabled = parseBoolean(options.enabled, '--enabled');
    const now = new Date().toISOString();
    db.prepare(`UPDATE collection_sources SET
      external_code = ?, site_name = ?, site_type = ?, enabled = ?, updated_at = ?
      WHERE provider = ? AND site_id = ?`)
      .run(
        options['external-code'] ?? current.external_code,
        options['site-name'] ?? current.site_name,
        options.type ?? current.site_type,
        enabled ?? current.enabled,
        now,
        provider,
        siteId,
      );
    print({ source: present(source(provider, siteId)) });
  } else if (command === 'enable' || command === 'disable') {
    const siteId = required(options, 'site-id');
    const now = new Date().toISOString();
    const result = db.prepare('UPDATE collection_sources SET enabled = ?, updated_at = ? WHERE provider = ? AND site_id = ?')
      .run(command === 'enable' ? 1 : 0, now, provider, siteId);
    if (result.changes !== 1) fail('Collection source not found');
    print({ source: present(source(provider, siteId)) });
  } else if (command === 'remove') {
    const siteId = required(options, 'site-id');
    const existing = source(provider, siteId);
    if (!existing) fail('Collection source not found');
    db.prepare('DELETE FROM collection_sources WHERE provider = ? AND site_id = ?').run(provider, siteId);
    print({ removed: present(existing) });
  } else if (command === 'mark-collected') {
    const siteId = required(options, 'site-id');
    const at = options.at ?? new Date().toISOString();
    if (Number.isNaN(Date.parse(at))) fail('--at must be a valid ISO date');
    const result = db.prepare('UPDATE collection_sources SET last_collected_at = ?, updated_at = ? WHERE provider = ? AND site_id = ?')
      .run(at, new Date().toISOString(), provider, siteId);
    if (result.changes !== 1) fail('Collection source not found');
    print({ source: present(source(provider, siteId)) });
  } else {
    fail(`Unknown command: ${command}`);
  }
} finally {
  db.close();
}
