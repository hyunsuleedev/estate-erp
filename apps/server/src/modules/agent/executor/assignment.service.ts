import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * AssignmentService
 *
 * Task 할당 결정기. Rule 은 "무엇을 할지"를 결정하고,
 * AssignmentService 는 "누구에게 맡길지" 를 결정한다.
 *
 * Phase 1 (현재): 휴리스틱 기반 단순 규칙
 *   1. 명시적 suggestedAssigneeId 가 있으면 그걸로
 *   2. buyerReqId 가 있으면 BuyerRequirement.assignedToId
 *   3. propertyId 가 있으면 해당 매물의 "가장 최근 Task 담당자" 연속성 유지
 *   4. 그것도 없으면 Office owner
 *   5. owner 조차 없으면 null (미할당 Task)
 *
 * Phase 2 (예정): LLM 판단 경로
 *   같은 인터페이스를 유지하면서 내부에 LLM 경로 추가.
 *   오늘 출근자(CalendarEvent), 각자의 open Task 수,
 *   과거 단지 담당 이력, 분배 형평성까지 고려.
 *   Office 설정으로 휴리스틱/LLM 모드를 선택 가능하게 한다.
 */
@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(private readonly prisma: PrismaService) {}

  async pickAssignee(
    officeId: string,
    context: AssignmentContext,
  ): Promise<string | null> {
    // 1. 명시적 힌트
    if (context.suggestedAssigneeId) {
      const valid = await this.isActiveEmployee(officeId, context.suggestedAssigneeId);
      if (valid) return context.suggestedAssigneeId;
      this.logger.warn(
        `suggestedAssigneeId ${context.suggestedAssigneeId} invalid for office ${officeId}, falling through`,
      );
    }

    // 2. BuyerRequirement 담당자
    if (context.buyerReqId) {
      const br = await this.prisma.buyerRequirement.findFirst({
        where: { id: context.buyerReqId, officeId },
        select: { assignedToId: true },
      });
      if (br?.assignedToId && (await this.isActiveEmployee(officeId, br.assignedToId))) {
        return br.assignedToId;
      }
    }

    // 3. 해당 Property 의 가장 최근 Task 담당자 (연속성)
    if (context.propertyId) {
      const lastTask = await this.prisma.task.findFirst({
        where: {
          officeId,
          propertyId: context.propertyId,
          assignedToId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        select: { assignedToId: true },
      });
      if (
        lastTask?.assignedToId &&
        (await this.isActiveEmployee(officeId, lastTask.assignedToId))
      ) {
        return lastTask.assignedToId;
      }
    }

    // 4. Office owner
    const owner = await this.prisma.user.findFirst({
      where: { officeId, role: 'owner', isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
    if (owner) return owner.id;

    // 5. 그래도 없으면 null
    this.logger.warn(`No assignee found for office ${officeId}, leaving task unassigned`);
    return null;
  }

  private async isActiveEmployee(officeId: string, userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, officeId, isActive: true },
      select: { id: true },
    });
    return !!user;
  }
}

export interface AssignmentContext {
  /** Rule/MCP 가 명시적으로 지정한 담당자 */
  suggestedAssigneeId?: string | null;
  /** 자연어 힌트 (Phase 2 LLM 에서 사용) */
  assignmentHint?: string;

  // 컨텍스트 참조 — 휴리스틱이 연속성/담당자 추론에 사용
  listingId?: string | null;
  propertyId?: string | null;
  contactId?: string | null;
  buyerReqId?: string | null;
  dealId?: string | null;
}
