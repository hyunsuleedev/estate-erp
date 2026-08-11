import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RequestFn } from "../src/client.ts";
import { createMatchesApi } from "../src/modules/matches.ts";

describe("matches api", () => {
  it("sends memo-only updates to the dedicated OCC endpoint", async () => {
    const calls: Array<{ path: string; options: unknown }> = [];
    const request: RequestFn = async <T>(path, options) => {
      calls.push({ path, options });
      return {} as T;
    };
    const matches = createMatchesApi(request);

    await matches.updateMemo("match-1", {
      memo: "방문 전 주차 확인",
      expectedUpdatedAt: "2026-08-01T09:00:00.000Z",
    });

    assert.deepEqual(calls, [
      {
        path: "/matches/match-1/memo",
        options: {
          method: "PATCH",
          body: {
            memo: "방문 전 주차 확인",
            expectedUpdatedAt: "2026-08-01T09:00:00.000Z",
          },
        },
      },
    ]);
    assert.equal(
      "stage" in (calls[0]?.options as { body: object }).body,
      false,
    );
  });
});
