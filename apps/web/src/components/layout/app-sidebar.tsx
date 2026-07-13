import { Fragment } from 'react'
import { useAuth } from '@/providers/auth-provider'
import { NavMain } from '@/components/nav-main'
import { NavFavorites } from '@/components/nav-favorites'
import { NavUser } from '@/components/nav-user'
import { OfficeSwitcher } from '@/components/team-switcher'
import { getNavGroups } from '@/components/layout/nav-config'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth()
  const groups = getNavGroups(user?.role)

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <OfficeSwitcher office={{ name: user?.office?.name ?? '사무소' }} />
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <Fragment key={group.key}>
            <NavMain label={group.label} items={group.items} />
            {/* 즐겨찾기 단지는 '메뉴' 그룹 바로 아래 유지 */}
            {group.key === 'menu' && <NavFavorites />}
          </Fragment>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user?.name ?? '',
            email: user?.email ?? '',
          }}
          onLogout={logout}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
