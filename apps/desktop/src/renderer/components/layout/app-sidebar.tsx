import {
  SquareTerminal,
  Building,
  BookUser,
  ListTodo,
  CalendarDays,
  Map,
  Handshake,
  GitBranch,
  MessageSquare,
  UserSearch,
  Globe,
  FileText,
  Users,
  Settings,
} from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { NavMain } from '@/components/nav-main'
import { NavFavorites } from '@/components/nav-favorites'
import { NavUser } from '@/components/nav-user'
import { OfficeSwitcher } from '@/components/team-switcher'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

const navItems = [
  {
    title: '대시보드',
    url: '/dashboard',
    icon: SquareTerminal,
  },
  {
    title: '매물관리',
    url: '/properties',
    icon: Building,
    items: [
      { title: '매물 목록', url: '/properties' },
      { title: '매물 등록', url: '/properties/new' },
    ],
  },
  {
    title: '연락처',
    url: '/contacts',
    icon: BookUser,
    items: [
      { title: '연락처 목록', url: '/contacts' },
      { title: '연락처 추가', url: '/contacts/new' },
    ],
  },
  {
    title: '거래관리',
    url: '/deals',
    icon: Handshake,
  },
  {
    title: '매칭',
    url: '/matches',
    icon: GitBranch,
  },
  {
    title: '상담기록',
    url: '/consultations',
    icon: MessageSquare,
  },
  {
    title: '구매고객',
    url: '/buyer-requirements',
    icon: UserSearch,
  },
  {
    title: '업무',
    url: '/tasks',
    icon: ListTodo,
  },
  {
    title: '캘린더',
    url: '/calendar',
    icon: CalendarDays,
  },
  {
    title: '관리단지',
    url: '/sites',
    icon: Map,
  },
  {
    title: '계약서 관리',
    url: '/contracts',
    icon: FileText,
  },
  {
    title: '네트워크',
    url: '/network',
    icon: Globe,
  },
  {
    title: '직원관리',
    url: '/employees',
    icon: Users,
  },
  {
    title: '설정',
    url: '/settings',
    icon: Settings,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <OfficeSwitcher
          office={{ name: user?.office?.name ?? '사무소' }}
        />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navItems} />
        <NavFavorites />
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
