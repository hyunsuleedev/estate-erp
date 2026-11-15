import React, { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  SplashBoundary,
  SplashScreen,
  resetSplashIntro,
} from "../../../src/renderer/components/layout/splash-screen";

function Pending() {
  return <SplashScreen />;
}
function Review() {
  const [stage, setStage] = useState("auth");
  return (
    <>
      <SplashBoundary>
        {stage === "auth" ? (
          <Pending key="auth" />
        ) : stage === "workspace" ? (
          <Pending key="workspace" />
        ) : (
          <button id="ready-content">앱 화면</button>
        )}
      </SplashBoundary>
      <nav
        style={{
          position: "fixed",
          bottom: 10,
          left: 10,
          zIndex: 10001,
          display: "flex",
          gap: 10,
        }}
      >
        {/* 앱에서는 장면을 처음 한 번만 보여 준다. 검토할 때는 다시 볼 수 있게 되돌린다. */}
        <button
          onClick={() => {
            resetSplashIntro();
            setStage("auth");
          }}
        >
          다시 시작
        </button>
        <button onClick={() => setStage("auth")}>로고만 다시</button>
        <button onClick={() => setStage("workspace")}>
          사무소 준비로 전환
        </button>
        <button onClick={() => setStage("ready")}>준비 완료</button>
      </nav>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Review />
  </StrictMode>,
);
