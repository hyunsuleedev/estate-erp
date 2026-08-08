/**
 * Role 기반 MCP 권한 정의 (코드 상수, Single Source of Truth)
 *
 * 사용자별 mcpScopes/mcpTrustTier override가 필요해지면 (Phase 2+)
 * User 테이블에 컬럼 추가하고 이 default를 fallback으로 활용.
 */

import type { UserRole } from '../modules/auth/auth.types';

export type McpTrustTier = 'auto' | 'approval_required' | 'inform_only';

export interface RolePermissions {
  label: string;
  /** MCP 도구 호출 시 허용된 scope */
  mcpScopes: readonly string[];
  /** Write 도구 실행 정책 */
  mcpTrustTier: McpTrustTier;
  /** 일반 API에서 사용하는 큰 그룹 권한 */
  permissions: readonly string[];
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  owner: {
    label: '사장님',
    mcpScopes: [
      'properties:read',
      'properties:write',
      'contacts:read',
      'contacts:write',
      'deals:read',
      'deals:write',
      'consultations:write',
      'external:write',
      'advertisements:read',
      'advertisements:observe',
      'tasks:read',
      'tasks:write',
      'finance:read',
    ],
    mcpTrustTier: 'auto',
    permissions: [
      'read:all',
      'write:basic',
      'write:deals',
      'manage:users',
      'manage:office',
      'manage:billing',
      'proposals:approve',
      'network:write',
      'external:write',
      'admin',
    ],
  },
  manager: {
    label: '매니저',
    mcpScopes: [
      'properties:read',
      'properties:write',
      'contacts:read',
      'contacts:write',
      'deals:read',
      'deals:write',
      'consultations:write',
      'external:write',
      'advertisements:read',
      'advertisements:observe',
      'tasks:read',
      'tasks:write',
    ],
    mcpTrustTier: 'auto',
    permissions: [
      'read:all',
      'write:basic',
      'write:deals',
      'network:write',
      'external:write',
    ],
  },
  agent: {
    label: '직원',
    mcpScopes: [
      'properties:read',
      'contacts:read',
      'consultations:write',
      'advertisements:read',
      'advertisements:observe',
      'tasks:read',
      'tasks:write',
    ],
    mcpTrustTier: 'approval_required',
    permissions: ['read:all', 'write:basic'],
  },
};

/** Role의 MCP scope 가져오기 (없는 role이면 빈 배열) */
export function getRoleScopes(role: string): readonly string[] {
  if (role in ROLE_PERMISSIONS) {
    return ROLE_PERMISSIONS[role as UserRole].mcpScopes;
  }
  return [];
}

/** Role의 trust tier 가져오기 */
export function getRoleTrustTier(role: string): McpTrustTier {
  if (role in ROLE_PERMISSIONS) {
    return ROLE_PERMISSIONS[role as UserRole].mcpTrustTier;
  }
  return 'inform_only';
}
