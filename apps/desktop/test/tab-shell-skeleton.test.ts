import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(
  new URL('../src/renderer/components/layout/splash-screen.tsx', import.meta.url),
  'utf8',
);

describe('tab screens do not replay the startup screen', () => {
  // 탭은 이미 켜진 앱 안에서 열린다. 시작 화면과 그 사라지는 순서(약 0.5초)를 탭마다 밟으면
  // 내용이 준비된 뒤에도 그만큼 기다리게 된다. 탭에서는 앱의 틀을 그려 두고 바로 내용을 보인다.
  const boundary = source.slice(
    source.indexOf('export function SplashBoundary'),
    source.indexOf('function TabShellSkeleton'),
  );

  it('draws the app frame instead of the splash while a tab screen gets ready', () => {
    const tabBranch = boundary.slice(
      boundary.indexOf('if (isNativeTab) {'),
      boundary.indexOf('return (\n    <LoadingContext.Provider value={register}>\n      <div inert'),
    );
    assert.match(tabBranch, /\{count > 0 && <TabShellSkeleton \/>\}/);
    assert.doesNotMatch(tabBranch, /SplashVisual/);
    // 내용을 덮어 두지 않는다(준비되면 기다림 없이 보인다)
    assert.doesNotMatch(tabBranch, /inert/);
    assert.match(tabBranch, /\{children\}/);
  });

  it('keeps the startup screen for the window document', () => {
    assert.match(boundary, /<SplashVisual\s+loading=\{count > 0\}/);
    assert.match(boundary, /const animated = !isNativeTab;/);
  });

  it('labels the frame for screen readers and marks it busy', () => {
    assert.match(source, /data-testid="tab-shell-skeleton"/);
    assert.match(source, /role="status"\s+aria-busy="true"/);
    assert.match(source, /화면을 불러오는 중입니다\./);
  });
});
