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
                            <Link to={subItem.url}>
                              <span>{subItem.title}</span>
                            </Link>
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
                <Link to={item.url}>
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
