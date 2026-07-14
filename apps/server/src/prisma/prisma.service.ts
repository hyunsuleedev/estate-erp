import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getRequestContext } from '../common/request-context/request-context';

const TENANT_SCOPED_MODELS = new Set([
  'User',
  'OfficeSite',
  'Contact',
  'ContactRelation',
  'PropertyContact',
  'Tenant',
  'Property',
  'ListingIntake',
  'Listing',
  'PriceHistory',
  'BuyerRequirement',
  'Consultation',
  'Match',
  'Deal',
  'Contract',
  'DealParticipant',
  'ContractDocument',
  'ContractDocumentRevision',
  // ContractParty는 주민번호 등 민감 PII 보유 — 테넌트 격리는 필수이되,
  // AUDITED_MODELS에는 의도적으로 넣지 않는다 (idNumber/phone이 activity_logs.changes에 복사되는 것 방지)
  'ContractParty',
  'OfficePrintTemplate',
  'ContractClauseTemplate',
  'Task',
  'CalendarEvent',
  'ActivityLog',
  'Notification',
  'Rule',
  'Proposal',
  'EntityDraft',
  'EntityDraftComment',
  'AgentSession',
  'AgentWakeupRequest',
  'AgentRun',
  'AgentActivity',
  // 공동중개 네트워크 모델(NetworkRoom/NetworkRoomMember/NetworkSharedProperty/
  // NetworkInquiry/NetworkMessage)은 여러 사무소가 한 방을 공유하는 크로스 오피스
  // 데이터라 자동 officeId 주입 대상이 아니다 (NetworkInquiry는 officeId 컬럼 자체가
  // 없고 fromOfficeId만 있다). 접근 제어는 modules/network의 방 멤버십(status=approved)
  // 검사로 서비스 레벨에서 강제한다.
]);

const AUDITED_MODELS = new Set([
  'Property',
  'ListingIntake',
  'Listing',
  'Contact',
  'PropertyContact',
  'Tenant',
  'BuyerRequirement',
  'Match',
  'Deal',
  'Consultation',
  'Task',
  'NetworkSharedProperty',
  'Contract',
  'ContractDocument',
  'ContractClauseTemplate',
  'OfficePrintTemplate',
]);

const AUDITED_OPERATIONS = new Set<PrismaOperation>([
  'create',
  'update',
  'delete',
  'upsert',
]);

const PRICE_TRACKED_FIELDS = ['price', 'deposit', 'monthlyRent'] as const;
const SKIPPED_ACTIVITY_FIELDS = new Set(['updatedAt']);

type PrismaOperation =
  | 'findUnique'
  | 'findUniqueOrThrow'
  | 'findFirst'
  | 'findFirstOrThrow'
  | 'findMany'
  | 'count'
  | 'aggregate'
  | 'update'
  | 'updateMany'
  | 'updateManyAndReturn'
  | 'delete'
  | 'deleteMany'
  | 'create'
  | 'createMany'
  | 'createManyAndReturn'
  | 'upsert';

type AuditAction = 'create' | 'update' | 'delete';
type RecordLike = Record<string, unknown>;

const OFFICE_SCOPING_OPERATIONS = new Set<PrismaOperation>([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
]);

