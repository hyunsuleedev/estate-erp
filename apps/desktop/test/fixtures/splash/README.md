# Splash lifecycle review

Runs the production `SplashBoundary` and `SplashScreen` under React StrictMode with controllable auth/workspace loading guards. This is a development fixture, not an application route or a packaged entrypoint.

Start the desktop with `ELECTRON_REMOTE_DEBUGGING_PORT=9345 pnpm dev:desktop`, connect `agent-browser --session splash connect 9345`, then navigate that Electron renderer to `http://localhost:5174/test/fixtures/splash/index.html`.

- Initial state: eight detached apartment blocks, camera rises to the plan, parcels join into the source logo. After nine seconds the logo holds while loading continues.
- “사무소 준비로 전환”: swaps loading guards without recreating the canvas.
- “준비 완료”: waits for the full nine-second animation before releasing the ready view; its button becomes interactive. If loading takes longer, the final logo holds until ready. Minimized/hidden windows pause playback and resume when visible so the animation is not skipped.
- “다시 시작”: creates a new splash after completion.
- With reduced-motion emulation, no WebGL canvas is created.

`agent-browser --session splash eval --stdin < test/fixtures/splash/assertions.js` checks handoff, early readiness waiting for playback, late readiness holding the logo, ready-view interaction, canvas cleanup, context loss, and fallback completion. Keep the Electron window visible during the animation checks. Run from `apps/desktop` after opening the fixture with reduced motion off.

Restore the renderer to `http://localhost:5174/` and reset media emulation when finished. Do not sign in or mutate production records for this review.
