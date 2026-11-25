import { useEffect, useRef, useState } from 'react'
import { Pin } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { getNavGroups } from '@/components/layout/nav-config'
import { GlobalSearch } from '@/components/layout/global-search'
import {
  NotificationList,
  useUnreadNotificationCount,
} from '@/components/layout/notification-bell'
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth()
  const groups = getNavGroups(user?.role)
  const { preview, setOpen, showPreview, hidePreview, keepPreview, leavePreview } = useSidebar()
  const userMenuOpen = useRef(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const unreadCount = useUnreadNotificationCount()

  useEffect(() => window.electronBridge?.tabs?.onSidebarPreview?.((command) => {
    if (command === 'show') showPreview()
    else if (command === 'leave') leavePreview()
    else hidePreview()
  }), [showPreview, leavePreview, hidePreview])

  useEffect(() => {
    if (!preview) return
    const isInside = (target: EventTarget | null) => target instanceof Element &&
      !!target.closest('[data-app-sidebar], [data-slot="sidebar-trigger"], [data-radix-popper-content-wrapper]')
    const move = (event: PointerEvent) => {
      if (userMenuOpen.current || isInside(event.target)) keepPreview()
      else leavePreview()
    }
    const outside = (event: PointerEvent) => { if (!isInside(event.target)) hidePreview() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        hidePreview()
      }
    }
    const visibility = () => { if (document.hidden) hidePreview() }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', hidePreview)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', hidePreview)
    }
  }, [preview, hidePreview, keepPreview, leavePreview])

  return (
    <Sidebar data-app-sidebar collapsible="offcanvas"
      onPointerEnter={keepPreview}
      onPointerLeave={() => { if (!userMenuOpen.current && !notificationsOpen) leavePreview() }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a[href]')) hidePreview()
      }}
      {...props}>
      {preview && (
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-xs font-medium text-muted-foreground">메뉴</span>
          <button type="button" aria-label="사이드바 고정" title="사이드바 고정"
            className="flex size-7 items-center justify-center rounded-md hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen(true)}>
            <Pin className="size-3.5" />
          </button>
        </div>
      )}
      <SidebarContent data-app-sidebar-scroll>
        {/* 전체 검색: 손님 이름·전화번호 뒷자리·단지·동호로 바로 찾아 간다 (⌘K / Ctrl+K) */}
        <SidebarGroup className="pt-2 pb-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <GlobalSearch variant="sidebar" />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {groups.map((group) => (
          <NavMain key={group.key} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
          <PopoverAnchor asChild>
            <div>
              <NavUser
                user={{
                  name: user?.name ?? '',
                  email: user?.email ?? '',
                }}
                onLogout={logout}
                unreadCount={unreadCount}
                onOpenNotifications={() => setNotificationsOpen(true)}
                onMenuOpenChange={(open) => {
                  userMenuOpen.current = open
                  if (open) keepPreview()
                  else if (!document.querySelector('[data-app-sidebar]:hover')) leavePreview()
                }}
              />
            </div>
          </PopoverAnchor>
          <PopoverContent
            side="right"
            align="end"
            sideOffset={8}
            className="w-80 p-0"
            aria-label="알림"
            // 메뉴가 닫히며 초점을 사용자 단추로 돌려도 알림 목록이 바로 닫히지 않게 한다
            onFocusOutside={(event) => event.preventDefault()}
          >
            <NotificationList
              open={notificationsOpen}
              unreadCount={unreadCount}
              onNavigate={() => setNotificationsOpen(false)}
            />
          </PopoverContent>
        </Popover>
      </SidebarFooter>
    </Sidebar>
  )
}
