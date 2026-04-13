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
  Bot,
  Wallet,
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
      { title: '광고노트', url: '/properties/external-listings' },
      { title: '내광고관리', url: '/properties/naver-my-ads' },
    ],
  },
  {
    title: '연락처',
    url: '/contacts',
    icon: BookUser,
    items: [
      { title: '연락처 목록', url: '/contacts' },
    ],
  },
  {
    title: '거래관리',
    url: '/deals',
    icon: Handshake,
  },
  {
    title: '수수료/정산',
    url: '/cashflow',
    icon: Wallet,
    items: [
      { title: '캐시플로우', url: '/cashflow' },
      { title: '수금 캘린더', url: '/cashflow/calendar' },
      { title: '수금 관리', url: '/cashflow/payments' },
      { title: '고정비 설정', url: '/cashflow/expenses' },
    ],
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
    title: '자료관리',
    url: '/contracts',
    icon: FileText,
    items: [
      { title: '계약서', url: '/contracts' },
      { title: '공적장부', url: '/documents' },
      { title: '매물 사진', url: '/documents/photos' },
    ],
  },
  {
    title: '네트워크',
    url: '/network',
    icon: Globe,
  },
  {
    title: 'AI 운영',
    url: '/ai-operations',
    icon: Bot,
    items: [
      { title: '개요', url: '/ai-operations' },
      { title: '에이전트', url: '/ai-operations/agent' },
      { title: 'AI 제안', url: '/ai-operations/proposals' },
      { title: '규칙 관리', url: '/ai-operations/rules' },
      { title: '실행 이력', url: '/ai-operations/history' },
      { title: '설정', url: '/ai-operations/settings' },
    ],
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
