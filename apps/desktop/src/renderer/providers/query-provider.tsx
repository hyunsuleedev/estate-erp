import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

/**
 * Mutation success 시 meta.invalidates에 선언된 쿼리 키들을 다른 윈도우에 broadcast.
 * 다른 윈도우에서는 onInvalidate 리스너가 받아서 자기 쪽 query를 invalidate.
 */
queryClient.getMutationCache().subscribe((event) => {
  if (event.type !== 'updated') return;
  const action = (event as { action?: { type?: string } }).action;
  if (action?.type !== 'success') return;

  const meta = event.mutation.options.meta as
    | { invalidates?: readonly (readonly unknown[])[] }
    | undefined;
  const keys = meta?.invalidates;
  if (!keys || keys.length === 0) return;

  const bridge = window.electronBridge?.tabs;
  if (!bridge) return;
  for (const key of keys) {
    bridge.broadcastInvalidate(key);
  }
});

export function QueryProvider({ children }: { children: ReactNode }) {
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;
    const bridge = window.electronBridge?.tabs;
    if (!bridge) return;
    return bridge.onInvalidate(({ queryKey }) => {
      queryClient.invalidateQueries({ queryKey: queryKey as unknown[] });
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