const OFFICE_DATA_OPERATIONS = new Set<PrismaOperation>([
  'create',
  'createMany',
  'createManyAndReturn',
  'upsert',
]);

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly extendedClient: PrismaClient;

  constructor() {
    super();
    const baseClient = this as PrismaClient;

    this.extendedClient = this.$extends(
      Prisma.defineExtension({
        query: {
          $allModels: {
            async $allOperations({ model, operation, args, query }) {
              const requestContext = getRequestContext();
              const officeId = requestContext?.officeId;
              const nextArgs =
                officeId &&
                model &&
                TENANT_SCOPED_MODELS.has(model)
                  ? PrismaService.applyOfficeScope(
                      operation as PrismaOperation,
                      args,
                      officeId,
                    )
                  : args;

              const shouldReadBefore =
                !!model &&
                AUDITED_MODELS.has(model) &&
                ['update', 'delete', 'upsert'].includes(operation);
              const beforeRecord = shouldReadBefore
                ? await PrismaService.readRecord(baseClient, model!, nextArgs)
                : null;

              const result = await query(nextArgs as never);

              const resultRecord = PrismaService.isRecord(result)
                ? (result as RecordLike)
                : null;

              if (!model || !resultRecord) {
                return result;
              }

              const resolvedOfficeId =
                PrismaService.extractString(resultRecord.officeId) ??
                PrismaService.extractString(beforeRecord?.officeId) ??
                officeId;

              if (model === 'Listing' && operation !== 'delete' && resolvedOfficeId) {
                await PrismaService.createPriceHistoryIfNeeded(
                  baseClient,
                  beforeRecord,
                  resultRecord,
                  resolvedOfficeId,
                  requestContext?.userId,
                );
              }

              if (
                AUDITED_MODELS.has(model) &&
                AUDITED_OPERATIONS.has(operation as PrismaOperation) &&
                resolvedOfficeId
              ) {
                await PrismaService.createActivityLogIfNeeded(
                  baseClient,
                  model,
                  operation as PrismaOperation,
                  nextArgs,
                  beforeRecord,
                  resultRecord,
                  resolvedOfficeId,
                  requestContext?.userId,
                  requestContext?.actor,
                  requestContext?.source,
                );
              }

              return result;
            },
          },
        },
      }),
    ) as PrismaClient;

    return new Proxy(this, {
      get: (target, property, receiver) => {
        if (property in target.extendedClient) {
          return Reflect.get(target.extendedClient as object, property, receiver);
        }

        return Reflect.get(target, property, receiver);
      },
    });
  }

  async onModuleInit() {
    await this.extendedClient.$connect();
  }

  async onModuleDestroy() {
    await this.extendedClient.$disconnect();
  }

  private static applyOfficeScope(
    operation: PrismaOperation,
    args: unknown,
    officeId: string,
  ) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return args;
    }

    const nextArgs = { ...(args as Record<string, unknown>) };

    if (OFFICE_SCOPING_OPERATIONS.has(operation)) {
      nextArgs.where = PrismaService.attachOfficeIdToWhere(nextArgs.where, officeId);
    }

    if (OFFICE_DATA_OPERATIONS.has(operation)) {
      if (operation === 'upsert') {
        nextArgs.create = PrismaService.attachOfficeIdToData(
          nextArgs.create,
          officeId,
        );
      } else {
        nextArgs.data = Array.isArray(nextArgs.data)
          ? nextArgs.data.map((item) =>
              PrismaService.attachOfficeIdToData(item, officeId),
            )
          : PrismaService.attachOfficeIdToData(nextArgs.data, officeId);
      }
    }

    return nextArgs;
  }

  private static attachOfficeIdToWhere(where: unknown, officeId: string) {
    if (!where || typeof where !== 'object' || Array.isArray(where)) {
      return { officeId };
    }

    if ('officeId' in where) {
      return where;
    }

    return {
      ...(where as Record<string, unknown>),
      officeId,
    };
  }

  private static attachOfficeIdToData(data: unknown, officeId: string) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return data;
    }

    if ('officeId' in data) {
      return data;
    }

    return {
      ...(data as Record<string, unknown>),
      officeId,
    };
  }

  private static async readRecord(
    client: PrismaClient,
    model: string,
    args: unknown,
  ): Promise<RecordLike | null> {
    const delegate = PrismaService.getModelDelegate(client, model);

    if (
      !delegate?.findFirst ||
      !PrismaService.isRecord(args) ||
      !PrismaService.isRecord(args.where)
    ) {
      return null;
    }

    return (await delegate.findFirst({
      where: args.where,
    })) as RecordLike | null;
  }

  private static async createPriceHistoryIfNeeded(
    client: PrismaClient,
    beforeRecord: RecordLike | null,
    afterRecord: RecordLike,
    officeId: string,
    userId?: string,
  ) {
    if (!beforeRecord) {
      return;
    }

    const hasPriceChange = PRICE_TRACKED_FIELDS.some((field) =>
      PrismaService.valuesDiffer(beforeRecord[field], afterRecord[field]),
    );

    if (!hasPriceChange) {
      return;
    }

    const listingId = PrismaService.extractString(afterRecord.id);

    if (!listingId) {
      return;
    }

    await client.priceHistory.create({
      data: {
        officeId,
        listingId,
        changedBy: userId,
        priceBefore: PrismaService.toOptionalNumber(beforeRecord.price),
        priceAfter: PrismaService.toOptionalNumber(afterRecord.price),
        depositBefore: PrismaService.toOptionalNumber(beforeRecord.deposit),
        depositAfter: PrismaService.toOptionalNumber(afterRecord.deposit),
        monthlyRentBefore: PrismaService.toOptionalNumber(
          beforeRecord.monthlyRent,
        ),
        monthlyRentAfter: PrismaService.toOptionalNumber(afterRecord.monthlyRent),
      },
    });
  }

  private static async createActivityLogIfNeeded(
    client: PrismaClient,
    model: string,
    operation: PrismaOperation,
    args: unknown,
    beforeRecord: RecordLike | null,
    afterRecord: RecordLike,
    officeId: string,
    userId?: string,
    actor = 'user',
    source = 'web',
  ) {
    const action = PrismaService.resolveAuditAction(operation, beforeRecord);
    const entityId =
      PrismaService.extractString(afterRecord.id) ??
      PrismaService.extractString(beforeRecord?.id);

    if (!entityId) {
      return;
    }

    const trackedKeys = PrismaService.resolveTrackedKeys(
      operation,
      args,
      beforeRecord,
      afterRecord,
    );
    const changes = PrismaService.buildChangeSet(
      action,
      trackedKeys,
      beforeRecord,
      afterRecord,
    );

    if (!changes) {
      return;
    }

    await client.activityLog.create({
      data: {
        officeId,
        userId,
        actor,
        source,
        action,
        entityType: PrismaService.toEntityType(model),
        entityId,
        changes: changes as Prisma.InputJsonValue,
      },
    });
  }

  private static resolveTrackedKeys(
    operation: PrismaOperation,
    args: unknown,
    beforeRecord: RecordLike | null,
    afterRecord: RecordLike,
  ) {
    if (operation === 'delete') {
      return Object.keys(beforeRecord ?? afterRecord);
    }

    if (!PrismaService.isRecord(args)) {
      return Object.keys(afterRecord);
    }

    const data =
      operation === 'upsert'
        ? beforeRecord
          ? args.update
          : args.create
        : args.data;

    if (!PrismaService.isRecord(data)) {
      return Object.keys(afterRecord);
    }

    return Object.keys(data);
  }

  private static buildChangeSet(
    action: AuditAction,
    keys: string[],
    beforeRecord: RecordLike | null,
    afterRecord: RecordLike,
  ) {
    const changes: Record<string, Record<string, unknown>> = {};

    for (const key of keys) {
      if (SKIPPED_ACTIVITY_FIELDS.has(key)) {
        continue;
      }

      const beforeValue =
        action === 'create'
          ? undefined
          : PrismaService.normalizeValue(beforeRecord?.[key]);
      const afterValue =
        action === 'delete' ? undefined : PrismaService.normalizeValue(afterRecord[key]);

      if (action === 'create') {
        if (afterValue === undefined) {
          continue;
        }

        changes[key] = { after: afterValue };
        continue;
      }

      if (action === 'delete') {
        if (beforeValue === undefined) {
          continue;
        }

        changes[key] = { before: beforeValue };
        continue;
      }

      if (PrismaService.valuesDiffer(beforeValue, afterValue)) {
        changes[key] = { before: beforeValue, after: afterValue };
      }
    }

    return Object.keys(changes).length > 0 ? changes : null;
  }

  private static normalizeValue(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (value instanceof Prisma.Decimal) {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => PrismaService.normalizeValue(item));
    }

    if (PrismaService.isRecord(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          PrismaService.normalizeValue(item),
        ]),
      );
    }

    return value;
  }

  private static valuesDiffer(left: unknown, right: unknown) {
    return (
      JSON.stringify(PrismaService.normalizeValue(left)) !==
      JSON.stringify(PrismaService.normalizeValue(right))
    );
  }

  private static toOptionalNumber(value: unknown) {
    if (value === null || value === undefined) {
      return null;
    }

    if (value instanceof Prisma.Decimal) {
      return value.toNumber();
    }

    return typeof value === 'number' ? value : Number(value);
  }

  private static resolveAuditAction(
    operation: PrismaOperation,
    beforeRecord: RecordLike | null,
  ): AuditAction {
    if (operation === 'create') {
      return 'create';
    }

    if (operation === 'delete') {
      return 'delete';
    }

    if (operation === 'upsert') {
      return beforeRecord ? 'update' : 'create';
    }

    return 'update';
  }

  private static toEntityType(model: string) {
    return `${model.charAt(0).toLowerCase()}${model.slice(1)}`;
  }

  private static getModelDelegate(client: PrismaClient, model: string) {
    const delegateName = `${model.charAt(0).toLowerCase()}${model.slice(1)}`;

    return (client as unknown as Record<
      string,
      {
        findFirst?: (args: { where: RecordLike }) => Promise<unknown>;
      }
    >)[delegateName];
  }

  private static isRecord(value: unknown): value is RecordLike {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  private static extractString(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
