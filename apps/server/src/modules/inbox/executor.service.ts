import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * DraftExecutorService — approved 된 EntityDraft 를 서버가 직접 실행.
 *
 * executor='server' 일 때만 이 서비스가 호출된다.
 * entityType + operation 별 dispatch.
 *
 * Phase A1 에서는 최소한의 엔티티만 지원.
 * - task: create / update / delete
 * - consultation: create
 * - commission_payment: update (금액/상태 변경)
 * - contract: create
 * - listing: update
 *
 * 승인 즉시 InboxService.decide() 에서 호출되므로, 실행 결과가
 * draft.status 에 반영된다. 실패해도 throw 하지 않고 status='failed' 로만 마감.
 */
@Injectable()
export class DraftExecutorService {
  private readonly logger = new Logger(DraftExecutorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(draftId: string): Promise<void> {
    const draft = await this.prisma.entityDraft.findUnique({
      where: { id: draftId },
    });
    if (!draft) {
      this.logger.warn(`execute called on missing draft ${draftId}`);
      return;
    }
    if (draft.status !== 'approved') {
      this.logger.warn(
        `execute called on draft in status=${draft.status} (${draftId})`,
      );
      return;
    }
    if (draft.executor !== 'server') {
      this.logger.warn(
        `execute called on non-server draft (${draft.executor}) ${draftId}`,
      );
      return;
    }

    try {
      const resultEntityId = await this.dispatch(draft);
      await this.prisma.entityDraft.update({
        where: { id: draftId },
        data: {
          status: 'executed',
          executedAt: new Date(),
          resultEntityId,
          executionError: null,
        },
      });
      this.logger.log(
        `Executed draft ${draftId} (${draft.entityType}/${draft.operation})`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.entityDraft.update({
        where: { id: draftId },
        data: {
          status: 'failed',
          executedAt: new Date(),
          executionError: message.slice(0, 2000),
          attempts: draft.attempts + 1,
        },
      });
      this.logger.error(
        `Failed draft ${draftId}: ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
    }
  }

  // ────────────────────────────────────────────────────────────────────

  /**
   * entityType + operation 기반 실제 DB 쓰기.
   * 반환값: create 인 경우 생성된 레코드 ID (resultEntityId 로 기록).
   *
   * proposedChanges 중 언더스코어(_)로 시작하는 키는 렌더링 전용 메타로 간주하고
   * DB 에 쓰기 전에 제거한다.
   *   예: _document, _preview, _meta
   */
  private async dispatch(draft: {
    officeId: string;
    entityType: string;
    operation: string;
    entityId: string | null;
    proposedChanges: unknown;
  }): Promise<string | null> {
    const rawChanges =
      (draft.proposedChanges as Record<string, unknown>) ?? {};
    const changes = stripRenderingMeta(rawChanges);

    switch (draft.entityType) {
      case 'task':
        return this.execTask(draft.operation, draft.entityId, draft.officeId, changes);
      case 'consultation':
        return this.execConsultation(draft.operation, draft.entityId, draft.officeId, changes);
      case 'commission_payment':
        return this.execCommissionPayment(
          draft.operation,
          draft.entityId,
          draft.officeId,
          changes,
        );
      case 'contract':
        return this.execContract(draft.operation, draft.entityId, draft.officeId, changes);
      case 'listing':
        return this.execListing(draft.operation, draft.entityId, draft.officeId, changes);
      default:
        throw new Error(`Unsupported entityType: ${draft.entityType}`);
    }
  }

  // ── Task ──────────────────────────────────────────────────────────
  private async execTask(
    op: string,
    id: string | null,
    officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    if (op === 'create') {
      const created = await this.prisma.task.create({
        data: { officeId, ...(changes as any) },
      });
      return created.id;
    }
    if (op === 'update') {
      if (!id) throw new Error('update requires entityId');
      await this.prisma.task.update({ where: { id }, data: changes as any });
      return id;
    }
    if (op === 'delete') {
      if (!id) throw new Error('delete requires entityId');
      await this.prisma.task.delete({ where: { id } });
      return null;
    }
    if (op === 'create_bulk') {
      return this.execBulkCreate('task', officeId, changes);
    }
    throw new Error(`Unsupported task operation: ${op}`);
  }

  // ── Consultation ──────────────────────────────────────────────────
  private async execConsultation(
    op: string,
    id: string | null,
    officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    if (op === 'create') {
      const created = await this.prisma.consultation.create({
        data: { officeId, ...(changes as any) },
      });
      return created.id;
    }
    if (op === 'update') {
      if (!id) throw new Error('update requires entityId');
      await this.prisma.consultation.update({
        where: { id },
        data: changes as any,
      });
      return id;
    }
    throw new Error(`Unsupported consultation operation: ${op}`);
  }

  // ── CommissionPayment ─────────────────────────────────────────────
  private async execCommissionPayment(
    op: string,
    id: string | null,
    _officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    if (op === 'update') {
      if (!id) throw new Error('update requires entityId');
      await this.prisma.commissionPayment.update({
        where: { id },
        data: changes as any,
      });
      return id;
    }
    throw new Error(`Unsupported commission_payment operation: ${op}`);
  }

  // ── Contract ──────────────────────────────────────────────────────
  private async execContract(
    op: string,
    id: string | null,
    officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    if (op === 'create') {
      const created = await this.prisma.contract.create({
        data: { officeId, ...(changes as any) },
      });
      return created.id;
    }
    if (op === 'update') {
      if (!id) throw new Error('update requires entityId');
      await this.prisma.contract.update({
        where: { id },
        data: changes as any,
      });
      return id;
    }
    throw new Error(`Unsupported contract operation: ${op}`);
  }

  // ── Listing ───────────────────────────────────────────────────────
  private async execListing(
    op: string,
    id: string | null,
    officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    if (op === 'update') {
      if (!id) throw new Error('update requires entityId');
      await this.prisma.listing.update({
        where: { id },
        data: changes as any,
      });
      return id;
    }
    if (op === 'update_bulk') {
      return this.execBulkUpdate('listing', officeId, changes);
    }
    throw new Error(`Unsupported listing operation: ${op}`);
  }

  // ─── Bulk helpers ───────────────────────────────────────────────
  /**
   * bulk 실행 공통 로직.
   * proposedChanges 형식:
   *   { items: [ { enabled: true, listingId?: ..., ...fields } ] }
   *
   * enabled === false 인 item 은 skip.
   * 각 item 에서 listingId/taskId 등 "식별자 필드" 를 꺼내 update 의 where 로 쓰거나,
   * create 의 경우 그대로 data 에 전달.
   *
   * 반환: 실행된 id 들을 쉼표로 join (Draft.resultEntityId 에 저장).
   */
  private async execBulkCreate(
    entity: 'task' | 'consultation',
    officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    const items = this.readItems(changes);
    const createdIds: string[] = [];
    for (const item of items) {
      const { enabled = true, displayLabel, subtitle, warning, ...data } =
        item as Record<string, unknown> & { enabled?: boolean };
      if (enabled === false) continue;
      try {
        const row =
          entity === 'task'
            ? await this.prisma.task.create({
                data: { officeId, ...(data as any) },
              })
            : await this.prisma.consultation.create({
                data: { officeId, ...(data as any) },
              });
        createdIds.push(row.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `bulk create ${entity} item failed: ${msg}`,
        );
        // 부분 실패 허용 — 나머지 진행
      }
    }
    return createdIds.join(',') || null;
  }

  private async execBulkUpdate(
    entity: 'listing',
    _officeId: string,
    changes: Record<string, unknown>,
  ): Promise<string | null> {
    const items = this.readItems(changes);
    const updatedIds: string[] = [];
    for (const item of items) {
      const {
        enabled = true,
        displayLabel,
        subtitle,
        warning,
        ...rest
      } = item as Record<string, unknown> & { enabled?: boolean };
      if (enabled === false) continue;

      const idKey = entity === 'listing' ? 'listingId' : 'id';
      const id = rest[idKey] as string | undefined;
      if (!id) {
        this.logger.warn(`bulk update ${entity}: item missing ${idKey}`);
        continue;
      }
      const data: Record<string, unknown> = { ...rest };
      delete data[idKey];

      try {
        if (entity === 'listing') {
          await this.prisma.listing.update({
            where: { id },
            data: data as any,
          });
          updatedIds.push(id);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`bulk update ${entity} ${id} failed: ${msg}`);
      }
    }
    return updatedIds.join(',') || null;
  }

  private readItems(changes: Record<string, unknown>): Array<Record<string, unknown>> {
    const items = (changes as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      throw new Error('bulk operation requires proposedChanges.items array');
    }
    return items as Array<Record<string, unknown>>;
  }
}

/**
 * proposedChanges 에서 렌더링 전용 메타(언더스코어 prefix 키) 를 제거한다.
 * 예: `_document`, `_preview`, `_meta`.
 */
function stripRenderingMeta(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('_')) continue;
    result[key] = value;
  }
  return result;
}
