#!/usr/bin/env node
/**
 * Generate docs/erd.html + docs/erd-data.json from prisma/schema/*.prisma
 *
 * Usage: node scripts/generate-erd.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const schemaDir = path.join(root, 'prisma/schema');
const outHtml = path.join(root, 'docs/erd.html');
const outJson = path.join(root, 'docs/erd-data.json');

const DOMAIN_MAP = {
  'master.prisma': { id: 'master', label: '법정동 마스터', color: '#64748b', order: 0 },
  'office.prisma': { id: 'office', label: '멀티테넌시', color: '#6366f1', order: 1 },
  'site.prisma': { id: 'site', label: '장소 계층', color: '#0ea5e9', order: 2 },
  'property.prisma': { id: 'property', label: '매물/리스팅', color: '#10b981', order: 3 },
  'contact.prisma': { id: 'contact', label: '연락처', color: '#f59e0b', order: 4 },
  'crm.prisma': { id: 'crm', label: 'CRM 파이프라인', color: '#ef4444', order: 5 },
  'finance.prisma': { id: 'finance', label: '수수료/정산', color: '#ec4899', order: 6 },
  'task.prisma': { id: 'task', label: '업무/일정/감사', color: '#8b5cf6', order: 7 },
  'network.prisma': { id: 'network', label: '공동중개망', color: '#14b8a6', order: 8 },
  'external-listing.prisma': { id: 'external', label: '외부 매물', color: '#06b6d4', order: 9 },
  'office-advertisement.prisma': { id: 'office-ad', label: '자사 광고', color: '#22c55e', order: 10 },
  'listing-advertisement-snapshot.prisma': { id: 'ad-snap', label: '광고 스냅샷', color: '#84cc16', order: 11 },
  'agent.prisma': { id: 'agent', label: '에이전트 제어', color: '#a855f7', order: 12 },
  'service-vendor.prisma': { id: 'vendor', label: '업체', color: '#f97316', order: 13 },
  'partner-broker.prisma': { id: 'partner', label: '공동중개 파트너', color: '#eab308', order: 14 },
  'photo.prisma': { id: 'photo', label: '사진', color: '#3b82f6', order: 15 },
  'public-document.prisma': { id: 'pubdoc', label: '공공문서', color: '#78716c', order: 16 },
  'notification.prisma': { id: 'notif', label: '알림', color: '#f43f5e', order: 17 },
  'call-log.prisma': { id: 'call', label: '통화', color: '#0d9488', order: 18 },
  'call-recording.prisma': { id: 'callrec', label: '녹음', color: '#0891b2', order: 19 },
};

const PREFERRED_ORDER = {
  master: ['Province', 'District', 'Ward'],
  office: ['Office', 'User'],
  site: ['Site', 'SiteUnitType', 'Dong', 'Unit', 'OfficeSite'],
  property: ['Property', 'ListingIntake', 'Listing', 'ListingAdvertisement', 'PriceHistory'],
  contact: ['Contact', 'ContactPhone', 'ContactRelation', 'PropertyContact', 'Tenant'],
  crm: [
    'BuyerIntake', 'BuyerIntakeContact', 'BuyerRequirement', 'BuyerRequirementSite', 'BuyerRequirementRegion',
    'Consultation', 'Match', 'Deal', 'DealPayment', 'DealParticipant',
    'Contract', 'ContractParty', 'ContractDocument', 'ContractDocumentRevision',
    'ContractDocumentTemplate', 'ContractClauseTemplate', 'OfficePrintTemplate',
  ],
  finance: ['CommissionPayment', 'CommissionDistribution', 'CommissionAdjustment', 'OfficeExpenseTemplate'],
  task: ['Task', 'CalendarEvent', 'ActivityLog'],
  network: ['NetworkRoom', 'NetworkRoomMember', 'NetworkSharedProperty', 'NetworkInquiry', 'NetworkMessage'],
  external: ['ExternalListingSource', 'ExternalListingGroup', 'ExternalListing', 'ExternalListingSnapshotSession'],
  'office-ad': ['OfficeAdvertisementGroup', 'OfficeAdvertisement'],
  'ad-snap': ['ListingAdvertisementSnapshotSession', 'ListingAdvertisementSnapshotItem'],
  agent: [
    'AdvertisementSyncRun', 'AdvertisementSyncStep',
    'AgentActionIssue', 'AgentActionRequest', 'AgentActionExecutionStep', 'AgentActionVerification',
    'AgentSession', 'AgentWakeupRequest', 'AgentRun', 'AgentActivity',
  ],
  vendor: ['ServiceVendor', 'VendorContact', 'OfficeVendorFavorite'],
  partner: ['PartnerBroker'],
  photo: ['PropertyPhoto'],
  pubdoc: ['PublicDocument'],
  notif: ['Notification'],
  call: ['CallLog'],
  callrec: ['CallRecording', 'CallRecordingMessage'],
};

const SCALAR = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

function parseSchema() {
  const files = fs.readdirSync(schemaDir).filter((f) => f.endsWith('.prisma')).sort();
  const models = [];
  const enums = [];

  for (const file of files) {
    if (file === 'base.prisma') continue;
    const content = fs.readFileSync(path.join(schemaDir, file), 'utf8');
    const domain = DOMAIN_MAP[file] || {
      id: file.replace('.prisma', ''),
      label: file,
      color: '#94a3b8',
      order: 99,
    };

    for (const em of content.matchAll(/^enum\s+(\w+)\s*\{([^}]+)\}/gm)) {
      enums.push({
        name: em[1],
        values: em[2].split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//') && !l.startsWith('///')),
        file,
        domain: domain.id,
      });
    }

    const parts = content.split(/(?=^model\s+\w+)/m);
    for (const part of parts) {
      const m = part.match(/^model\s+(\w+)\s*\{([\s\S]*)\n\}/m);
      if (!m) continue;
      const name = m[1];
      const body = m[2];
      const fields = [];
      const relations = [];
      const indexes = [];
      const uniqueConstraints = [];
      let tableMap = null;

      for (const rawLine of body.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('//') || line.startsWith('///')) continue;
        if (line.startsWith('@@map(')) {
          const mm = line.match(/@@map\("([^"]+)"\)/);
          if (mm) tableMap = mm[1];
          continue;
        }
        if (line.startsWith('@@index')) {
          indexes.push(line);
          continue;
        }
        if (line.startsWith('@@unique')) {
          uniqueConstraints.push(line);
          continue;
        }
        if (line.startsWith('@@')) continue;

        const fm = line.match(/^(\w+)\s+(\S+)(.*)$/);
        if (!fm) continue;
        const [, fname, ftype, rest] = fm;
        const baseType = ftype.replace('[]', '').replace('?', '');
        const isArray = ftype.includes('[]');
        const optional = ftype.includes('?');
        const isModelType = !SCALAR.has(baseType);

        if (isModelType) {
          const fieldsMatch = rest.match(/fields:\s*\[([^\]]+)\]/);
          const refsMatch = rest.match(/references:\s*\[([^\]]+)\]/);
          const nameMatch = rest.match(/@relation\("([^"]+)"/);
          const onDelete = (rest.match(/onDelete:\s*(\w+)/) || [])[1] || null;
          relations.push({
            field: fname,
            target: baseType,
            isArray,
            optional,
            isOwning: !!fieldsMatch,
            localFields: fieldsMatch ? fieldsMatch[1].split(',').map((s) => s.trim()) : [],
            refFields: refsMatch ? refsMatch[1].split(',').map((s) => s.trim()) : [],
            relationName: nameMatch ? nameMatch[1] : null,
            onDelete,
          });
        } else {
          const mapM = rest.match(/@map\("([^"]+)"\)/);
          const dbType = (rest.match(/@db\.(\w+(?:\([^)]*\))?)/) || [])[1] || null;
          fields.push({
            name: fname,
            type: ftype,
            baseType,
            optional,
            isArray,
            pk: rest.includes('@id'),
            unique: rest.includes('@unique'),
            hasDefault: rest.includes('@default'),
            defaultExpr: ((rest.match(/@default\(([^)]+(?:\([^)]*\)[^)]*)*)\)/) || [])[1]) || null,
            map: mapM ? mapM[1] : null,
            dbType,
            isFk: false,
            fkTarget: null,
          });
        }
      }

      for (const rel of relations.filter((r) => r.isOwning)) {
        for (const lf of rel.localFields) {
          const f = fields.find((x) => x.name === lf);
          if (f) {
            f.isFk = true;
            f.fkTarget = rel.target;
          }
        }
      }

      models.push({
        name,
        table: tableMap || name,
        file,
        domain: domain.id,
        domainLabel: domain.label,
        domainColor: domain.color,
        domainOrder: domain.order,
        fields,
        relations,
        indexes,
        uniqueConstraints,
      });
    }
  }

  const edges = [];
  for (const model of models) {
    for (const rel of model.relations.filter((r) => r.isOwning)) {
      edges.push({
        from: model.name,
        to: rel.target,
        fromFields: rel.localFields,
        toFields: rel.refFields.length ? rel.refFields : ['id'],
        optional: rel.optional,
        onDelete: rel.onDelete,
        field: rel.field,
        relationName: rel.relationName,
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    source: 'prisma/schema/*.prisma',
    modelCount: models.length,
    edgeCount: edges.length,
    domains: Object.values(DOMAIN_MAP).sort((a, b) => a.order - b.order),
    models,
    edges,
    enums,
  };
}

function layoutData(data) {
  const CARD_W = 270;
  const ROW_H = 18;
  const HEADER_H = 40;
  const PAD = 8;
  const GAP_X = 70;
  const GAP_Y = 44;
  const DOMAIN_PAD = 28;
  const DOMAIN_HEADER = 44;
  const CANVAS_W = 3400;

  const modelsByDomain = {};
  for (const d of data.domains) modelsByDomain[d.id] = [];
  for (const m of data.models) (modelsByDomain[m.domain] ||= []).push(m);

  const cardHeight = (m) => HEADER_H + PAD + m.fields.length * ROW_H + PAD + 6;
  const sortDomainModels = (domainId, ms) => {
    const pref = PREFERRED_ORDER[domainId] || [];
    const rank = Object.fromEntries(pref.map((n, i) => [n, i]));
    return ms.slice().sort((a, b) => {
      const ra = rank[a.name] ?? 1000;
      const rb = rank[b.name] ?? 1000;
      if (ra !== rb) return ra - rb;
      return a.name.localeCompare(b.name);
    });
  };

  const layout = {};
  const domainBoxes = {};
  let cursorY = 48;

  for (const d of data.domains) {
    const ms = sortDomainModels(d.id, modelsByDomain[d.id] || []);
    if (!ms.length) continue;

    let x = DOMAIN_PAD + 48;
    let y = cursorY + DOMAIN_HEADER;
    let rowH = 0;
    let maxX = x;
    let maxBottom = y;

    for (const m of ms) {
      const h = cardHeight(m);
      if (x + CARD_W > CANVAS_W - 48 && x > DOMAIN_PAD + 48) {
        x = DOMAIN_PAD + 48;
        y += rowH + GAP_Y;
        rowH = 0;
      }
      layout[m.name] = { x, y, w: CARD_W, h, domain: d.id };
      maxX = Math.max(maxX, x + CARD_W);
      maxBottom = Math.max(maxBottom, y + h);
      rowH = Math.max(rowH, h);
      x += CARD_W + GAP_X;
    }

    const boxH = maxBottom - cursorY + DOMAIN_PAD;
    domainBoxes[d.id] = {
      id: d.id,
      label: d.label,
      color: d.color,
      x: 24,
      y: cursorY,
      w: Math.max(maxX + DOMAIN_PAD, 640),
      h: boxH,
    };
    cursorY += boxH + 40;
  }

  return {
    ...data,
    layout,
    domainBoxes,
    canvas: { w: CANVAS_W, h: cursorY + 48 },
    ui: { CARD_W, ROW_H, HEADER_H, PAD },
  };
}

// Keep HTML template in generate-erd by reading existing docs/erd.html runtime section is complex.
// Instead: write JSON always, and if docs/erd.html exists with marker, patch data; else require full rebuild via inline.
// For maintainability: write JSON + a thin loader HTML that fetches erd-data.json (works on static servers).
// Primary artifact remains self-contained HTML for file:// open.

function buildSelfContainedHtml(embed) {
  // Re-use the last generated interactive shell by replacing the JSON script block if present.
  // Fallback: minimal redirect-style note.
  const jsonStr = JSON.stringify(embed).replace(/</g, '\\u003c');

  if (fs.existsSync(outHtml)) {
    const prev = fs.readFileSync(outHtml, 'utf8');
    const replaced = prev.replace(
      /<script id="erd-data" type="application\/json">[\s\S]*?<\/script>/,
      `<script id="erd-data" type="application/json">${jsonStr}</script>`,
    );
    if (replaced !== prev) {
      // also refresh stats in case counts changed — runtime reads DATA so OK
      return replaced;
    }
  }

  // Full template is large; if missing, write a lightweight loader that expects erd-data.json
  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>EstaitFlow ERD</title>
  <style>
    body { margin:0; font-family: system-ui, sans-serif; background:#0b1020; color:#e2e8f0; display:grid; place-items:center; height:100vh; }
    a { color:#38bdf8; }
    code { background:#1e293b; padding:2px 6px; border-radius:4px; }
  </style>
</head>
<body>
  <div>
    <h1>ERD shell missing</h1>
    <p>Run the full generator once, or open the existing interactive file.</p>
    <p>Data written to <code>docs/erd-data.json</code> (${embed.modelCount} models, ${embed.edgeCount} relations).</p>
  </div>
</body>
</html>`;
}

const data = layoutData(parseSchema());
fs.mkdirSync(path.dirname(outJson), { recursive: true });
fs.writeFileSync(outJson, JSON.stringify(data, null, 2));
const html = buildSelfContainedHtml(data);
fs.writeFileSync(outHtml, html);
console.log(`Wrote ${path.relative(root, outJson)} and ${path.relative(root, outHtml)}`);
console.log(`models=${data.modelCount} edges=${data.edgeCount} domains=${data.domains.length}`);
