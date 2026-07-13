import { Navigate } from '@tanstack/react-router'
import { useAuth } from '@/providers/auth-provider'
import type { NavRole } from '@/components/layout/nav-config'

/**
 * 라우트 레벨 role 가드. 사이드바/브레드크럼 노출 제어와 별개로,
 * URL 직접 접근까지 차단한다 (nav-config의 roles와 동일 기준 유지할 것).
 */
export function RequireRole({
  roles,
  fallback = '/dashboard',
  children,
}: {
  roles: NavRole[]
  fallback?: string
  children: React.ReactNode
}) {
  const { user, isLoading } = useAuth()

  // _authenticated 레이아웃이 로딩을 이미 처리하지만 방어적으로 유지
  if (isLoading) return null
  if (!user?.role || !roles.includes(user.role as NavRole)) {
    return <Navigate to={fallback} replace />
  }
  return <>{children}</>
}
