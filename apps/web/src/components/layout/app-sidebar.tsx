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
  PhoneCall,
  UserSearch,
  Globe,
  FileText,
  Users,
  Settings,
  Bot,
  Wallet,
  Inbox,
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
import { useTranslation } from 'react-i18next'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth()
  const { t } = useTranslation('sidebar')
  const isManagerOrOwner = user?.role === 'owner' || user?.role === 'manager'

  const navItems = [
    {
      title: t('items.dashboard'),
      url: '/dashboard',
      icon: SquareTerminal,
    },
    {
      title: t('items.inbox'),
      url: '/inbox',
      icon: Inbox,
    },
    {
      title: t('items.properties'),
      url: '/properties',
      icon: Building,
      items: [
        { title: t('items.propertiesList'), url: '/properties' },
        { title: t('items.propertiesExternalListings'), url: '/properties/external-listings' },
        { title: t('items.propertiesNaverMyAds'), url: '/properties/naver-my-ads' },
      ],
    },
    {
      title: t('items.contacts'),
      url: '/contacts',
      icon: BookUser,
      items: [
        { title: t('items.contactsList'), url: '/contacts' },
        { title: t('items.partnerBrokers'), url: '/partner-brokers' },
        { title: t('items.serviceVendors'), url: '/service-vendors' },
      ],
    },
    {
      title: t('items.deals'),
      url: '/deals',
      icon: Handshake,
    },
    {
      title: t('items.matches'),
      url: '/matches',
      icon: GitBranch,
    },
    {
      title: t('items.consultations'),
      url: '/consultations',
      icon: MessageSquare,
    },
    {
      title: t('items.calls'),
      url: '/calls',
      icon: PhoneCall,
    },
    {
      title: t('items.buyerRequirements'),
      url: '/buyer-requirements',
      icon: UserSearch,
    },
    {
      title: t('items.tasks'),
      url: '/tasks',
      icon: ListTodo,
    },
    {
      title: t('items.calendar'),
      url: '/calendar',
      icon: CalendarDays,
    },
    {
      title: t('items.sites'),
      url: '/sites',
      icon: Map,
    },
    {
      title: t('items.contracts'),
      url: '/contracts',
      icon: FileText,
    },
    {
      title: t('items.cashflow'),
      url: '/cashflow',
      icon: Wallet,
      items: [
        ...(isManagerOrOwner
          ? [
              { title: t('items.cashflowDashboard'), url: '/cashflow' },
              { title: t('items.cashflowLedger'), url: '/cashflow/ledger' },
              { title: t('items.partnerCommissions'), url: '/cashflow/partner-commissions' },
              { title: t('items.employeeSettlements'), url: '/cashflow/employee-settlements' },
            ]
          : []),
        { title: t('items.mySettlement'), url: '/cashflow/my-settlement' },
        ...(isManagerOrOwner
          ? [{ title: t('items.expenses'), url: '/cashflow/expenses' }]
          : []),
      ],
    },
    {
      title: t('items.documents'),
      url: '/documents',
      icon: FileText,
    },
    {
      title: t('items.network'),
      url: '/network',
      icon: Globe,
    },
    {
      title: t('items.aiOperations'),
      url: '/ai-operations',
      icon: Bot,
    },
    {
      title: t('items.employees'),
      url: '/employees',
      icon: Users,
    },
    {
      title: t('items.settings'),
      url: '/settings',
      icon: Settings,
    },
  ]

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
