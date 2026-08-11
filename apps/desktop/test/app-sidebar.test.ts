import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("desktop app sidebar", () => {
  // 웹(기준 구현)과 동일하게 사이드바에 관리 단지 즐겨찾기를 두지 않는다.
  it("does not render favorite complexes, matching the web sidebar", () => {
    const sidebarSource = readFileSync(
      resolve(testDir, "../src/renderer/components/layout/app-sidebar.tsx"),
      "utf8",
    );

    assert.equal(sidebarSource.includes("NavFavorites"), false);
  });

  it("does not render the office identity header", () => {
    const sidebarSource = readFileSync(
      resolve(testDir, "../src/renderer/components/layout/app-sidebar.tsx"),
      "utf8",
    );

    assert.equal(sidebarSource.includes("OfficeSwitcher"), false);
    assert.equal(sidebarSource.includes("SidebarHeader"), false);
  });

  it("reveals the navigation scrollbar only while the sidebar is interactive", () => {
    const sidebarSource = readFileSync(
      resolve(testDir, "../src/renderer/components/layout/app-sidebar.tsx"),
      "utf8",
    );
    const appCssSource = readFileSync(
      resolve(testDir, "../src/renderer/app.css"),
      "utf8",
    );

    assert.match(sidebarSource, /<Sidebar data-app-sidebar/);
    assert.match(sidebarSource, /<SidebarContent data-app-sidebar-scroll>/);
    assert.match(
      appCssSource,
      /\[data-app-sidebar-scroll\] \{[\s\S]*?--app-sidebar-scroll-thumb: transparent/,
    );
    assert.match(
      appCssSource,
      /\[data-app-sidebar\]:hover \[data-app-sidebar-scroll\],[\s\S]*?\[data-app-sidebar-scroll\]:focus-within/,
    );
  });

  it("uses the desktop sidebar information architecture and nested menu layout", () => {
    const navConfigSource = readFileSync(
      resolve(testDir, "../src/renderer/components/layout/nav-config.ts"),
      "utf8",
    );
    const navMainSource = readFileSync(
      resolve(testDir, "../src/renderer/components/nav-main.tsx"),
      "utf8",
    );

    for (const label of [
      "시작",
      "매물·공간",
      "고객·상담",
      "거래·계약",
      "업무·운영",
    ]) {
      assert.equal(navConfigSource.includes(`label: "${label}"`), true);
    }
    assert.equal(navConfigSource.includes('label: "매물관리"'), true);
    assert.equal(navConfigSource.includes('label: "광고관리"'), true);
    assert.equal(navConfigSource.includes('label: "광고노트"'), true);
    assert.equal(navConfigSource.includes('label: "내광고관리"'), true);
    assert.equal(navConfigSource.includes('label: "자동화흐름"'), false);
    assert.equal(navConfigSource.includes('label: "수집단지"'), false);
    assert.equal(navConfigSource.includes('label: "AI 요청함"'), false);
    assert.equal(navConfigSource.includes('path: "/ai-requests"'), false);
    assert.equal(navConfigSource.includes('label: "자동화설정"'), false);
    assert.equal(navConfigSource.includes('label: "수수료/정산"'), true);
    assert.equal(navConfigSource.includes('label: "파트너 중개사"'), false);
    const navItemsSource = navConfigSource.slice(
      navConfigSource.indexOf("export const NAV_ITEMS"),
      navConfigSource.indexOf("export const ALL_NAV_PATHS"),
    );
    assert.doesNotMatch(navItemsSource, /path: "\/documents"/);
    assert.doesNotMatch(navItemsSource, /label: "자료실"/);
    assert.doesNotMatch(navItemsSource, /path: "\/network"/);
    assert.doesNotMatch(navItemsSource, /label: "네트워크"/);
    assert.doesNotMatch(navItemsSource, /path: "\/service-vendors"/);
    assert.doesNotMatch(navItemsSource, /label: "협력업체 찾기"/);
    assert.doesNotMatch(navItemsSource, /path: "\/calls"/);
    assert.doesNotMatch(navItemsSource, /label: "통화 관리"/);
    assert.equal(navMainSource.includes("<NavItemWithChildren"), true);
    assert.equal(navMainSource.includes("SidebarMenuAction"), true);
    assert.equal(navMainSource.includes('className="py-1"'), true);
    assert.equal(navMainSource.includes('className="h-7 px-2"'), true);
  });

  it("does not expose server automation or collection-scope routes", () => {
    const navConfigSource = readFileSync(
      resolve(testDir, "../src/renderer/components/layout/nav-config.ts"),
      "utf8",
    );

    assert.doesNotMatch(navConfigSource, /automation-runs/);
    assert.doesNotMatch(navConfigSource, /collection-sites/);
    assert.doesNotMatch(navConfigSource, /ai-requests/);
  });

  it("places the Estaitt brand before the titlebar sidebar trigger", () => {
    const layoutSource = readFileSync(
      resolve(testDir, "../src/renderer/routes/_authenticated.tsx"),
      "utf8",
    );

    const brandIndex = layoutSource.indexOf('data-slot="desktop-brand"');
    const spacerIndex = layoutSource.indexOf(
      'data-slot="titlebar-brand-spacer"',
    );
    const triggerIndex = layoutSource.indexOf("<SidebarTrigger");

    assert.ok(brandIndex !== -1, "titlebar brand should exist");
    assert.ok(spacerIndex !== -1, "titlebar brand spacer should exist");
    assert.ok(triggerIndex !== -1, "sidebar trigger should exist");
    assert.ok(
      brandIndex < spacerIndex && spacerIndex < triggerIndex,
      "the flexible space should sit between Estaitt and the sidebar trigger",
    );
    assert.match(
      layoutSource,
      /w-\(--sidebar-width\)/,
      "titlebar controls should end at the expanded sidebar boundary",
    );
    assert.match(
      layoutSource,
      /isMac && !isFullscreen \? 'pl-\[92px\]' : 'pl-4'/,
      "macOS titlebar should leave breathing room after the 80px traffic-light area",
    );
    assert.match(
      layoutSource,
      /data-slot="titlebar-brand-spacer"[^>]*className="min-w-0 flex-1"/,
      "remaining titlebar space should be placed to the right of Estaitt",
    );
    assert.match(
      layoutSource,
      /<Separator[^>]*className="ml-1 mr-0 self-stretch"/,
      "the titlebar separator should fill the boundary from top to bottom",
    );
    assert.equal(
      layoutSource.includes("data-[orientation=vertical]:h-4"),
      false,
    );
  });

  it("does not render global actions in the desktop titlebar", () => {
    const layoutSource = readFileSync(
      resolve(testDir, "../src/renderer/routes/_authenticated.tsx"),
      "utf8",
    );

    assert.equal(layoutSource.includes("GlobalSearch"), false);
    assert.equal(layoutSource.includes("NotificationBell"), false);
    assert.equal(layoutSource.includes("QuickCreate"), false);
  });

  it("renders detached windows as a focused tab shell without sidebar navigation", () => {
    const layoutSource = readFileSync(
      resolve(testDir, "../src/renderer/routes/_authenticated.tsx"),
      "utf8",
    );
    const detachedStart = layoutSource.indexOf(
      "function DetachedAuthenticatedShell",
    );
    const detachedEnd = layoutSource.indexOf(
      "function AuthenticatedLayout",
      detachedStart,
    );
    const detachedSource = layoutSource.slice(detachedStart, detachedEnd);

    assert.ok(detachedStart !== -1, "detached shell should exist");
    assert.ok(detachedEnd > detachedStart, "detached shell should be isolated");
    assert.match(detachedSource, /data-window-shell="detached"/);
    assert.match(
      detachedSource,
      /<TabBar[^>]*showNewTabButton=\{false\}/,
      "detached windows should keep the tab strip without exposing the global new-tab action",
    );
    assert.match(
      detachedSource,
      /<TabContent autoCreateInitialTab=\{false\}/,
    );
    assert.doesNotMatch(detachedSource, /<AppSidebar/);
    assert.doesNotMatch(detachedSource, /<SidebarTrigger/);
    assert.doesNotMatch(detachedSource, /data-slot="desktop-brand"/);
    assert.doesNotMatch(detachedSource, /<CallPopup/);
  });

  it("renders titlebar tabs as compact bordered rectangles", () => {
    const tabSource = readFileSync(
      resolve(testDir, "../src/renderer/features/tabs/TabBar/Tab.tsx"),
      "utf8",
    );
    const tabBarSource = readFileSync(
      resolve(testDir, "../src/renderer/features/tabs/TabBar/TabBar.tsx"),
      "utf8",
    );
    const appCssSource = readFileSync(
      resolve(testDir, "../src/renderer/app.css"),
      "utf8",
    );

    assert.match(tabSource, /h-8[^'\n]*border border-border/);
    assert.match(
      tabSource,
      /z-10 -mb-px h-9 self-end border-b-background! /,
      "the active tab should meet the titlebar's bottom edge without a gap",
    );
    assert.match(tabSource, /first:ml-0/);
    assert.match(tabBarSource, /overflow-x-auto pl-1\.5/);
    assert.match(tabSource, /opacity-0[^'\n]*group-hover:opacity-70/);
    assert.equal(
      appCssSource.includes("Chrome-style active tab shoulders"),
      false,
    );
  });
});
