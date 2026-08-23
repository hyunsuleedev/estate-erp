import type { TabWorkspaceSnapshot } from '@estate-erp/shared';

export interface WindowWorkspaceOwner {
  userId: string;
  officeId: string;
}

export interface WindowWorkspaceSyncPayload {
  owner: WindowWorkspaceOwner;
  workspace: TabWorkspaceSnapshot;
}

export function windowWorkspaceOwnerKey(owner: WindowWorkspaceOwner): string {
  return `${owner.userId}\u0000${owner.officeId}`;
}
