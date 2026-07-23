import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.dirname(new URL(import.meta.url).pathname);
const htmlPath = path.join(root, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const errors = [];

const inlineScript = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!inlineScript) {
  errors.push('inline script not found');
} else {
  try {
    new vm.Script(`(function(){${inlineScript}\n})`);
  } catch (error) {
    errors.push(`inline JavaScript syntax: ${error.message}`);
  }
}

const pageBlock = html.match(/const pages = \[([\s\S]*?)\n    \];/)?.[1] ?? '';
const ids = [...pageBlock.matchAll(/\{id:(\d+),/g)].map(match => Number(match[1]));
const routes = [...pageBlock.matchAll(/route:'([^']+)'/g)].map(match => match[1]);
const images = [...pageBlock.matchAll(/image:'([^']+)'/g)].map(match => match[1]);

const routeTreePath = path.resolve(root, '../../apps/web/src/routeTree.gen.ts');
if (!fs.existsSync(routeTreePath)) {
  errors.push('web route tree not found');
} else {
  const routeTree = fs.readFileSync(routeTreePath, 'utf8');
  const declaredRouteBlock = routeTree.match(/declare module '@tanstack\/react-router' \{[\s\S]*?\n\}/)?.[0] ?? '';
  const sourceRoutes = [...declaredRouteBlock.matchAll(/fullPath: '([^']+)'/g)]
    .map(match => match[1].replace(/\/$/, '') || '/')
    .filter(route => route !== '/' && !route.startsWith('/dev/'));
  const uniqueSourceRoutes = [...new Set(sourceRoutes)].sort();
  const reportRoutes = [...routes].sort();
  if (uniqueSourceRoutes.length !== 39) {
    errors.push(`expected 39 user-facing web routes, found ${uniqueSourceRoutes.length}`);
  }
  const missingFromReport = uniqueSourceRoutes.filter(route => !reportRoutes.includes(route));
  const unknownInReport = reportRoutes.filter(route => !uniqueSourceRoutes.includes(route));
  if (missingFromReport.length) errors.push(`routes missing from report: ${missingFromReport.join(', ')}`);
  if (unknownInReport.length) errors.push(`report routes not found in web route tree: ${unknownInReport.join(', ')}`);
}

if (ids.length !== 39) errors.push(`expected 39 page ids, found ${ids.length}`);
if (new Set(ids).size !== ids.length) errors.push('duplicate page ids');
if (new Set(routes).size !== routes.length) errors.push('duplicate routes');
if (new Set(images).size !== images.length) errors.push('duplicate page images');

const expectedIds = Array.from({ length: 39 }, (_, index) => index + 1);
if (ids.join(',') !== expectedIds.join(',')) errors.push('page ids are not a continuous 1..39 sequence');

const dimensions = [];
for (const relative of images) {
  const file = path.join(root, relative);
  if (!fs.existsSync(file)) {
    errors.push(`missing image: ${relative}`);
    continue;
  }
  const buffer = fs.readFileSync(file);
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    errors.push(`not a valid PNG signature: ${relative}`);
    continue;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const ratio = width / height;
  dimensions.push({ relative, width, height });
  if (width < 1400 || height < 850) errors.push(`image too small: ${relative} (${width}×${height})`);
  if (ratio < 1.55 || ratio > 1.65) errors.push(`unexpected aspect ratio: ${relative} (${ratio.toFixed(3)})`);
}

const localLinks = [...html.matchAll(/(?:href|src)="([^"#]+)"/g)]
  .map(match => match[1])
  .filter(value => !value.startsWith('http') && !value.startsWith('data:') && !value.includes('${'));
for (const relative of localLinks) {
  const file = path.resolve(root, relative);
  if (!fs.existsSync(file)) errors.push(`missing static link: ${relative}`);
}

if (errors.length) {
  console.error(`Report verification failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${ids.length} source-matched routes, ${images.length} PNGs, ${localLinks.length} static links`);
  const sizes = new Set(dimensions.map(item => `${item.width}×${item.height}`));
  console.log(`Image dimensions: ${[...sizes].join(', ')}`);
}
