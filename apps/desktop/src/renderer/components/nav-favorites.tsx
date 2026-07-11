import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  MoreHorizontal,
  Frame,
} from "lucide-react"

import { api } from '@/lib/api'
import { useTranslation } from 'react-i18next'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavFavorites() {
  const { t } = useTranslation('sidebar')
  const { data: officeSites } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  })

  const sites = officeSites?.slice(0, 5) ?? []

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{t('favorites')}</SidebarGroupLabel>
      <SidebarMenu>
        {sites.length === 0 ? (
          <SidebarMenuItem>
            <SidebarMenuButton className="text-sidebar-foreground/50" asChild>
              <Link to="/sites">
                <Frame />
                <span>단지를 추가하세요</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : (
          <>
            {sites.map((os) => (
              <SidebarMenuItem key={os.id}>
                <SidebarMenuButton asChild>
                  <Link to="/sites">
                    <Frame />
                    <span>{os.site?.name ?? '-'}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
            {officeSites && officeSites.length > 5 && (
              <SidebarMenuItem>
                <SidebarMenuButton className="text-sidebar-foreground/70" asChild>
                  <Link to="/sites">
                    <MoreHorizontal className="text-sidebar-foreground/70" />
                    <span>더보기</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </>
        )}
      </SidebarMenu>
    </SidebarGroup>
  )
}
