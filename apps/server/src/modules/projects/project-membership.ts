import { formatPlaceLabel } from '@estate-erp/shared';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type CaseIntakeKind = 'listing' | 'buyer';

/**
 * 의뢰를 만들면서 바로 프로젝트에 담을 때 쓴다. 프로젝트는 사용자가 고른 것만 받는다
 * (서버가 당사자를 보고 알아서 묶지 않는다).
 */
export async function assertActiveProject(
  tx: Prisma.TransactionClient,
  officeId: string,
  projectId: string,
): Promise<void> {
  const found = await tx.project.findFirst({
    where: { id: projectId, officeId, archivedAt: null },
    select: { id: true },
  });
  if (!found) {
    throw new NotFoundException('진행 중인 프로젝트를 찾을 수 없습니다.');
  }
}

/**
 * 프로젝트에 담긴 의뢰를 진행 계획의 맨 끝 단계로 넣는다. 이미 그 의뢰의 단계가 있으면
 * 그대로 둔다. 의뢰의 projectId는 호출하기 전에 이 프로젝트로 맞춰져 있어야 한다
 * (단계의 복합 FK가 같은 프로젝트에 담긴 의뢰만 받는다).
 */
export async function appendIntakeStep(
  tx: Prisma.TransactionClient,
  input: {
    officeId: string;
    projectId: string;
    kind: CaseIntakeKind;
    intakeId: string;
    title: string;
    /** 다른 프로젝트에서 옮겨 온 의뢰라면 그 단계에 적어 둔 목표일·메모를 이어받는다. */
    targetDate?: Date | null;
    memo?: string | null;
  },
): Promise<void> {
  const target =
    input.kind === 'listing'
      ? { listingIntakeId: input.intakeId }
      : { buyerIntakeId: input.intakeId };
  const existing = await tx.projectStep.findFirst({
    where: { projectId: input.projectId, ...target },
    select: { id: true },
  });
  if (existing) return;

  const last = await tx.projectStep.aggregate({
    where: { officeId: input.officeId, projectId: input.projectId },
    _max: { sortOrder: true },
  });
  await tx.projectStep.create({
    data: {
      officeId: input.officeId,
      projectId: input.projectId,
      sortOrder: (last._max.sortOrder ?? 0) + 1,
      title: input.title,
      targetDate: input.targetDate ?? null,
      memo: input.memo ?? null,
      ...target,
    },
  });
  await tx.project.update({
    where: { id: input.projectId },
    data: { updatedAt: new Date() },
  });
}

/** 매물 의뢰 단계의 기본 제목: "고덕그라시움 101동 3501호 매물 의뢰". */
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
  // "고덕그라시움 102동 2203호 매물 의뢰" (공용 formatPlaceLabel)
  const place = property
    ? formatPlaceLabel({
        siteName: property.site.name,
        dongName: property.unit?.dong?.name,
        dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
        unit: property.unit,
      })
    : '';
  return [place, '매물 의뢰'].filter(Boolean).join(' ');
}

export const BUYER_INTAKE_STEP_TITLE = '구매 의뢰';
