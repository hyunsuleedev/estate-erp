import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tabResourceKeys } from '../src/renderer/features/tabs/lib/tabResource';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

const testDir = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(testDir, relativePath), 'utf8');
}

describe('contract document tab', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      transferLockedTabIds: new Set(),
    });
  });

  it('keeps the contract list tab and reveals one editor tab per document', () => {
    const listTabId = useTabStore.getState().openModule({
      route: '/contracts',
      kind: 'contract',
      title: '계약서 관리',
    });
    const resourceKey = tabResourceKeys.entity(
      'contract-document',
      'document-1',
    );
    const editorInput = {
      route:
        '/contracts?editorContractId=contract-1&editorDocumentId=document-1',
      kind: 'contract' as const,
      title: '매매 계약서',
      resourceKey,
    };

    const editorTabId =
      useTabStore.getState().openOrRevealResource(editorInput);
    const reopenedTabId =
      useTabStore.getState().openOrRevealResource(editorInput);

    assert.notEqual(editorTabId, listTabId);
    assert.equal(reopenedTabId, editorTabId);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(useTabStore.getState().activeTabId, editorTabId);

    useTabStore.getState().closeTab(editorTabId);
    assert.equal(useTabStore.getState().activeTabId, listTabId);
  });

  it('opens the editor through the workspace tab store instead of window IPC', () => {
    const pageSource = source(
      '../src/renderer/routes/_authenticated/contracts/index.tsx',
    );

    assert.match(pageSource, /openOrRevealResource\(\{/);
    assert.match(pageSource, /tabResourceKeys\.entity\(/);
    assert.match(pageSource, /editorContractId/);
    assert.match(pageSource, /<DocumentEditorWorkspace/);
    assert.match(pageSource, /closeTab\(activeTabId\)/);
    assert.doesNotMatch(pageSource, /openContractWindow|DocumentEditorSheet/);
  });

  it('renders the editor as a full workspace instead of a drawer', () => {
    const editorSource = source(
      '../src/renderer/routes/_authenticated/contracts/-document-editor.tsx',
    );

    assert.match(editorSource, /export function DocumentEditorWorkspace/);
    assert.match(editorSource, /aria-label="계약 문서 편집기"/);
    assert.doesNotMatch(editorSource, /components\/ui\/sheet/);
    assert.doesNotMatch(editorSource, /<Sheet(?:Content)?\b/);
  });

  it('starts with the document tabs and omits redundant editor metadata', () => {
    const editorSource = source(
      '../src/renderer/routes/_authenticated/contracts/-document-editor.tsx',
    );

    assert.doesNotMatch(editorSource, /<header className="border-b px-6 py-4">/);
    assert.doesNotMatch(editorSource, />문서 편집</);
    assert.doesNotMatch(editorSource, />문서 설정</);
    assert.doesNotMatch(editorSource, />작업 유형</);
    assert.doesNotMatch(editorSource, />문서 목록</);
    assert.match(editorSource, /aria-label="계약 문서 탭"/);
    assert.match(editorSource, />작성 점검</);
    assert.match(editorSource, /<Button variant="outline" onClick=\{onClose\}>[\s\S]*?닫기/);
  });

  it('uses one Hangul amount format without exposing the legacy Hanja option', () => {
    const desktopPrimitives = source(
      '../src/renderer/routes/_authenticated/contracts/-clause-primitives.tsx',
    );
    const webPrimitives = source(
      '../../web/src/routes/_authenticated/contracts/-clause-primitives.tsx',
    );
    const desktopEditor = source(
      '../src/renderer/routes/_authenticated/contracts/-document-editor.tsx',
    );
    const webEditor = source(
      '../../web/src/routes/_authenticated/contracts/-document-editor.tsx',
    );

    for (const value of [desktopPrimitives, webPrimitives]) {
      assert.match(value, /export function AmountUnitBar/);
      assert.doesNotMatch(
        value,
        /금액인쇄형식|AMOUNT_NOTATION_OPTIONS|amount-notation-hanja|漢字/,
      );
    }
    for (const value of [desktopEditor, webEditor]) {
      assert.match(
        value,
        /getContractDocumentEnginePrintOptions\(document\?\.metadata\)[\s\S]*?amountNotation: 'hangul'/,
      );
      assert.match(
        value,
        /\.\.\.partial, amountNotation: 'hangul'/,
      );
    }
  });

  it('does not expose contract-specific BrowserWindow IPC', () => {
    const sources = [
      source('../src/main/windowManager.ts'),
      source('../src/preload.ts'),
      source('../src/renderer/electron.d.ts'),
      source('../../../packages/shared/src/types/tabs.ts'),
    ];

    for (const value of sources) {
      assert.doesNotMatch(
        value,
        /OpenContractWindowPayload|tabs:openContractWindow|createContractWindow/,
      );
    }
  });
});
