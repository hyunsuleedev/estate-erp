import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

function source(relativePath: string): string {
  return readFileSync(resolve(testDir, relativePath), 'utf8');
}

describe('desktop auth lifecycle wiring', () => {
  it('reroutes a pending sign-out when its authority renderer is suspended', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const suspendStart = mainSource.indexOf('private suspendAuthShell(');
    const suspendEnd = mainSource.indexOf(
      '\n  private unregisterAuthShell(',
      suspendStart,
    );
    const suspendMethod = mainSource.slice(suspendStart, suspendEnd);

    assert.ok(suspendStart >= 0 && suspendEnd > suspendStart);
    assert.match(suspendMethod, /this\.authBroker\.suspendShell/);
    assert.match(suspendMethod, /pending\.shellWebContentsId = -1/);
    assert.match(
      suspendMethod,
      /pending\.attemptedShellIds\.delete\(shellWebContentsId\)/,
    );
    assert.match(suspendMethod, /this\.dispatchPendingSignOut\(pending\)/);
  });

  it('discards an invalid initial authority and continues dispatching', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const dispatchStart = mainSource.indexOf(
      'private dispatchPendingSignOut(',
    );
    const dispatchEnd = mainSource.indexOf(
      '\n  private finishPendingSignOut(',
      dispatchStart,
    );
    const dispatchMethod = mainSource.slice(dispatchStart, dispatchEnd);

    assert.ok(dispatchStart >= 0 && dispatchEnd > dispatchStart);
    assert.match(
      dispatchMethod,
      /pending\.shellWebContentsId = authority;[\s\S]*?this\.unregisterAuthShell\(authority\)/,
    );
    assert.match(
      dispatchMethod,
      /!this\.authBroker\.isShellAuthenticated\(authority\)[\s\S]*?pending\.shellWebContentsId = -1/,
    );
    assert.match(dispatchMethod, /contents\.send\('auth:signOutRequest'/);
  });

  it('commits broker logout only after a successful Clerk ACK', () => {
    const mainSource = source('../src/main/windowManager.ts');
    const providerSource = source(
      '../src/renderer/providers/auth-provider.tsx',
    );

    assert.match(
      providerSource,
      /\.then\(\(\) => signOut\(\)\)[\s\S]*?\.then\(\(\) => commitLocalSignedOut\(\)\)/,
    );
    assert.match(
      providerSource,
      /onSignOutRequest[\s\S]*?signOutClerkAndCommitLocal\(\)[\s\S]*?resolveSignOut\(\{ requestId, ok: true \}\)/,
    );
    assert.match(
      mainSource,
      /if \(response\.ok\) \{[\s\S]*?publishAuthSession\(shellWebContentsId, \{[\s\S]*?authenticated: false/,
    );
    assert.match(
      providerSource,
      /if \(!result\.ok\) \{\s*throw new Error\(result\.error/,
    );
  });

  it('treats missing-bearer 401 as transport recovery and bearer 401 as logout', () => {
    const providerSource = source(
      '../src/renderer/providers/auth-provider.tsx',
    );
    const brokeredStart = providerSource.indexOf(
      'function BrokeredTabAuthProvider(',
    );
    const brokeredProvider = providerSource.slice(brokeredStart);

    assert.ok(brokeredStart >= 0);
    assert.match(
      brokeredProvider,
      /if \(!hadBearer\) \{[\s\S]*?reapplyBrokerSession\(\)/,
    );
    assert.match(
      brokeredProvider,
      /if \(bearerFailureRef\.current\) return;[\s\S]*?requestSignOut\(\)/,
    );
  });

  it('does not erase a restored detached workspace during initial same-principal hydration', () => {
    const providerSource = source(
      '../src/renderer/providers/auth-provider.tsx',
    );
    const shellStart = providerSource.indexOf(
      'function ClerkShellAuthProvider(',
    );
    const brokeredStart = providerSource.indexOf(
      'function BrokeredTabAuthProvider(',
    );
    const shellProvider = providerSource.slice(shellStart, brokeredStart);

    assert.match(shellProvider, /hasEstablishedPrincipalRef/);
    assert.match(
      shellProvider,
      /hasEstablishedPrincipalRef\.current\s*&&[\s\S]*?principalRef\.current !== nextPrincipal[\s\S]*?resetWorkspaceForAuthChange\(\)/,
    );
    assert.match(
      shellProvider,
      /if \(nextPrincipal !== null\) hasEstablishedPrincipalRef\.current = true/,
    );
  });

  it('binds detached bootstrap lookup to the locally hydrated workspace owner', () => {
    const hookSource = source(
      '../src/renderer/features/tabs/hooks/useDetachedInitialTab.ts',
    );
    const preloadSource = source('../src/preload.ts');
    const mainSource = source('../src/main/windowManager.ts');

    assert.match(hookSource, /if \(!enabled \|\| !owner\) return/);
    assert.match(hookSource, /getInitialTab\(owner\)/);
    assert.match(
      preloadSource,
      /getInitialTab: \(owner: WindowWorkspaceOwner\)[\s\S]*?'tabs:getInitialTab', owner/,
    );
    assert.match(
      mainSource,
      /requestedPrincipal !== globalPrincipal \|\|[\s\S]*?entry\.workspacePrincipal !== requestedPrincipal/,
    );
  });
});
