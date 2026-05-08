import { Link, useMatchRoute } from '@tanstack/react-router'
import { ChevronRight, type LucideIcon } from "lucide-react"
import { useTranslation } from 'react-i18next'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { useTabStore } from '@/features/tabs/store/useTabStore'
import { getRouteMeta } from '@/features/tabs/lib/routeMeta'

/**
 * 사이드바 메뉴 클릭 동작:
 * - 일반 클릭 → 현재 활성 탭의 route 변경 (TanStack Link 기본 동작 + TabContent가 활성 탭 route 동기화)
 * - Cmd/Ctrl 클릭 또는 미들 클릭 → 새 탭으로 열기
 */
function useTabAwareLinkHandlers(url: string) {
  const openTab = useTabStore((s) => s.openTab)

  const openInNewTab = () => {
    const meta = getRouteMeta(url)
    openTab({ route: url, kind: meta.kind, title: meta.title })
  }

  return {
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault()
        openInNewTab()
      }
    },
    onAuxClick: (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault()
        openInNewTab()
      }
    },
  }
}

function TabAwareLink({ to, children }: { to: string; children: React.ReactNode }) {
  const handlers = useTabAwareLinkHandlers(to)
  return (
    <Link to={to} {...handlers}>
      {children}
    </Link>
  )
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const matchRoute = useMatchRoute()
  const { t } = useTranslation('sidebar')

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t('menu')}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) =>
          item.items && item.items.length > 0 ? (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={!!matchRoute({ to: item.url, fuzzy: true })}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items.map((subItem) => {
                      // 같은 그룹 내 다른 subItem URL 중 현재 경로와
                      // 더 구체적(긴)으로 일치하는 게 있으면 이 항목은 비활성.
                      // (예: /cashflow/ledger 방문 시 "캐시플로우"(/cashflow) 가 아닌
                      //  "수금 원장"(/cashflow/ledger) 만 활성화되도록 prefix 충돌 제거)
                      const hasMoreSpecificSibling = item.items!.some(
                        (other) =>
                          other.url !== subItem.url &&
                          other.url.startsWith(subItem.url + '/') &&
                          matchRoute({ to: other.url, fuzzy: true }),
                      );
                      const isActive =
                        !hasMoreSpecificSibling &&
                        !!matchRoute({ to: subItem.url, fuzzy: true });
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton asChild isActive={isActive}>
                            <TabAwareLink to={subItem.url}>
                              <span>{subItem.title}</span>
                            </TabAwareLink>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      );
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                asChild
                isActive={!!matchRoute({ to: item.url, fuzzy: true })}
                tooltip={item.title}
              >
                <TabAwareLink to={item.url}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </TabAwareLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
