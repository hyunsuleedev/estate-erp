import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ContactDetail, Party, PartyMember } from '@estate-erp/api-client';
import { PartyKind } from '@estate-erp/shared';
import { Building2, Home, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, nb, Tag } from '../properties/-detail/ui';
import type { PartyDisplayItem } from './-detail-cards';

interface EdgePath {
  id: string;
  d: string;
  selected: boolean;
}

function toDisplayItem(party: Party, member: PartyMember): PartyDisplayItem {
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

function splitOrganizationTiers(members: PartyMember[]) {
  const tier1 = members.filter(
    (member) =>
      member.isPrimary || Boolean(member.roleLabel && member.roleLabel.includes('대표')),
  );
  if (tier1.length === 0 && members.length > 0) {
    return { tier1: [members[0]], tier2: members.slice(1) };
  }
  const tier1Ids = new Set(tier1.map((member) => member.id));
  return {
    tier1,
    tier2: members.filter((member) => !tier1Ids.has(member.id)),
  };
}

export function PartyStructureModal({
  open,
  onOpenChange,
  contact,
  parties,
  initialPartyId,
  onEditParty,
  onDeleteParty,
  onAddMember,
  onEditMember,
  onRemoveMember,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contact: ContactDetail;
  parties: Party[];
  initialPartyId?: string | null;
  onEditParty: (party: Party) => void;
  onDeleteParty: (party: Party) => void;
  onAddMember: (party: Party) => void;
  onEditMember: (item: PartyDisplayItem) => void;
  onRemoveMember: (item: PartyDisplayItem) => void;
}) {
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [edges, setEdges] = useState<EdgePath[]>([]);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: 260,
  });

  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      setSelectedMemberId(null);
      return;
    }
    if (initialPartyId && parties.some((party) => party.id === initialPartyId)) {
      setSelectedPartyId(initialPartyId);
    } else if (!selectedPartyId || !parties.some((party) => party.id === selectedPartyId)) {
      setSelectedPartyId(parties[0]?.id ?? null);
    }
    setSelectedMemberId(null);
  }, [open, initialPartyId, parties, selectedPartyId]);

  const activeParty = useMemo(
    () => parties.find((party) => party.id === selectedPartyId) ?? parties[0] ?? null,
    [parties, selectedPartyId],
  );

  const isOrg = activeParty?.kind === PartyKind.ORGANIZATION;
  const members = activeParty?.members ?? [];
  const { tier1, tier2 } = useMemo(() => {
    if (!activeParty) return { tier1: [] as PartyMember[], tier2: [] as PartyMember[] };
    if (activeParty.kind !== PartyKind.ORGANIZATION) {
      return { tier1: activeParty.members, tier2: [] as PartyMember[] };
    }
    return splitOrganizationTiers(activeParty.members);
  }, [activeParty]);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const recomputeEdges = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !open) return;
    const hub = canvas.querySelector<HTMLElement>('[data-hub-node]');
    if (!hub) return;

    const cRect = canvas.getBoundingClientRect();
    const width = canvas.scrollWidth;
    const height = canvas.scrollHeight;
    setCanvasSize({ width, height });

    const relBox = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      return {
        cx: r.left - cRect.left + canvas.scrollLeft + r.width / 2,
        top: r.top - cRect.top + canvas.scrollTop,
        bottom: r.bottom - cRect.top + canvas.scrollTop,
      };
    };

    const hubBox = relBox(hub);
    const tier1Nodes = Array.from(canvas.querySelectorAll<HTMLElement>('[data-node-id][data-tier="1"]'));
    const tier2Nodes = Array.from(canvas.querySelectorAll<HTMLElement>('[data-node-id][data-tier="2"]'));

    const nextEdges: EdgePath[] = [];
    const connect = (
      prefix: string,
      parentBox: ReturnType<typeof relBox>,
      children: HTMLElement[],
    ) => {
      if (children.length === 0) return;
      const boxes = children.map((el) => ({
        id: el.dataset.nodeId ?? '',
        box: relBox(el),
      }));
      const midY = Math.round((parentBox.bottom + boxes[0].box.top) / 2);
      const minX = Math.min(...boxes.map((b) => b.box.cx), parentBox.cx);
      const maxX = Math.max(...boxes.map((b) => b.box.cx), parentBox.cx);

      nextEdges.push({
        id: `${prefix}-trunk`,
        d: `M ${parentBox.cx} ${parentBox.bottom} V ${midY}`,
        selected: false,
      });
      if (boxes.length > 1 || minX !== maxX) {
        nextEdges.push({
          id: `${prefix}-bus`,
          d: `M ${minX} ${midY} H ${maxX}`,
          selected: false,
        });
      }
      for (const item of boxes) {
        nextEdges.push({
          id: `${prefix}-${item.id}`,
          d: `M ${item.box.cx} ${midY} V ${item.box.top}`,
          selected: item.id === selectedMemberId,
        });
      }
    };

    connect('t1', hubBox, tier1Nodes);
    if (tier2Nodes.length > 0 && tier1Nodes.length > 0) {
      connect('t2', relBox(tier1Nodes[0]), tier2Nodes);
    }
    setEdges(nextEdges);
  }, [open, selectedMemberId]);

  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(recomputeEdges);
    return () => cancelAnimationFrame(raf);
  }, [open, activeParty, selectedMemberId, recomputeEdges]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const observer = new ResizeObserver(() => recomputeEdges());
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [open, recomputeEdges]);

  const renderNodeCard = (member: PartyMember, tier: '1' | '2') => {
    const memberName = member.contact?.name ?? '이름 없음';
    const memberPhone = member.contact?.phone ?? null;
    const isSelf = member.contactId === contact.id;
    const isSelected = member.id === selectedMemberId;

    return (
      <button
        key={member.id}
        type="button"
        data-node-id={member.id}
        data-tier={tier}
        onClick={() => setSelectedMemberId((prev) => (prev === member.id ? null : member.id))}
        className={cn(
          'relative min-w-[176px] max-w-[212px] rounded-md border bg-white px-3 py-2.5 text-left shadow-xs transition-all hover:-translate-y-0.5 hover:border-[#9e9b93]',
          isSelf ? 'border-[#2383e2] ring-2 ring-[#2383e2]/15' : 'border-[#d3d1cb]',
          isSelected && 'border-[#37352f] ring-2 ring-[#37352f]/15',
        )}
      >
        <div className="flex items-center gap-2">
          <Avatar name={memberName} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#37352f]">
            {memberName}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Tag>{member.roleLabel || (isOrg ? '담당자' : '세대원')}</Tag>
          {member.isPrimary && <Tag tone="brown">대표</Tag>}
          {isSelf && <Tag tone="blue">본인</Tag>}
        </div>
        <div className="mt-1.5 truncate text-[12px] tabular-nums text-[#37352f]/65">
          {memberPhone ? formatPhone(memberPhone) : '전화번호 없음'}
        </div>
        {member.memo && (
          <div className="mt-1 truncate text-[11.5px] text-[#37352f]/50">{member.memo}</div>
        )}
      </button>
    );
  };

  if (!activeParty) return null;

  const partyTitle =
    activeParty.organizationContact?.name ?? activeParty.name ?? (isOrg ? '법인' : '세대');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-4xl">
        <DialogHeader className="border-b border-[#e9e9e7] px-5 pb-3 pt-4">
          <DialogTitle className="text-[16px]">소속 파티 구성도</DialogTitle>
          <DialogDescription className="text-[13px]">
            세대 구성원과 소속 법인·담당자 계층을 확인하고 노드를 눌러 수정하거나 해당 연락처로 이동합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 py-4">
          <div className="overflow-hidden rounded-lg border border-[#e9e9e7] bg-[#fcfcfb]">
            {/* 파티 선택 탭 + 작업 버튼 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e9e9e7] bg-white px-3.5 py-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {parties.map((party) => {
                  const active = party.id === activeParty.id;
                  const title =
                    party.organizationContact?.name ??
                    party.name ??
                    (party.kind === PartyKind.ORGANIZATION ? '법인' : '세대');
                  return (
                    <button
                      key={party.id}
                      type="button"
                      onClick={() => {
                        setSelectedPartyId(party.id);
                        setSelectedMemberId(null);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] font-medium transition-colors',
                        active
                          ? 'border-[#37352f] bg-[#37352f] text-white'
                          : 'border-[#e9e9e7] bg-white text-[#37352f]/70 hover:border-[#d3d1cb] hover:text-[#37352f]',
                      )}
                    >
                      {party.kind === PartyKind.HOUSEHOLD ? (
                        <Home className="size-3.5" />
                      ) : (
                        <Building2 className="size-3.5" />
                      )}
                      <span>{title}</span>
                      <span
                        className={cn(
                          'rounded-full px-1.5 text-[11px] tabular-nums',
                          active ? 'bg-white/20 text-white' : 'bg-[#f1f1ef] text-[#37352f]/65',
                        )}
                      >
                        {party.members.length}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  className={cn(nb.line, 'h-7 px-2.5 text-[12px]')}
                  onClick={() => onEditParty(activeParty)}
                >
                  <Pencil />
                  파티 수정
                </button>
                <button
                  type="button"
                  className={cn(nb.ghost, 'h-7 bg-[#e8f1fa] px-2.5 text-[12px] font-semibold text-[#1b64b1] hover:bg-[#dceafb]')}
                  onClick={() => onAddMember(activeParty)}
                >
                  <Plus />
                  구성원 추가
                </button>
                <button
                  type="button"
                  className={cn(nb.ghost, 'h-7 px-2 text-[12px] text-[#d44c47] hover:bg-[#ffe2dd]')}
                  onClick={() => onDeleteParty(activeParty)}
                >
                  <Trash2 />
                  파티 삭제
                </button>
              </div>
            </div>

            {/* 노드-엣지 다이어그램 */}
            <div ref={canvasRef} className="relative min-h-[250px] overflow-x-auto px-5 py-6">
              <svg
                className="pointer-events-none absolute inset-0 z-[1]"
                viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`}
                style={{ width: canvasSize.width, height: canvasSize.height }}
              >
                {edges.map((edge) => (
                  <path
                    key={edge.id}
                    d={edge.d}
                    fill="none"
                    stroke={edge.selected ? '#2383e2' : '#d3d1cb'}
                    strokeWidth={edge.selected ? 2 : 1.5}
                  />
                ))}
              </svg>

              <div className="relative z-[2] flex min-w-fit flex-col items-center gap-8">
                {/* 허브 노드 */}
                <div className="flex justify-center">
                  <div
                    data-hub-node
                    className={cn(
                      'min-w-[270px] max-w-[360px] rounded-md border-[1.5px] px-4 py-3 text-center shadow-xs',
                      isOrg
                        ? 'border-[#9b7ec8] bg-[#fbf9fe]'
                        : 'border-[#7eb07e] bg-[#fafdf9]',
                    )}
                  >
                    <div className="flex items-center justify-center gap-1.5">
                      {isOrg ? (
                        <Building2 className="size-4 text-[#6940a5]" />
                      ) : (
                        <Home className="size-4 text-[#2b6e3f]" />
                      )}
                      <span className="text-[14.5px] font-bold text-[#37352f]">{partyTitle}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1">
                      <Tag tone={isOrg ? 'blue' : 'green'}>
                        {isOrg ? '법인·단체 파티' : '세대·가족 파티'}
                      </Tag>
                      <Tag>{`구성원 ${members.length}명`}</Tag>
                    </div>
                    <div className="mt-1.5 text-[12px] tabular-nums text-[#37352f]/65">
                      {activeParty.homePhone
                        ? `${isOrg ? '대표번호' : '집 전화'} ${formatPhone(activeParty.homePhone)}`
                        : '대표번호 미등록'}
                    </div>
                    {activeParty.memo && (
                      <div className="mt-1 text-[12px] text-[#37352f]/55">{activeParty.memo}</div>
                    )}
                  </div>
                </div>

                {/* 구성원 행 */}
                {!isOrg ? (
                  <>
                    <div className="-mb-5 text-[11px] font-semibold text-[#37352f]/45">
                      세대 구성원
                    </div>
                    <div className="flex flex-nowrap items-stretch justify-center gap-3.5">
                      {tier1.map((member) => renderNodeCard(member, '1'))}
                      <button
                        type="button"
                        onClick={() => onAddMember(activeParty)}
                        className="flex min-w-[136px] flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-[#d3d1cb] bg-white/70 px-3 py-3 text-[12.5px] font-medium text-[#37352f]/65 transition-colors hover:border-[#2383e2] hover:bg-[#e8f1fa]/50 hover:text-[#1b64b1]"
                      >
                        <Plus className="size-4" />
                        <span>세대원 추가</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="-mb-5 text-[11px] font-semibold text-[#37352f]/45">
                      대표 · 의사결정
                    </div>
                    <div className="flex flex-nowrap items-stretch justify-center gap-3.5">
                      {tier1.map((member) => renderNodeCard(member, '1'))}
                      {tier2.length === 0 && (
                        <button
                          type="button"
                          onClick={() => onAddMember(activeParty)}
                          className="flex min-w-[136px] flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-[#d3d1cb] bg-white/70 px-3 py-3 text-[12.5px] font-medium text-[#37352f]/65 transition-colors hover:border-[#2383e2] hover:bg-[#e8f1fa]/50 hover:text-[#1b64b1]"
                        >
                          <Plus className="size-4" />
                          <span>담당자 추가</span>
                        </button>
                      )}
                    </div>
                    {tier2.length > 0 && (
                      <>
                        <div className="-mb-5 text-[11px] font-semibold text-[#37352f]/45">
                          임원 · 실무 담당자
                        </div>
                        <div className="flex flex-nowrap items-stretch justify-center gap-3.5">
                          {tier2.map((member) => renderNodeCard(member, '2'))}
                          <button
                            type="button"
                            onClick={() => onAddMember(activeParty)}
                            className="flex min-w-[136px] flex-col items-center justify-center gap-1.5 rounded-md border-[1.5px] border-dashed border-[#d3d1cb] bg-white/70 px-3 py-3 text-[12.5px] font-medium text-[#37352f]/65 transition-colors hover:border-[#2383e2] hover:bg-[#e8f1fa]/50 hover:text-[#1b64b1]"
                          >
                            <Plus className="size-4" />
                            <span>담당자 추가</span>
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* 하단 선택 노드 인스펙터 */}
            {selectedMember ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e9e9e7] bg-white px-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={selectedMember.contact?.name ?? '이름 없음'} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <strong className="text-[13.5px] text-[#37352f]">
                        {selectedMember.contact?.name ?? '이름 없음'}
                      </strong>
                      <Tag>
                        {selectedMember.roleLabel || (isOrg ? '담당자' : '세대원')}
                      </Tag>
                      {selectedMember.isPrimary && <Tag tone="brown">대표</Tag>}
                    </div>
                    <div className="text-[12.5px] tabular-nums text-[#37352f]/65">
                      {selectedMember.contact?.phone
                        ? formatPhone(selectedMember.contact.phone)
                        : '전화번호 없음'}
                      {selectedMember.memo ? ` · ${selectedMember.memo}` : ''}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className={cn(nb.line, 'h-7 px-2.5 text-[12px]')}
                    onClick={() => onEditMember(toDisplayItem(activeParty, selectedMember))}
                  >
                    역할·메모 수정
                  </button>
                  <button
                    type="button"
                    className={cn(nb.ghost, 'h-7 px-2.5 text-[12px] text-[#d44c47] hover:bg-[#ffe2dd]')}
                    onClick={() => onRemoveMember(toDisplayItem(activeParty, selectedMember))}
                  >
                    소속 제외
                  </button>
                  {selectedMember.contactId !== contact.id ? (
                    <Link
                      to="/contacts/$id"
                      params={{ id: selectedMember.contactId }}
                      onClick={() => onOpenChange(false)}
                      className={cn(nb.solid, 'h-7 px-2.5 text-[12px]')}
                    >
                      이 연락처로 이동
                    </Link>
                  ) : (
                    <Tag tone="blue">현재 보고 있는 연락처</Tag>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e9e9e7] bg-white px-4 py-2.5 text-[12.5px] text-[#37352f]/65">
                <span>
                  구성원 카드를 클릭하면 역할 수정, 소속 제외, 해당 연락처 화면 이동을 바로 실행할 수 있습니다.
                </span>
                {isOrg &&
                  activeParty.organizationContactId &&
                  activeParty.organizationContactId !== contact.id && (
                    <Link
                      to="/contacts/$id"
                      params={{ id: activeParty.organizationContactId }}
                      onClick={() => onOpenChange(false)}
                      className={cn(nb.line, 'h-7 px-2.5 text-[12px]')}
                    >
                      {`${partyTitle} 연락처로 이동`}
                    </Link>
                  )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
