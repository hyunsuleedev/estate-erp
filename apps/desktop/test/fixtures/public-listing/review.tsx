// Isolated component fixture: synthetic API, no real advertisement or account writes.
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PublicListingEditor } from "../../../src/renderer/routes/_authenticated/properties/-detail/sections/PublicListingEditor";
import "../../../src/renderer/app.css";
let saved: Record<string, unknown> | null = null;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input).includes("/public-listings/listing/")) {
    if (init?.method === "PUT") {
      const body = JSON.parse(String(init.body));
      saved = {
        ...body,
        id: "11111111-1111-4111-8111-111111111111",
        officeId: "22222222-2222-4222-8222-222222222222",
        listingId: "33333333-3333-4333-8333-333333333333",
        updatedAt: new Date().toISOString(),
      };
    }
    return new Response(JSON.stringify(saved), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  return originalFetch(input, init);
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <main className="p-8">
      <h1>공개 매물 설정 · 컴포넌트 검증</h1>
      <p>예시 API를 사용하는 검증 화면입니다. 실제 광고를 게재하지 않습니다.</p>
      <PublicListingEditor listingId="33333333-3333-4333-8333-333333333333" />
    </main>
  </QueryClientProvider>,
);
