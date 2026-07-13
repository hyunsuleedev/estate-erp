import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListingsService } from '../listings/listings.service';
import { ListingIntakesService } from '../listing-intakes/listing-intakes.service';
import { ContactsService } from '../contacts/contacts.service';
import { PropertiesService } from '../properties/properties.service';
import { DealsService } from '../deals/deals.service';
import { BuyerRequirementsService } from '../buyer-requirements/buyer-requirements.service';
import { ConsultationsService } from '../consultations/consultations.service';
import { MatchesService } from '../matches/matches.service';
import { ContractsService } from '../contracts/contracts.service';
import { TasksService } from '../tasks/tasks.service';
import { CalendarEventsService } from '../calendar-events/calendar-events.service';
import { SitesService } from '../sites/sites.service';
import { DongsService } from '../dongs/dongs.service';
import { UnitsService } from '../units/units.service';
import { OfficeSitesService } from '../office-sites/office-sites.service';
import { PropertyContactsService } from '../property-contacts/property-contacts.service';
import { ContactRelationsService } from '../contact-relations/contact-relations.service';
import { TenantsService } from '../tenants/tenants.service';
import { EmployeesService } from '../employees/employees.service';
import { OfficesService } from '../offices/offices.service';
import {
  ExternalListingsService,
  type BatchListingItem,
} from '../external-listings/external-listings.service';
import { CommissionPaymentService } from '../finance/commission-payment.service';
import { CashflowService } from '../finance/cashflow.service';
import { PublicDocumentsService } from '../public-documents/public-documents.service';
import { PropertyPhotosService } from '../property-photos/property-photos.service';
import { ListingAdvertisementsService } from '../listing-advertisements/listing-advertisements.service';
import {
  OfficeAdvertisementsService,
  type OfficeAdvertisementBatchGroupDto,
} from '../office-advertisements/office-advertisements.service';
import { ProposalService } from '../agent/proposal/proposal.service';
import type { ProposalStatus } from '../agent/proposal/proposal.types';
import { InboxService } from '../inbox/inbox.service';
import { AgentControlPlaneService } from '../agent/control-plane/control-plane.service';
import type {
  AgentActivityType,
  AgentSessionStatus,
  AgentWakeupStatus,
  CompleteAgentRunOutcome,
} from '../agent/control-plane/control-plane.types';
import type {
  DraftDecisionMode,
  DraftEntityType,
  DraftExecutor,
  DraftOperation,
  DraftPriority,
} from '../inbox/inbox.types';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface ToolCallResult {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
  [key: string]: unknown;
}

interface McpContext {
  officeId: string;
  userId: string;
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: McpContext,
) => Promise<unknown>;

interface ToolEntry {
  def: ToolDefinition;
  handler: ToolHandler;
}

// JSON Schema helpers
const str = (desc: string) => ({ type: 'string' as const, description: desc });
const strEnum = (desc: string, values: string[]) => ({
  type: 'string' as const,
  enum: values,
  description: desc,
});
const num = (desc: string) => ({ type: 'number' as const, description: desc });
const bool = (desc: string) => ({ type: 'boolean' as const, description: desc });
const strArr = (desc: string) => ({
  type: 'array' as const,
  items: { type: 'string' as const },
  description: desc,
});
const page = {
  page: num('페이지 번호 (기본 1)'),
  limit: num('페이지당 수 (기본 20, 최대 100)'),
};
const obj = (
  properties: Record<string, unknown>,
  required?: string[],
): Record<string, unknown> => ({
  type: 'object',
  properties,
  ...(required?.length ? { required } : {}),
});
/** Listing 거래유형 */
const LISTING_TRANSACTION_TYPES = ['sale', 'jeonse', 'monthly'];
const MAINTENANCE_FEE_INCLUDE_SLUGS = [
  'water',
  'electricity',
  'gas',
  'internet',
  'tv',
  'cleaning',
  'parking',
  'heating',
];
const maintenanceFeeIncludes = {
  type: 'array' as const,
  items: { type: 'string' as const, enum: MAINTENANCE_FEE_INCLUDE_SLUGS },
  description:
    '관리비 포함 항목 slug 목록 (water=수도, electricity=전기, gas=가스, internet=인터넷, tv=TV, cleaning=청소, parking=주차, heating=난방)',
};
const listingInput = obj(
  {
    transactionType: strEnum(
      '거래유형',
      LISTING_TRANSACTION_TYPES,
    ),
    price: num('매매가/전세가 (만원)'),
    deposit: num('보증금 (만원)'),
    monthlyRent: num('월세 (만원)'),
    maintenanceFee: num('관리비 (만원)'),
    maintenanceFeeIncludes,
    loanAmount: num('융자금/근저당 설정액 (만원)'),
    premium: num('상가 권리금 (만원)'),
    privateMemo: str(
      '내부 전용 메모 — 네트워크 공유/외부 노출 절대 금지. MCP 조회 응답에는 포함되지 않습니다.',
    ),
    moveInAvailableType: str('입주가능 유형'),
    moveInAvailableFrom: str('입주가능 시작일 (ISO)'),
    moveInAvailableTo: str('입주가능 종료일 (ISO)'),
    memo: str('메모'),
  },
  ['transactionType'],
);
const listingInputs = {
  type: 'array' as const,
  items: listingInput,
  description: '의뢰건에 포함할 listing rows',
};

@Injectable()
export class McpToolsService {
  private tools: ToolEntry[] = [];

