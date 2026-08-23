import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export interface BrokerageCaseParticipantInput {
  contactId: string;
  role: string;
  isPrincipal: boolean;
  isCommunicationPrimary?: boolean;
}

interface ResolveBrokerageCaseInput {
  officeId: string;
  participants: BrokerageCaseParticipantInput[];
  requestedCaseId?: string;
  autoAttach?: boolean;
  intakeKind: 'buyer' | 'listing';
}

export interface ResolvedBrokerageCase {
  brokerageCaseId: string;
  casePriorityRank: number;
}

/**
 * 새 의뢰를 기존 활성 업무철에 붙인다.
 *
 * 자동 연결은 실제 당사자(isPrincipal)의 집합이 정확히 같은 경우에만 한다.
 * 가족/대리인 한 명이 겹친다는 이유로 서로 다른 경제 주체를 합치지 않는다.
 */
export async function resolveBrokerageCaseForIntake(
  tx: Prisma.TransactionClient,
  input: ResolveBrokerageCaseInput,
): Promise<ResolvedBrokerageCase> {
  const participants = normalizeParticipants(input.participants);
  const principalIds = participants
    .filter((participant) => participant.isPrincipal)
    .map((participant) => participant.contactId)
    .sort();
  const subjectIds = principalIds.length
    ? principalIds
    : participants.map((participant) => participant.contactId).sort();

  if (subjectIds.length === 0 && input.intakeKind === 'buyer') {
    throw new BadRequestException('중개 케이스에는 연락처가 한 명 이상 필요합니다.');
  }

  if (subjectIds.length > 0) {
    const lockKey = `brokerage-case:${input.officeId}:${subjectIds.join(',')}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
  }

  let brokerageCaseId = input.requestedCaseId;
  if (brokerageCaseId) {
    const requestedCase = await tx.brokerageCase.findFirst({
      where: {
        id: brokerageCaseId,
        officeId: input.officeId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!requestedCase) {
      throw new NotFoundException('활성 중개 케이스를 찾을 수 없습니다.');
    }
  } else if (input.autoAttach !== false && subjectIds.length > 0) {
    const candidates = await tx.brokerageCase.findMany({
      where: {
        officeId: input.officeId,
        archivedAt: null,
        participants: {
          some: { contactId: { in: subjectIds }, isPrincipal: true },
        },
      },
      select: {
        id: true,
        participants: {
          where: { isPrincipal: true },
          select: { contactId: true },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });

    brokerageCaseId = candidates.find((candidate) => {
      const candidateIds = candidate.participants
        .map((participant) => participant.contactId)
        .sort();
      return sameStringSet(candidateIds, subjectIds);
    })?.id;
  }

  if (!brokerageCaseId) {
    const created = await tx.brokerageCase.create({
      data: { officeId: input.officeId },
      select: { id: true },
    });
    brokerageCaseId = created.id;
  }

  await upsertCaseParticipants(
    tx,
    input.officeId,
    brokerageCaseId,
    participants,
  );

  const aggregate =
    input.intakeKind === 'buyer'
      ? await tx.buyerIntake.aggregate({
          where: { officeId: input.officeId, brokerageCaseId },
          _max: { casePriorityRank: true },
        })
      : await tx.listingIntake.aggregate({
          where: { officeId: input.officeId, brokerageCaseId },
          _max: { casePriorityRank: true },
        });

  await tx.brokerageCase.update({
    where: { id: brokerageCaseId },
    data: { updatedAt: new Date() },
  });

  return {
    brokerageCaseId,
    casePriorityRank: (aggregate._max.casePriorityRank ?? 0) + 1,
  };
}

export function buyerCaseParticipants(
  contacts: Array<{
    contactId: string;
    role?: string;
    isPrimary?: boolean;
  }>,
): BrokerageCaseParticipantInput[] {
  const hasExplicitPrincipal = contacts.some((contact) =>
    ['buyer', 'co_buyer'].includes(contact.role ?? ''),
  );
  return contacts.map((contact) => ({
    contactId: contact.contactId,
    role: contact.role ?? 'buyer',
    isPrincipal:
      !hasExplicitPrincipal || ['buyer', 'co_buyer'].includes(contact.role ?? ''),
    isCommunicationPrimary: contact.isPrimary,
  }));
}

export async function listingCaseParticipants(
  tx: Prisma.TransactionClient,
  officeId: string,
  propertyId: string,
): Promise<BrokerageCaseParticipantInput[]> {
  return readListingCaseParticipants(tx, officeId, propertyId);
}

/**
 * 의뢰가 만들어진 뒤 연락처를 추가하거나 역할을 바꾼 경우에도
 * 케이스 주소록에 해당 참여자를 빠뜨리지 않는다.
 *
 * 케이스 참여자는 여러 의뢰가 공유할 수 있으므로 이 함수는 안전하게
 * 병합만 하고 자동 삭제는 하지 않는다.
 */
export async function mergeBuyerIntakeCaseParticipants(
  tx: Prisma.TransactionClient,
  officeId: string,
  buyerIntakeId: string,
) {
  const intake = await tx.buyerIntake.findFirst({
    where: { id: buyerIntakeId, officeId },
    select: {
      brokerageCaseId: true,
      contacts: {
        select: {
          contactId: true,
          role: true,
          isPrimary: true,
        },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!intake?.brokerageCaseId) return;

  await upsertCaseParticipants(
    tx,
    officeId,
    intake.brokerageCaseId,
    buyerCaseParticipants(intake.contacts),
  );
}

/**
 * PropertyContact가 바뀌면 그 부동산의 진행 중 매도 의뢰가 속한 모든
 * 케이스에 새 연락처를 병합한다.
 */
export async function mergePropertyListingCaseParticipants(
  tx: Prisma.TransactionClient,
  officeId: string,
  propertyId: string,
) {
  const intakes = await tx.listingIntake.findMany({
    where: {
      officeId,
      propertyId,
      lifecycleStatus: { in: ['open', 'hold'] },
    },
    select: { brokerageCaseId: true },
  });
  const caseIds = [
    ...new Set(intakes.map((intake) => intake.brokerageCaseId)),
  ];
  if (caseIds.length === 0) return;

  const participants = await readListingCaseParticipants(
    tx,
    officeId,
    propertyId,
  );
  if (participants.length === 0) return;

  for (const brokerageCaseId of caseIds) {
    await upsertCaseParticipants(
      tx,
      officeId,
      brokerageCaseId,
      participants,
    );
  }
}

async function readListingCaseParticipants(
  tx: Prisma.TransactionClient,
  officeId: string,
  propertyId: string,
): Promise<BrokerageCaseParticipantInput[]> {
  const propertyContacts = await tx.propertyContact.findMany({
    where: { officeId, propertyId, status: 'active' },
    select: {
      contactId: true,
      role: true,
      isPrimary: true,
    },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
  });
  const hasOwner = propertyContacts.some((contact) =>
    ['owner', 'co_owner'].includes(contact.role),
  );
  return propertyContacts.map((contact) => ({
    contactId: contact.contactId,
    role:
      contact.role === 'owner'
        ? 'seller'
        : contact.role === 'co_owner'
          ? 'co_seller'
          : contact.role,
    isPrincipal:
      !hasOwner || ['owner', 'co_owner'].includes(contact.role),
    isCommunicationPrimary: contact.isPrimary,
  }));
}

async function upsertCaseParticipants(
  tx: Prisma.TransactionClient,
  officeId: string,
  brokerageCaseId: string,
  participants: BrokerageCaseParticipantInput[],
) {
  const existing = await tx.brokerageCaseParticipant.findMany({
    where: { officeId, brokerageCaseId },
  });
  let hasCommunicationPrimary = existing.some(
    (participant) => participant.isCommunicationPrimary,
  );

  for (const participant of participants) {
    const current = existing.find(
      (item) => item.contactId === participant.contactId,
    );
    const shouldBecomePrimary =
      !hasCommunicationPrimary &&
      (participant.isCommunicationPrimary || existing.length === 0);
    if (current) {
      const roles = [...new Set([...current.roles, participant.role])];
      await tx.brokerageCaseParticipant.update({
        where: { id: current.id },
        data: {
          roles,
          isPrincipal: current.isPrincipal || participant.isPrincipal,
          isCommunicationPrimary:
            current.isCommunicationPrimary || shouldBecomePrimary,
        },
      });
    } else {
      await tx.brokerageCaseParticipant.create({
        data: {
          officeId,
          brokerageCaseId,
          contactId: participant.contactId,
          roles: [participant.role],
          isPrincipal: participant.isPrincipal,
          isCommunicationPrimary: shouldBecomePrimary,
        },
      });
    }
    if (shouldBecomePrimary) hasCommunicationPrimary = true;
  }
}

function normalizeParticipants(
  participants: BrokerageCaseParticipantInput[],
) {
  const byContact = new Map<string, BrokerageCaseParticipantInput>();
  for (const participant of participants) {
    const current = byContact.get(participant.contactId);
    if (!current) {
      byContact.set(participant.contactId, { ...participant });
      continue;
    }
    byContact.set(participant.contactId, {
      ...current,
      isPrincipal: current.isPrincipal || participant.isPrincipal,
      isCommunicationPrimary:
        current.isCommunicationPrimary || participant.isCommunicationPrimary,
    });
  }
  return [...byContact.values()];
}

function sameStringSet(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
