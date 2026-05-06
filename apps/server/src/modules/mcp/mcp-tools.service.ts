import { Injectable } from '@nestjs/common';
import { ListingsService } from '../listings/listings.service';
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
import { ProposalService } from '../agent/proposal/proposal.service';
import type { ProposalStatus } from '../agent/proposal/proposal.types';
import { InboxService } from '../inbox/inbox.service';
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
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
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

  private clampLimit(args: Record<string, unknown>, max = 100): number {
    return Math.min(Math.max((args.limit as number) ?? 20, 1), max);
  }

  private registerAll() {
    // ═══════════════════════════════════════════════════════════
    // 매물 (Listings)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_listings',
      '매물(Listing) 목록을 검색합니다. 거래유형, 확인상태, 가격범위, 단지, 키워드로 필터링.',
      obj({
        transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        checkStatus: strEnum('확인상태', ['unverified', 'verified', 'in_contract', 'hold', 'done']),
        siteId: str('단지 ID'),
        search: str('검색어 (단지명, 주소)'),
        priceMin: num('최소 가격 (만원)'),
        priceMax: num('최대 가격 (만원)'),
        includeHidden: bool('숨김 매물 포함'),
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
          includeHidden: a.includeHidden as boolean,
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
          propertyId: str('관리매물 ID'),
          transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
          price: num('매매가/전세가 (만원)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          memo: str('메모'),
        },
        ['propertyId', 'transactionType'],
      ),
      async (a, c) =>
        this.listings.create(c.officeId, {
          propertyId: a.propertyId as string,
          transactionType: a.transactionType as string,
          price: a.price as number,
          deposit: a.deposit as number,
          monthlyRent: a.monthlyRent as number,
          memo: a.memo as string,
        }),
    );

    this.add(
      'update_listing',
      '매물 정보를 수정합니다. 가격, 거래유형, 확인상태, 메모 등.',
      obj({ id: str('매물 ID'), price: num('가격'), deposit: num('보증금'), monthlyRent: num('월세'), checkStatus: strEnum('확인상태', ['unverified', 'verified', 'in_contract', 'hold', 'done']), isHidden: bool('숨김'), memo: str('메모') }, ['id']),
      async (a, c) =>
        this.listings.update(a.id as string, c.officeId, {
          price: a.price as number,
          deposit: a.deposit as number,
          monthlyRent: a.monthlyRent as number,
          checkStatus: a.checkStatus as string,
          isHidden: a.isHidden as boolean,
          memo: a.memo as string,
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
      obj({ name: str('이름'), phone: str('전화번호'), phone2: str('보조 전화'), email: str('이메일'), tags: strArr('태그'), memo: str('메모') }, ['name']),
      async (a, c) =>
        this.contacts.create(c.officeId, {
          name: a.name as string,
          phone: a.phone as string,
          phone2: a.phone2 as string,
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
      '새 관리매물을 등록합니다. 단지(siteId)는 필수, 호실(unitId)은 선택.',
      obj({ siteId: str('단지 ID'), unitId: str('호실 ID'), memo: str('메모') }, ['siteId']),
      async (a, c) =>
        this.properties.create(c.officeId, {
          siteId: a.siteId as string,
          unitId: a.unitId as string,
          memo: a.memo as string,
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
      obj({ contactId: str('연락처 ID'), propertyId: str('매물 ID'), listingId: str('리스팅 ID'), ...page }),
      async (a, c) =>
        this.consultations.findAll(c.officeId, {
          contactId: a.contactId as string,
          propertyId: a.propertyId as string,
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
    // 업무함 (Inbox / EntityDraft) — AI 워크플로우 전체 루프
    //
    // 1) AI 가 초안 생성 → inbox_create_draft
    // 2) 사장님이 업무함에서 확인/승인 또는 코멘트로 재작성 요청
    //    - 코멘트 달리면 status='processing' 으로 자동 전이
    // 3) OpenClaw heartbeat:
    //    - inbox_list_processing 으로 재작성 대상 가져옴
    //    - 재작성 후 inbox_submit_revision 으로 반영 → pending 복귀
    // 4) 승인 + executor='agent' 인 경우:
    //    - inbox_list_agent_pending 으로 approved 작업 조회
    //    - inbox_claim 으로 executing 전이
    //    - 실제 실행 (ex: 네이버 광고 게재)
    //    - inbox_report_execution 으로 executed/failed 결과 보고
    // ═══════════════════════════════════════════════════════════

    this.add(
      'inbox_list',
      '업무함(EntityDraft) 목록 조회. scope 로 탭 필터: pending(처리 대기), processing(재처리), approved(승인·실행 대기), resolved(종결), all.',
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
      '업무함 항목 상세. 코멘트(AI 수정 지시) 포함.',
      obj({ id: str('draft ID') }, ['id']),
      async (a, c) => this.inbox.getById(a.id as string, c.officeId),
    );

    this.add(
      'inbox_create_draft',
      '업무함에 AI 제안 초안을 등록. 사장님이 업무함에서 확인·승인한 뒤 실제 반영된다. decisionMode=confirm 은 "결과 검토 후 저장", approval 은 "실행 승인". executor=server(서버가 DB 작업 직접 수행), agent(AI 가 직접 실행, ex: 네이버 광고 게재), manual(사장님이 직접 처리).',
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
          listingId: str('연결된 매물 ID'),
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
      async (a, c) =>
        this.inbox.create({
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
          listingId: a.listingId as string | undefined,
          propertyId: a.propertyId as string | undefined,
          contactId: a.contactId as string | undefined,
          dealId: a.dealId as string | undefined,
          contractId: a.contractId as string | undefined,
          paymentId: a.paymentId as string | undefined,
        }),
    );

    this.add(
      'inbox_list_processing',
      '사장님이 코멘트로 재작성을 요청한 draft 목록 (status=processing). OpenClaw heartbeat 가 주기적으로 조회해서 재작성 후 inbox_submit_revision 으로 반영한다.',
      obj({ limit: num('최대 개수 (기본 20)') }),
      async (a, c) =>
        this.inbox.listProcessing(c.officeId, a.limit as number),
    );

    this.add(
      'inbox_submit_revision',
      'AI 재작성 결과 제출. proposedChanges 를 교체하고 미읽음 코멘트를 읽음 처리, status=pending 으로 복귀시켜 사장님이 다시 검토할 수 있게 한다.',
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
      'Agent 가 실행할 승인 완료 작업 목록 (executor=agent, status=approved). OpenClaw heartbeat 가 조회해서 inbox_claim 으로 집어간다.',
      obj({ limit: num('최대 개수 (기본 20)') }),
      async (a, c) =>
        this.inbox.listAgentPending(c.officeId, a.limit as number),
    );

    this.add(
      'inbox_claim',
      'Agent 가 승인된 작업을 집어감. approved → executing 으로 전이. 같은 draft 를 이미 다른 agent 가 claim 했으면 실패한다.',
      obj({ id: str('draft ID') }, ['id']),
      async (a, c) => this.inbox.claimForAgent(a.id as string, c.officeId),
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
          resultEntityId: a.resultEntityId as string | undefined,
          executionError: a.executionError as string | undefined,
        }),
    );
  }
}
