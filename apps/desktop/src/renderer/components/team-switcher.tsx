import { useQuery } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'

import { api } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

const PLAN_LABELS: Record<string, string> = {
  free: '무료',
  basic: '기본',
  pro: '프로',
  premium: '프리미엄',
}

/**
 * 사무소 표시 전용 (전환 기능 없음 — cursor-default, 드롭다운 없음).
 * 사무소명 + 구독 플랜 배지.
 */
export function OfficeSwitcher({
  office,
}: {
  office: {
    name: string
  }
}) {
  const { data: officeProfile } = useQuery({
    queryKey: ['office', 'me'],
    queryFn: () => api.offices.getMe(),
    staleTime: 5 * 60 * 1000,
  })

  const subscription = officeProfile?.subscription
  const planLabel = subscription
    ? (PLAN_LABELS[subscription] ?? subscription)
    : null

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" className="cursor-default">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2 className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-medium">{office.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              중개사무소
            </span>
          </div>
          {planLabel && (
            <Badge
              variant="secondary"
              className="ml-auto px-1.5 text-[10px] group-data-[collapsible=icon]:hidden"
            >
              {planLabel}
            </Badge>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
