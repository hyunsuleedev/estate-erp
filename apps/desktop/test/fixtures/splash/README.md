# Splash lifecycle review

Runs the production `SplashBoundary` and `SplashScreen` under React StrictMode with controllable auth/workspace loading guards. This is a development fixture, not an application route or a packaged entrypoint.

Start the desktop with `ELECTRON_REMOTE_DEBUGGING_PORT=9345 pnpm dev:desktop`, connect `agent-browser --session splash connect 9345`, then navigate that Electron renderer to `http://localhost:5174/test/fixtures/splash/index.html`.

- Initial state: the static logo shows while shaders compile in the background, then the apartment complex rises floor by floor (about 3.4 seconds) and the splash returns to the logo.
- The complex scene plays only for the first splash after launch. “다시 시작” resets that so the scene replays; “로고만 다시” shows what every later splash looks like (logo only, no WebGL canvas).
- “사무소 준비로 전환”: swaps loading guards without recreating the canvas.
- “준비 완료”: an early ready signal speeds up the remaining construction instead of cutting it; the ready view becomes interactive once the scene completes. If loading takes longer, the logo holds until ready. Minimized/hidden windows pause playback and resume when visible.
- With reduced-motion emulation, no WebGL canvas is created.

`agent-browser --session splash eval --stdin < test/fixtures/splash/assertions.js` checks handoff, early readiness waiting for playback, late readiness holding the logo, ready-view interaction, canvas cleanup, context loss, and fallback completion. Keep the Electron window visible during the animation checks. Run from `apps/desktop` after opening the fixture with reduced motion off.

Restore the renderer to `http://localhost:5174/` and reset media emulation when finished. Do not sign in or mutate production records for this review.
