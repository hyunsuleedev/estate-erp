import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/providers/auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { UpdatePrompt } from "@/components/update/UpdatePrompt";
import { Toaster } from "@/components/ui/sonner";
import { SplashBoundary } from "@/components/layout/splash-screen";
import { useForwardedToasts } from "@/lib/notify";
import { getRendererSurface } from "@/features/tabs/native/rendererSurface";
import "@/app.css";

export const Route = createRootRoute({
  component: () => (
    <QueryProvider>
      <AuthProvider>
        <RealtimeProvider>
          <SplashBoundary>
            <Outlet />
          </SplashBoundary>
          <UpdatePrompt />
          <AppToaster />
        </RealtimeProvider>
      </AuthProvider>
    </QueryProvider>
  ),
});

/**
 * 셸·전화 팝업 층에서 보낸 알림도 이 화면에서 띄운다.
 * 알림은 위쪽 가운데에 띄운다. 오른쪽 아래에 두면 계약서 편집의 출력·저장 단추, 프로젝트 상세의
 * 코멘트 입력, 목록의 일괄 작업 줄, 전화 팝업을 4초 동안 가린다. 오른쪽 위는 목록의 '새 … 등록' 단추 자리다.
 * 브라우저 미리보기는 같은 문서에 탭바(36px)가 있어 그만큼 내려 띄운다. Electron 탭 화면은 탭바가 따로라 조금만 띄운다.
 */
function AppToaster() {
  useForwardedToasts();
  const top = getRendererSurface().kind === "native-tab" ? 12 : 48;
  return <Toaster richColors position="top-center" offset={{ top }} />;
}