  constructor(
    private readonly listings: ListingsService,
    private readonly contacts: ContactsService,
    private readonly properties: PropertiesService,
    private readonly deals: DealsService,
    private readonly buyerReqs: BuyerRequirementsService,
    private readonly consultations: ConsultationsService,
    private readonly matches: MatchesService,
    private readonly contracts: ContractsService,
    private readonly tasks: TasksService,
    private readonly calendarEvents: CalendarEventsService,
    private readonly sites: SitesService,
    private readonly dongs: DongsService,
    private readonly units: UnitsService,
    private readonly officeSites: OfficeSitesService,
    private readonly propertyContacts: PropertyContactsService,
    private readonly contactRelations: ContactRelationsService,
    private readonly tenants: TenantsService,
    private readonly employees: EmployeesService,
    private readonly offices: OfficesService,
    private readonly externalListings: ExternalListingsService,
    private readonly commissionPayments: CommissionPaymentService,
    private readonly cashflow: CashflowService,
    private readonly publicDocs: PublicDocumentsService,
    private readonly propertyPhotos: PropertyPhotosService,
    private readonly proposals: ProposalService,
    private readonly inbox: InboxService,
    private readonly listingAdvertisements: ListingAdvertisementsService,
    private readonly officeAdvertisements: OfficeAdvertisementsService,
    private readonly listingIntakes: ListingIntakesService,
    private readonly controlPlane: AgentControlPlaneService,
  ) {
    this.registerAll();
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.tools.map((t) => t.def);
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    ctx: McpContext,
  ): Promise<ToolCallResult> {
    const entry = this.tools.find((t) => t.def.name === toolName);
    if (!entry) {
      return {
        content: [{ type: 'text', text: `Unknown tool: ${toolName}` }],
        isError: true,
      };
    }
    try {
      const data = await entry.handler(args, ctx);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(this.redactPrivateFields(data), null, 2),
          },
        ],
        isError: false,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  }

  private add(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: ToolHandler,
  ) {
    this.tools.push({ def: { name, description, inputSchema }, handler });
  }

  /**
   * MCP 응답에서 내부 전용 필드를 제거한다.
   * Listing.privateMemo 는 네트워크 공유/외부(MCP 포함) 노출 절대 금지 필드 —
   * 어떤 도구가 어떤 include 로 Listing 을 직렬화하든 여기서 일괄 차단한다.
   */
  private redactPrivateFields(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactPrivateFields(item));
    }
    // Date/Decimal 등 class instance 는 toJSON 직렬화를 보존하기 위해 건드리지 않는다.
    if (!this.isPlainObject(value)) {
      return value;
    }
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (key === 'privateMemo') continue;
      result[key] = this.redactPrivateFields(val);
    }
    return result;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    if (!value || typeof value !== 'object') return false;
    const proto: unknown = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
  }

  private clampLimit(args: Record<string, unknown>, max = 100): number {
    return Math.min(Math.max((args.limit as number) ?? 20, 1), max);
  }

  private async assertMcpRunOwnership(
    officeId: string,
    userId: string,
    sessionId: string,
    runId: string,
  ) {
    const run = await this.controlPlane.getRun(officeId, runId);
    const leaseExpiresAt = run.leaseExpiresAt
      ? new Date(run.leaseExpiresAt)
      : null;
    if (
      run.sessionId !== sessionId ||
      run.status !== 'running' ||
      run.workerId !== `mcp:${userId}` ||
      !leaseExpiresAt ||
      leaseExpiresAt <= new Date()
    ) {
      throw new BadRequestException(
        'agentRunId는 이 MCP worker가 현재 소유한 유효한 실행 lease여야 합니다.',
      );
    }
    return run;
  }

  private async prepareSaleContractReview(
    args: Record<string, unknown>,
    ctx: McpContext,
  ) {
    const contractId = args.contractId as string;
    const taskKey = `contract:${contractId}:sale-agreement`;
    const requestedByRunId = args.agentRunId as string | undefined;
    let session = await this.controlPlane.getOrCreateSession(ctx.officeId, {
      agentKey: 'contract-writer',
      adapter: 'mcp',
      taskKey,
      context: { contractId },
      plan: [
        { step: '계약 데이터 수집', status: 'in_progress' },
        { step: '계약서 revision 작성', status: 'pending' },
        { step: '담당자 검토', status: 'pending' },
      ],
    });

    if (requestedByRunId) {
      await this.assertMcpRunOwnership(
        ctx.officeId,
        ctx.userId,
        session.id,
        requestedByRunId,
      );
    }

    const prepared = await this.contracts.prepareSaleContractDraft(
      contractId,
      ctx.officeId,
      ctx.userId,
      {
        actualAgreementAt: args.actualAgreementAt as string | undefined,
        conditions: args.conditions as string | undefined,
        specialTerms: args.specialTerms as string | undefined,
        rightsTransferDetails: args.rightsTransferDetails as string | undefined,
        explanationDeliveredAt: args.explanationDeliveredAt as
          | string
          | undefined,
      },
      'agent:contract-writer',
    );

    if (!session.taskId) {
      const task = await this.tasks.create(
        ctx.officeId,
        {
          title: `계약서 검토 · ${prepared.document.title}`,
          content:
            'AI가 작성한 계약서 revision을 확인하고 승인하거나 코멘트로 수정을 요청하세요.',
          source: 'ai',
          status: 'pending',
          priority: 'high',
          category: 'contract',
          assignedToId: ctx.userId,
          contractId,
        },
        ctx.userId,
      );
      session = await this.controlPlane.updateSession(
        ctx.officeId,
        session.id,
        { taskId: task.id },
      );
    } else {
      await this.tasks.update(
        session.taskId,
        ctx.officeId,
        { status: 'pending' },
        ctx.userId,
      );
    }

    const artifactPayload = prepared.revision.payload as Record<
      string,
      unknown
    >;
    const reviewRequest = await this.inbox.upsertAgentReview({
      officeId: ctx.officeId,
      entityType: 'contract',
      operation: 'action',
      entityId: contractId,
      proposedChanges: {
        tool: 'apply_contract_document_revision',
        documentId: prepared.document.id,
        revisionId: prepared.revision.id,
        contentHash: prepared.revision.contentHash,
        payload: artifactPayload,
        contractAgreement: artifactPayload.contractAgreement,
        validation: prepared.validation,
        _artifactRevision: {
          documentId: prepared.document.id,
          revisionId: prepared.revision.id,
          revisionNo: prepared.revision.revisionNo,
          contentHash: prepared.revision.contentHash,
          validation: prepared.validation,
        },
      },
      category: 'contract_draft',
      title: `${prepared.document.title} revision ${prepared.revision.revisionNo}`,
      summary: 'AI가 작성한 계약서 초안입니다. 정확한 revision을 검토한 뒤 확인해주세요.',
      reasoning:
        '계약 데이터와 연결된 매물·당사자·중개사무소 정보를 기반으로 작성했습니다.',
      priority: 'urgent',
      decisionMode: 'confirm',
      executor: 'server',
      generatedBy: 'agent:contract-writer',
      dedupeKey: taskKey,
      contractId,
      agentSessionId: session.id,
      requestedByRunId,
    });

    session = await this.controlPlane.updateSession(ctx.officeId, session.id, {
      status: 'awaiting_input',
      waitingReason: `계약서 revision ${prepared.revision.revisionNo} 검토 대기`,
      context: {
        contractId,
        documentId: prepared.document.id,
        revisionId: prepared.revision.id,
        reviewRequestId: reviewRequest?.id ?? null,
      },
      plan: [
        { step: '계약 데이터 수집', status: 'completed' },
        { step: '계약서 revision 작성', status: 'completed' },
        { step: '담당자 검토', status: 'in_progress' },
      ],
    });

    await this.controlPlane.appendActivity(ctx.officeId, {
      sessionId: session.id,
      runId: requestedByRunId,
      type: 'elicitation',
      message: `계약서 revision ${prepared.revision.revisionNo} 검토를 요청했습니다.`,
      payload: {
        contractId,
        documentId: prepared.document.id,
        revisionId: prepared.revision.id,
        contentHash: prepared.revision.contentHash,
        reviewRequestId: reviewRequest?.id ?? null,
      },
    });

    return {
      ...prepared,
      reviewRequest,
      agentSession: session,
    };
  }

  private registerAll() {
    // ═══════════════════════════════════════════════════════════
    // 매물 의뢰 (ListingIntakes) - table CRUD for MCP testing
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_listing_intakes',
      '매물 의뢰(ListingIntake) 목록을 검색합니다.',
      obj({
        status: strEnum('의뢰 상태', ['unverified', 'active', 'in_contract', 'hold', 'done']),
        nextConfirmFrom: str('다음 확인 예정 시작일 (ISO)'),
        nextConfirmTo: str('다음 확인 예정 종료일 (ISO)'),
        includeInactive: bool('비활성 의뢰 포함'),
        propertyId: str('관리매물 ID'),
        transactionType: strEnum(
          '거래유형',
          LISTING_TRANSACTION_TYPES,
        ),
        checkStatus: strEnum('확인상태', ['unverified', 'verified', 'in_contract', 'hold', 'done']),
        siteId: str('단지 ID'),
        siteType: str('매물유형'),
        wardCode: str('법정동코드'),
        search: str('검색어'),
        priceMin: num('최소 가격 (만원)'),
        priceMax: num('최대 가격 (만원)'),
        depositMin: num('최소 보증금 (만원)'),
        depositMax: num('최대 보증금 (만원)'),
        monthlyRentMin: num('최소 월세 (만원)'),
        monthlyRentMax: num('최대 월세 (만원)'),
        areaMin: num('최소 면적 (m²)'),
        areaMax: num('최대 면적 (m²)'),
        sortBy: strEnum('정렬 필드', ['receivedAt', 'updatedAt', 'createdAt', 'price']),
        sortOrder: strEnum('정렬 방향', ['asc', 'desc']),
        ...page,
      }),
      async (a, c) =>
        this.listingIntakes.findAll(c.officeId, {
          status: a.status as string,
          nextConfirmFrom: a.nextConfirmFrom as string,
          nextConfirmTo: a.nextConfirmTo as string,
          includeInactive: a.includeInactive as boolean,
          propertyId: a.propertyId as string,
          transactionType: a.transactionType as string,
          checkStatus: a.checkStatus as string,
          siteId: a.siteId as string,
          siteType: a.siteType as string,
          wardCode: a.wardCode as string,
          search: a.search as string,
          priceMin: a.priceMin as number,
          priceMax: a.priceMax as number,
          depositMin: a.depositMin as number,
          depositMax: a.depositMax as number,
          monthlyRentMin: a.monthlyRentMin as number,
          monthlyRentMax: a.monthlyRentMax as number,
          areaMin: a.areaMin as number,
          areaMax: a.areaMax as number,
          sortBy: a.sortBy as 'receivedAt' | 'updatedAt' | 'createdAt' | 'price',
          sortOrder: a.sortOrder as 'asc' | 'desc',
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'get_listing_intake',
      '특정 매물 의뢰(ListingIntake)를 조회합니다.',
      obj({ id: str('의뢰 ID') }, ['id']),
      async (a, c) => this.listingIntakes.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_listing_intake',
      '새 매물 의뢰(ListingIntake) row를 등록합니다. 테스트용 table CRUD 도구이므로 listings는 선택입니다.',
      obj(
        {
          propertyId: str('관리매물 ID'),
          status: strEnum('의뢰 상태', ['unverified', 'active', 'in_contract', 'hold', 'done']),
          receivedAt: str('접수일 (ISO)'),
          confirmedAt: str('확인일 (ISO)'),
          isJointBrokerageRequired: bool('공동중개 필요 여부'),
          jointBrokeragePartnerId: str('공동중개 거래처 ID'),
          memo: str('의뢰 메모'),
          listings: listingInputs,
        },
        ['propertyId'],
      ),
      async (a, c) =>
        this.listingIntakes.create(c.officeId, {
          propertyId: a.propertyId as string,
          status: a.status as string,
          receivedAt: a.receivedAt as string | null,
          confirmedAt: a.confirmedAt as string | null,
          isJointBrokerageRequired: a.isJointBrokerageRequired as boolean,
          jointBrokeragePartnerId: a.jointBrokeragePartnerId as string | null,
          memo: a.memo as string | null,
          listings: a.listings as never,
        }),
    );

    this.add(
      'update_listing_intake',
      '매물 의뢰(ListingIntake) row를 수정합니다.',
      obj(
        {
          id: str('의뢰 ID'),
          status: strEnum('의뢰 상태', ['unverified', 'active', 'in_contract', 'hold', 'done']),
          receivedAt: str('접수일 (ISO)'),
          confirmedAt: str('확인일 (ISO)'),
          isJointBrokerageRequired: bool('공동중개 필요 여부'),
          jointBrokeragePartnerId: str('공동중개 거래처 ID'),
          memo: str('의뢰 메모'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingIntakes.update(a.id as string, c.officeId, {
          status: a.status as string,
          receivedAt: a.receivedAt as string | null,
          confirmedAt: a.confirmedAt as string | null,
          isJointBrokerageRequired: a.isJointBrokerageRequired as boolean,
          jointBrokeragePartnerId: a.jointBrokeragePartnerId as string | null,
          memo: a.memo as string | null,
        }),
    );

    this.add(
      'confirm_listing_intake',
      '매물 의뢰의 생존 여부를 확인하고 최신 확인 상태를 갱신합니다. 가능하면 Consultation 히스토리도 함께 남깁니다.',
      obj(
        {
          id: str('의뢰 ID'),
          result: strEnum('확인 결과', ['alive', 'price_changed', 'unavailable', 'no_answer', 'pending']),
          channel: strEnum('확인 채널', ['phone', 'sms', 'visit', 'owner_message', 'note', 'mcp']),
          memo: str('확인 메모'),
          checkedAt: str('확인 시각 (ISO)'),
          nextConfirmAt: str('다음 확인 예정일 (ISO)'),
          contactId: str('확인 대상 연락처 ID'),
        },
        ['id', 'result'],
      ),
      async (a, c) =>
        this.listingIntakes.confirm(a.id as string, c.officeId, c.userId, {
          result: a.result as string,
          channel: (a.channel as string) ?? 'mcp',
          memo: a.memo as string | null,
          checkedAt: a.checkedAt as string | null,
          nextConfirmAt: a.nextConfirmAt as string | null,
          contactId: a.contactId as string | null,
        }),
    );

    this.add(
      'delete_listing_intake',
      '매물 의뢰(ListingIntake)를 삭제 요청합니다. 현재 API 구현은 done 상태로 전환합니다.',
      obj({ id: str('의뢰 ID') }, ['id']),
      async (a, c) => this.listingIntakes.remove(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 매물 (Listings)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_listings',
      '매물(Listing) 목록을 검색합니다. 거래유형, 확인상태, 가격범위, 단지, 키워드로 필터링.',
      obj({
        transactionType: strEnum(
          '거래유형',
          LISTING_TRANSACTION_TYPES,
        ),
        checkStatus: strEnum('확인상태', ['unverified', 'verified', 'in_contract', 'hold', 'done']),
        siteId: str('단지 ID'),
        search: str('검색어 (단지명, 주소)'),
        priceMin: num('최소 가격 (만원)'),
        priceMax: num('최대 가격 (만원)'),
        ...page,
      }),
      async (a, c) =>
        this.listings.findAll(c.officeId, {
          transactionType: a.transactionType as string,
          checkStatus: a.checkStatus as string,
          siteId: a.siteId as string,
          search: a.search as string,
          priceMin: a.priceMin as number,
          priceMax: a.priceMax as number,
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'get_listing',
      '특정 매물의 상세 정보를 조회합니다. 소유자, 세입자, 매칭, 거래, 가격이력 포함.',
      obj({ id: str('매물 ID') }, ['id']),
      async (a, c) => this.listings.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_listing',
      '새 매물을 등록합니다. Property에 거래 조건을 추가합니다.',
      obj(
        {
          intakeId: str('의뢰 ID'),
          propertyId: str('관리매물 ID'),
          transactionType: strEnum(
            '거래유형',
            LISTING_TRANSACTION_TYPES,
          ),
          price: num('매매가/전세가 (만원)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          maintenanceFee: num('관리비 (만원)'),
          maintenanceFeeIncludes,
          loanAmount: num('융자금/근저당 설정액 (만원)'),
          premium: num('상가 권리금 (만원)'),
          privateMemo: str(
            '내부 전용 메모 — 네트워크 공유/외부 노출 절대 금지. MCP 조회 응답에는 포함되지 않습니다.',
          ),
          memo: str('메모'),
        },
        ['intakeId', 'propertyId', 'transactionType'],
      ),
      async (a, c) => {
        if (!a.intakeId) {
          throw new BadRequestException('intakeId is required');
        }

        return this.listings.create(c.officeId, {
          intakeId: a.intakeId as string,
          propertyId: a.propertyId as string,
          transactionType: a.transactionType as string,
          price: a.price as number,
          deposit: a.deposit as number,
          monthlyRent: a.monthlyRent as number,
          maintenanceFee: a.maintenanceFee as number,
          maintenanceFeeIncludes: a.maintenanceFeeIncludes as string[],
          loanAmount: a.loanAmount as number,
          premium: a.premium as number,
          privateMemo: a.privateMemo as string,
          memo: a.memo as string,
        });
      },
    );

    this.add(
      'update_listing',
      '매물 정보를 수정합니다. 가격, 관리비, 융자금, 권리금, 확인상태, 메모 등.',
      obj(
        {
          id: str('매물 ID'),
          price: num('가격 (만원)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          maintenanceFee: num('관리비 (만원)'),
          maintenanceFeeIncludes,
          loanAmount: num('융자금/근저당 설정액 (만원)'),
          premium: num('상가 권리금 (만원)'),
          privateMemo: str(
            '내부 전용 메모 — 네트워크 공유/외부 노출 절대 금지. MCP 조회 응답에는 포함되지 않습니다.',
          ),
          checkStatus: strEnum('확인상태', ['unverified', 'verified', 'in_contract', 'hold', 'done']),
          memo: str('메모'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listings.update(a.id as string, c.officeId, {
          price: a.price as number,
          deposit: a.deposit as number,
          monthlyRent: a.monthlyRent as number,
          maintenanceFee: a.maintenanceFee as number,
          maintenanceFeeIncludes: a.maintenanceFeeIncludes as string[],
          loanAmount: a.loanAmount as number,
          premium: a.premium as number,
          privateMemo: a.privateMemo as string,
          checkStatus: a.checkStatus as string,
          memo: a.memo as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 내부 광고 row (ListingAdvertisements)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_listing_advertisements',
      '내부 광고 row(ListingAdvertisement) 목록을 검색합니다. listingId, 채널, 상태, 출처, 검색어로 필터링.',
      obj({
        listingId: str('매물 ID'),
        channel: str('광고 채널 slug (naver, asil, zigbang 등)'),
        status: strEnum('광고 상태', ['planned', 'draft', 'active', 'paused', 'ended', 'error']),
        source: strEnum('광고 row 출처', ['manual', 'external_observed', 'cp_sync']),
        search: str('검색어 (채널, URL, 메모, 단지명 등)'),
        sortBy: strEnum('정렬 필드', ['createdAt', 'updatedAt', 'startedAt', 'lastCheckedAt']),
        sortOrder: strEnum('정렬 방향', ['asc', 'desc']),
        ...page,
      }),
      async (a, c) =>
        this.listingAdvertisements.findAll(c.officeId, {
          listingId: a.listingId as string,
          channel: a.channel as string,
          status: a.status as string,
          source: a.source as string,
          search: a.search as string,
          sortBy: a.sortBy as 'createdAt' | 'updatedAt' | 'startedAt' | 'lastCheckedAt',
          sortOrder: a.sortOrder as 'asc' | 'desc',
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'create_listing_advertisement',
      '내부 광고 row(ListingAdvertisement)를 생성합니다. 같은 listingId+channel에 active 광고가 있으면 서비스에서 거절합니다.',
      obj(
        {
          listingId: str('매물 ID'),
          channel: str('광고 채널 slug (naver, asil, zigbang 등)'),
          status: strEnum('광고 상태', ['planned', 'draft', 'active', 'paused', 'ended', 'error']),
          source: strEnum('광고 row 출처', ['manual', 'external_observed', 'cp_sync']),
          advertisedPrice: num('광고 매매가/전세가 (만원)'),
          advertisedDeposit: num('광고 보증금 (만원)'),
          advertisedMonthlyRent: num('광고 월세 (만원)'),
          startedAt: str('광고 시작일 (ISO)'),
          endedAt: str('광고 종료일 (ISO)'),
          url: str('광고 URL'),
          memo: str('광고 메모'),
          externalAdId: str('외부 광고 ID'),
          lastCheckedAt: str('마지막 확인일 (ISO)'),
          lastSyncedAt: str('마지막 동기화일 (ISO)'),
        },
        ['listingId', 'channel'],
      ),
      async (a, c) =>
        this.listingAdvertisements.create(c.officeId, {
          listingId: a.listingId as string,
          channel: a.channel as string,
          status: a.status as string,
          source: a.source as string,
          advertisedPrice: a.advertisedPrice as number | null,
          advertisedDeposit: a.advertisedDeposit as number | null,
          advertisedMonthlyRent: a.advertisedMonthlyRent as number | null,
          startedAt: a.startedAt as string | null,
          endedAt: a.endedAt as string | null,
          url: a.url as string | null,
          memo: a.memo as string | null,
          externalAdId: a.externalAdId as string | null,
          lastCheckedAt: a.lastCheckedAt as string | null,
          lastSyncedAt: a.lastSyncedAt as string | null,
        }),
    );

    this.add(
      'update_listing_advertisement',
      '내부 광고 row(ListingAdvertisement)를 수정합니다. 정상 광고 내림은 status=ended를 사용하세요.',
      obj(
        {
          id: str('광고 row ID'),
          channel: str('광고 채널 slug (naver, asil, zigbang 등)'),
          status: strEnum('광고 상태', ['planned', 'draft', 'active', 'paused', 'ended', 'error']),
          source: strEnum('광고 row 출처', ['manual', 'external_observed', 'cp_sync']),
          advertisedPrice: num('광고 매매가/전세가 (만원)'),
          advertisedDeposit: num('광고 보증금 (만원)'),
          advertisedMonthlyRent: num('광고 월세 (만원)'),
          startedAt: str('광고 시작일 (ISO)'),
          endedAt: str('광고 종료일 (ISO)'),
          url: str('광고 URL'),
          memo: str('광고 메모'),
          externalAdId: str('외부 광고 ID'),
          lastCheckedAt: str('마지막 확인일 (ISO)'),
          lastSyncedAt: str('마지막 동기화일 (ISO)'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingAdvertisements.update(a.id as string, c.officeId, {
          channel: a.channel as string,
          status: a.status as string,
          source: a.source as string,
          advertisedPrice: a.advertisedPrice as number | null,
          advertisedDeposit: a.advertisedDeposit as number | null,
          advertisedMonthlyRent: a.advertisedMonthlyRent as number | null,
          startedAt: a.startedAt as string | null,
          endedAt: a.endedAt as string | null,
          url: a.url as string | null,
          memo: a.memo as string | null,
          externalAdId: a.externalAdId as string | null,
          lastCheckedAt: a.lastCheckedAt as string | null,
          lastSyncedAt: a.lastSyncedAt as string | null,
        }),
    );

    this.add(
      'delete_listing_advertisement',
      '잘못 등록한 내부 광고 row(ListingAdvertisement)를 삭제합니다. 정상 광고 내림은 update_listing_advertisement(status=ended)를 사용하세요.',
      obj({ id: str('광고 row ID') }, ['id']),
      async (a, c) => this.listingAdvertisements.remove(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 내 사무소 외부 광고 인벤토리 (OfficeAdvertisements)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_office_advertisement_groups',
      '내 사무소 외부 광고 그룹(OfficeAdvertisementGroup) 목록을 검색합니다. 네이버 등 외부 플랫폼에서 가져온 "내 광고" 인벤토리. status/source/검색어/미연결 필터 지원.',
      obj({
        source: str('출처 (기본 naver)'),
        status: strEnum('그룹 상태', [
          'needs_unit_confirmation',
          'linked',
          'ignored',
        ]),
        search: str('검색어 (단지명, 동 힌트, 호 힌트, 메모, articleNo, 매물명, 중개사명)'),
        onlyUnlinked: bool('아직 내부 ListingAdvertisement에 연결되지 않은 그룹만 (ignored 제외)'),
        ...page,
      }),
      async (a, c) =>
        this.officeAdvertisements.findAllGroups(c.officeId, {
          source: a.source as string,
          status: a.status as string,
          search: a.search as string,
          onlyUnlinked: a.onlyUnlinked as boolean,
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'update_office_advertisement_group',
      '내 광고 그룹의 상태/메모/호 힌트/동 힌트를 수정합니다. status 값: needs_unit_confirmation | linked | ignored.',
      obj(
        {
          id: str('그룹 ID'),
          status: strEnum('그룹 상태', [
            'needs_unit_confirmation',
            'linked',
            'ignored',
          ]),
          memo: str('메모'),
          hoHint: str('호수 추정 힌트 (예: 1503호)'),
          dongHint: str('동 추정 힌트 (예: 101동)'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.officeAdvertisements.updateGroup(a.id as string, c.officeId, {
          status: a.status as string,
          memo: a.memo as string | null,
          hoHint: a.hoHint as string | null,
          dongHint: a.dongHint as string | null,
        }),
    );

    this.add(
      'link_office_advertisement_group_to_listing_advertisement',
      '내 광고 그룹을 내부 ListingAdvertisement에 연결합니다. 연결 시 그룹 status는 자동으로 linked가 됩니다.',
      obj(
        {
          id: str('그룹 ID'),
          listingAdvertisementId: str('연결할 ListingAdvertisement ID'),
          hoHint: str('호수 힌트 (선택)'),
          memo: str('메모 (선택)'),
        },
        ['id', 'listingAdvertisementId'],
      ),
      async (a, c) =>
        this.officeAdvertisements.linkGroupToListingAdvertisement(
          a.id as string,
          c.officeId,
          {
            listingAdvertisementId: a.listingAdvertisementId as string,
            hoHint: a.hoHint as string | null,
            memo: a.memo as string | null,
          },
        ),
    );

    this.add(
      'batch_upsert_office_advertisements',
      '내 사무소 외부 광고를 그룹 단위로 일괄 upsert합니다. 같은 articleNo가 있는 그룹은 재사용, 없으면 새 그룹 생성. groups는 최대 100개. 각 그룹은 advertisements 1개 이상 필수.',
      obj(
        {
          source: str('출처 (기본 naver). 그룹별 source가 없으면 이 값을 사용.'),
          groups: {
            type: 'array' as const,
            description: '광고 그룹 배열 (최대 100)',
            items: obj(
              {
                source: str('그룹별 출처 override'),
                siteName: str('단지명 (네이버 원본)'),
                buildingName: str('건물명/동명 원본'),
                dongHint: str('동 힌트'),
                hoHint: str('호 힌트'),
                floorInfo: str('층 정보 (저/중/고/숫자)'),
                areaName: str('평형명 (예: 84A)'),
                exclusiveAreaM2: num('전용면적 (m²)'),
                supplyAreaM2: num('공급면적 (m²)'),
                transactionType: strEnum('거래유형', [
                  'sale',
                  'jeonse',
                  'monthly',
                ]),
                memo: str('메모'),
                advertisements: {
                  type: 'array' as const,
                  description: '그룹에 속하는 개별 광고 (1개 이상 필수)',
                  items: obj(
                    {
                      articleNo: str('네이버 등 외부 매물 번호'),
                      sourceUrl: str('원본 URL'),
                      cpPcArticleUrl: str('CP PC 상세 URL'),
                      isMine: bool('내 사무소 광고 여부'),
                      isMain: bool('그룹 대표 광고 여부'),
                      isActive: bool('활성 여부 (기본 true)'),
                      articleName: str('매물명'),
                      realtorName: str('등록 중개사명'),
                      realtorId: str('등록 중개사 ID'),
                      representativeTelNo: str('대표 번호'),
                      price: num('매매가/전세가 (만원)'),
                      deposit: num('보증금 (만원)'),
                      monthlyRent: num('월세 (만원)'),
                      ranking: num('노출 순위'),
                      sameAddrCnt: num('같은 주소 매물 수'),
                      articleConfirmYmd: str('네이버 매물 확인일 (YYYYMMDD)'),
                      seango: bool('선광고 여부'),
                      epju: bool('e편주 여부'),
                      raw: { type: 'object', description: '원본 응답 JSON' },
                    },
                    ['articleNo'],
                  ),
                },
              },
              ['advertisements'],
            ),
          },
        },
        ['groups'],
      ),
      async (a, c) =>
        this.officeAdvertisements.batchUpsert(c.officeId, {
          source: a.source as string,
          groups: a.groups as OfficeAdvertisementBatchGroupDto[],
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 연락처 (Contacts)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_contacts',
      '연락처 목록을 검색합니다. 이름, 전화번호, 이메일로 검색. 태그 필터.',
      obj({ search: str('검색어'), tags: strArr('태그 (VIP, 단골 등)'), ...page }),
      async (a, c) =>
        this.contacts.findAll(c.officeId, {
          search: a.search as string,
          tags: a.tags as string[],
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'get_contact',
      '연락처 상세. 관련 매물, 구매조건, 상담기록 포함.',
      obj({ id: str('연락처 ID') }, ['id']),
      async (a, c) => this.contacts.findOne(a.id as string, c.officeId),
    );

    this.add(
      'find_contact_by_phone',
      '전화번호로 연락처를 검색합니다.',
      obj({ phone: str('전화번호') }, ['phone']),
      async (a, c) => this.contacts.findByPhone(c.officeId, a.phone as string),
    );

    this.add(
      'create_contact',
      '새 연락처를 등록합니다.',
      obj({ name: str('이름'), phone: str('대표 전화번호'), email: str('이메일'), tags: strArr('태그'), memo: str('메모') }, ['name']),
      async (a, c) =>
        this.contacts.create(c.officeId, {
          name: a.name as string,
          phone: a.phone as string,
          email: a.email as string,
          tags: a.tags as string[],
          memo: a.memo as string,
        }),
    );

    this.add(
      'update_contact',
      '연락처 정보를 수정합니다.',
      obj({ id: str('연락처 ID'), name: str('이름'), phone: str('전화'), email: str('이메일'), tags: strArr('태그'), memo: str('메모') }, ['id']),
      async (a, c) =>
        this.contacts.update(a.id as string, c.officeId, {
          name: a.name as string,
          phone: a.phone as string,
          email: a.email as string,
          tags: a.tags as string[],
          memo: a.memo as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 관리매물 (Properties)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_properties',
      '관리매물(Property) 목록. 단지, 지역, 매물유형으로 필터링.',
      obj({ siteId: str('단지 ID'), siteType: str('매물유형'), wardCode: str('법정동코드'), search: str('검색어'), ...page }),
      async (a, c) =>
        this.properties.findAll(c.officeId, {
          siteId: a.siteId as string,
          siteType: a.siteType as string,
          wardCode: a.wardCode as string,
          search: a.search as string,
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'get_property',
      '관리매물 상세. 단지, 호실, 소유자, 세입자, 매물, 상담기록 포함.',
      obj({ id: str('매물 ID') }, ['id']),
      async (a, c) => this.properties.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_property',
      '새 관리매물을 등록합니다. 단지(siteId)는 필수. 호실(unitId)은 건물형(아파트/오피스텔/빌라/상가/생활숙박시설)은 필수, 토지(land)는 금지, 단독/다가구주택(house)은 선택(통건물·호실 모두 가능). 의뢰 메모는 매물(Listing) 단위에서 별도로 기록한다.',
      obj({ siteId: str('단지 ID'), unitId: str('호실 ID') }, ['siteId']),
      async (a, c) =>
        this.properties.create(c.officeId, {
          siteId: a.siteId as string,
          unitId: a.unitId as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 거래 (Deals)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_deals',
      '거래 목록. 매물, 매수인/매도인 정보 포함.',
      obj({}),
      async (_a, c) => this.deals.findAll(c.officeId),
    );

    this.add(
      'get_deal',
      '거래 상세.',
      obj({ id: str('거래 ID') }, ['id']),
      async (a, c) => this.deals.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_deal',
      '새 거래를 시작합니다.',
      obj(
        {
          listingId: str('매물 ID'),
          matchId: str('매칭 ID'),
          transactionType: strEnum('거래 유형', ['sale', 'jeonse', 'monthly']),
          agreedPrice: num('합의된 거래가 / 전세금 (만원)'),
          agreedDeposit: num('합의된 보증금 (만원, 월세)'),
          agreedMonthlyRent: num('합의된 월세 (만원)'),
          specialTerms: str('특약'),
          memo: str('메모'),
        },
        ['listingId'],
      ),
      async (a, c) =>
        this.deals.create(c.officeId, {
          listingId: a.listingId as string,
          matchId: a.matchId as string | undefined,
          transactionType: a.transactionType as string | undefined,
          agreedPrice: a.agreedPrice as number | undefined,
          agreedDeposit: a.agreedDeposit as number | undefined,
          agreedMonthlyRent: a.agreedMonthlyRent as number | undefined,
          specialTerms: a.specialTerms as string | undefined,
          memo: a.memo as string | undefined,
        }),
    );

    this.add(
      'update_deal_stage',
      '거래 단계를 변경합니다. `contracted` 이상 단계는 Contract 가 존재해야 합니다.',
      obj(
        {
          id: str('거래 ID'),
          stage: strEnum('단계', [
            'selection',
            'negotiating',
            'preContract',
            'contracted',
            'settling',
            'completed',
            'closed',
          ]),
          agreedPrice: num('합의가 (만원)'),
          agreedDeposit: num('보증금 (만원)'),
          agreedMonthlyRent: num('월세 (만원)'),
          memo: str('메모'),
        },
        ['id', 'stage'],
      ),
      async (a, c) =>
        this.deals.updateStage(a.id as string, c.officeId, {
          stage: a.stage as string,
          agreedPrice: a.agreedPrice as number | undefined,
          agreedDeposit: a.agreedDeposit as number | undefined,
          agreedMonthlyRent: a.agreedMonthlyRent as number | undefined,
          memo: a.memo as string | undefined,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 구매고객 (Buyer Requirements)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_buyer_requirements',
      '구매 희망조건 목록. 상태, 긴급도, 거래유형, 담당자 필터.',
      obj({
        status: strEnum('상태', ['active', 'matched', 'completed', 'inactive']),
        urgency: strEnum('긴급도', ['urgent', 'normal', 'flexible']),
        transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        assignedToId: str('담당자 ID'),
        ...page,
      }),
      async (a, c) =>
        this.buyerReqs.findAll(c.officeId, {
          status: a.status as string,
          urgency: a.urgency as string,
          transactionType: a.transactionType as string,
          assignedToId: a.assignedToId as string,
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'get_buyer_requirement',
      '구매조건 상세. 매칭, 상담기록 포함.',
      obj({ id: str('ID') }, ['id']),
      async (a, c) => this.buyerReqs.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_buyer_requirement',
      '새 구매 희망조건을 등록합니다.',
      obj({
        contactId: str('연락처 ID'),
        transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        siteTypes: strArr('희망 유형 (apartment, villa 등)'),
        priceMin: num('최소 예산 (만원)'),
        priceMax: num('최대 예산 (만원)'),
        areaMin: num('최소 면적 (m²)'),
        areaMax: num('최대 면적 (m²)'),
        urgency: strEnum('긴급도', ['urgent', 'normal', 'flexible']),
        mustConditions: strArr('필수 조건'),
        preferConditions: strArr('선호 조건'),
        memo: str('메모'),
      }, ['contactId']),
      async (a, c) =>
        this.buyerReqs.create(c.officeId, {
          contactId: a.contactId as string,
          transactionType: a.transactionType as string,
          siteTypes: a.siteTypes as string[],
          priceMin: a.priceMin as number,
          priceMax: a.priceMax as number,
          areaMin: a.areaMin as number,
          areaMax: a.areaMax as number,
          urgency: a.urgency as string,
          mustConditions: a.mustConditions as string[],
          preferConditions: a.preferConditions as string[],
          memo: a.memo as string,
        }),
    );

    this.add(
      'find_due_buyer_contacts',
      '연락 예정일이 지난 구매고객 목록을 조회합니다.',
      obj({}),
      async (_a, c) => this.buyerReqs.findDueContacts(c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 상담 (Consultations)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_consultations',
      '상담기록 목록. 연락처, 매물, 매칭별 필터.',
      obj({
        contactId: str('연락처 ID'),
        propertyId: str('매물 ID'),
        listingIntakeId: str('의뢰 ID'),
        listingId: str('리스팅 ID'),
        ...page,
      }),
      async (a, c) =>
        this.consultations.findAll(c.officeId, {
          contactId: a.contactId as string,
          propertyId: a.propertyId as string,
          listingIntakeId: a.listingIntakeId as string,
          listingId: a.listingId as string,
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'get_consultation',
      '상담기록 상세.',
      obj({ id: str('상담 ID') }, ['id']),
      async (a, c) => this.consultations.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_consultation',
      '새 상담기록을 작성합니다.',
      obj({
        contactId: str('연락처 ID'),
        type: strEnum('상담유형', ['phone', 'visit', 'online']),
        content: str('메모 내용'),
        propertyId: str('관련 매물 ID'),
        listingIntakeId: str('관련 의뢰 ID'),
        listingId: str('관련 리스팅 ID'),
        matchId: str('관련 매칭 ID'),
        buyerReqId: str('관련 구매조건 ID'),
      }, ['contactId', 'type', 'content']),
      async (a, c) =>
        this.consultations.create(c.officeId, c.userId, {
          contactId: a.contactId as string,
          type: a.type as string,
          content: a.content as string,
          propertyId: a.propertyId as string,
          listingIntakeId: a.listingIntakeId as string,
          listingId: a.listingId as string,
          matchId: a.matchId as string,
          buyerReqId: a.buyerReqId as string,
        }),
    );

    this.add(
      'get_recent_consultations',
      '최근 상담기록을 조회합니다.',
      obj({ limit: num('조회 수 (기본 10)') }),
      async (a, c) => this.consultations.getRecent(c.officeId, (a.limit as number) ?? 10),
    );

    // ═══════════════════════════════════════════════════════════
    // 매칭 (Matches)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_matches',
      '매칭 파이프라인 목록.',
      obj({}),
      async (_a, c) => this.matches.findAll(c.officeId),
    );

    this.add(
      'get_match',
      '매칭 상세.',
      obj({ id: str('매칭 ID') }, ['id']),
      async (a, c) => this.matches.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_match',
      '매물과 구매조건을 매칭합니다.',
      obj({ listingId: str('매물 ID'), buyerReqId: str('구매조건 ID'), memo: str('메모') }, ['listingId', 'buyerReqId']),
      async (a, c) =>
        this.matches.create(c.officeId, {
          listingId: a.listingId as string,
          buyerReqId: a.buyerReqId as string,
          memo: a.memo as string,
        }),
    );

    this.add(
      'update_match_stage',
      '매칭 단계를 변경합니다.',
      obj({ id: str('매칭 ID'), stage: strEnum('단계', ['suggested', 'buyerContacted', 'viewing', 'ownerContacted', 'negotiating', 'dealCreated', 'closed']), memo: str('메모') }, ['id', 'stage']),
      async (a, c) =>
        this.matches.updateStage(a.id as string, c.officeId, {
          stage: a.stage as string,
          memo: a.memo as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 계약 (Contracts)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_contracts',
      '계약 목록.',
      obj({}),
      async (_a, c) => this.contracts.findAll(c.officeId),
    );

    this.add(
      'get_contract',
      '계약 상세. 금액 스케줄, 당사자, 임대기간 포함.',
      obj({ id: str('계약 ID') }, ['id']),
      async (a, c) => this.contracts.findOne(a.id as string, c.officeId),
    );

    this.add(
      'prepare_sale_contract_draft',
      '주거용 매매계약서의 불변 revision을 만들고 AI 검토함에 정확한 버전 승인을 요청합니다. 계약·매물·당사자·중개사무소 정보를 자동 입력하며, 승인 전에는 현재 계약 문서를 덮어쓰지 않습니다.',
      obj(
        {
          contractId: str('매매 Contract ID'),
          agentRunId: str(
            'wakeup을 claim해 실행 중이면 AgentRun ID. revision과 실행 이력을 연결합니다.',
          ),
          actualAgreementAt: str('실제 계약 체결일 (YYYY-MM-DD)'),
          conditions: str('계약 이행 조건'),
          specialTerms: str('특약사항'),
          rightsTransferDetails: str('소유권 이전 및 권리관계 정리 내용'),
          explanationDeliveredAt: str(
            '중개대상물 확인·설명서 교부일 (YYYY-MM-DD)',
          ),
        },
        ['contractId'],
      ),
      async (a, c) => this.prepareSaleContractReview(a, c),
    );

    this.add(
      'validate_sale_contract_draft',
      '저장된 주거용 매매계약서 구조화 초안을 읽기 전용으로 검증합니다. 필수값 오류와 공적장부·연락처 확인 경고를 반환하며 문서를 수정하거나 완료 상태로 전환하지 않습니다.',
      obj({ contractId: str('매매 Contract ID') }, ['contractId']),
      async (a, c) =>
        this.contracts.validateSaleContractDraft(
          a.contractId as string,
          c.officeId,
        ),
    );

    // ═══════════════════════════════════════════════════════════
    // 업무 (Tasks)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_tasks',
      '업무 목록.',
      obj({}),
      async (_a, c) => this.tasks.findAll(c.officeId),
    );

    this.add(
      'get_task',
      '업무 상세.',
      obj({ id: str('업무 ID') }, ['id']),
      async (a, c) => this.tasks.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_task',
      '새 업무를 생성합니다.',
      obj({
        title: str('제목'),
        content: str('내용'),
        source: strEnum('출처', ['manual', 'system', 'ai']),
        priority: str('우선순위'),
        category: str('카테고리'),
        dueDate: str('마감일 (ISO)'),
        assignedToId: str('담당자 ID'),
        contactId: str('관련 연락처 ID'),
        propertyId: str('관련 매물 ID'),
        listingIntakeId: str('관련 의뢰 ID'),
        listingId: str('관련 리스팅 ID'),
        consultationId: str('관련 상담 ID'),
        buyerReqId: str('관련 구매조건 ID'),
        matchId: str('관련 매칭 ID'),
        dealId: str('관련 거래 ID'),
        contractId: str('관련 계약 ID'),
      }, ['title']),
      async (a, c) =>
        this.tasks.create(c.officeId, {
          title: a.title as string,
          content: a.content as string,
          source: (a.source as string) ?? 'ai',
          priority: a.priority as string,
          category: a.category as string,
          dueDate: a.dueDate as string,
          assignedToId: a.assignedToId as string,
          contactId: a.contactId as string,
          propertyId: a.propertyId as string,
          listingIntakeId: a.listingIntakeId as string,
          listingId: a.listingId as string,
          consultationId: a.consultationId as string,
          buyerReqId: a.buyerReqId as string,
          matchId: a.matchId as string,
          dealId: a.dealId as string,
          contractId: a.contractId as string,
        }, c.userId),
    );

    this.add(
      'update_task',
      '업무를 수정합니다.',
      obj({ id: str('업무 ID'), title: str('제목'), content: str('내용'), status: str('상태'), priority: str('우선순위'), dueDate: str('마감일') }, ['id']),
      async (a, c) =>
        this.tasks.update(a.id as string, c.officeId, {
          title: a.title as string,
          content: a.content as string,
          status: a.status as string,
          priority: a.priority as string,
          dueDate: a.dueDate as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 캘린더 (Calendar Events)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_calendar_events',
      '캘린더 일정을 조회합니다. 기간, 유형, 담당자 필터.',
      obj({ start: str('시작일 (ISO)'), end: str('종료일 (ISO)'), type: str('유형'), userId: str('담당자 ID') }),
      async (a, c) =>
        this.calendarEvents.findAll(c.officeId, {
          start: a.start as string,
          end: a.end as string,
          type: a.type as string,
          userId: a.userId as string,
        }),
    );

    this.add(
      'create_calendar_event',
      '새 일정을 등록합니다.',
      obj({
        title: str('제목'),
        description: str('설명'),
        type: strEnum('유형', ['viewing', 'contract', 'meeting', 'task', 'general']),
        allDay: bool('종일 여부'),
        start: str('시작 (ISO)'),
        end: str('종료 (ISO)'),
        contactId: str('연락처 ID'),
        propertyId: str('매물 ID'),
        listingIntakeId: str('의뢰 ID'),
        listingId: str('리스팅 ID'),
        dealId: str('거래 ID'),
      }, ['title', 'start']),
      async (a, c) =>
        this.calendarEvents.create(c.officeId, c.userId, {
          title: a.title as string,
          description: a.description as string,
          type: a.type as string,
          allDay: a.allDay as boolean,
          start: a.start as string,
          end: a.end as string,
          contactId: a.contactId as string,
          propertyId: a.propertyId as string,
          listingIntakeId: a.listingIntakeId as string,
          listingId: a.listingId as string,
          dealId: a.dealId as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 단지/동/호실 (Sites / Dongs / Units)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_sites',
      '단지/건물 목록.',
      obj({}),
      async (_a, c) => this.sites.findAll(c.officeId),
    );

    this.add(
      'get_site',
      '단지 상세. 동/호실/평형 정보 포함.',
      obj({ id: str('단지 ID') }, ['id']),
      async (a, c) => this.sites.findOne(a.id as string, c.officeId),
    );

    this.add(
      'find_dongs',
      '단지의 동 목록.',
      obj({ siteId: str('단지 ID') }, ['siteId']),
      async (a, c) => this.dongs.findAll(c.officeId, a.siteId as string),
    );

    this.add(
      'find_units',
      '호실 목록. 단지 또는 동으로 필터.',
      obj({ siteId: str('단지 ID'), dongId: str('동 ID') }),
      async (a, c) =>
        this.units.findAll(c.officeId, {
          siteId: a.siteId as string,
          dongId: a.dongId as string,
        }),
    );

    this.add(
      'get_unit',
      '호실 상세.',
      obj({ id: str('호실 ID') }, ['id']),
      async (a, c) => this.units.findOne(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 관리단지 즐겨찾기 (Office Sites)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_office_sites',
      '관리 단지(즐겨찾기) 목록.',
      obj({}),
      async (_a, c) => this.officeSites.findAll(c.officeId),
    );

    this.add(
      'search_central_sites',
      '공공 단지 데이터를 검색합니다. 단지명, 주소로 검색.',
      obj({ query: str('검색어') }, ['query']),
      async (a) => this.officeSites.searchCentralSites(a.query as string),
    );

    this.add(
      'add_office_site',
      '단지를 관리 목록에 추가합니다.',
      obj({ siteId: str('단지 ID'), memo: str('메모') }, ['siteId']),
      async (a, c) =>
        this.officeSites.add(c.officeId, {
          siteId: a.siteId as string,
          memo: a.memo as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 매물 관련인 (Property Contacts)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_property_contacts',
      '매물의 관련인(소유자, 대리인 등) 목록.',
      obj({ propertyId: str('매물 ID') }, ['propertyId']),
      async (a, c) =>
        this.propertyContacts.findByProperty(c.officeId, a.propertyId as string),
    );

    this.add(
      'create_property_contact',
      '매물에 관련인을 추가합니다.',
      obj({
        contactId: str('연락처 ID'),
        propertyId: str('매물 ID'),
        role: strEnum('역할', ['owner', 'co_owner', 'representative', 'lawyer', 'tax_agent']),
        shareRatio: num('지분비율 (%)'),
        isResident: bool('실거주 여부'),
        isPrimary: bool('주 연락처'),
        memo: str('메모'),
      }, ['contactId', 'propertyId', 'role']),
      async (a, c) =>
        this.propertyContacts.create(c.officeId, {
          contactId: a.contactId as string,
          propertyId: a.propertyId as string,
          role: a.role as string,
          shareRatio: a.shareRatio as number,
          isResident: a.isResident as boolean,
          isPrimary: a.isPrimary as boolean,
          memo: a.memo as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 연락처 관계 (Contact Relations)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_contact_relations',
      '연락처의 관계 목록 (가족, 법무사 등).',
      obj({ contactId: str('연락처 ID') }, ['contactId']),
      async (a, c) =>
        this.contactRelations.findByContact(c.officeId, a.contactId as string),
    );

    // ═══════════════════════════════════════════════════════════
    // 세입자 (Tenants)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_tenants',
      '매물의 세입자 목록.',
      obj({ propertyId: str('매물 ID') }, ['propertyId']),
      async (a, c) =>
        this.tenants.findByProperty(c.officeId, a.propertyId as string),
    );

    this.add(
      'find_expiring_contracts',
      '임대 계약 만료 임박 세입자 목록.',
      obj({ withinDays: num('일수 (기본 90)') }),
      async (a, c) =>
        this.tenants.findExpiringContracts(c.officeId, (a.withinDays as number) ?? 90),
    );

    this.add(
      'create_tenant',
      '세입자를 등록합니다.',
      obj({
        propertyId: str('매물 ID'),
        contactId: str('연락처 ID'),
        deposit: num('보증금 (만원)'),
        monthlyRent: num('월세 (만원)'),
        contractStart: str('계약 시작일'),
        contractEnd: str('계약 종료일'),
        memo: str('메모'),
      }, ['propertyId', 'contactId']),
      async (a, c) =>
        this.tenants.create(c.officeId, {
          propertyId: a.propertyId as string,
          contactId: a.contactId as string,
          deposit: a.deposit as number,
          monthlyRent: a.monthlyRent as number,
          contractStart: a.contractStart as string,
          contractEnd: a.contractEnd as string,
          memo: a.memo as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 직원 (Employees) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_employees',
      '직원 목록.',
      obj({}),
      async (_a, c) => this.employees.findAll(c.officeId),
    );

    this.add(
      'get_employee',
      '직원 상세.',
      obj({ id: str('직원 ID') }, ['id']),
      async (a, c) => this.employees.findOne(a.id as string, c.officeId),
    );

    this.add(
      'get_employee_performance',
      '직원의 실적 정보를 조회합니다.',
      obj({ id: str('직원 ID') }, ['id']),
      async (a, c) => this.employees.getPerformance(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 사무소 (Office) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'get_office',
      '현재 사무소 정보를 조회합니다.',
      obj({}),
      async (_a, c) => this.offices.getMe(c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 외부매물 광고노트 (External Listings) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_external_listing_groups',
      '외부 매물(광고노트) 그룹 목록. 단지/거래유형/상태 필터.',
      obj({ siteId: str('단지 ID'), transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']), status: str('상태'), search: str('검색어') }),
      async (a, c) =>
        this.externalListings.findAllGroups(c.officeId, {
          siteId: a.siteId as string,
          transactionType: a.transactionType as string,
          status: a.status as string,
          search: a.search as string,
        }),
    );

    this.add(
      'get_external_listing_group',
      '외부 매물 그룹 상세. 개별 매물 목록 포함.',
      obj({ id: str('그룹 ID') }, ['id']),
      async (a, c) => this.externalListings.findGroupById(a.id as string, c.officeId),
    );

    this.add(
      'update_external_listing_group',
      '외부 매물 그룹의 호수 추정, 메모, 상태를 수정합니다.',
      obj({
        id: str('그룹 ID'),
        unitId: str('매칭할 호실 ID (null이면 해제)'),
        inferredHo: str('추정 호수 (예: "1503호")'),
        memo: str('메모'),
        status: strEnum('상태', ['unmatched', 'matched', 'verified', 'on_hold']),
      }, ['id']),
      async (a, c) =>
        this.externalListings.updateGroup(a.id as string, c.officeId, {
          unitId: a.unitId as string | null,
          inferredHo: a.inferredHo as string | null,
          memo: a.memo as string | null,
          status: a.status as string,
        }),
    );

    this.add(
      'batch_upsert_external_listings',
      '외부 매물(네이버 등 크롤링 데이터)을 일괄 적재합니다. 있으면 업데이트, 없으면 생성. 그룹 자동 매칭.',
      obj({
        source: str('데이터 소스 (naver, kb, manual 등)'),
        siteId: str('단지 ID'),
        transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        listings: {
          type: 'array',
          description: '매물 목록',
          items: {
            type: 'object',
            properties: {
              articleNo: str('매물번호 (필수)'),
              price: num('가격 (만원)'),
              deposit: num('보증금 (만원)'),
              monthlyRent: num('월세 (만원)'),
              articleName: str('매물명'),
              articleFeatureDesc: str('특징 설명'),
              floorInfo: str('층 정보'),
              exclusiveAreaM2: num('전용면적 (m²)'),
              supplyAreaM2: num('공급면적 (m²)'),
              direction: str('향'),
              realtorName: str('중개사명'),
              representativeTelNo: str('대표번호'),
              representativeArticleNo: str('대표 매물번호 (sameAddr 그룹)'),
              buildingName: str('동명'),
              areaName: str('평형명 (84A 등)'),
              sourceUrl: str('원본 URL'),
              raw: { type: 'object', description: '원본 응답 전체 (JSONB 보존)' },
            },
            required: ['articleNo'],
          },
        },
      }, ['source', 'siteId', 'transactionType', 'listings']),
      async (a, c) =>
        this.externalListings.batchUpsert(c.officeId, {
          source: a.source as string,
          siteId: a.siteId as string,
          transactionType: a.transactionType as string,
          listings: a.listings as BatchListingItem[],
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 수수료/캐시플로우 (Finance) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_commission_payments',
      '수수료 수금 내역. 사무소 전체 또는 거래별.',
      obj({ dealId: str('거래 ID'), status: str('상태 필터') }),
      async (a, c) =>
        a.dealId
          ? this.commissionPayments.listByDeal(c.officeId, a.dealId as string)
          : this.commissionPayments.listByOffice(c.officeId, {
              status: a.status as string,
            }),
    );

    this.add(
      'get_cashflow_summary',
      '월별 캐시플로우 요약 (수금, 고정비, 순이익).',
      obj({ year: num('연도'), month: num('월') }, ['year', 'month']),
      async (a, c) =>
        this.cashflow.getSummary(c.officeId, a.year as number, a.month as number),
    );

    // ═══════════════════════════════════════════════════════════
    // 공적장부 (Public Documents) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_public_documents',
      '공적장부 발급 이력.',
      obj({ type: str('장부 유형') }),
      async (a, c) =>
        this.publicDocs.listAll(c.officeId, { type: a.type as string }),
    );

    this.add(
      'find_public_documents_by_property',
      '특정 매물의 공적장부.',
      obj({ propertyId: str('매물 ID') }, ['propertyId']),
      async (a, c) =>
        this.publicDocs.listByProperty(c.officeId, a.propertyId as string),
    );

    // ═══════════════════════════════════════════════════════════
    // 매물 사진 (Property Photos) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_property_photos',
      '매물의 사진 목록.',
      obj({ propertyId: str('매물 ID') }, ['propertyId']),
      async (a, c) =>
        this.propertyPhotos.listByProperty(c.officeId, a.propertyId as string),
    );

    // ═══════════════════════════════════════════════════════════
    // AI 제안 (Proposals) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_proposals',
      'AI 제안 목록. 상태/우선순위/유형 필터.',
      obj({ status: str('상태'), priority: str('우선순위'), type: str('유형') }),
      async (a, c) =>
        this.proposals.list(c.officeId, {
          status: a.status as ProposalStatus | undefined,
          priority: a.priority as string,
          type: a.type as string,
        }),
    );

    this.add(
      'get_proposal',
      'AI 제안 상세.',
      obj({ id: str('제안 ID') }, ['id']),
      async (a, c) => this.proposals.getById(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // Agent Control Plane — durable wakeup/run/activity protocol
    // ═══════════════════════════════════════════════════════════
    this.add(
      'agent_start_session',
      '사람이 책임지는 업무 문맥에 지속형 AI 세션을 생성하거나 기존 세션을 재사용합니다.',
      obj(
        {
          agentKey: str('AI delegate 식별자 (예: contract-writer)'),
          taskKey: str('업무별 안정 키'),
          taskId: str('사람 담당자가 지정된 ERP Task ID'),
          context: { type: 'object', description: '세션 재개용 도메인 ID 문맥' },
          plan: { type: 'array', description: '선택적 실행 계획' },
        },
        ['agentKey', 'taskKey'],
      ),
      async (a, c) =>
        this.controlPlane.getOrCreateSession(c.officeId, {
          agentKey: a.agentKey as string,
          adapter: 'mcp',
          taskKey: a.taskKey as string,
          taskId: a.taskId as string | undefined,
          context: (a.context ?? {}) as Prisma.InputJsonValue,
          plan: a.plan as Prisma.InputJsonValue | undefined,
        }),
    );

    this.add(
      'agent_list_sessions',
      '현재 사무소의 AI 세션과 pending/active/awaiting_input 상태를 조회합니다.',
      obj({
        status: strEnum('세션 상태', [
          'pending',
          'active',
          'awaiting_input',
          'complete',
          'error',
          'stale',
        ]),
        agentKey: str('AI delegate 식별자'),
        taskId: str('ERP Task ID'),
        limit: num('최대 개수'),
      }),
      async (a, c) =>
        this.controlPlane.listSessions(c.officeId, {
          status: a.status as AgentSessionStatus | undefined,
          agentKey: a.agentKey as string | undefined,
          taskId: a.taskId as string | undefined,
          limit: a.limit as number | undefined,
        }),
    );

    this.add(
      'agent_list_wakeups',
      '승인·코멘트·이벤트로 생성된 durable wakeup을 조회합니다.',
      obj({
        sessionId: str('AgentSession ID'),
        status: strEnum('wakeup 상태', [
          'queued',
          'claimed',
          'completed',
          'failed',
          'cancelled',
        ]),
        source: str('approval, comment, schedule, event 등'),
        limit: num('최대 개수'),
      }),
      async (a, c) =>
        this.controlPlane.listWakeups(c.officeId, {
          sessionId: a.sessionId as string | undefined,
          status: a.status as AgentWakeupStatus | undefined,
          source: a.source as string | undefined,
          limit: a.limit as number | undefined,
        }),
    );

    this.add(
      'agent_claim_wakeup',
      '가장 오래된 wakeup 하나를 lease로 원자적 claim하고 새 AgentRun을 시작합니다. 대기 작업이 없으면 null입니다.',
      obj({
        source: str('선택적 source 필터'),
        leaseMs: num('lease 길이(ms), 1초~1시간'),
      }),
      async (a, c) =>
        this.controlPlane.claimNextWakeup(
          c.officeId,
          `mcp:${c.userId}`,
          {
            source: a.source as string | undefined,
            leaseMs: a.leaseMs as number | undefined,
          },
        ),
    );

    this.add(
      'agent_renew_run',
      '장시간 실행 중인 AgentRun의 소유 lease를 연장합니다.',
      obj(
        { runId: str('AgentRun ID'), leaseMs: num('새 lease 길이(ms)') },
        ['runId'],
      ),
      async (a, c) =>
        this.controlPlane.renewRunLease(
          c.officeId,
          a.runId as string,
          `mcp:${c.userId}`,
          a.leaseMs as number | undefined,
        ),
    );

    this.add(
      'agent_append_activity',
      '수정 가능한 댓글과 분리된 append-only AI 실행 활동을 기록합니다.',
      obj(
        {
          sessionId: str('AgentSession ID'),
          runId: str('AgentRun ID'),
          type: strEnum('활동 유형', [
            'thought',
            'action',
            'elicitation',
            'response',
            'error',
            'system',
          ]),
          message: str('사람이 읽을 수 있는 요약'),
          payload: { type: 'object', description: '구조화 활동 데이터' },
          ephemeral: bool('UI에서 축약 가능한 중간 활동 여부'),
        },
        ['sessionId', 'type'],
      ),
      async (a, c) => {
        const sessionId = a.sessionId as string;
        const runId = a.runId as string | undefined;
        if (runId) {
          await this.assertMcpRunOwnership(
            c.officeId,
            c.userId,
            sessionId,
            runId,
          );
        }
        return this.controlPlane.appendActivity(c.officeId, {
          sessionId,
          runId,
          type: a.type as AgentActivityType,
          message: a.message as string | undefined,
          payload: a.payload as Prisma.InputJsonValue | undefined,
          ephemeral: a.ephemeral as boolean | undefined,
        });
      },
    );

    this.add(
      'agent_list_activities',
      '세션의 append-only 활동 스트림을 sequence 순서로 조회합니다.',
      obj(
        {
          sessionId: str('AgentSession ID'),
          runId: str('AgentRun ID'),
          afterSequence: num('이 sequence 이후만 조회'),
          limit: num('최대 개수'),
        },
        ['sessionId'],
      ),
      async (a, c) =>
        this.controlPlane.listActivities(
          c.officeId,
          a.sessionId as string,
          {
            runId: a.runId as string | undefined,
            afterSequence: a.afterSequence as number | undefined,
            limit: a.limit as number | undefined,
          },
        ),
    );

    this.add(
      'agent_complete_run',
      '소유한 AgentRun을 completed/awaiting_input/failed로 마감하고 wakeup·세션 상태를 함께 전이합니다.',
      obj(
        {
          runId: str('AgentRun ID'),
          outcome: strEnum('실행 결과', [
            'completed',
            'awaiting_input',
            'failed',
          ]),
          result: { type: 'object', description: '실행 결과' },
          usage: { type: 'object', description: '토큰/비용 등 사용량' },
          error: str('failed 사유'),
          waitingReason: str('awaiting_input 사유'),
        },
        ['runId', 'outcome'],
      ),
      async (a, c) =>
        this.controlPlane.completeRun(
          c.officeId,
          a.runId as string,
          `mcp:${c.userId}`,
          {
            outcome: a.outcome as CompleteAgentRunOutcome,
            result: a.result as Prisma.InputJsonValue | undefined,
            usage: a.usage as Prisma.InputJsonValue | undefined,
            error: a.error as string | undefined,
            waitingReason: a.waitingReason as string | undefined,
          },
        ),
    );

    // ═══════════════════════════════════════════════════════════
    // AI 검토함 (Inbox / EntityDraft) — 사람의 확인·승인 surface
    //
    // 1) AI 가 초안 생성 → inbox_create_draft
    // 2) 사장님이 업무함에서 확인/승인 또는 코멘트로 재작성 요청
    //    - 코멘트 달리면 status='processing' 으로 자동 전이
    // 3) 서버가 comment/approval wakeup을 영속화
    // 4) MCP agent가 agent_claim_wakeup으로 즉시 재개하고 lease를 갱신
    // 5) 새 artifact revision 또는 실행 결과를 제출한 뒤 AgentRun을 마감
    // 기존 inbox_list_processing/inbox_claim은 레거시 executor 복구용으로 유지
    // ═══════════════════════════════════════════════════════════

    this.add(
      'inbox_list',
      'AI 검토함 목록 조회. scope로 검토 필요, AI 작업 중, 실행 대기, 완료 항목을 필터링합니다.',
      obj({
        scope: strEnum('조회 범위', [
          'pending',
          'processing',
          'approved',
          'resolved',
          'all',
        ]),
        decisionMode: strEnum('확인/승인 필터', ['confirm', 'approval']),
        priority: strEnum('우선순위', ['urgent', 'normal', 'low']),
        category: str('카테고리 (contract_draft, ad_takedown 등)'),
        limit: num('최대 개수 (기본 100)'),
      }),
      async (a, c) =>
        this.inbox.list(c.officeId, {
          scope: a.scope as
            | 'pending'
            | 'processing'
            | 'approved'
            | 'resolved'
            | 'all'
            | undefined,
          decisionMode: a.decisionMode as string,
          priority: a.priority as DraftPriority | undefined,
          category: a.category as string,
          limit: a.limit as number,
        }),
    );

    this.add(
      'inbox_get',
      'AI 검토함 항목 상세. 사람 담당자, AI 세션, 수정 요청 코멘트를 포함합니다.',
      obj({ id: str('draft ID') }, ['id']),
      async (a, c) => this.inbox.getById(a.id as string, c.officeId),
    );

    this.add(
      'inbox_create_draft',
      'AI 검토함에 제안 초안을 등록합니다. decisionMode=confirm 은 결과물 확인, approval 은 행동 사전 승인입니다. 가능하면 agentSessionId/requestedByRunId를 넣어 승인·코멘트가 원래 AI 실행을 깨우게 하세요.',
      obj(
        {
          entityType: strEnum('대상 엔티티', [
            'listing',
            'contract',
            'task',
            'commission_payment',
            'match',
            'consultation',
            'property',
            'action',
          ]),
          operation: strEnum('작업', ['create', 'update', 'delete', 'action']),
          entityId: str('기존 엔티티 ID (update/delete 일 때)'),
          proposedChanges: {
            type: 'object',
            description:
              '제안된 변경 내용 (DB 저장 형식). 렌더링 메타는 _ 접두 키에 넣으면 저장 전에 제거됨.',
          },
          category: str(
            '업무 카테고리 (contract_draft, ad_takedown, post_naver_ad, naver_ad_repost, followup_task 등)',
          ),
          title: str('카드 제목'),
          summary: str('한 줄 요약'),
          reasoning: str('제안 근거'),
          priority: strEnum('우선순위', ['urgent', 'normal', 'low']),
          decisionMode: strEnum('결정 모드', ['confirm', 'approval']),
          executor: strEnum('실행자', ['server', 'agent', 'manual']),
          generatedBy: str(
            '생성 주체 식별자 (예: "mcp:claude", "rule:ad_takedown:v1")',
          ),
          dedupeKey: str('중복 방지 키 (같은 officeId + dedupeKey 활성 건이 있으면 생성 스킵)'),
          expiresAt: str('만료 일시 (ISO 8601)'),
          agentSessionId: str('이 검토를 요청한 AgentSession ID'),
          requestedByRunId: str('이 검토를 요청한 AgentRun ID'),
          listingId: str('연결된 매물 ID'),
          listingIntakeId: str('연결된 매물 의뢰 ID'),
          propertyId: str('연결된 호실 ID'),
          contactId: str('연결된 연락처 ID'),
          dealId: str('연결된 거래 ID'),
          contractId: str('연결된 계약 ID'),
          paymentId: str('연결된 수금 ID'),
        },
        [
          'entityType',
          'operation',
          'proposedChanges',
          'category',
          'title',
          'summary',
          'decisionMode',
          'generatedBy',
        ],
      ),
      async (a, c) => {
        const agentSessionId = a.agentSessionId as string | undefined;
        const requestedByRunId = a.requestedByRunId as string | undefined;
        if (requestedByRunId) {
          if (!agentSessionId) {
            throw new BadRequestException(
              'requestedByRunId에는 agentSessionId가 필요합니다.',
            );
          }
          await this.assertMcpRunOwnership(
            c.officeId,
            c.userId,
            agentSessionId,
            requestedByRunId,
          );
        }
        return this.inbox.create({
          officeId: c.officeId,
          entityType: a.entityType as DraftEntityType,
          operation: a.operation as DraftOperation,
          entityId: a.entityId as string | undefined,
          proposedChanges: a.proposedChanges as Record<string, unknown>,
          category: a.category as string,
          title: a.title as string,
          summary: a.summary as string,
          reasoning: a.reasoning as string | undefined,
          priority: a.priority as DraftPriority | undefined,
          decisionMode: a.decisionMode as DraftDecisionMode,
          executor: a.executor as DraftExecutor | undefined,
          generatedBy: a.generatedBy as string,
          dedupeKey: a.dedupeKey as string | undefined,
          expiresAt: a.expiresAt ? new Date(a.expiresAt as string) : undefined,
          agentSessionId,
          requestedByRunId,
          listingId: a.listingId as string | undefined,
          listingIntakeId: a.listingIntakeId as string | undefined,
          propertyId: a.propertyId as string | undefined,
          contactId: a.contactId as string | undefined,
          dealId: a.dealId as string | undefined,
          contractId: a.contractId as string | undefined,
          paymentId: a.paymentId as string | undefined,
        });
      },
    );

    this.add(
      'inbox_list_processing',
      '레거시/복구용 processing 검토 요청 목록입니다. 정상 흐름은 agent_claim_wakeup으로 코멘트 신호를 즉시 받습니다.',
      obj({ limit: num('최대 개수 (기본 20)') }),
      async (a, c) =>
        this.inbox.listProcessing(c.officeId, a.limit as number),
    );

    this.add(
      'inbox_submit_revision',
      '일반 제안의 AI 재작성 결과를 제출합니다. 불변 계약서 artifact에는 사용할 수 없으며 prepare_sale_contract_draft로 새 revision을 만들어야 합니다.',
      obj(
        {
          id: str('draft ID'),
          proposedChanges: {
            type: 'object',
            description: '재작성된 제안 내용 전체 (기존 값 완전 교체).',
          },
          readCommentIds: strArr(
            '읽음 처리할 코멘트 ID 배열. 생략 시 해당 draft 의 모든 미읽음 코멘트가 읽음 처리됨.',
          ),
        },
        ['id', 'proposedChanges'],
      ),
      async (a, c) =>
        this.inbox.submitRevision(a.id as string, c.officeId, {
          proposedChanges: a.proposedChanges as Record<string, unknown>,
          readCommentIds: a.readCommentIds as string[] | undefined,
        }),
    );

    this.add(
      'inbox_list_agent_pending',
      '레거시 agent-executor 승인 작업 목록입니다. 세션형 작업은 agent_claim_wakeup을 사용합니다.',
      obj({ limit: num('최대 개수 (기본 20)') }),
      async (a, c) =>
        this.inbox.listAgentPending(c.officeId, a.limit as number),
    );

    this.add(
      'inbox_claim',
      'Agent가 승인된 작업을 lease로 집어감. approved → executing으로 전이하며 동시 실행과 중간 중단을 방지한다.',
      obj({ id: str('draft ID') }, ['id']),
      async (a, c) =>
        this.inbox.claimForAgent(
          a.id as string,
          c.officeId,
          `mcp:${c.userId}`,
        ),
    );

    this.add(
      'inbox_renew_claim',
      '긴 작업을 수행 중인 Agent가 현재 draft lease를 연장한다.',
      obj({ id: str('draft ID') }, ['id']),
      async (a, c) =>
        this.inbox.renewAgentClaim(
          a.id as string,
          c.officeId,
          `mcp:${c.userId}`,
        ),
    );

    this.add(
      'inbox_report_execution',
      'Agent 가 실행 결과를 보고. executing → executed (성공) 또는 failed (실패). 실패 시 executionError 에 이유를 남긴다.',
      obj(
        {
          id: str('draft ID'),
          status: strEnum('실행 결과', ['executed', 'failed']),
          resultEntityId: str('실행 결과 생성/수정된 엔티티 ID'),
          executionError: str('실패 사유 (status=failed 일 때)'),
        },
        ['id', 'status'],
      ),
      async (a, c) =>
        this.inbox.reportAgentExecution(a.id as string, c.officeId, {
          status: a.status as 'executed' | 'failed',
          claimedBy: `mcp:${c.userId}`,
          resultEntityId: a.resultEntityId as string | undefined,
          executionError: a.executionError as string | undefined,
        }),
    );
  }
}
