import { PartyKind, PartyMemberStatus } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { isPlaceholderContactName } from './contact-name.utils';

/**
 * 연락처 합치기 (같은 사람/법인이 두 번 등록됐을 때).
 *
 * 순서: 두 연락처 줄을 잠근다 → 합치면 안 되는 경우를 센다 → 옮긴다 → 변경 기록을 남긴다 → 원본을 지운다.
 * 모두 한 트랜잭션이다. planContactMerge는 읽기만 하므로 합치기 전 미리보기에도 쓴다.
 */

type Tx = Prisma.TransactionClient;

export interface MergeItem {
  key: string;
  label: string;
  count: number;
}

export interface MergeConflict {
  key: 'kind_mismatch' | 'deal_parties' | 'contract_parties' | 'household';
  message: string;
}

export interface ContactMergePlan {
  /** 하나라도 있으면 합치지 않는다 */
  conflicts: MergeConflict[];
  /** 합친 뒤 남는 이름. 남길 쪽이 임시 이름("미확인 5678")이고 지울 쪽에 진짜 이름이 있으면 그 이름이다 */
  resultName: string | null;
  /** 원본에서 대상으로 옮겨지는 것 */
  moved: MergeItem[];
  /** 대상에 같은 자리가 이미 있어 원본 줄을 버리는 것 (빈 칸은 대상에 채운다) */
  dropped: MergeItem[];
}

export interface MergeParty {
  id: string;
  kind: string;
  name: string;
  businessRegNo: string | null;
  email: string | null;
  memo: string | null;
  primaryPhone: string | null;
}

function pick(items: MergeItem[]) {
  return items.filter((item) => item.count > 0);
}

/** "01012345678" → "010-****-5678". 변경 기록에는 번호 전체를 남기지 않는다(전화번호는 감사 기록에 복사하지 않는 규칙). */
export function maskPhone(canonical: string | null): string | null {
  if (!canonical) return null;
  if (canonical.length <= 4) return canonical;
  return `${canonical.slice(0, 3)}-****-${canonical.slice(-4)}`;
}

