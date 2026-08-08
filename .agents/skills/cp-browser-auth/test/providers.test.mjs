import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authenticateBrowser,
  isLoopbackBrowserCdpUrl,
} from "../scripts/lib/browser-auth.mjs";
import {
  getProviderConfig,
  isAllowedProviderUrl,
  isExactProviderPage,
} from "../scripts/lib/providers.mjs";

describe("cp-browser-auth navigation boundaries", () => {
  it("accepts only loopback browser-level CDP WebSockets", () => {
    assert.equal(
      isLoopbackBrowserCdpUrl(
        "ws://127.0.0.1:9222/devtools/browser/browser-id",
      ),
      true,
    );
    assert.equal(
      isLoopbackBrowserCdpUrl("ws://localhost:9222/devtools/browser/id"),
      false,
    );
    assert.equal(
      isLoopbackBrowserCdpUrl(
        "ws://127.0.0.1:9222/devtools/page/page-id",
      ),
      false,
    );
    assert.equal(
      isLoopbackBrowserCdpUrl(
        "wss://example.com:9222/devtools/browser/browser-id",
      ),
      false,
    );
  });

  it("keeps each provider inside its HTTPS hostname allowlist", () => {
    const esiljang = getProviderConfig("esiljang");
    assert.equal(
      isAllowedProviderUrl(
        "https://www.aipartner.com/offerings/ad_list",
        esiljang.allowedHostSuffixes,
      ),
      true,
    );
    assert.equal(
      isAllowedProviderUrl(
        "https://aipartner.com.evil.example/offerings/ad_list",
        esiljang.allowedHostSuffixes,
      ),
      false,
    );
    assert.equal(
      isAllowedProviderUrl(
        "http://www.aipartner.com/offerings/ad_list",
        esiljang.allowedHostSuffixes,
      ),
      false,
    );
    assert.equal(
      isAllowedProviderUrl(
        "https://user:password@www.aipartner.com/offerings/ad_list",
        esiljang.allowedHostSuffixes,
      ),
      false,
    );
    assert.equal(
      isExactProviderPage(
        `${esiljang.authenticatedUrl}/`,
        esiljang.authenticatedUrl,
        esiljang.allowedHostSuffixes,
      ),
      true,
    );
    assert.equal(
      isExactProviderPage(
        `${esiljang.loginUrl}&unexpected=1`,
        esiljang.loginUrl,
        esiljang.allowedHostSuffixes,
      ),
      false,
    );
  });

  it("injects credentials through CDP but returns only safe status metadata", async () => {
    const originalWebSocket = globalThis.WebSocket;
    const provider = getProviderConfig("esiljang");
    const sockets = [];
    globalThis.WebSocket = class extends EventTarget {
      authenticated = false;
      sent = [];

      constructor(url) {
        super();
        this.url = url;
        sockets.push(this);
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }

      send(payload) {
        const command = JSON.parse(payload);
        this.sent.push(command);
        let result;
        if (command.method === "Target.getTargets") {
          result = {
            targetInfos: [
              {
                targetId: "provider-tab",
                type: "page",
                url: this.authenticated
                  ? provider.authenticatedUrl
                  : provider.loginUrl,
              },
            ],
          };
        } else if (command.method === "Target.attachToTarget") {
          result = { sessionId: "provider-session" };
        } else if (command.method === "Runtime.evaluate") {
          this.authenticated = true;
          result = { result: { value: { ok: true } } };
        } else {
          throw new Error(`Unexpected CDP method: ${command.method}`);
        }
        queueMicrotask(() => {
          const event = new Event("message");
          Object.defineProperty(event, "data", {
            value: JSON.stringify({ id: command.id, result }),
          });
          this.dispatchEvent(event);
        });
      }

      close() {
        this.dispatchEvent(new Event("close"));
      }
    };

    try {
      const result = await authenticateBrowser({
        browserCdpUrl:
          "ws://127.0.0.1:9222/devtools/browser/test-browser-id",
        ...provider,
        username: "test-user",
        password: "test-secret-value",
      });
      assert.deepEqual(result, {
        status: "authenticated",
        targetUrl: provider.authenticatedUrl,
      });
      assert.doesNotMatch(JSON.stringify(result), /test-user|test-secret-value/);
      const evaluation = sockets[0].sent.find(
        (command) => command.method === "Runtime.evaluate",
      );
      assert.match(evaluation.params.expression, /test-user/);
      assert.match(evaluation.params.expression, /test-secret-value/);
    } finally {
      globalThis.WebSocket = originalWebSocket;
    }
  });
});
