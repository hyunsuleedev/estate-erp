import { QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@estate-erp/api-client';
import { useEffect, useRef, type ReactNode } from 'react';
import { CrossRendererQueryClient } from '@/lib/cross-renderer-query-client';

export const queryClient = new CrossRendererQueryClient(
  {
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.statusCode === 429) {
            return false;
          }
          return failureCount < 1;
        },
      },
    },
  },
  (queryKey) => {
    window.electronBridge?.tabs.broadcastInvalidate(queryKey);
  },
);

export function QueryProvider({ children }: { children: ReactNode }) {
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    cleanupRef.current?.();
    const bridge = window.electronBridge?.tabs;
    if (!bridge) return;
    const cleanup = bridge.onInvalidate(({ queryKey }) => {
      void queryClient.invalidateQueriesFromRemote(queryKey);
    });
    cleanupRef.current = cleanup;
    return () => {
      cleanup();
      if (cleanupRef.current === cleanup) cleanupRef.current = null;
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
