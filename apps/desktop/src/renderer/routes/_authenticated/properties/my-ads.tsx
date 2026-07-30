import { createFileRoute, redirect } from "@tanstack/react-router";

/** @deprecated Canonical route: /properties/naver-my-ads */
export const Route = createFileRoute("/_authenticated/properties/my-ads")({
  beforeLoad: () => {
    throw redirect({ to: "/properties/naver-my-ads" });
  },
});
