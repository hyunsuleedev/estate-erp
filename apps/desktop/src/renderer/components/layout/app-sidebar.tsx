import { useEffect, useRef } from 'react'
import { Pin } from 'lucide-react'
import { useAuth } from '@/providers/auth-provider'
import { NavMain } from '@/components/nav-main'
import { NavUser } from '@/components/nav-user'
import { getNavGroups } from '@/components/layout/nav-config'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, logout } = useAuth()
  const groups = getNavGroups(user?.role)
  const { preview, setOpen, showPreview, hidePreview, keepPreview, leavePreview } = useSidebar()
  const userMenuOpen = useRef(false)

  useEffect(() => window.electronBridge?.tabs?.onSidebarPreview?.((command) => {
    if (command === 'show') showPreview()
    else if (command === 'leave') leavePreview()
    else hidePreview()
  }), [showPreview, leavePreview, hidePreview])

  useEffect(() => {
    if (!preview) return
    const isInside = (target: EventTarget | null) => target instanceof Element &&
      !!target.closest('[data-app-sidebar], [data-slot="sidebar-trigger"], [data-radix-popper-content-wrapper]')
    const move = (event: PointerEvent) => {
      if (userMenuOpen.current || isInside(event.target)) keepPreview()
      else leavePreview()
    }
    const outside = (event: PointerEvent) => { if (!isInside(event.target)) hidePreview() }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        hidePreview()
      }
    }
    const visibility = () => { if (document.hidden) hidePreview() }
    document.addEventListener('pointermove', move)
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('keydown', key)
    window.addEventListener('blur', hidePreview)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('keydown', key)
      window.removeEventListener('blur', hidePreview)
    }
  }, [preview, hidePreview, keepPreview, leavePreview])

  return (
    <Sidebar data-app-sidebar collapsible="offcanvas"
      onPointerEnter={keepPreview}
      onPointerLeave={() => { if (!userMenuOpen.current) leavePreview() }}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('a[href]')) hidePreview()
      }}
      {...props}>
      {preview && (
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
          <span className="text-xs font-medium text-muted-foreground">메뉴</span>
          <button type="button" aria-label="사이드바 고정" title="사이드바 고정"
            className="flex size-7 items-center justify-center rounded-md hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpen(true)}>
            <Pin className="size-3.5" />
          </button>
        </div>
      )}
      <SidebarContent data-app-sidebar-scroll>
        {groups.map((group) => (
          <NavMain key={group.key} label={group.label} items={group.items} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser
          user={{
            name: user?.name ?? '',
            email: user?.email ?? '',
          }}
          onLogout={logout}
          onMenuOpenChange={(open) => {
            userMenuOpen.current = open
            if (open) keepPreview()
            else if (!document.querySelector('[data-app-sidebar]:hover')) leavePreview()
          }}
        />
      </SidebarFooter>
    </Sidebar>
  )
}
