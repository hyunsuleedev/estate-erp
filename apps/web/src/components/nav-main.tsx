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
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
}: {
  label: string
  items: NavItem[]
}) {
  const matchRoute = useMatchRoute()

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

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-xs">{label}</SidebarGroupLabel>
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
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.label}>
                    <item.icon />
                    <span>{item.label}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
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
    </SidebarGroup>
  )
}