/** 두 연락처를 id 순서로 잠근다. 같은 두 사람을 동시에 합치거나 지우는 요청이 서로 덮어쓰지 않게 한다. */
export async function lockContacts(tx: Tx, officeId: string, ids: string[]) {
  const sorted = [...new Set(ids)].sort();
  const rows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT id::text AS id FROM contacts WHERE office_id = ${officeId}::uuid AND id IN (${Prisma.join(
      sorted.map((id) => Prisma.sql`${id}::uuid`),
    )}) ORDER BY id FOR UPDATE`,
  );
  return new Set(rows.map((row) => row.id));
}

export async function readMergeParty(tx: Tx, officeId: string, id: string): Promise<MergeParty | null> {
  const contact = await tx.contact.findFirst({
    where: { id, officeId },
    select: {
      id: true,
      kind: true,
      name: true,
      businessRegNo: true,
      email: true,
      memo: true,
      phones: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1, select: { phone: true } },
    },
  });
  if (!contact) return null;
  return {
    id: contact.id,
    kind: contact.kind,
    name: contact.name,
    businessRegNo: contact.businessRegNo,
    email: contact.email,
    memo: contact.memo,
    primaryPhone: contact.phones[0]?.phone ?? null,
  };
}

/** 합치면 안 되는 경우와, 옮겨질 것 · 버려질 것의 건수 */
export async function planContactMerge(
  client: Tx,
  officeId: string,
  sourceId: string,
  targetId: string,
): Promise<ContactMergePlan> {
  const pair = (left: string, right: string) => ({ left, right });
  const both = [pair(sourceId, targetId), pair(targetId, sourceId)];

  const [sourceInfo, targetInfo, dealConflicts, partyRows, memberships] = await Promise.all([
    client.contact.findFirst({
      where: { id: sourceId, officeId },
      select: {
        kind: true,
        name: true,
        _count: {
          select: {
            consultations: true,
            propertyContacts: true,
            buyerIntakeContacts: true,
            leaseTenancies: true,
            dealsAsBuyer: true,
            dealsAsSeller: true,
            contractParties: true,
            primaryProjects: true,
            commissionPayments: true,
            partyMemberships: { where: { status: PartyMemberStatus.ACTIVE } },
            tasks: true,
            calendarEvents: true,
            callLogs: true,
            callRecordings: true,
            phones: true,
          },
        },
      },
    }),
    client.contact.findFirst({
      where: { id: targetId, officeId },
      select: { kind: true, name: true },
    }),
    // 한 거래의 매도인과 매수인이 두 사람이면, 합치면 한 사람이 양쪽 당사자가 된다
    client.deal.count({
      where: {
        officeId,
        OR: both.map(({ left, right }) => ({ buyerContactId: left, sellerContactId: right })),
      },
    }),
    client.contractParty.findMany({
      where: { officeId, contactId: { in: [sourceId, targetId] }, side: { in: ['one', 'two'] } },
      select: { contractId: true, contactId: true, side: true },
    }),
    client.partyMember.findMany({
      where: {
        officeId,
        contactId: { in: [sourceId, targetId] },
        partyKind: PartyKind.HOUSEHOLD,
        status: PartyMemberStatus.ACTIVE,
      },
      select: { contactId: true, partyId: true },
    }),
  ]);

  // 계약서 당사자 줄: 같은 계약에서 한 사람은 매도(one) 측, 다른 사람은 매수(two) 측
  const sidesByContract = new Map<string, Map<string, Set<string>>>();
  for (const row of partyRows) {
    if (!row.contactId) continue;
    const byContact = sidesByContract.get(row.contractId) ?? new Map<string, Set<string>>();
    const sides = byContact.get(row.contactId) ?? new Set<string>();
    sides.add(row.side);
    byContact.set(row.contactId, sides);
    sidesByContract.set(row.contractId, byContact);
  }
  let partyConflicts = 0;
  for (const byContact of sidesByContract.values()) {
    const sourceSides = byContact.get(sourceId);
    const targetSides = byContact.get(targetId);
    if (!sourceSides || !targetSides) continue;
    if ([...sourceSides].some((side) => [...targetSides].some((other) => other !== side))) partyConflicts += 1;
  }

  const sourceHousehold = memberships.find((m) => m.contactId === sourceId)?.partyId;
  const targetHousehold = memberships.find((m) => m.contactId === targetId)?.partyId;

  const conflicts: MergeConflict[] = [];
  if (sourceInfo && targetInfo && sourceInfo.kind !== targetInfo.kind) {
    conflicts.push({
      key: 'kind_mismatch',
      message: '개인과 법인·단체 연락처는 서로 합칠 수 없습니다.',
    });
  }
  if (dealConflicts > 0) {
    conflicts.push({
      key: 'deal_parties',
      message: `두 사람이 같은 거래 ${dealConflicts}건에서 매도인과 매수인입니다. 합치면 한 사람이 양쪽 당사자가 되므로 합칠 수 없습니다. 거래의 당사자를 먼저 바로잡으세요.`,
    });
  }
  if (partyConflicts > 0) {
    conflicts.push({
      key: 'contract_parties',
      message: `두 사람이 같은 계약서 ${partyConflicts}건에서 서로 다른 쪽 당사자입니다. 합치면 한 사람이 양쪽 당사자가 되므로 합칠 수 없습니다.`,
    });
  }
  if (sourceHousehold && targetHousehold && sourceHousehold === targetHousehold) {
    conflicts.push({
      key: 'household',
      message: '두 사람이 같은 세대에 속해 있습니다. 같은 사람이 맞다면 세대에서 먼저 뺀 뒤 합치세요.',
    });
  }

  const count = sourceInfo?._count;

  const [sourceProperties, sourceIntakes, sourceLeases, sourceMemberships, sourcePhones] =
    await Promise.all([
      client.propertyContact.findMany({
        where: { officeId, contactId: sourceId },
        select: { propertyId: true, role: true, status: true },
      }),
      client.buyerIntakeContact.findMany({
        where: { officeId, contactId: sourceId },
        select: { buyerIntakeId: true },
      }),
      client.propertyLeaseTenant.findMany({
        where: { officeId, contactId: sourceId },
        select: { leaseId: true },
      }),
      client.partyMember.findMany({
        where: { officeId, contactId: sourceId, status: PartyMemberStatus.ACTIVE },
        select: { partyId: true, partyKind: true },
      }),
      client.contactPhone.findMany({
        where: { officeId, contactId: sourceId },
        select: { phone: true },
      }),
    ]);

  const [overlapProperties, overlapIntakes, overlapLeases, targetMemberships, overlapPhones] =
    await Promise.all([
      sourceProperties.filter((p) => p.status === 'active').length
        ? client.propertyContact.count({
            where: {
              officeId,
              contactId: targetId,
              status: 'active',
              OR: sourceProperties
                .filter((p) => p.status === 'active')
                .map(({ propertyId, role }) => ({ propertyId, role })),
            },
          })
        : 0,
      sourceIntakes.length
        ? client.buyerIntakeContact.count({
            where: {
              officeId,
              contactId: targetId,
              buyerIntakeId: { in: sourceIntakes.map((row) => row.buyerIntakeId) },
            },
          })
        : 0,
      sourceLeases.length
        ? client.propertyLeaseTenant.count({
            where: {
              officeId,
              contactId: targetId,
              leaseId: { in: sourceLeases.map((row) => row.leaseId) },
            },
          })
        : 0,
      client.partyMember.findMany({
        where: { officeId, contactId: targetId, status: PartyMemberStatus.ACTIVE },
        select: { partyId: true, partyKind: true },
      }),
      sourcePhones.length
        ? client.contactPhone.count({
            where: {
              officeId,
              contactId: targetId,
              phone: { in: sourcePhones.map((p) => p.phone) },
            },
          })
        : 0,
    ]);

  const targetOrgPartyIds = new Set(
    targetMemberships.filter((m) => m.partyKind === PartyKind.ORGANIZATION).map((m) => m.partyId),
  );
  const overlapMemberships = sourceMemberships.filter((m) => {
    if (m.partyKind === PartyKind.HOUSEHOLD) return Boolean(targetHousehold);
    return targetOrgPartyIds.has(m.partyId);
  }).length;

  const moved = count
    ? pick([
        { key: 'consultations', label: '상담 기록', count: count.consultations },
        { key: 'propertyContacts', label: '연결 매물', count: count.propertyContacts - overlapProperties },
        { key: 'buyerIntakes', label: '희망 조건', count: count.buyerIntakeContacts - overlapIntakes },
        { key: 'tenants', label: '세입자 기록', count: count.leaseTenancies - overlapLeases },
        { key: 'deals', label: '거래', count: count.dealsAsBuyer + count.dealsAsSeller },
        { key: 'contracts', label: '계약서', count: count.contractParties },
        { key: 'projects', label: '대표 고객인 프로젝트', count: count.primaryProjects },
        { key: 'commissionPayments', label: '수수료 입금 기록', count: count.commissionPayments },
        { key: 'parties', label: '세대·법인 소속', count: count.partyMemberships - overlapMemberships },
        { key: 'tasks', label: '할 일', count: count.tasks },
        { key: 'calendarEvents', label: '일정', count: count.calendarEvents },
        { key: 'calls', label: '통화 기록', count: count.callLogs + count.callRecordings },
        { key: 'phones', label: '전화번호', count: count.phones - overlapPhones },
      ])
    : [];
  const dropped = pick([
    { key: 'propertyContacts', label: '같은 매물·같은 역할의 매물 연결', count: overlapProperties },
    { key: 'buyerIntakes', label: '같은 희망 조건의 고객 자리', count: overlapIntakes },
    { key: 'tenants', label: '같은 임대차의 임차인 자리', count: overlapLeases },
    { key: 'parties', label: '중복된 세대·법인 소속', count: overlapMemberships },
    { key: 'phones', label: '같은 전화번호', count: overlapPhones },
  ]);

  const resultName =
    targetInfo?.name === undefined ? null : mergedName(targetInfo.name, sourceInfo?.name ?? null);

  return { conflicts, resultName, moved, dropped };
}

/**
 * 합친 뒤의 이름. 남길 쪽이 임시 이름("미확인 7731")이고 지울 쪽 이름이 진짜면 진짜 이름을 남긴다 —
 * 번호만 저장해 둔 연락처 쪽으로 합쳐도 손님 이름이 사라지지 않게.
 */
export function mergedName(targetName: string, sourceName: string | null): string {
  if (sourceName && isPlaceholderContactName(targetName) && !isPlaceholderContactName(sourceName)) {
    return sourceName;
  }
  return targetName;
}

/** 메모 두 개를 잇는다. 같은 글이면 한 번만 남긴다. */
function joinMemo(target: string | null | undefined, source: string | null | undefined, sourceLabel?: string) {
  const left = target?.trim();
  const right = source?.trim();
  if (!right || right === left) return left || null;
  const tagged = sourceLabel ? `(${sourceLabel}) ${right}` : right;
  return left ? `${left}\n${tagged}` : tagged;
}

/**
 * 실제로 옮긴다. 호출하는 쪽이 이미 두 줄을 잠그고, 합치면 안 되는 경우가 없음을 확인했어야 한다.
 * 돌려주는 값은 변경 기록에 남길 건수다.
 */
export async function executeContactMerge(
  tx: Tx,
  officeId: string,
  source: MergeParty,
  target: MergeParty,
  actorId: string | null,
) {
  const sourceId = source.id;
  const targetId = target.id;
  const fromSource = { officeId, contactId: sourceId };
  const toTarget = { contactId: targetId };
  const moved: Record<string, number> = {};
  const dropped: Record<string, number> = {};
  const add = (bucket: Record<string, number>, key: string, value: number) => {
    if (value > 0) bucket[key] = (bucket[key] ?? 0) + value;
  };

  // 1) 칸 하나만 바꾸면 되는 기록
  add(moved, 'consultations', (await tx.consultation.updateMany({ where: fromSource, data: toTarget })).count);
  add(moved, 'tasks', (await tx.task.updateMany({ where: fromSource, data: toTarget })).count);
  add(moved, 'calendarEvents', (await tx.calendarEvent.updateMany({ where: fromSource, data: toTarget })).count);
  add(moved, 'calls', (await tx.callLog.updateMany({ where: fromSource, data: toTarget })).count);
  add(moved, 'calls', (await tx.callRecording.updateMany({ where: fromSource, data: toTarget })).count);
  await tx.callActionSuggestion.updateMany({ where: fromSource, data: toTarget });
  add(moved, 'contracts', (await tx.contractParty.updateMany({ where: fromSource, data: toTarget })).count);
  for (const field of ['buyerContactId', 'sellerContactId'] as const) {
    add(
      moved,
      'deals',
      (await tx.deal.updateMany({ where: { officeId, [field]: sourceId }, data: { [field]: targetId } })).count,
    );
  }
  add(
    moved,
    'projects',
    (
      await tx.project.updateMany({
        where: { officeId, primaryContactId: sourceId },
        data: { primaryContactId: targetId },
      })
    ).count,
  );
  add(
    moved,
    'commissionPayments',
    (
      await tx.commissionPayment.updateMany({
        where: { officeId, payerContactId: sourceId },
        data: { payerContactId: targetId },
      })
    ).count,
  );
  await tx.contact.updateMany({
    where: { officeId, referredByContactId: sourceId, id: { not: targetId } },
    data: { referredByContactId: targetId },
  });
  await tx.contact.updateMany({
    where: { officeId, referredByContactId: sourceId, id: targetId },
    data: { referredByContactId: null },
  });

  // 2) 매물 연결: 같은 매물·같은 활성 역할이 대상에 있으면 원본 줄을 버리되, 대상의 빈 칸은 원본 값으로 채운다
  const sourceProperties = await tx.propertyContact.findMany({ where: fromSource });
  for (const row of sourceProperties) {
    if (row.status !== 'active') {
      await tx.propertyContact.update({ where: { id: row.id }, data: toTarget });
      add(moved, 'propertyContacts', 1);
      continue;
    }
    const existing = await tx.propertyContact.findFirst({
      where: {
        officeId,
        contactId: targetId,
        propertyId: row.propertyId,
        role: row.role,
        status: 'active',
      },
    });
    if (!existing) {
      await tx.propertyContact.update({ where: { id: row.id }, data: toTarget });
      add(moved, 'propertyContacts', 1);
      continue;
    }
    await tx.propertyContact.delete({ where: { id: row.id } });
    const memo = joinMemo(existing.memo, row.memo);
    await tx.propertyContact.update({
      where: { id: existing.id },
      data: {
        ...(existing.shareRatio === null && row.shareRatio !== null ? { shareRatio: row.shareRatio } : {}),
        ...(!existing.isResident && row.isResident ? { isResident: true } : {}),
        ...(!existing.isPrimary && row.isPrimary ? { isPrimary: true } : {}),
        ...(memo !== (existing.memo ?? null) ? { memo } : {}),
      },
    });
    add(dropped, 'propertyContacts', 1);
  }

  // 3) 구매 의뢰 참여
  const sourceIntakes = await tx.buyerIntakeContact.findMany({ where: fromSource });
  for (const row of sourceIntakes) {
    const existing = await tx.buyerIntakeContact.findFirst({
      where: { officeId, contactId: targetId, buyerIntakeId: row.buyerIntakeId },
    });
    if (!existing) {
      await tx.buyerIntakeContact.update({ where: { id: row.id }, data: toTarget });
      add(moved, 'buyerIntakes', 1);
      continue;
    }
    await tx.buyerIntakeContact.delete({ where: { id: row.id } });
    await tx.buyerIntakeContact.update({
      where: { id: existing.id },
      data: {
        ...(existing.role === 'other' && row.role !== 'other' ? { role: row.role } : {}),
        ...(!existing.isPrimary && row.isPrimary ? { isPrimary: true } : {}),
      },
    });
    add(dropped, 'buyerIntakes', 1);
  }

  // 4) 임대차 임차인 자리
  const sourceLeases = await tx.propertyLeaseTenant.findMany({ where: fromSource });
  for (const row of sourceLeases) {
    const existing = await tx.propertyLeaseTenant.findFirst({
      where: { officeId, contactId: targetId, leaseId: row.leaseId },
    });
    if (!existing) {
      await tx.propertyLeaseTenant.update({ where: { id: row.id }, data: toTarget });
      add(moved, 'tenants', 1);
      continue;
    }
    await tx.propertyLeaseTenant.delete({ where: { id: row.id } });
    await tx.propertyLeaseTenant.update({
      where: { id: existing.id },
      data: {
        ...(existing.role === 'resident' && row.role !== 'resident' ? { role: row.role } : {}),
        ...(!existing.isPrimary && row.isPrimary ? { isPrimary: true } : {}),
      },
    });
    add(dropped, 'tenants', 1);
  }

  // 5) 집단 소속 (세대/법인): 대상이 같은 집단 또는 이미 다른 세대에 있으면 원본 소속은 정리
  const sourceMemberships = await tx.partyMember.findMany({
    where: { officeId, contactId: sourceId },
  });
  const targetHasHousehold =
    (await tx.partyMember.count({
      where: {
        officeId,
        contactId: targetId,
        partyKind: PartyKind.HOUSEHOLD,
        status: PartyMemberStatus.ACTIVE,
      },
    })) > 0;
  for (const member of sourceMemberships) {
    const duplicateSameParty = await tx.partyMember.findFirst({
      where: {
        officeId,
        partyId: member.partyId,
        contactId: targetId,
        status: PartyMemberStatus.ACTIVE,
      },
    });
    if (duplicateSameParty || (member.partyKind === PartyKind.HOUSEHOLD && targetHasHousehold)) {
      await tx.partyMember.delete({ where: { id: member.id } });
      if (member.partyKind === PartyKind.HOUSEHOLD) {
        const remaining = await tx.partyMember.count({
          where: { officeId, partyId: member.partyId, status: PartyMemberStatus.ACTIVE },
        });
        if (remaining <= 1) {
          await tx.party.delete({ where: { id: member.partyId } });
        }
      }
      add(dropped, 'parties', 1);
      continue;
    }
    await tx.partyMember.update({ where: { id: member.id }, data: toTarget });
    add(moved, 'parties', 1);
  }

  // 법인 합치기: 원본 법인의 Party 소속 담당자들을 대상 법인 Party로 옮긴다
  if (source.kind === 'organization' && target.kind === 'organization') {
    const [sourceOrgParty, targetOrgParty] = await Promise.all([
      tx.party.findFirst({
        where: { officeId, kind: PartyKind.ORGANIZATION, organizationContactId: sourceId },
        include: { members: true },
      }),
      tx.party.findFirst({
        where: { officeId, kind: PartyKind.ORGANIZATION, organizationContactId: targetId },
      }),
    ]);
    if (sourceOrgParty) {
      if (!targetOrgParty) {
        await tx.party.update({
          where: { id: sourceOrgParty.id },
          data: { organizationContactId: targetId },
        });
      } else {
        for (const m of sourceOrgParty.members) {
          const exists = await tx.partyMember.findFirst({
            where: { officeId, partyId: targetOrgParty.id, contactId: m.contactId, status: PartyMemberStatus.ACTIVE },
          });
          if (!exists) {
            await tx.partyMember.update({
              where: { id: m.id },
              data: { partyId: targetOrgParty.id, isPrimary: false },
            });
          } else {
            await tx.partyMember.delete({ where: { id: m.id } });
          }
        }
        await tx.party.delete({ where: { id: sourceOrgParty.id } });
      }
    }
  }

  // 6) 그룹 · 태그: 대상에 없는 것만 붙인다
  const [groups, tags] = await Promise.all([
    tx.contactGroupMember.findMany({ where: fromSource, select: { groupId: true } }),
    tx.contactTagAssignment.findMany({ where: fromSource, select: { tagId: true } }),
  ]);
  if (groups.length > 0) {
    await tx.contactGroupMember.createMany({
      data: groups.map(({ groupId }) => ({ officeId, groupId, contactId: targetId, addedById: actorId })),
      skipDuplicates: true,
    });
  }
  if (tags.length > 0) {
    await tx.contactTagAssignment.createMany({
      data: tags.map(({ tagId }) => ({ officeId, tagId, contactId: targetId, addedById: actorId })),
      skipDuplicates: true,
    });
  }

  // 7) 전화번호: 중복 번호는 버리고 나머지 번호를 대상으로 옮긴다. 대상에 주 번호가 있으면 보조 번호가 된다.
  const [targetHasPrimary, targetPhones, sourcePhones] = await Promise.all([
    tx.contactPhone.count({ where: { officeId, contactId: targetId, isPrimary: true } }).then((c) => c > 0),
    tx.contactPhone.findMany({ where: { officeId, contactId: targetId }, select: { phone: true } }),
    tx.contactPhone.findMany({ where: fromSource, select: { id: true, phone: true } }),
  ]);
  const targetPhoneSet = new Set(targetPhones.map((p) => p.phone));
  for (const sp of sourcePhones) {
    if (targetPhoneSet.has(sp.phone)) {
      await tx.contactPhone.delete({ where: { id: sp.id } });
      add(dropped, 'phones', 1);
    } else {
      await tx.contactPhone.update({
        where: { id: sp.id },
        data: targetHasPrimary ? { contactId: targetId, isPrimary: false } : toTarget,
      });
      add(moved, 'phones', 1);
    }
  }

  // 8) 사업자번호·이메일은 비어 있을 때만 채우고, 다르면 메모에 남긴다.
  const memoParts = [target.memo?.trim()];
  if (source.memo?.trim()) memoParts.push(`(${source.name}에서 합친 메모)\n${source.memo.trim()}`);
  const differentEmail = Boolean(target.email && source.email && target.email !== source.email);
  if (differentEmail) memoParts.push(`합친 연락처의 이메일: ${source.email}`);
  const memo = memoParts.filter(Boolean).join('\n\n') || null;
  const name = mergedName(target.name, source.name);
  await tx.contact.update({
    where: { id: targetId },
    data: {
      ...(name !== target.name ? { name } : {}),
      ...(!target.businessRegNo && source.businessRegNo ? { businessRegNo: source.businessRegNo } : {}),
      ...(!target.email && source.email ? { email: source.email } : {}),
      ...(memo !== (target.memo ?? null) ? { memo } : {}),
    },
  });

  return { moved, dropped, name };
}

/** 유일성 충돌 · 직렬화 실패 · 교착은 "다른 곳에서 바뀌었다"로 알린다 */
export function isConcurrentChangeError(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ['P2002', 'P2034', 'P2003'].includes(error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return /40001|40P01|could not serialize|deadlock/i.test(error.message);
  }
  return false;
}
