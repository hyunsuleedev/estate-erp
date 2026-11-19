import { formatUnitName } from '@estate-erp/shared';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type CaseIntakeKind = 'listing' | 'buyer';

/**
 * 의뢰를 만들면서 바로 건에 담을 때 쓴다. 건은 사용자가 고른 것만 받는다
 * (서버가 당사자를 보고 알아서 묶지 않는다).
 */
export async function assertActiveBrokerageCase(
  tx: Prisma.TransactionClient,
  officeId: string,
  brokerageCaseId: string,
): Promise<void> {
  const found = await tx.brokerageCase.findFirst({
    where: { id: brokerageCaseId, officeId, archivedAt: null },
    select: { id: true },
  });
  if (!found) {
    throw new NotFoundException('진행 중인 중개 건을 찾을 수 없습니다.');
  }
}

/**
 * 건에 담긴 의뢰를 진행 계획의 맨 끝 단계로 넣는다. 이미 그 의뢰의 단계가 있으면
 * 그대로 둔다. 의뢰의 brokerageCaseId는 호출하기 전에 이 건으로 맞춰져 있어야 한다
 * (단계의 복합 FK가 같은 건에 담긴 의뢰만 받는다).
 */
export async function appendIntakeStep(
  tx: Prisma.TransactionClient,
  input: {
    officeId: string;
    brokerageCaseId: string;
    kind: CaseIntakeKind;
    intakeId: string;
    title: string;
    /** 다른 건에서 옮겨 온 의뢰라면 그 단계에 적어 둔 목표일·메모를 이어받는다. */
    targetDate?: Date | null;
    memo?: string | null;
  },
): Promise<void> {
  const target =
    input.kind === 'listing'
      ? { listingIntakeId: input.intakeId }
      : { buyerIntakeId: input.intakeId };
  const existing = await tx.brokerageCaseStep.findFirst({
    where: { brokerageCaseId: input.brokerageCaseId, ...target },
    select: { id: true },
  });
  if (existing) return;

  const last = await tx.brokerageCaseStep.aggregate({
    where: { officeId: input.officeId, brokerageCaseId: input.brokerageCaseId },
    _max: { sortOrder: true },
  });
  await tx.brokerageCaseStep.create({
    data: {
      officeId: input.officeId,
      brokerageCaseId: input.brokerageCaseId,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      title: input.title,
      targetDate: input.targetDate ?? null,
      memo: input.memo ?? null,
      ...target,
    },
  });
  await tx.brokerageCase.update({
    where: { id: input.brokerageCaseId },
    data: { updatedAt: new Date() },
  });
}

/** 매물 의뢰 단계의 기본 제목: "고덕그라시움 101동 3501 매물 의뢰". */
export async function listingIntakeStepTitle(
  tx: Prisma.TransactionClient,
  propertyId: string,
): Promise<string> {
  const property = await tx.property.findUnique({
    where: { id: propertyId },
    select: {
      site: { select: { name: true } },
      unit: {
        select: {
          name: true, floor: true, floorEnd: true, floorLabel: true,
          dong: { select: { name: true, isPlaceholder: true } },
        },
      },
    },
  });
  const dong = property?.unit?.dong;
  const parts = [
    property?.site.name,
    dong && !dong.isPlaceholder
      ? dong.name.endsWith('동')
        ? dong.name
        : `${dong.name}동`
      : null,
    formatUnitName(property?.unit),
    '매물 의뢰',
  ].filter(Boolean);
  return parts.join(' ');
}

export const BUYER_INTAKE_STEP_TITLE = '구매 의뢰';
