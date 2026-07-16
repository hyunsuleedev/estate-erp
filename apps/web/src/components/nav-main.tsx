import { useEffect, useState } from 'react'
import { Link, useMatchRoute } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { ALL_NAV_PATHS, type NavItem } from '@/components/layout/nav-config'

/**
 * nav-config의 그룹 1개를 렌더링.
 * active 판정: fuzzy 매치하되, 전체 네비 경로 중 더 구체적(긴) 경로가
 * 함께 매치되면 비활성 (예: /properties/external-listings 방문 시
 * "매물장"(/properties)이 아닌 "광고노트"만 활성).
 */
export function NavMain({
  label,
  items,
  defaultOpen = false,
}: {
  label: string
  items: NavItem[]
  defaultOpen?: boolean
}) {
  const matchRoute = useMatchRoute()
  const { isMobile, state: sidebarState } = useSidebar()

  const isActivePath = (path: string) => {
    if (!matchRoute({ to: path, fuzzy: true })) return false
    const hasMoreSpecificMatch = ALL_NAV_PATHS.some(
      (other) =>
        other !== path &&
        other.startsWith(`${path}/`) &&
        matchRoute({ to: other, fuzzy: true }),
    )
    return !hasMoreSpecificMatch
  }

  // 부모와 자식이 같은 경로를 공유할 수 있으므로(예: 매물관리 ↔ 매물 목록 = /properties)
  // 자식이 활성인 동안 부모 버튼은 강조하지 않는다 — 가장 깊은 매치만 하이라이트.
  const isParentActive = (item: NavItem) =>
    isActivePath(item.path) &&
    !(item.children ?? []).some((child) => isActivePath(child.path))

  const isGroupActive = items.some(
    (item) =>
      isActivePath(item.path) ||
      (item.children ?? []).some((child) => isActivePath(child.path)),
  )
  const [open, setOpen] = useState(defaultOpen || isGroupActive)

  useEffect(() => {
    if (isGroupActive) setOpen(true)
  }, [isGroupActive])

  const forceOpenForIconSidebar = !isMobile && sidebarState === 'collapsed'
  const isOpen = forceOpenForIconSidebar || open

  return (
    <Collapsible open={isOpen} onOpenChange={setOpen}>
      <SidebarGroup className="py-1">
        <SidebarGroupLabel asChild className="h-7 px-2">
          <CollapsibleTrigger
            aria-label={`${label} 메뉴 토글`}
            className="group/nav-section-trigger w-full cursor-pointer justify-between hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <span aria-hidden="true">{label}</span>
            <ChevronRight
              aria-hidden="true"
              className="transition-transform duration-150 group-data-[state=open]/nav-section-trigger:rotate-90"
            />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarMenu>
            {items.map((item) =>
              item.children && item.children.length > 0 ? (
                <Collapsible
                  key={item.path}
                  asChild
                  defaultOpen={!!matchRoute({ to: item.path, fuzzy: true })}
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    {/* 부모는 링크 — 아이콘 접힘 모드에서도 클릭으로 이동 가능해야 함 */}
                    <SidebarMenuButton
                      asChild
                      isActive={isParentActive(item)}
                      tooltip={item.label}
                    >
                      <Link to={item.path}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="data-[state=open]:rotate-90 transition-transform duration-200">
                        <ChevronRight />
                        <span className="sr-only">
                          {item.label} 하위 메뉴 토글
                        </span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.children.map((child) => (
                          <SidebarMenuSubItem key={child.path}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActivePath(child.path)}
                            >
                              <Link to={child.path}>
                                <span>{child.label}</span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              ) : (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(item.path)}
                    tooltip={item.label}
                  >
                    <Link to={item.path}>
                      <item.icon />
                      <span>{item.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ),
            )}
          </SidebarMenu>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
