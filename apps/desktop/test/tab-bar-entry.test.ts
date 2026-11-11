import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * 탭바 문서(tabbar.html → src/tabbar/main.tsx)는 새 창을 열었을 때 가장 먼저 그려지는
 * 화면이다. 앱 전체(라우터, 서버 호출, 로그인, store)를 끌어오면 다시 느려지므로, 이
 * 문서가 불러오는 것을 여기서 지킨다.
 */
const testDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(testDir, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

const EXTENSIONS = ['', '.ts', '.tsx', '.css', '/index.ts', '/index.tsx'];

function resolveLocal(fromFile: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? join(root, 'src/renderer', specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`cannot resolve ${specifier} from ${relative(root, fromFile)}`);
}

/** 실행 때 실제로 불러오는 import만 모은다(`import type`은 빌드에서 사라진다). */
function runtimeSpecifiers(source: string): string[] {
  const found: string[] = [];
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const statements =
    /(?:^|\n)\s*(import|export)\s+(type\s+)?([\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  for (const match of withoutComments.matchAll(statements)) {
    if (match[2]) continue;
    found.push(match[4]);
  }
  for (const match of withoutComments.matchAll(/(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
    found.push(match[1]);
  }
  for (const match of withoutComments.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.push(match[1]);
  }
  for (const match of withoutComments.matchAll(/@import\s+["']([^"']+)["']/g)) {
    found.push(match[1]);
  }
  return found;
}

function packageName(specifier: string): string {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function walk(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [resolve(root, entry)];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    files.add(file);
    for (const specifier of runtimeSpecifiers(readFileSync(file, 'utf8'))) {
      // CSS의 `@import "tailwindcss"`처럼 패키지 이름으로 시작하는 것은 패키지다.
      const local =
        specifier.startsWith('.') || specifier.startsWith('@/')
          ? resolveLocal(file, specifier)
          : null;
      if (local) queue.push(local);
      else packages.add(packageName(specifier));
    }
  }
  return {
    files: [...files].map((file) => relative(root, file)).sort(),
    packages: [...packages].sort(),
  };
}

describe('tab bar document', () => {
  const graph = walk('src/tabbar/main.tsx');

  it('loads only what a tab bar needs', () => {
    // 탭을 끌어 옮기는 것은 브라우저의 기본 끌어 놓기로 한다(다른 창의 탭 줄, 창 밖까지
    // 이어지는 끌기는 그것만 된다). 끌기 라이브러리를 싣지 않는다.
    assert.deepEqual(graph.packages, [
      'clsx',
      'lucide-react',
      'pretendard',
      'react',
      'react-dom',
      'tailwind-merge',
      'tailwindcss',
    ]);
  });

  it('pulls in no app code: router, server calls, login, stores, providers', () => {
    const forbidden = [
      /^src\/renderer\/providers\//,
      /^src\/renderer\/routes\//,
      /^src\/renderer\/lib\/(?!utils\.ts$)/,
      /^src\/renderer\/features\/(?!tabs\/)/,
      /^src\/renderer\/features\/tabs\/store\//,
      /^src\/renderer\/features\/tabs\/native\//,
      /^src\/renderer\/features\/tabs\/previewTabBarPort\.ts$/,
      /^src\/renderer\/components\//,
      /^src\/renderer\/app\.css$/,
      /^src\/main\//,
      /^src\/preload\.ts$/,
    ];
    for (const file of graph.files) {
      for (const pattern of forbidden) {
        assert.doesNotMatch(file, pattern, `${file} must not be part of the tab bar document`);
      }
    }
    // 화면 쪽에서 가져다 쓰는 것은 탭바 부품과 그 부품이 쓰는 작은 도우미뿐이다.
    assert.deepEqual(
      graph.files.filter((file) => file.startsWith('src/renderer/')),
      [
        'src/renderer/features/tabs/TabBar/NewTabButton.tsx',
        'src/renderer/features/tabs/TabBar/Tab.tsx',
        'src/renderer/features/tabs/TabBar/TabBar.tsx',
        'src/renderer/features/tabs/TabBar/TabNavigationButtons.tsx',
        'src/renderer/features/tabs/TabBar/tabBarContext.tsx',
        'src/renderer/features/tabs/hooks/useTabDrag.ts',
        'src/renderer/features/tabs/lib/routeMeta.ts',
        'src/renderer/lib/utils.ts',
      ],
    );
    assert.ok(graph.files.length <= 30, `tab bar document grew to ${graph.files.length} files`);
  });

  it('uses the same colours and sidebar width as the app', () => {
    // 같은 이름이 여러 번 나오면 처음 것(밝은 테마의 값)을 본다. 뒤의 것은 어두운 테마나
    // 다른 변수로 잇는 선언이다.
    const declarations = (css: string) => {
      const found = new Map<string, string>();
      for (const match of css.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)) {
        if (!found.has(match[1])) found.set(match[1], match[2].trim());
      }
      return found;
    };
    const tabBar = declarations(read('src/tabbar/tabbar.css'));
    const app = declarations(read('src/renderer/app.css'));
    const shared = [...tabBar.keys()].filter((name) => app.has(name));
    assert.ok(shared.length >= 10, 'expected the tab bar to share theme tokens with the app');
    for (const name of shared) {
      assert.equal(tabBar.get(name), app.get(name), `${name} differs from src/renderer/app.css`);
    }
    for (const name of tabBar.keys()) {
      if (name.startsWith('--color-') || name.startsWith('--radius-')) {
        assert.ok(app.has(name), `${name} is not a token of the app theme`);
      }
    }
    const sidebar = read('src/renderer/components/ui/sidebar.tsx');
    assert.match(sidebar, new RegExp(`SIDEBAR_WIDTH = "${tabBar.get('--sidebar-width')}"`));
    assert.match(
      sidebar,
      new RegExp(`SIDEBAR_WIDTH_ICON = "${tabBar.get('--sidebar-width-icon')}"`),
    );
  });

  it('is built next to the app document and never replaced by it', () => {
    const html = read('tabbar.html');
    assert.match(html, /<script type="module" src="\/src\/tabbar\/main\.tsx"><\/script>/);
    // 탭바 문서는 서버를 부르지 않는다: 바깥 호스트를 허용하지 않는다.
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? '';
    assert.ok(csp.length > 0);
    assert.doesNotMatch(csp, /https:|naver|kakao|estaitt/);

    const vite = read('vite.renderer.config.ts');
    assert.match(vite, /index: path\.resolve\(__dirname, 'index\.html'\)/);
    assert.match(vite, /tabbar: path\.resolve\(__dirname, 'tabbar\.html'\)/);

    const main = read('src/main.ts');
    // 없는 .html 문서를 앱 문서로 대신하지 않는다(탭바가 빠진 빌드가 앱 전체를 띄우지 않게).
    assert.match(main, /fallsBackToAppDocument\(requested\.relativePath\)/);
    assert.match(main, /new Response\('Not Found', \{ status: 404 \}\)/);
    // 패키지 앱은 시작할 때 문서가 다 있는지 확인하고, 없으면 주소 처리를 등록하기 전에
    // 던진다. 던진 것은 시작 순서(src/main/startup.ts)가 받아 알리고 끝낸다.
    assert.match(
      main,
      /const missing = missingRendererDocuments\(rendererRoot, existsSync\);\s*if \(missing\.length > 0\) \{\s*throw new Error\([\s\S]*?protocol\.handle\(APP_PROTOCOL/,
    );
    assert.match(main, /reportFailure: reportStartupFailure,/);
    assert.match(
      main,
      /async function reportStartupFailure\(error: unknown\): Promise<void> \{[\s\S]*?await dialog\.showMessageBox\([\s\S]*?app\.exit\(1\);/,
    );
    // 탭 화면은 탭바 문서를 앱 화면으로 띄우지 않는다.
    assert.match(read('src/common/nativeTabs.ts'), /'\/tabbar\.html'/);
  });
});
