import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite'));
const { build } = viteRequire('esbuild');
const entry = fileURLToPath(new URL('./standalone-entry.tsx', import.meta.url));
const output = fileURLToPath(new URL('../../../../docs/mockups/matching-path-v2.html', import.meta.url));

const result = await build({
  entryPoints: [entry],
  bundle: true,
  write: false,
  outdir: '/tmp/estaitflow-matching-html-export',
  format: 'iife',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl' },
  legalComments: 'inline',
});
const js = result.outputFiles.find(file => file.path.endsWith('.js'))?.text;
const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text;
if (!js || !css) throw new Error('Missing bundled JavaScript or CSS');

const html = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data:; connect-src 'none'">
  <title>매물 매칭 · 2번 고객별 경로</title>
  <style>${css.replace(/<\/style/gi, '<\\/style')}
    main{padding-bottom:24px}.workspace-foot>span:last-child{display:none}
  </style>
</head>
<body>
  <div id="root"></div>
  <noscript>이 데모를 보려면 브라우저에서 JavaScript를 허용해 주세요.</noscript>
  <script>${js.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>
`;
await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(`${output}\n${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB · standalone HTML`);
