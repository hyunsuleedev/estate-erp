import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthProvider } from "@/providers/auth-provider";
import { QueryProvider } from "@/providers/query-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { UpdatePrompt } from "@/components/update/UpdatePrompt";
import { Toaster } from "@/components/ui/sonner";
import { SplashBoundary } from "@/components/layout/splash-screen";
import { useForwardedToasts, useToastBottomOffset } from "@/lib/notify";
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
 * 셸·전화 팝업 층에서 보낸 알림도 이 화면에서 띄운다. 전화 팝업이 떠 있는
 * 동안은 알림을 팝업 위로 올려 가려지지 않게 한다.
 */
function AppToaster() {
  useForwardedToasts();
  const bottom = useToastBottomOffset();
  return <Toaster richColors position="bottom-right" offset={{ bottom }} />;
}
