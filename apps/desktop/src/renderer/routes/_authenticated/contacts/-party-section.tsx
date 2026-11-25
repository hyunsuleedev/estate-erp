import { Link } from '@tanstack/react-router';
import type { ContactDetail, Party, PartyMember } from '@estate-erp/api-client';
import { ContactKind, PartyKind } from '@estate-erp/shared';
import { Building2, GitFork, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Avatar, H2, nb, Tag } from '../properties/-detail/ui';
import type { PartyDisplayItem } from './-detail-cards';

function toPartyDisplayItem(party: Party, member: PartyMember): PartyDisplayItem {
  return {
    id: `${party.id}:${member.id}`,
    partyId: party.id,
    memberId: member.id,
    partyKind: party.kind,
    contactId: member.contactId,
    contactName: member.contact?.name ?? '이름 없음',
    contactPhone: member.contact?.phone ?? null,
    roleLabel: member.roleLabel,
    isPrimary: member.isPrimary,
    memo: member.memo,
  };
}

export function ContactPartySection({
  contact,
  parties,
  deletingMemberKey,
  onOpenStructureModal,
  onOpenCreateParty,
  onEditParty,
  onDeleteParty,
  onAddMember,
  onEditMember,
  onRemoveMember,
}: {
  contact: ContactDetail;
  parties: Party[];
  deletingMemberKey?: string | null;
  onOpenStructureModal: (partyId?: string) => void;
  onOpenCreateParty: (defaultTab?: 'new-household' | 'new-org' | 'join-existing') => void;
  onEditParty: (party: Party) => void;
  onDeleteParty: (party: Party) => void;
  onAddMember: (party: Party) => void;
  onEditMember: (item: PartyDisplayItem) => void;
  onRemoveMember: (item: PartyDisplayItem) => void;
}) {
  const isOrganization = contact.kind === ContactKind.ORGANIZATION;
  const totalMembers = parties.reduce((sum, party) => sum + party.members.length, 0);

  return (
    <section data-contact-parties id="parties" className="mt-6 border-t border-[#e9e9e7] pt-5">
      <H2
        title={isOrganization ? '법인 파티 · 담당자' : '세대 · 법인 소속'}
        count={parties.length}
        hint={
          parties.length > 0
            ? `${parties.length}개 파티 · 총 ${totalMembers}명`
            : undefined
        }
        action={
          <div className="flex items-center gap-1">
            {parties.length > 0 && (
              <button
                type="button"
                className={cn(
                  nb.ghost,
                  'bg-[#e8f1fa] font-semibold text-[#1b64b1] hover:bg-[#dceafb]',
                )}
                onClick={() => onOpenStructureModal()}
              >
                <GitFork />
                구성도 보기
              </button>
            )}
            <button
              type="button"
              className={nb.ghost}
              onClick={() => onOpenCreateParty()}
            >
              <Plus />
              새 파티
            </button>
          </div>
        }
      />

      {parties.length === 0 ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#e9e9e7] bg-[#f7f6f3]/70 px-4 py-3 text-[13px] text-[#37352f]/70">
          <div className="min-w-0 flex-1 break-keep">
            {isOrganization
              ? '이 법인의 대표자·담당자 구성을 관리할 법인 파티가 아직 없습니다.'
              : '연결된 세대·법인 소속이 없습니다. 다른 사람을 먼저 찾지 않아도 1인 세대나 새 법인 파티를 만들 수 있습니다.'}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {!isOrganization && (
              <button
                type="button"
                className={nb.solid}
                onClick={() => onOpenCreateParty('new-household')}
              >
                + 새 세대 만들기
              </button>
            )}
            <button
              type="button"
              className={nb.line}
              onClick={() => onOpenCreateParty('new-org')}
            >
              + 새 법인 만들기
            </button>
            <button
              type="button"
              className={nb.line}
              onClick={() => onOpenCreateParty('join-existing')}
            >
              기존 소속 연결
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 space-y-2.5">
          {parties.map((party) => {
            const isOrg = party.kind === PartyKind.ORGANIZATION;
            const partyTitle =
              party.organizationContact?.name ?? party.name ?? (isOrg ? '법인' : '세대');

            return (
              <div
                key={party.id}
                data-party-row={party.id}
                className="rounded-md border border-[#e9e9e7] bg-white px-3.5 py-2.5 transition-colors hover:border-[#d3d1cb]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {isOrg ? (
                      <Building2 className="size-3.5 shrink-0 text-[#6940a5]" />
                    ) : (
                      <Home className="size-3.5 shrink-0 text-[#2b6e3f]" />
                    )}
                    {party.organizationContactId &&
                    party.organizationContactId !== contact.id ? (
                      <Link
                        to="/contacts/$id"
                        params={{ id: party.organizationContactId }}
                        className="truncate text-[14px] font-semibold text-[#37352f] underline-offset-2 hover:underline"
                      >
                        {partyTitle}
                      </Link>
                    ) : (
                      <span className="truncate text-[14px] font-semibold text-[#37352f]">
                        {partyTitle}
                      </span>
                    )}
                    <Tag tone={isOrg ? 'blue' : 'green'}>{isOrg ? '법인' : '세대'}</Tag>
                    <Tag>{`${party.members.length}명`}</Tag>
                    {party.homePhone && (
                      <span className="text-[12.5px] tabular-nums text-[#37352f]/55">
                        {formatPhone(party.homePhone)}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      className={cn(nb.ghost, 'h-6 px-2 text-[12px]')}
                      onClick={() => onEditParty(party)}
                    >
                      파티 수정
                    </button>
                    <button
                      type="button"
                      className={cn(nb.ghost, 'h-6 px-2 text-[12px]')}
                      onClick={() => onAddMember(party)}
                    >
                      <Plus />
                      구성원
                    </button>
                    <button
                      type="button"
                      className={cn(
                        nb.ghost,
                        'h-6 bg-[#e8f1fa] px-2 text-[12px] font-medium text-[#1b64b1] hover:bg-[#dceafb]',
                      )}
                      onClick={() => onOpenStructureModal(party.id)}
                    >
                      구성도
                    </button>
                    <button
                      type="button"
                      className={cn(nb.icon, 'size-6 text-[#37352f]/50 hover:text-[#d44c47]')}
                      aria-label={`${partyTitle} 파티 삭제`}
                      title="파티 삭제"
                      onClick={() => onDeleteParty(party)}
                    >
                      <Trash2 />
                    </button>
                  </div>
                </div>

                {party.memo && (
                  <p className="mt-1 truncate text-[12px] text-[#37352f]/55">{party.memo}</p>
                )}

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {party.members.map((member) => {
                    const isSelf = member.contactId === contact.id;
                    const memberName = member.contact?.name ?? '이름 없음';
                    const memberPhone = member.contact?.phone ?? null;
                    const item = toPartyDisplayItem(party, member);
                    const isDeleting = deletingMemberKey === item.id;

                    return (
                      <div
                        key={member.id}
                        data-contact-party
                        className={cn(
                          'group/member inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[12.5px] transition-colors',
                          isSelf
                            ? 'border-[#bfd9f4] bg-[#e8f1fa]/70'
                            : 'border-[#e9e9e7] bg-[#faf9f7] hover:border-[#d3d1cb]',
                        )}
                      >
                        <Avatar name={memberName} />
                        {isSelf ? (
                          <strong className="font-semibold text-[#37352f]">{memberName}</strong>
                        ) : (
                          <Link
                            to="/contacts/$id"
                            params={{ id: member.contactId }}
                            className="font-semibold text-[#37352f] underline-offset-2 hover:underline"
                          >
                            {memberName}
                          </Link>
                        )}
                        <span className="text-[12px] text-[#37352f]/65">
                          {member.roleLabel || (isOrg ? '담당자' : '세대원')}
                        </span>
                        {member.isPrimary && (
                          <Tag tone="brown" className="h-[17px] px-1 text-[11px]">
                            대표
                          </Tag>
                        )}
                        {isSelf && (
                          <Tag tone="blue" className="h-[17px] px-1 text-[11px]">
                            본인
                          </Tag>
                        )}
                        {memberPhone && (
                          <span className="text-[11.5px] tabular-nums text-[#37352f]/55">
                            {formatPhone(memberPhone)}
                          </span>
                        )}
                        <span className="inline-flex items-center opacity-0 transition-opacity group-focus-within/member:opacity-100 group-hover/member:opacity-100 [@media(hover:none)]:opacity-100">
                          <button
                            type="button"
                            className="rounded p-0.5 text-[#37352f]/55 hover:bg-[#37352f]/10 hover:text-[#37352f]"
                            aria-label="소속 수정"
                            onClick={() => onEditMember(item)}
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            className="rounded p-0.5 text-[#37352f]/55 hover:bg-[#ffe2dd] hover:text-[#d44c47]"
                            aria-label="소속 빼기"
                            disabled={isDeleting}
                            onClick={() => onRemoveMember(item)}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
