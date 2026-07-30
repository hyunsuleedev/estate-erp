import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { AppNotification } from '@estate-erp/api-client'
import { Bell, BellOff, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

import { api } from '@/lib/api'
import { timeAgo } from '@/lib/time-ago'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * 상단바 알림 벨.
 * - 미읽음 카운트: 30초 폴링 + 창 포커스 시 refetch. 미읽음이 있으면 벨에 빨간 카운트 뱃지.
 * - 목록: Popover 열렸을 때만 최근 20건 조회. 미읽음 항목은 파란 점 + 연한 배경으로 강조.
 * - 클릭: 읽음 처리 후 linkType 기반 라우트 점프 (알 수 없는 타입은 점프 없음).
 * - 셸 위젯 특성상 조회/읽음 실패는 콘솔에만 기록 (toast 미사용 — 모두 읽음 성공만 toast).
 */
export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const unreadCountQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.notifications.unreadCount(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    // 전역 staleTime(60초)이면 포커스 refetch가 무시되므로 항상 stale 처리
    staleTime: 0,
  })
  const unreadCount = unreadCountQuery.data?.count ?? 0

  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => api.notifications.list({ limit: 20 }),
    enabled: open,
    // Popover를 다시 열 때마다 최신 목록을 가져오도록 항상 stale 처리
    staleTime: 0,
  })
  const notifications = listQuery.data?.items ?? []

  // 셸 위젯이므로 조회 에러는 조용히 (콘솔만)
  useEffect(() => {
    if (unreadCountQuery.error) {
      console.error('알림 미읽음 카운트 조회 실패:', unreadCountQuery.error)
    }
  }, [unreadCountQuery.error])
  useEffect(() => {
    if (listQuery.error) {
      console.error('알림 목록 조회 실패:', listQuery.error)
    }
  }, [listQuery.error])

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (error) => {
      console.error('알림 읽음 처리 실패:', error)
    },
  })

  const markAllReadMutation = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('모든 알림을 읽음 처리했습니다')
    },
    onError: (error) => {
      console.error('알림 모두 읽음 처리 실패:', error)
    },
  })

  /** linkType 기반 라우트 점프. 점프했으면 true 반환 (알 수 없는 타입은 false). */
  const jumpToLink = (notification: AppNotification): boolean => {
    const { linkType, linkId } = notification
    switch (linkType) {
      case 'property':
        if (linkId) {
          void navigate({ to: '/properties/$id', params: { id: linkId } })
        } else {
          void navigate({ to: '/properties' })
        }
        return true
      case 'listing':
        void navigate({ to: '/properties' })
        return true
      case 'deal':
        void navigate({ to: '/deals' })
        return true
      case 'networkRoom':
        void navigate({ to: '/network' })
        return true
      case 'task':
        void navigate({ to: '/tasks' })
        return true
      case 'agentActionRequest':
        void navigate({
          to: '/ai-requests',
          search: linkId ? { requestId: linkId } : {},
        })
        return true
      case 'match':
        void navigate({ to: '/matches' })
        return true
      default:
        return false
    }
  }

  const handleItemClick = (notification: AppNotification) => {
    if (!notification.isRead) {
      markReadMutation.mutate(notification.id)
    }
    if (jumpToLink(notification)) {
      setOpen(false)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8"
          aria-label={unreadCount > 0 ? `알림 (미읽음 ${unreadCount}건)` : '알림'}
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-medium text-white tabular-nums"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex h-10 items-center justify-between border-b px-3">
          <p className="text-sm font-medium">
            알림
            {unreadCount > 0 && (
              <span className="ml-1.5 text-xs font-normal text-info tabular-nums">
                미읽음 {unreadCount}
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

        {listQuery.isLoading ? (
          <div className="flex flex-col gap-3 px-3 py-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : listQuery.isError && notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BellOff className="size-5 text-muted-foreground" />
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
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <BellOff className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">새 알림이 없습니다</p>
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={() => handleItemClick(notification)}
                className={cn(
                  'flex w-full items-start gap-2 border-b px-3 py-2.5 text-left transition-colors last:border-b-0 hover:bg-muted/50',
                  !notification.isRead && 'bg-info-soft/40',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 size-1.5 shrink-0 rounded-full',
                    notification.isRead ? 'bg-transparent' : 'bg-info',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block truncate text-sm',
                      notification.isRead
                        ? 'text-muted-foreground'
                        : 'font-medium text-foreground',
                    )}
                  >
                    {notification.title}
                  </span>
                  {notification.content && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {notification.content}
                    </span>
                  )}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/70">
                    {timeAgo(notification.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
