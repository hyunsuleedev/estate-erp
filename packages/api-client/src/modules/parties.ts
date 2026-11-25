import type { PartyKind, PartyMemberStatus } from '@estate-erp/shared';
import type { RequestFn } from '../client.js';

export interface PartyMemberContactSummary {
  id: string;
  kind: string;
  name: string;
  phone: string | null;
  email?: string | null;
}

export interface PartyMember {
  id: string;
  officeId: string;
  partyId: string;
  partyKind: PartyKind;
  contactId: string;
  contactKind: string;
  roleLabel: string | null;
  isPrimary: boolean;
  status: PartyMemberStatus;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: PartyMemberContactSummary;
}

export interface Party {
  id: string;
  officeId: string;
  kind: PartyKind;
  name: string | null;
  organizationContactId: string | null;
  organizationContactKind: string | null;
  homePhone: string | null;
  memo: string | null;
  createdAt: string;
  updatedAt: string;
  organizationContact?: PartyMemberContactSummary | null;
  members: PartyMember[];
}

export interface PartiesByContact {
  household: Party | null;
  organizations: Party[];
  items: Party[];
}

export interface CreatePartyInitialMemberInput {
  memberContactId?: string;
  name?: string;
  phone?: string;
  roleLabel?: string;
  isPrimary?: boolean;
  memo?: string;
}

export interface CreatePartyDto {
  kind: PartyKind;
  contactId?: string;
  name?: string;
  businessRegNo?: string;
  homePhone?: string;
  memo?: string;
  selfRoleLabel?: string;
  selfIsPrimary?: boolean;
  initialMembers?: CreatePartyInitialMemberInput[];
}

export interface AddPartyMemberDto {
  memberContactId?: string;
  name?: string;
  phone?: string;
  roleLabel?: string;
  isPrimary?: boolean;
  memo?: string;
}

export interface SearchPartiesParams {
  search?: string;
  kind?: PartyKind;
  limit?: number;
}

export interface AddHouseholdMemberDto {
  contactId: string;
  memberContactId?: string;
  name?: string;
  phone?: string;
  roleLabel?: string;
  selfRoleLabel?: string;
  isPrimary?: boolean;
  memo?: string;
}

export interface AddOrganizationMemberDto {
  organizationContactId: string;
  memberContactId?: string;
  name?: string;
  phone?: string;
  roleLabel?: string;
  isPrimary?: boolean;
  memo?: string;
}

export interface UpdatePartyDto {
  name?: string | null;
  homePhone?: string | null;
  memo?: string | null;
}

export interface UpdatePartyMemberDto {
  roleLabel?: string | null;
  isPrimary?: boolean;
  status?: PartyMemberStatus;
  memo?: string | null;
}

export function createPartiesApi(request: RequestFn) {
  return {
    search: (params?: SearchPartiesParams) =>
      request<{ items: Party[] }>('/parties/search', {
        params: params ? { ...params } : undefined,
      }),

    findByContact: (contactId: string) =>
      request<PartiesByContact>('/parties', { params: { contactId } }),

    createParty: (dto: CreatePartyDto) =>
      request<Party>('/parties', { method: 'POST', body: dto }),

    addMember: (partyId: string, dto: AddPartyMemberDto) =>
      request<Party>(`/parties/${partyId}/members`, { method: 'POST', body: dto }),

    addHouseholdMember: (dto: AddHouseholdMemberDto) =>
      request<Party>('/parties/household-members', { method: 'POST', body: dto }),

    addOrganizationMember: (dto: AddOrganizationMemberDto) =>
      request<Party>('/parties/organization-members', { method: 'POST', body: dto }),

    updateParty: (partyId: string, dto: UpdatePartyDto) =>
      request<Party>(`/parties/${partyId}`, { method: 'PATCH', body: dto }),

    deleteParty: (partyId: string) =>
      request<{ deleted: boolean; id: string }>(`/parties/${partyId}`, { method: 'DELETE' }),

    updateMember: (partyId: string, memberId: string, dto: UpdatePartyMemberDto) =>
      request<Party>(`/parties/${partyId}/members/${memberId}`, { method: 'PATCH', body: dto }),

    removeMember: (partyId: string, memberId: string) =>
      request<{ deletedParty: boolean; party: Party | null }>(
        `/parties/${partyId}/members/${memberId}`,
        { method: 'DELETE' },
      ),
  };
}
