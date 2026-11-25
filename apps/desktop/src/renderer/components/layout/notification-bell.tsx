import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppNotification } from "@estate-erp/api-client";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { timeAgo } from "@/lib/time-ago";
import { cn } from "@/lib/utils";
import { navigateActiveTab } from "@/features/tabs/lib/navigateActiveTab";
import { getRouteMeta } from "@/features/tabs/lib/routeMeta";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { notificationRoute } from "@/components/layout/notification-route";

export { notificationRoute };

/** 안 읽은 알림 수. 30초마다, 창으로 돌아올 때 다시 센다. */
export function useUnreadNotificationCount() {
  const query = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    // 전역 staleTime(60초)이면 포커스 refetch가 무시되므로 항상 stale 처리
    staleTime: 0,
  });
  // 셸 위젯이므로 조회 에러는 조용히 (콘솔만)
  useEffect(() => {
    if (query.error) {
      console.error("알림 미읽음 카운트 조회 실패:", query.error);
    }
  }, [query.error]);
  return query.data?.count ?? 0;
}

/**
 * 알림 목록(최근 20건). 열려 있을 때만 불러온다.
 * - 안 읽은 항목은 파란 점 + 연한 배경으로 강조
 * - 누르면 읽음 처리 후 알림의 화면으로 이동 (갈 곳이 없는 알림은 읽음만)
 * - 조회/읽음 실패는 콘솔에만 기록 (셸 위젯이라 토스트는 모두 읽음 성공만)
 */
export function NotificationList({
  open,
  unreadCount,
  onNavigate,
}: {
  open: boolean;
  unreadCount: number;
  /** 알림을 눌러 다른 화면으로 옮겨 갈 때 (목록을 닫는 데 쓴다) */
  onNavigate?: () => void;
}) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api.notifications.list({ limit: 20 }),
    enabled: open,
    // 다시 열 때마다 최신 목록을 가져오도록 항상 stale 처리
    staleTime: 0,
  });
  const notifications = listQuery.data?.items ?? [];

  useEffect(() => {
    if (listQuery.error) {
      console.error("알림 목록 조회 실패:", listQuery.error);
    }
  }, [listQuery.error]);

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => {
      console.error("알림 읽음 처리 실패:", error);
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("모든 알림을 읽음으로 바꿨습니다.");
    },
    onError: (error) => {
      console.error("알림 모두 읽음 처리 실패:", error);
      toast.error("알림을 읽음으로 바꾸지 못했습니다. 다시 시도해 주세요.");
    },
  });

  const handleItemClick = (notification: AppNotification) => {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id);
    }
    const route = notificationRoute(notification);
    if (!route) return;
    const meta = getRouteMeta(route);
    void navigateActiveTab({ route, kind: meta.kind, title: meta.title });
    onNavigate?.();
  };

  let body: ReactNode;
  if (listQuery.isLoading) {
    body = (
      <div className="flex flex-col gap-3 px-3 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        ))}
      </div>
    );
  } else if (listQuery.isError && notifications.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <BellOff className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          알림을 불러오지 못했습니다
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => void listQuery.refetch()}
        >
          다시 시도
        </Button>
      </div>
    );
  } else if (notifications.length === 0) {
    body = (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
        <BellOff className="size-5 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">새 알림이 없습니다</p>
        <p className="text-xs text-muted-foreground">
          업무를 맡게 되면 여기에 알려 드립니다.
        </p>
      </div>
    );
  } else {
    body = (
      <ul className="max-h-96 overflow-y-auto">
        {notifications.map((notification) => {
          const route = notificationRoute(notification);
          return (
            <li key={notification.id} className="border-b last:border-b-0">
              <button
                type="button"
                onClick={() => handleItemClick(notification)}
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2.5 text-left transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
                  !notification.isRead && "bg-info-soft/40",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    notification.isRead ? "bg-transparent" : "bg-info",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-sm",
                      notification.isRead
                        ? "text-muted-foreground"
                        : "font-medium text-foreground",
                    )}
                  >
                    {notification.isRead ? null : (
                      <span className="sr-only">안 읽음 </span>
                    )}
                    {notification.title}
                  </span>
                  {notification.content && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {notification.content}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {timeAgo(notification.createdAt)}
                    {route ? null : " · 열 화면 없음"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div>
      <div className="flex h-10 items-center justify-between border-b px-3">
        <p className="text-sm font-medium">
          알림
          {unreadCount > 0 && (
            <span className="ml-1.5 text-xs font-normal text-info tabular-nums">
              안 읽음 {unreadCount}
            </span>
          )}
        </p>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck className="size-3.5" />
            모두 읽음
          </Button>
        )}
      </div>
      {body}
    </div>
  );
}

/**
 * 종 모양 알림 단추(지금은 제목줄에 두지 않는다 — 앱에서는 사이드바 사용자 메뉴의 '알림'이 같은 목록을 연다).
 * - 미읽음이 있으면 벨에 빨간 카운트 뱃지.
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const unreadCount = useUnreadNotificationCount();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={
            unreadCount > 0 ? `알림 (안 읽음 ${unreadCount}건)` : "알림"
          }
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-medium text-white tabular-nums"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <NotificationList
          open={open}
          unreadCount={unreadCount}
          onNavigate={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
