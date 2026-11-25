import {
  BadgeCheck,
  Bell,
  ChevronsUpDown,
  LogOut,
} from "lucide-react"
import { Link } from "@tanstack/react-router"

import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

/** 이름의 첫 글자(한글·영문·숫자). "[대표] 홍길동"처럼 기호로 시작해도 글자를 고른다. */
function initialOf(name: string | undefined): string {
  const match = name?.match(/[\p{L}\p{N}]/u)
  return match ? match[0].toUpperCase() : "U"
}

export function NavUser({
  user,
  onLogout,
  onMenuOpenChange,
  unreadCount = 0,
  onOpenNotifications,
}: {
  user: {
    name: string
    email: string
  }
  onLogout: () => void
  onMenuOpenChange?: (open: boolean) => void
  /** 안 읽은 알림 수. 사용자 단추에 점과 숫자로 보인다. */
  unreadCount?: number
  /** 메뉴의 '알림'을 눌렀을 때. 없으면 알림 항목을 보이지 않는다. */
  onOpenNotifications?: () => void
}) {
  const { isMobile } = useSidebar()
  const initial = initialOf(user.name)
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={onMenuOpenChange}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={
                unreadCount > 0
                  ? `${user.name} 메뉴 (안 읽은 알림 ${unreadCount}건)`
                  : `${user.name} 메뉴`
              }
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <span className="relative shrink-0">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                {unreadCount > 0 && (
                  <span
                    aria-hidden
                    data-slot="nav-user-unread"
                    className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-medium text-white tabular-nums ring-2 ring-sidebar"
                  >
                    {unreadLabel}
                  </span>
                )}
              </span>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs">{user.email}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {initial}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">{user.name}</span>
                  <span className="truncate text-xs">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {onOpenNotifications ? (
                <DropdownMenuItem onSelect={() => onOpenNotifications()}>
                  <Bell />
                  알림
                  {unreadCount > 0 && (
                    <span className="ml-auto text-xs font-medium text-info tabular-nums">
                      안 읽음 {unreadLabel}
                    </span>
                  )}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link
                  to="/settings"
                  search={{ section: "account" }}
                  onClick={() => {
                    try {
                      localStorage.setItem(
                        "estate-erp:settings:v1:last-section",
                        "account",
                      )
                    } catch {
                      // 저장소를 못 써도 주소의 항목으로 열린다
                    }
                  }}
                >
                  <BadgeCheck />
                  계정 설정
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onLogout}>
              <LogOut />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
