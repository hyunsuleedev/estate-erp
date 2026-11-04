(async () => {
  const waitFor = async (predicate, label) => {
    const until = Date.now() + 20000;
    while (!predicate()) {
      if (Date.now() > until) throw new Error(label);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
  };
  const click = (text) =>
    [...document.querySelectorAll("button")]
      .find((button) => button.textContent === text)
      .click();
  await waitFor(
    () => document.querySelector(".estate-splash canvas"),
    "scene did not load",
  );
  const canvas = document.querySelector(".estate-splash canvas");
  click("사무소 준비로 전환");
  await new Promise((resolve) => setTimeout(resolve, 100));
  if (canvas !== document.querySelector(".estate-splash canvas"))
    throw new Error("loading handoff recreated scene");
  click("준비 완료");
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (canvas !== document.querySelector(".estate-splash canvas"))
    throw new Error("fast readiness skipped animation");
  if (!document.getElementById("ready-content").closest("[inert]"))
    throw new Error("ready content became interactive before playback ended");
  await waitFor(
    () => Number(document.querySelector(".estate-splash__wordmark")?.style.opacity) >= 1,
    "animation did not reach the final logo",
  );
  await waitFor(
    () =>
      !document.querySelector(".estate-splash") &&
      document.getElementById("ready-content"),
    "completion stalled",
  );
  if (document.getElementById("ready-content").closest("[inert]"))
    throw new Error("ready content remained inert");
  if (canvas.isConnected) throw new Error("old WebGL canvas was not removed");
  click("다시 시작");
  await waitFor(
    () => document.querySelector(".estate-splash canvas"),
    "second scene did not load",
  );
  await waitFor(
    () => Number(document.querySelector(".estate-splash__wordmark")?.style.opacity) >= 1,
    "slow-load animation did not finish",
  );
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (!document.querySelector(".estate-splash"))
    throw new Error("animation completion bypassed app loading");
  click("준비 완료");
  await waitFor(() => !document.querySelector(".estate-splash"), "slow load did not release");
  click("다시 시작");
  await waitFor(() => document.querySelector(".estate-splash canvas"), "fallback scene did not load");
  const nextCanvas = document.querySelector(".estate-splash canvas");
  nextCanvas
    .getContext("webgl2")
    .getExtension("WEBGL_lose_context")
    .loseContext();
  await waitFor(
    () => document.querySelector(".estate-splash--static"),
    "context loss did not show fallback",
  );
  click("준비 완료");
  await waitFor(
    () => !document.querySelector(".estate-splash"),
    "fallback completion stalled",
  );
  return {
    passed: [
      "loading handoff preserves canvas",
      "fast readiness waits for full playback",
      "slow readiness holds the final logo",
      "ready content is interactive",
      "canvas cleanup",
      "WebGL fallback and completion",
    ],
    hidden: document.hidden,
    electron: !!window.electronBridge,
  };
})();
