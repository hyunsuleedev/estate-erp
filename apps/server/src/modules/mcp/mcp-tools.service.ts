import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
} from '@nestjs/common';
import {
  IntakeCheckResult,
  IntakeClosedReason,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  MATCH_STAGE_ORDER,
  MatchStage,
  OCCUPANCY_STATUSES,
} from '@estate-erp/shared';
import { formatToolError, normalizeDateArgs, validateToolArgs } from './mcp-tool-args';
import { compactMcpResult } from './mcp-response-compact';
import { rejectMisnamedListingArgs, toMcpVocabulary } from './mcp-vocabulary';
import { toLightList, toListingRow, toPropertyRow } from './mcp-list-rows';
import { MOVE_IN_AVAILABLE_TYPE_VALUES } from '../listings/listing-input';
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
import { PartiesService } from '../parties/parties.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  EMPLOYEE_SECTIONS,
  EmployeesService,
  isEmployeeSection,
  type EmployeeSection,
} from '../employees/employees.service';
import { OfficesService } from '../offices/offices.service';
import {
  ExternalListingsService,
  type BatchListingItem,
  type ListingGroupInput,
  type SnapshotListingPatch,
} from '../external-listings/external-listings.service';
import { CommissionPaymentService } from '../finance/commission-payment.service';
import { CashflowService } from '../finance/cashflow.service';
import { PublicDocumentsService } from '../public-documents/public-documents.service';
import { PropertyPhotosService } from '../property-photos/property-photos.service';
import { ListingAdvertisementsService } from '../listing-advertisements/listing-advertisements.service';
import { AdvertisementChangeRequestsService } from '../listing-advertisements/advertisement-change-requests.service';
import { OfficeCpAccountsService } from '../listing-advertisements/office-cp-accounts.service';
import { ListingAdvertisementSnapshotsService } from '../listing-advertisement-snapshots/listing-advertisement-snapshots.service';
import {
  OfficeAdvertisementsService,
  type AdvertisementComparisonInput,
} from '../office-advertisements/office-advertisements.service';
import { getRoleScopes } from '../../constants/role-permissions';

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
  role?: string;
}

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: McpContext,
) => Promise<unknown>;

interface ToolEntry {
  def: ToolDefinition;
  handler: ToolHandler;
  requiredScopes: readonly string[];
}

/**
 * 시각 칸(…At)에 날짜만 와도 받는 도구. 이 도구들의 서비스는 받은 문자열을 그대로 DB에 넘겨, 날짜만 주면 실패했다.
 * 날짜만 받는 칸이 있는 도구(계약서 초안의 체결일 등)는 넣지 않는다 — 그쪽은 날짜 문자열 그대로 써야 한다.
 */
/**
 * 매물 · 거래 조건의 낱말을 옮기는 도구. 광고노트(external_listing) 도구는 뺀다 — 거기서 listingId는
 * 우리 매물이 아니라 외부 광고 한 줄의 id다.
 */
const USES_LISTING_VOCABULARY = (toolName: string) => !toolName.includes('external_listing');

/** 읽기만 하는 도구 — 응답을 줄여 보내도 되는 것 */
const READ_TOOL_NAME = /^(find|get|search|list)_/;

/**
 * get_employee의 include 이름 → 응답에 붙는 칸. 직원 한 명의 기본 정보는 1KB인데 딸린 목록을
 * 다 붙이면 60KB를 넘는다. 적은 것만 따로 읽어 붙인다(EmployeesService.findSection).
 */
const EMPLOYEE_INCLUDE_FIELDS: Record<EmployeeSection, string> = {
  tasks: 'assignedTasks',
  buyerRequirements: 'assignedBuyerRequirements',
  projects: 'assignedProjects',
  deals: 'dealParticipants',
  settlements: 'recentSettlementLines',
  consultations: 'recentConsultations',
  activities: 'recentActivities',
};

const DATE_ONLY_AS_TIME_TOOLS: ReadonlySet<string> = new Set([
  'create_listing',
  'update_listing',
  'create_listing_advertisement',
  'update_listing_advertisement',
]);

// JSON Schema helpers
const str = (desc: string) => ({ type: 'string' as const, description: desc });
const strEnum = (desc: string, values: string[]) => ({
  type: 'string' as const,
  enum: values,
  description: desc,
});
const num = (desc: string) => ({ type: 'number' as const, description: desc });
const bool = (desc: string) => ({
  type: 'boolean' as const,
  description: desc,
});
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
// 입주 가능 시기. 값의 뜻을 스키마에 적는다 — 예전에는 자유 글이라 "협의"가 어떤 값인지 AI가 알 수 없었다.
const moveInAvailableType = strEnum(
  '입주 가능 시기: immediate=즉시 입주, date=특정일 이후(moveInAvailableFrom에 그 날짜), range=기간 안에서 협의(moveInAvailableFrom~moveInAvailableTo), negotiable=협의, unknown=확인 필요',
  [...MOVE_IN_AVAILABLE_TYPE_VALUES],
);
const moveInAvailableFrom = str(
  '입주 가능 시작일 (YYYY-MM-DD). date · range일 때만 씁니다',
);
const moveInAvailableTo = str('입주 가능 종료일 (YYYY-MM-DD). range일 때만 씁니다');

/**
 * 입주 가능 시기를 바꿀 때 날짜를 종류에 맞춘다: 즉시 · 협의 · 확인 필요로 바꾸면 예전 날짜를 비우고,
 * 특정일 이후로 바꾸면 종료일을 비운다. 종류를 보내지 않았으면 보낸 칸만 바꾼다.
 */
function moveInPatch(a: Record<string, unknown>) {
  const type = a.moveInAvailableType as string | undefined;
  const from = a.moveInAvailableFrom as string | undefined;
  const to = a.moveInAvailableTo as string | undefined;
  if (type === undefined) return { moveInAvailableFrom: from, moveInAvailableTo: to };
  const usesFrom = type === 'date' || type === 'range';
  return {
    moveInAvailableType: type,
    moveInAvailableFrom: usesFrom ? from : null,
    moveInAvailableTo: type === 'range' ? to : null,
  };
}

const listingInput = obj(
  {
    transactionType: strEnum('거래유형', LISTING_TRANSACTION_TYPES),
    price: num('매매가/전세가 (만원)'),
    deposit: num('보증금 (만원)'),
    monthlyRent: num('월세 (만원)'),
    maintenanceFee: num('관리비 (만원)'),
    maintenanceFeeIncludes,
    loanAmount: num('융자금/근저당 설정액 (만원)'),
    premium: num('상가 권리금 (만원)'),
    moveInAvailableType,
    moveInAvailableFrom,
    moveInAvailableTo,
    memo: str('메모'),
  },
  ['transactionType'],
);
const listingInputs = {
  type: 'array' as const,
  items: listingInput,
  description: '이 매물의 거래 조건들 (매매 · 전세 · 월세마다 하나)',
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
    private readonly parties: PartiesService,
    private readonly tenants: TenantsService,
    private readonly employees: EmployeesService,
    private readonly offices: OfficesService,
    private readonly externalListings: ExternalListingsService,
    private readonly commissionPayments: CommissionPaymentService,
    private readonly cashflow: CashflowService,
    private readonly publicDocs: PublicDocumentsService,
    private readonly propertyPhotos: PropertyPhotosService,
    private readonly listingAdvertisements: ListingAdvertisementsService,
    private readonly officeAdvertisements: OfficeAdvertisementsService,
    private readonly listingIntakes: ListingIntakesService,
    private readonly listingAdvertisementSnapshots: ListingAdvertisementSnapshotsService,
    private readonly advertisementChangeRequests: AdvertisementChangeRequestsService,
    @Optional() private readonly officeCpAccounts?: OfficeCpAccountsService,
  ) {
    this.registerAll();
  }

  getToolDefinitions(ctx?: McpContext): ToolDefinition[] {
    return this.tools
      .filter((tool) => !ctx || this.canUseTool(tool, ctx))
      .map((tool) => tool.def);
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
    if (!this.canUseTool(entry, ctx)) {
      return {
        content: [
          {
            type: 'text',
            text: `Error: Missing MCP scope for tool ${toolName}`,
          },
        ],
        isError: true,
      };
    }
    // 손잡이에 닿기 전에 인자를 스키마로 확인한다(필수 id가 빠지면 아무 기록에나 동작하던 문제, mcp-tool-args.ts).
    const invalid = validateToolArgs(entry.def.inputSchema, args);
    if (invalid) {
      return {
        content: [{ type: 'text', text: `Error: 인자가 올바르지 않습니다 — ${invalid}` }],
        isError: true,
      };
    }
    // 매물 · 거래 조건의 id를 이 도구가 받지 않는 이름으로 보냈으면 버리지 않고 거절한다(mcp-vocabulary.ts).
    const misnamed = USES_LISTING_VOCABULARY(toolName)
      ? rejectMisnamedListingArgs(entry.def.inputSchema, args ?? {})
      : null;
    if (misnamed) {
      return {
        content: [{ type: 'text', text: `Error: 인자가 올바르지 않습니다 — ${misnamed}` }],
        isError: true,
      };
    }
    try {
      const raw = await entry.handler(
        DATE_ONLY_AS_TIME_TOOLS.has(toolName) ? normalizeDateArgs(args ?? {}) : (args ?? {}),
        ctx,
      );
      const data = USES_LISTING_VOCABULARY(toolName) ? toMcpVocabulary(raw) : raw;
      return {
        content: [
          {
            type: 'text',
            // 들여쓰기 없이 보낸다. 읽는 쪽은 AI라 줄바꿈이 필요 없고, 응답이 절반 가까이 줄어든다.
            // 조회 응답은 딸린 객체를 줄여 보낸다(mcp-response-compact.ts). 만들기·고치기·초안은
            // 빈 칸이 "아직 안 정함"을 뜻하기도 해서 그대로 둔다.
            // 그 전에 칸 이름을 MCP의 낱말로 옮긴다(매물 = listing, 거래 조건 = term).
            text: JSON.stringify(READ_TOOL_NAME.test(toolName) ? compactMcpResult(data) : data),
          },
        ],
        isError: false,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${formatToolError(err)}` }],
        isError: true,
      };
    }
  }

  private add(
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
    handler: ToolHandler,
    requiredScopes: readonly string[] = [],
  ) {
    this.tools.push({
      def: { name, description, inputSchema },
      handler,
      requiredScopes,
    });
  }

  private canUseTool(entry: ToolEntry, ctx: McpContext) {
    if (entry.requiredScopes.length === 0) return true;
    const scopes = new Set(getRoleScopes(ctx.role ?? ''));
    return entry.requiredScopes.every((scope) => scopes.has(scope));
  }

  private clampLimit(args: Record<string, unknown>, max = 100): number {
    return Math.min(Math.max((args.limit as number) ?? 20, 1), max);
  }

  private async prepareSaleContractDraft(
    args: Record<string, unknown>,
    ctx: McpContext,
  ) {
    const contractId = args.contractId as string;
    return this.contracts.prepareSaleContractDraft(
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
  }

  /**
   * 외부매물 광고노트 도구.
   *
   * 2026-11-17부터 기본으로 꺼 둔다. 광고노트는 네이버 자료를 담는 자리라 제품에서의 위치가
   * 정리될 때까지 화면 메뉴와 MCP에서 뺐다. 표와 서버 코드(external-listings 모듈)는 그대로다.
   * 다시 켤 때는 환경 변수 MCP_EXTERNAL_LISTING_TOOLS=on.
   */
  private registerExternalListingTools() {
    if (process.env.MCP_EXTERNAL_LISTING_TOOLS !== 'on') return;

    // ═══════════════════════════════════════════════════════════
    // 외부매물 광고노트 (External Listings)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_external_listing_groups',
      '외부 매물(광고노트) 그룹 목록. 단지/거래유형/상태 필터.',
      obj({
        siteId: str('단지 ID'),
        transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        status: str('상태'),
        search: str('검색어'),
      }),
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
      async (a, c) =>
        this.externalListings.findGroupById(a.id as string, c.officeId),
    );

    this.add(
      'update_external_listing_group',
      '외부 매물 그룹의 호수 텍스트, 메모, 상태를 수정합니다.',
      obj(
        {
          id: str('그룹 ID'),
          ho: str('호수 텍스트 (예: "1503호")'),
          memo: str('메모'),
          status: strEnum('상태', ['unmatched', 'verified', 'on_hold']),
        },
        ['id'],
      ),
      async (a, c) =>
        this.externalListings.updateGroup(a.id as string, c.officeId, {
          ho: a.ho as string | null,
          memo: a.memo as string | null,
          status: a.status as string,
        }),
    );

    this.add(
      'get_active_external_listing_snapshot_session',
      '광고노트 단지·거래유형의 열린 스냅샷을 조회합니다. 이번에 입력된 광고 수(receivedListingCount)와 닫으면 내려갈 광고 수(pendingRemovalCount)를 함께 돌려줍니다.',
      obj(
        {
          siteId: str('단지 ID'),
          transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        },
        ['siteId', 'transactionType'],
      ),
      async (a, c) =>
        this.externalListings.getActiveSession(
          c.officeId,
          a.siteId as string,
          a.transactionType as string,
        ),
      ['advertisements:observe'],
    );

    this.add(
      'create_external_listing_snapshot_session',
      '광고노트 스냅샷을 엽니다. 같은 단지·거래유형에는 열린 스냅샷이 하나만 존재하며, 입력과 닫기에 반환된 id를 사용합니다.',
      obj(
        {
          siteId: str('단지 ID'),
          transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        },
        ['siteId', 'transactionType'],
      ),
      async (a, c) =>
        this.externalListings.createSession(c.officeId, c.userId, {
          siteId: a.siteId as string,
          transactionType: a.transactionType as string,
        }),
      ['advertisements:observe'],
    );

    this.add(
      'complete_external_listing_snapshot_session',
      '입력을 마친 스냅샷을 닫고 이전 자료와 비교한 결과(신규 매물, 광고 추가, 사라진 매물, 가격 변경)를 돌려줍니다. 이번에 입력되지 않은 기존 광고는 비활성화합니다. expectedListingCount가 실제 입력 건수와 다르면 거부하고 스냅샷을 열어 둡니다. 입력이 0건이면 expectedListingCount 0으로 닫아 모든 광고를 내립니다.',
      obj(
        {
          id: str('ExternalListingSnapshotSession ID'),
          expectedListingCount: num('이번 스냅샷에 입력한 광고의 전체 건수'),
        },
        ['id', 'expectedListingCount'],
      ),
      async (a, c) => {
        // 건수 확인 없이 닫으면 입력 누락이 사라진 매물로 처리된다.
        if (typeof a.expectedListingCount !== 'number') {
          throw new Error('expectedListingCount는 필수입니다.');
        }
        return this.externalListings.completeSession(
          c.officeId,
          c.userId,
          c.role ?? 'agent',
          a.id as string,
          { expectedListingCount: a.expectedListingCount },
        );
      },
      ['advertisements:observe'],
    );

    this.add(
      'cancel_external_listing_snapshot_session',
      '입력이 불완전하거나 중단됐을 때 스냅샷을 취소합니다. 입력되지 않은 기존 광고를 비활성화하지 않습니다.',
      obj({ id: str('ExternalListingSnapshotSession ID') }, ['id']),
      async (a, c) =>
        this.externalListings.cancelSession(
          c.officeId,
          c.userId,
          c.role ?? 'agent',
          a.id as string,
        ),
      ['advertisements:observe'],
    );

    this.add(
      'batch_upsert_external_listings',
      '열린 스냅샷에 외부 광고를 묶음 단위로 입력합니다. 같은 매물의 광고는 모두 한 묶음에 넣고 요청 사이에 나누지 않습니다. 묶음의 번호가 기존 데이터와 겹치면 기존 그룹에 합류하고, 대표는 새 묶음의 대표로 바뀝니다. 요청 하나는 최대 100건이며 전부 저장되거나 전부 거부됩니다.',
      obj(
        {
          sessionId: str('열린 ExternalListingSnapshotSession ID'),
          source: str('입력자가 지정하는 데이터 출처 식별자'),
          batchId: str('입력 실행을 식별하는 선택적 안정 키'),
          groups: {
            type: 'array',
            description: '동일 매물의 광고 묶음 목록',
            items: {
              type: 'object',
              properties: {
                representativeArticleNo: str(
                  '이 묶음의 대표 광고 번호. listings 안에 있어야 합니다.',
                ),
                listings: {
                  type: 'array',
                  description: '묶음에 속한 광고 목록',
                  items: {
                    type: 'object',
                    properties: {
                      articleNo: str('광고 번호 (필수, 출처 안에서 유일)'),
                      price: num('가격 (만원)'),
                      deposit: num('보증금 (만원)'),
                      monthlyRent: num('월세 (만원)'),
                      articleName: str('광고명'),
                      articleFeatureDesc: str('특징 설명'),
                      detailDescription: str('상세 설명'),
                      articleConfirmYmd: str('광고 확인일 YYYYMMDD'),
                      floorInfo: str('층 정보'),
                      exclusiveAreaM2: num('전용면적 (m²)'),
                      supplyAreaM2: num('공급면적 (m²)'),
                      direction: str('향'),
                      realtorName: str('중개사명'),
                      realtorId: str('중개사 식별자'),
                      representativeTelNo: str('대표번호'),
                      ranking: num('광고 노출 순위'),
                      buildingName: str('동명'),
                      ho: str('호수 텍스트'),
                      areaName: str('평형명 (84A 등)'),
                      sourceUrl: str('원본 URL'),
                    },
                    required: ['articleNo'],
                  },
                },
              },
              required: ['representativeArticleNo', 'listings'],
            },
          },
        },
        ['sessionId', 'source', 'groups'],
      ),
      async (a, c) =>
        this.externalListings.batchUpsert(c.officeId, {
          sessionId: a.sessionId as string,
          source: a.source as string,
          batchId: a.batchId as string | undefined,
          groups: a.groups as ListingGroupInput[],
        }),
      ['advertisements:observe'],
    );

    this.add(
      'add_external_listing_to_snapshot_group',
      '열린 스냅샷에 입력한 매물에 동일 광고를 한 건 추가합니다. 대표는 바뀌지 않습니다.',
      obj(
        {
          sessionId: str('열린 ExternalListingSnapshotSession ID'),
          groupId: str('이번 스냅샷에 입력한 그룹 ID'),
          source: str('입력자가 지정하는 데이터 출처 식별자'),
          listing: {
            type: 'object',
            description: '추가할 광고',
            properties: {
              articleNo: str('광고 번호 (필수, 출처 안에서 유일)'),
              price: num('가격 (만원)'),
              deposit: num('보증금 (만원)'),
              monthlyRent: num('월세 (만원)'),
              articleFeatureDesc: str('특징 설명'),
              floorInfo: str('층 정보'),
              direction: str('향'),
              realtorName: str('중개사명'),
              representativeTelNo: str('대표번호'),
              ranking: num('광고 노출 순위'),
              sourceUrl: str('원본 URL'),
            },
            required: ['articleNo'],
          },
        },
        ['sessionId', 'groupId', 'source', 'listing'],
      ),
      async (a, c) =>
        this.externalListings.addSnapshotListing(
          c.officeId,
          a.sessionId as string,
          a.groupId as string,
          {
            source: a.source as string,
            listing: a.listing as BatchListingItem,
          },
        ),
      ['advertisements:observe'],
    );

    this.add(
      'update_external_listing_in_snapshot',
      '열린 스냅샷에서 광고를 수정합니다. 수정한 광고는 이번 스냅샷에 입력된 것으로 처리됩니다. 스냅샷을 닫은 뒤에는 수정할 수 없습니다.',
      obj(
        {
          sessionId: str('열린 ExternalListingSnapshotSession ID'),
          listingId: str('광고 ID'),
          price: num('가격 (만원)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          articleName: str('광고명'),
          articleFeatureDesc: str('특징 설명'),
          detailDescription: str('상세 설명'),
          articleConfirmYmd: str('광고 확인일 YYYYMMDD'),
          floorInfo: str('층 정보'),
          direction: str('향'),
          realtorName: str('중개사명'),
          representativeTelNo: str('대표번호'),
          ranking: num('광고 노출 순위'),
          sourceUrl: str('원본 URL'),
        },
        ['sessionId', 'listingId'],
      ),
      async (a, c) => {
        const { sessionId, listingId, ...patch } = a;
        return this.externalListings.updateSnapshotListing(
          c.officeId,
          sessionId as string,
          listingId as string,
          patch as SnapshotListingPatch,
        );
      },
      ['advertisements:observe'],
    );

    this.add(
      'remove_external_listing_from_snapshot',
      '열린 스냅샷에서 광고를 뺍니다. 이번에 처음 입력한 광고는 지우고, 기존 광고는 닫을 때 비활성화되도록 이번 입력에서 제외합니다. 스냅샷을 닫은 뒤에는 뺄 수 없습니다.',
      obj(
        {
          sessionId: str('열린 ExternalListingSnapshotSession ID'),
          listingId: str('광고 ID'),
        },
        ['sessionId', 'listingId'],
      ),
      async (a, c) =>
        this.externalListings.removeSnapshotListing(
          c.officeId,
          a.sessionId as string,
          a.listingId as string,
        ),
      ['advertisements:observe'],
    );
  }

  private registerAll() {
    // ═══════════════════════════════════════════════════════════
    // 매물 — 매물관리 화면의 한 줄 (DB의 ListingIntake). 낱말의 기준은 mcp-vocabulary.ts
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_listings',
      '매물 목록을 찾습니다. "매물 알려 줘"에는 이 도구를 씁니다. 매물은 매물관리 화면의 한 줄입니다: 집주인이 한 집을 한 번 맡긴 것이고, 그 안에 거래 조건(terms: 매매 · 전세 · 월세)이 하나 이상 들어 있습니다. 한 줄에는 어느 집(place) · 매물 상태 · 확인된 날 · 거주 상태 · 메모와, 조건마다(terms[]) 가격 · 입주 가능 시기 · 잡고 있는 거래 · 진행 중인 광고 요약을 싣습니다. 가격 이력 · 광고 전체는 get_listing으로, 소유자 이름 · 전화는 그 줄의 propertyId로 find_property_contacts를 불러 봅니다. 종료한 매물은 includeClosed를 줘야 나옵니다. 호실(집) 자체를 찾을 때는 find_properties를 씁니다.',
      obj({
        lifecycleStatus: strEnum(
          '매물 상태: open=진행 중, hold=보류, closed=종료',
          Object.values(IntakeLifecycleStatus),
        ),
        confirmationState: strEnum(
          '확인 상태: unverified=확인한 적 없음, verified=확인됨, overdue=다시 확인할 때가 지남',
          Object.values(IntakeConfirmationState),
        ),
        nextConfirmFrom: str('다음 확인 예정 시작일 (ISO)'),
        nextConfirmTo: str('다음 확인 예정 종료일 (ISO)'),
        availability: strEnum(
          '거래할 수 있는 상태(거래 · 보류 · 종료에서 계산)',
          Object.values(ListingAvailability),
        ),
        occupancyStatus: strEnum(
          '거주 상태: owner_occupied=주인 거주, tenant=세입자 거주, vacant=공실, unknown=적지 않음',
          [...OCCUPANCY_STATUSES, 'unknown'],
        ),
        includeClosed: bool('종료한 매물 포함'),
        propertyId: str('관리매물 ID'),
        transactionType: strEnum('거래유형', LISTING_TRANSACTION_TYPES),
        siteId: str('단지 ID'),
        siteType: str('매물유형'),
        wardCode: str('법정동코드'),
        search: str('검색어 (단지 이름, 주소)'),
        priceMin: num('최소 가격 (만원)'),
        priceMax: num('최대 가격 (만원)'),
        depositMin: num('최소 보증금 (만원)'),
        depositMax: num('최대 보증금 (만원)'),
        monthlyRentMin: num('최소 월세 (만원)'),
        monthlyRentMax: num('최대 월세 (만원)'),
        areaMin: num('최소 공급면적 (m²)'),
        areaMax: num('최대 공급면적 (m²)'),
        sortBy: strEnum('정렬 필드', ['receivedAt', 'updatedAt', 'createdAt']),
        sortOrder: strEnum('정렬 방향', ['asc', 'desc']),
        ...page,
      }),
      // 서비스의 목록은 아직 화면용 무거운 줄이다. 가벼운 줄로 골라 싣는다(mcp-list-rows.ts).
      async (a, c) =>
        toLightList(
          await this.listingIntakes.findAll(c.officeId, {
            lifecycleStatus: a.lifecycleStatus as string,
            confirmationState: a.confirmationState as string,
            nextConfirmFrom: a.nextConfirmFrom as string,
            nextConfirmTo: a.nextConfirmTo as string,
            availability: a.availability as string,
            occupancies: a.occupancyStatus ? [a.occupancyStatus as string] : undefined,
            includeClosed: a.includeClosed as boolean,
            propertyId: a.propertyId as string,
            transactionType: a.transactionType as string,
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
            sortBy: a.sortBy as 'receivedAt' | 'updatedAt' | 'createdAt',
            sortOrder: a.sortOrder as 'asc' | 'desc',
            page: (a.page as number) ?? 1,
            limit: this.clampLimit(a),
          }),
          toListingRow,
        ),
    );

    this.add(
      'get_listing',
      '매물 하나의 상세: 어느 집인지, 거래 조건(terms)마다 가격 이력 · 광고 · 걸린 거래. 소유자는 propertyId로 find_property_contacts를 불러 봅니다. 매물은 매물관리 화면의 한 줄입니다: 집주인이 한 집을 한 번 맡긴 것이고, 그 안에 거래 조건(terms: 매매 · 전세 · 월세)이 하나 이상 들어 있습니다.',
      obj({ id: str('매물 ID (find_listings의 id)') }, ['id']),
      async (a, c) => this.listingIntakes.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_listing',
      '새 매물을 등록합니다. 매물은 매물관리 화면의 한 줄입니다: 집주인이 한 집을 한 번 맡긴 것이고, 그 안에 거래 조건(terms: 매매 · 전세 · 월세)이 하나 이상 들어 있습니다. 거래 조건(terms)은 함께 줘도 되고 나중에 add_listing_term으로 더해도 됩니다. 어느 집인지는 propertyId로 알립니다(find_or_create_property).',
      obj(
        {
          propertyId: str('관리매물 ID'),
          lifecycleStatus: strEnum(
            '매물 상태 (기본 open)',
            Object.values(IntakeLifecycleStatus),
          ),
          closedReason: strEnum('종결 사유', Object.values(IntakeClosedReason)),
          receivedAt: str('접수일 (ISO)'),
          lastCheckedAt: str('마지막 확인 시도일 (ISO)'),
          lastVerifiedAt: str('마지막 유효 확인일 (ISO)'),
          lastCheckResult: strEnum(
            '마지막 확인 결과',
            Object.values(IntakeCheckResult),
          ),
          nextConfirmAt: str('다음 확인 예정일 (ISO)'),
          isJointBrokerageRequired: bool('공동중개 필요 여부'),
          jointBrokeragePartnerId: str('공동중개 거래처 ID'),
          occupancyStatus: strEnum(
            '거주 상태: owner_occupied(주인 거주) · tenant(세입자 거주) · vacant(공실). 모르면 보내지 않습니다',
            [...OCCUPANCY_STATUSES],
          ),
          memo: str('매물 메모'),
          terms: listingInputs,
        },
        ['propertyId'],
      ),
      async (a, c) =>
        this.listingIntakes.create(c.officeId, {
          propertyId: a.propertyId as string,
          lifecycleStatus: a.lifecycleStatus as string,
          closedReason: a.closedReason as string | null,
          receivedAt: a.receivedAt as string | null,
          lastCheckedAt: a.lastCheckedAt as string | null,
          lastVerifiedAt: a.lastVerifiedAt as string | null,
          lastCheckResult: a.lastCheckResult as string | null,
          nextConfirmAt: a.nextConfirmAt as string | null,
          isJointBrokerageRequired: a.isJointBrokerageRequired as boolean,
          jointBrokeragePartnerId: a.jointBrokeragePartnerId as string | null,
          occupancyStatus: a.occupancyStatus as string | undefined,
          memo: a.memo as string | null,
          listings: a.terms as never,
        }),
    );

    this.add(
      'update_listing',
      '매물을 고칩니다: 상태 · 거주 상태 · 메모 · 공동중개 · 접수일. 가격처럼 거래 조건에 딸린 값은 update_listing_term으로 고칩니다. 매물을 끝낼 때는 lifecycleStatus=closed와 closedReason(withdrawn=의뢰 철회, external_deal_completed=다른 중개사 · 직거래로 계약됨, unavailable=매물 없어짐, other)을 보냅니다 — 진행 중인 매칭도 함께 닫히므로 사용자에게 확인한 뒤에 하세요. 보류는 hold, 다시 열기는 open.',
      obj(
        {
          id: str('매물 ID'),
          lifecycleStatus: strEnum(
            '매물 상태: open=진행 중, hold=보류, closed=종료',
            Object.values(IntakeLifecycleStatus),
          ),
          closedReason: strEnum('종결 사유', Object.values(IntakeClosedReason)),
          receivedAt: str('접수일 (ISO)'),
          lastCheckedAt: str('마지막 확인 시도일 (ISO)'),
          lastVerifiedAt: str('마지막 유효 확인일 (ISO)'),
          lastCheckResult: strEnum(
            '마지막 확인 결과',
            Object.values(IntakeCheckResult),
          ),
          nextConfirmAt: str('다음 확인 예정일 (ISO)'),
          isJointBrokerageRequired: bool('공동중개 필요 여부'),
          jointBrokeragePartnerId: str('공동중개 거래처 ID'),
          occupancyStatus: strEnum(
            '거주 상태: owner_occupied(주인 거주) · tenant(세입자 거주) · vacant(공실). 모르면 보내지 않습니다',
            [...OCCUPANCY_STATUSES],
          ),
          memo: str('매물 메모'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingIntakes.update(a.id as string, c.officeId, {
          lifecycleStatus: a.lifecycleStatus as string,
          closedReason: a.closedReason as string | null,
          receivedAt: a.receivedAt as string | null,
          lastCheckedAt: a.lastCheckedAt as string | null,
          lastVerifiedAt: a.lastVerifiedAt as string | null,
          lastCheckResult: a.lastCheckResult as string | null,
          nextConfirmAt: a.nextConfirmAt as string | null,
          isJointBrokerageRequired: a.isJointBrokerageRequired as boolean,
          jointBrokeragePartnerId: a.jointBrokeragePartnerId as string | null,
          occupancyStatus: a.occupancyStatus as string | undefined,
          memo: a.memo as string | null,
        }),
    );

    this.add(
      'confirm_listing',
      '매물이 아직 살아 있다고 집주인에게 확인했을 때 찍습니다. 확인된 날과 다음 확인 날(7일 뒤)만 갱신합니다. 확인은 이것 하나뿐입니다 — 연락이 안 됐으면 찍지 않습니다. 팔렸거나 거둬들인 매물은 close_listing으로 종료하고, 가격이 바뀌었으면 update_listing_term으로 고친 뒤 찍으세요. 상담 기록은 memo에 집주인과 나눈 이야기를 적었을 때만 함께 남습니다.',
      obj(
        {
          id: str('매물 ID'),
          channel: strEnum('확인 방법', ['phone', 'sms', 'visit', 'owner_message', 'note', 'mcp']),
          memo: str('집주인과 나눈 이야기 (적으면 상담 기록도 남습니다)'),
          checkedAt: str('확인 시각 (ISO)'),
          nextConfirmAt: str('다음 확인 예정일 (ISO). 비우면 7일 뒤'),
          contactId: str('확인 대상 연락처 ID'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingIntakes.confirm(a.id as string, c.officeId, c.userId, {
          // 예전 도구 정의를 기억한 AI가 result(no_answer · unavailable 등)를 보낼 수 있다. 버리면 "연락 안 됨"이
          // 유효함으로 기록되므로 그대로 넘겨 서비스가 거절하게 한다(유효함 말고는 받지 않는다).
          result: a.result as string | undefined,
          channel: (a.channel as string) ?? 'mcp',
          memo: a.memo as string | null,
          checkedAt: a.checkedAt as string | null,
          nextConfirmAt: a.nextConfirmAt as string | null,
          contactId: a.contactId as string | null,
        }),
    );

    // 매물을 끝내는 길은 둘이다: 종료(기록을 남김)와 삭제(없앰). 이름이 하는 일과 같아야 한다 —
    // 예전에는 삭제 도구가 종료만 해서, 지워 달라는 요청에 매물이 종료 상태로 남았다.
    this.add(
      'close_listing',
      '매물을 종료(closed)로 바꿉니다. 평소의 정리는 이것입니다: 거래가 끝났거나, 집주인이 거둬 갔거나, 더는 유효하지 않을 때. 매물과 그 거래 조건은 지워지지 않고 종료 상태로 남아 이력으로 볼 수 있습니다(find_listings의 includeClosed). 종료하면 그 안의 거래 조건(매매 · 전세 · 월세)이 모두 함께 내려갑니다. 잘못 넣은 것을 아예 없애려면 delete_listing을 쓰세요.',
      obj(
        {
          id: str('매물 ID'),
          closedReason: strEnum(
            '종료 사유 (기본 other). withdrawn=집주인이 거둠, unavailable=더는 거래할 수 없음, external_deal_completed=다른 곳에서 거래됨, superseded=새 의뢰로 대체',
            Object.values(IntakeClosedReason),
          ),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingIntakes.close(a.id as string, c.officeId, a.closedReason as string | undefined),
    );

    this.add(
      'delete_listing',
      '매물을 통째로 지웁니다: 그 매물의 거래 조건을 모두 지우고 매물도 지웁니다. 되돌릴 수 없으니 잘못 넣은 매물을 없앨 때만 쓰고, 거래가 끝났거나 거둬 간 매물은 close_listing으로 종료하세요. 대표·매니저만 할 수 있습니다. 조건 가운데 하나라도 거래가 연결됐거나, 매칭된 손님이 있거나, 공동중개망에 공유돼 있으면 아무것도 지우지 않고 이유를 알려 줍니다. 프로젝트에 담긴 매물도 지우지 않습니다. 관리매물(Property)과 연락처는 남습니다. 매물은 그대로 두고 거래 조건 하나만 지우려면(매매·전세를 함께 내놓았다가 전세만 뺄 때) delete_listing_term을 쓰세요.',
      obj({ id: str('매물 ID') }, ['id']),
      // 화면과 같은 권한: 역할을 넘겨 서비스가 가린다. 역할을 모르면 null — undefined는 서버 안쪽 호출로 본다.
      async (a, c) => this.listingIntakes.remove(a.id as string, c.officeId, c.role ?? null),
    );

    // ═══════════════════════════════════════════════════════════
    // 거래 조건 — 매물 안의 매매 · 전세 · 월세 하나 (DB의 Listing).
    // 조건만 따로 찾거나 보는 도구는 두지 않는다: 매물(find_listings · get_listing)의 terms에 실린다.
    // ═══════════════════════════════════════════════════════════
    this.add(
      'add_listing_term',
      '매물에 거래 조건을 하나 더합니다(매매로 내놓은 집을 전세로도 내놓을 때). 새 매물을 등록하는 것은 create_listing입니다.',
      obj(
        {
          listingId: str('매물 ID'),
          propertyId: str('관리매물 ID'),
          transactionType: strEnum('거래유형', LISTING_TRANSACTION_TYPES),
          price: num('매매가/전세가 (만원)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          maintenanceFee: num('관리비 (만원)'),
          maintenanceFeeIncludes,
          loanAmount: num('융자금/근저당 설정액 (만원)'),
          premium: num('상가 권리금 (만원)'),
          moveInAvailableType,
          moveInAvailableFrom,
          moveInAvailableTo,
          memo: str('메모'),
        },
        ['listingId', 'propertyId', 'transactionType'],
      ),
      async (a, c) => {
        return this.listings.create(c.officeId, {
          intakeId: a.listingId as string,
          propertyId: a.propertyId as string,
          transactionType: a.transactionType as string,
          price: a.price as number,
          deposit: a.deposit as number,
          monthlyRent: a.monthlyRent as number,
          maintenanceFee: a.maintenanceFee as number,
          maintenanceFeeIncludes: a.maintenanceFeeIncludes as string[],
          loanAmount: a.loanAmount as number,
          premium: a.premium as number,
          ...moveInPatch(a),
          memo: a.memo as string,
        });
      },
    );

    this.add(
      'update_listing_term',
      '거래 조건 하나를 고칩니다: 가격 · 관리비 · 융자금 · 권리금 · 입주 가능 시기 · 일시 중단 · 메모. 보낸 칸만 바뀝니다. 광고와 매칭은 그대로 남으므로, 조건을 고치려고 매물을 지우고 다시 만들지 마세요. 매물 상태 · 거주 상태 · 매물 메모는 update_listing, 확인은 confirm_listing입니다.',
      obj(
        {
          id: str('거래 조건 ID (매물의 terms[].id)'),
          price: num('가격 (만원)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          maintenanceFee: num('관리비 (만원)'),
          maintenanceFeeIncludes,
          loanAmount: num('융자금/근저당 설정액 (만원)'),
          premium: num('상가 권리금 (만원)'),
          moveInAvailableType,
          moveInAvailableFrom,
          moveInAvailableTo,
          isPaused: bool('이 조건만 잠시 멈춤'),
          memo: str('이 조건의 메모'),
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
          ...moveInPatch(a),
          isPaused: a.isPaused as boolean,
          memo: a.memo as string,
        }),
    );

    this.add(
      'delete_listing_term',
      '거래 조건 하나를 완전히 지웁니다(매매·전세를 함께 내놓았다가 전세만 뺄 때). 매물을 통째로 없애려면 delete_listing, 지우지 않고 끝내려면 close_listing을 쓰세요. 되돌릴 수 없고 대표·매니저만 할 수 있습니다. 거래가 연결됐거나, 매칭된 손님이 있거나, 공동중개망에 공유한 조건은 지워지지 않고 이유를 알려 줍니다. 그 매물의 마지막 조건을 지우면 빈 매물이 남지 않게 매물도 함께 지워지며(프로젝트에 담긴 매물은 남습니다) 응답의 intakeRemoved로 알 수 있습니다. 관리매물(Property)과 연락처는 남습니다.',
      obj({ id: str('거래 조건 ID (매물의 terms[].id)') }, ['id']),
      // 화면과 같은 권한: 역할을 넘겨 서비스가 가린다. 역할을 모르면 null을 넘긴다 —
      // undefined는 서버 안쪽 호출로 보아 검사를 건너뛴다.
      async (a, c) => this.listings.remove(a.id as string, c.officeId, c.role ?? null),
    );

    // ═══════════════════════════════════════════════════════════
    // CP 광고 원장 (ListingAdvertisements)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'list_office_cp_accounts',
      '사무소에 등록된 CP(이실장, 부동산뱅크 등) 로그인 계정 목록과 계정별 활성 광고 수를 조회합니다. accountKey는 CP 로그인 아이디이며 비밀번호는 서버에 저장되지 않습니다.',
      obj({
        channel: str('CP사 slug로 거르기 (선택)'),
        includeInactive: bool('비활성 계정 포함 여부'),
      }),
      async (a, c) => {
        if (!this.officeCpAccounts) {
          throw new BadRequestException('OfficeCpAccountsService is not available');
        }
        return this.officeCpAccounts.findAll(c.officeId, {
          channel: a.channel as string | undefined,
          includeInactive: a.includeInactive as boolean | undefined,
        });
      },
    );

    this.add(
      'find_listing_advertisements',
      'CP 광고 원장(ListingAdvertisement)을 검색합니다. 각 row는 한 번의 연속된 실제 게재이고, endedAt은 완전한 스냅샷에서 관측 종료된 시각입니다. syncState는 manual(수동 관리) / synced(CP 확인됨) / manual_override(직접 수정 후 CP 미확인)입니다. 광고는 매물 없이도 있을 수 있고, 각 row의 linkLevel이 연결 단계입니다(listing=매물까지, property=관리매물까지, site=건물까지, none=연결 없음). 매물이 없는 광고는 link=no_listing으로 모아 사용자에게 "매물로 등록할까요?"를 물을 때 씁니다. changeRequests에는 이 광고에 걸린 변경 요청과 반영 여부(fulfilled)가 들어 있습니다.',
      obj({
        termId: str('거래 조건 ID (매물의 terms[].id)'),
        propertyId: str('관리매물 ID'),
        cpAccountId: str('CP 계정 ID'),
        link: strEnum('연결 단계로 거르기: listing=매물의 거래 조건까지 연결됨, no_listing=매물 없음, no_property=호실 없음, no_site=건물 없음', ['listing', 'no_listing', 'no_property', 'no_site']),
        requests: strEnum('pending이면 처리되지 않은 변경 요청이 걸린 광고만', ['pending']),
        channel: str('CP사 slug (esiljang, budongsanbank 등)'),
        status: strEnum('광고 생명주기', ['active', 'ended']),
        search: str('검색어 (CP사, 계정 ID/별칭, CP/네이버 광고번호, URL, 단지명 등)'),
        sortBy: strEnum('정렬 필드', [
          'createdAt',
          'updatedAt',
          'startedAt',
          'lastCheckedAt',
        ]),
        sortOrder: strEnum('정렬 방향', ['asc', 'desc']),
        ...page,
      }),
      async (a, c) =>
        this.listingAdvertisements.findAll(c.officeId, {
          listingId: a.termId as string,
          propertyId: a.propertyId as string,
          cpAccountId: a.cpAccountId as string,
          link: a.link as 'listing' | 'no_listing' | 'no_property' | 'no_site',
          requests: a.requests === 'pending' ? 'pending' : undefined,
          channel: a.channel as string,
          status: a.status as string,
          search: a.search as string,
          sortBy: a.sortBy as
            | 'createdAt'
            | 'updatedAt'
            | 'startedAt'
            | 'lastCheckedAt',
          sortOrder: a.sortOrder as 'asc' | 'desc',
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'find_listing_advertisement_price_history',
      '한 Listing에 연결된 모든 CP·재광고 회차의 광고 가격 관측 이력을 시간순으로 조회합니다.',
      obj({ termId: str('거래 조건 ID (매물의 terms[].id)') }, ['termId']),
      async (a, c) =>
        this.listingAdvertisements.findPriceHistory(
          c.officeId,
          a.termId as string,
        ),
    );

    this.add(
      'create_listing_advertisement',
      'CP에서 실제로 관측하거나 수동으로 기록할 광고(ListingAdvertisement)를 넣습니다. 같은 사무소의 서로 다른 CP 계정(cpAccountId/accountKey)은 같은 매물·채널에 각자 광고를 올릴 수 있습니다. 매물 없이도 만들 수 있습니다: termId·propertyId·siteId 중 아는 가장 깊은 단계 하나만 주면 위 단계는 서버가 채우고, 아무것도 모르면 CP 원문(raw*)만 넣습니다.',
      obj(
        {
          termId: str('거래 조건 ID — 매물의 terms[].id (어느 매물의 어느 조건 광고인지까지 아는 경우)'),
          propertyId: str('관리매물 ID (호실까지만 아는 경우)'),
          siteId: str('단지·건물 ID (건물까지만 아는 경우)'),
          cpAccountId: str('CP 계정 ID (선택)'),
          accountKey: str('CP 로그인 아이디 (선택, 전달 시 계정을 자동 연결)'),
          transactionType: strEnum('거래유형 (매물에 연결되면 매물의 값을 따른다)', ['sale', 'jeonse', 'monthly']),
          rawJibunAddress: str('CP에 적힌 지번주소 원문'),
          rawRoadAddress: str('CP에 적힌 도로명주소 원문'),
          rawSiteName: str('CP에 적힌 단지·건물 이름 원문'),
          rawDong: str('CP에 적힌 동 원문'),
          rawHo: str('CP에 적힌 호 원문'),
          rawFloorText: str('CP의 층 표기 원문 (예: 12/25, 저/25, B1)'),
          rawAreaM2: num('CP에 적힌 면적 (m²)'),
          floorExposure: strEnum('광고의 층 노출 방식 (exact=정확한 층, band=저·중·고)', ['exact', 'band']),
          channel: str('CP사 slug (esiljang, budongsanbank 등)'),
          status: strEnum('광고 생명주기', ['active', 'ended']),
          advertisedPrice: num('광고 매매가 (만원, 매매 전용)'),
          advertisedDeposit: num('광고 전세가 또는 월세 보증금 (만원)'),
          advertisedMonthlyRent: num('광고 월세 (만원)'),
          startedAt: str('광고 시작일 (ISO)'),
          endedAt: str('광고 관측 종료 시각 (ISO, 예정 종료일 아님)'),
          url: str('CP 광고 관리 URL'),
          memo: str('광고 메모'),
          externalAdId: str('CP사 광고 ID'),
          naverArticleNo: str('네이버 매물번호'),
          naverUrl: str('네이버 광고 URL'),
          lastCheckedAt: str('마지막 네이버 비교일 (ISO)'),
          lastSyncedAt: str('마지막 CP 동기화일 (ISO)'),
        },
        ['channel'],
      ),
      async (a, c) =>
        this.listingAdvertisements.create(c.officeId, {
          listingId: a.termId as string | undefined,
          propertyId: a.propertyId as string | undefined,
          siteId: a.siteId as string | undefined,
          cpAccountId: a.cpAccountId as string | undefined,
          accountKey: a.accountKey as string | undefined,
          transactionType: a.transactionType as string | undefined,
          rawJibunAddress: a.rawJibunAddress as string | undefined,
          rawRoadAddress: a.rawRoadAddress as string | undefined,
          rawSiteName: a.rawSiteName as string | undefined,
          rawDong: a.rawDong as string | undefined,
          rawHo: a.rawHo as string | undefined,
          rawFloorText: a.rawFloorText as string | undefined,
          rawAreaM2: a.rawAreaM2 as number | undefined,
          floorExposure: a.floorExposure as string | undefined,
          channel: a.channel as string,
          status: a.status as string,
          advertisedPrice: a.advertisedPrice as number | null,
          advertisedDeposit: a.advertisedDeposit as number | null,
          advertisedMonthlyRent: a.advertisedMonthlyRent as number | null,
          startedAt: a.startedAt as string | null,
          endedAt: a.endedAt as string | null,
          url: a.url as string | null,
          memo: a.memo as string | null,
          externalAdId: a.externalAdId as string | null,
          naverArticleNo: a.naverArticleNo as string | null,
          naverUrl: a.naverUrl as string | null,
          lastCheckedAt: a.lastCheckedAt as string | null,
          lastSyncedAt: a.lastSyncedAt as string | null,
        }),
    );

    this.add(
      'update_listing_advertisement',
      'CP 광고 원장(ListingAdvertisement)을 수정합니다 — "직접 변경"입니다: 이미 CP에서 바뀐 것을 기록에 맞출 때만 쓰세요(lastSyncedAt 없이 가격·상태·층노출 등을 고치면 manual_override 상태가 됩니다). CP에서 바꿔 달라는 요청은 create_advertisement_change_request로 만듭니다. 연결은 link_listing_advertisement로 바꿉니다.',
      obj(
        {
          id: str('광고 원장 ID'),
          cpAccountId: str('CP 계정 ID'),
          accountKey: str('CP 로그인 아이디'),
          transactionType: strEnum('거래유형 (매물에 연결되면 매물의 값을 따른다)', ['sale', 'jeonse', 'monthly']),
          rawJibunAddress: str('CP에 적힌 지번주소 원문'),
          rawRoadAddress: str('CP에 적힌 도로명주소 원문'),
          rawSiteName: str('CP에 적힌 단지·건물 이름 원문'),
          rawDong: str('CP에 적힌 동 원문'),
          rawHo: str('CP에 적힌 호 원문'),
          rawFloorText: str('CP의 층 표기 원문 (예: 12/25, 저/25, B1)'),
          rawAreaM2: num('CP에 적힌 면적 (m²)'),
          floorExposure: strEnum('광고의 층 노출 방식 (exact=정확한 층, band=저·중·고)', ['exact', 'band']),
          channel: str('CP사 slug (esiljang, budongsanbank 등)'),
          status: strEnum('광고 생명주기', ['active', 'ended']),
          advertisedPrice: num('광고 매매가 (만원, 매매 전용)'),
          advertisedDeposit: num('광고 전세가 또는 월세 보증금 (만원)'),
          advertisedMonthlyRent: num('광고 월세 (만원)'),
          startedAt: str('광고 시작일 (ISO)'),
          endedAt: str('광고 관측 종료 시각 (ISO, 예정 종료일 아님)'),
          url: str('CP 광고 관리 URL'),
          memo: str('광고 메모'),
          externalAdId: str('CP사 광고 ID'),
          naverArticleNo: str('네이버 매물번호'),
          naverUrl: str('네이버 광고 URL'),
          lastCheckedAt: str('마지막 네이버 비교일 (ISO)'),
          lastSyncedAt: str('마지막 CP 동기화일 (ISO)'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingAdvertisements.update(a.id as string, c.officeId, {
          cpAccountId: a.cpAccountId as string | undefined,
          accountKey: a.accountKey as string | undefined,
          transactionType: a.transactionType as string | undefined,
          rawJibunAddress: a.rawJibunAddress as string | undefined,
          rawRoadAddress: a.rawRoadAddress as string | undefined,
          rawSiteName: a.rawSiteName as string | undefined,
          rawDong: a.rawDong as string | undefined,
          rawHo: a.rawHo as string | undefined,
          rawFloorText: a.rawFloorText as string | undefined,
          rawAreaM2: a.rawAreaM2 as number | undefined,
          floorExposure: a.floorExposure as string | undefined,
          channel: a.channel as string,
          status: a.status as string,
          advertisedPrice: a.advertisedPrice as number | null,
          advertisedDeposit: a.advertisedDeposit as number | null,
          advertisedMonthlyRent: a.advertisedMonthlyRent as number | null,
          startedAt: a.startedAt as string | null,
          endedAt: a.endedAt as string | null,
          url: a.url as string | null,
          memo: a.memo as string | null,
          externalAdId: a.externalAdId as string | null,
          naverArticleNo: a.naverArticleNo as string | null,
          naverUrl: a.naverUrl as string | null,
          lastCheckedAt: a.lastCheckedAt as string | null,
          lastSyncedAt: a.lastSyncedAt as string | null,
        }),
    );

    this.add(
      'link_listing_advertisement',
      '광고를 우리 데이터에 연결하거나 연결을 푼다. termId·propertyId·siteId 중 아는 가장 깊은 단계 하나만 주면 위 단계는 서버가 채웁니다(거래 조건 → 관리매물 → 건물). propertyId만 주면 매물 연결은 풀리고, 셋 다 비우면 모두 풀립니다.',
      obj(
        {
          id: str('광고 원장 ID'),
          termId: str('거래 조건 ID (매물의 terms[].id)'),
          propertyId: str('관리매물 ID'),
          siteId: str('단지·건물 ID'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.listingAdvertisements.link(a.id as string, c.officeId, {
          listingId: a.termId as string | undefined,
          propertyId: a.propertyId as string | undefined,
          siteId: a.siteId as string | undefined,
        }),
    );

    this.add(
      'find_advertisement_change_requests',
      '처리되지 않은(또는 지정 상태의) 광고 변경 요청 목록입니다. 각 요청은 publish(신규 게재) · update(조건 변경) · readvertise(재광고) · takedown(내리기) 액션과 cpAccount 정보를 담고 묶음 업무(Task)에 연결됩니다. 실행 시 update_advertisement_change_request로 in_progress/executed/failed를 보고하고, 최종 verified는 complete_listing_advertisement_snapshot이 자동 검증합니다.',
      obj({
        advertisementId: str('특정 광고의 요청만'),
        termId: str('특정 거래 조건의 요청만 (신규 게재 포함)'),
        channel: str('CP사 slug'),
        cpAccountId: str('CP 계정 ID'),
        accountKey: str('CP 로그인 아이디 (channel과 함께 지정)'),
        status: strEnum('요청 상태 필터', [
          'requested',
          'in_progress',
          'executed',
          'verified',
          'failed',
          'cancelled',
        ]),
        includeClosed: bool('완료·취소 요청 포함 여부'),
      }),
      async (a, c) =>
        this.advertisementChangeRequests.findOpen(c.officeId, {
          advertisementId: a.advertisementId as string | undefined,
          listingId: a.termId as string | undefined,
          channel: a.channel as string | undefined,
          cpAccountId: a.cpAccountId as string | undefined,
          accountKey: a.accountKey as string | undefined,
          status: a.status as string | undefined,
          includeClosed: a.includeClosed as boolean | undefined,
        }),
    );

    this.add(
      'create_advertisement_change_request',
      '광고를 CP에 새로 올리거나(publish) 바꿔 달라는 요청(update / readvertise / takedown)을 만듭니다. action=publish이면 termId+channel 필수, 나머지는 advertisementId 필수입니다.',
      obj(
        {
          action: strEnum('요청 작업', ['publish', 'update', 'readvertise', 'takedown']),
          advertisementId: str('광고 원장 ID (update/readvertise/takedown일 때 필수)'),
          termId: str('거래 조건 ID — 매물의 terms[].id (publish일 때 필수)'),
          channel: str('CP사 slug (publish일 때 필수)'),
          cpAccountId: str('CP 계정 ID (선택)'),
          accountKey: str('CP 로그인 아이디 (선택)'),
          targetValue: {
            type: 'object',
            description: '목표 조건: { price?, deposit?, monthlyRent?, floorExposure?: "exact"|"band" } (가격은 만원 단위, 전세는 deposit)',
            additionalProperties: true,
          },
          memo: str('요청사항'),
          dueDate: str('기한 (ISO)'),
          assignedToId: str('맡길 직원 ID. 비우면 담당자 없이 등록'),
        },
        ['action'],
      ),
      async (a, c) =>
        this.advertisementChangeRequests.createSingle(c.officeId, c.userId, {
          action: a.action as string,
          advertisementId: a.advertisementId as string | undefined,
          listingId: a.termId as string | undefined,
          channel: a.channel as string | undefined,
          cpAccountId: a.cpAccountId as string | undefined,
          accountKey: a.accountKey as string | undefined,
          targetValue: a.targetValue as Record<string, unknown> | undefined,
          memo: a.memo as string | undefined,
          dueDate: a.dueDate as string | undefined,
          assignedToId: a.assignedToId as string | undefined,
        }),
    );

    this.add(
      'update_advertisement_change_request',
      '에이전트나 담당자가 광고 변경 요청의 진행 상태(in_progress / executed / failed)를 보고합니다. verified 전이는 complete_listing_advertisement_snapshot에서 실제 CP 관측값으로 검증된 후 자동으로 일어납니다.',
      obj(
        {
          id: str('요청 ID'),
          status: strEnum('상태', ['requested', 'in_progress', 'executed', 'failed', 'cancelled']),
          failureReason: str('실패 사유 (status=failed일 때 필수)'),
        },
        ['id', 'status'],
      ),
      async (a, c) =>
        this.advertisementChangeRequests.updateStatus(c.officeId, a.id as string, {
          status: a.status as 'requested' | 'in_progress' | 'executed' | 'failed' | 'cancelled',
          failureReason: a.failureReason as string | undefined,
        }),
    );

    this.add(
      'cancel_advertisement_change_request',
      '처리되지 않은 광고 변경 요청을 거둡니다(묶음 업무의 모든 요청이 취소되면 업무도 취소됩니다).',
      obj({ id: str('요청 ID') }, ['id']),
      async (a, c) =>
        this.advertisementChangeRequests.cancel(c.officeId, a.id as string),
    );

    this.add(
      'delete_listing_advertisement',
      '잘못 등록한 내부 광고 row(ListingAdvertisement)를 삭제합니다. 정상 광고 내림은 update_listing_advertisement(status=ended)를 사용하세요.',
      obj({ id: str('광고 row ID') }, ['id']),
      async (a, c) =>
        this.listingAdvertisements.remove(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // CP 광고 원본 스냅샷 → 에이전트 매물 연결 → 광고 원장 반영
    // ═══════════════════════════════════════════════════════════
    this.add(
      'begin_listing_advertisement_snapshot',
      'Reader가 저장한 완전한 CP 광고 JSON의 메타데이터로 계정별 가져오기 세션을 시작합니다. accountKey(CP 로그인 아이디, 비밀번호 제외)가 필수입니다.',
      obj(
        {
          channel: str('CP사 slug. snapshot provider와 동일해야 함'),
          provider: str('Reader snapshot provider'),
          accountKey: str('수집한 CP 로그인 아이디 (비밀번호 절대 금지)'),
          scope: strEnum('Reader 수집 범위', ['active_advertisements']),
          observedAt: str('스냅샷 관측 시각 (ISO timestamp)'),
          expectedTotal: {
            oneOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }],
            description: 'Reader가 확인한 광고중 총 건수 또는 null',
          },
          manifestHash: str('Reader canonical manifest SHA-256'),
          fileSha256: str('저장된 JSON 파일 SHA-256 (선택)'),
          activeFilter: {
            type: 'object',
            description: 'Reader가 증명한 광고중 필터 상태',
            additionalProperties: true,
          },
          paginationComplete: bool('마지막 페이지까지 수집 완료 여부'),
          visitedPages: {
            type: 'array',
            items: { type: 'integer', minimum: 1 },
            description: '1부터 연속된 방문 페이지 목록',
          },
        },
        [
          'channel',
          'provider',
          'accountKey',
          'scope',
          'observedAt',
          'expectedTotal',
          'manifestHash',
          'activeFilter',
          'paginationComplete',
          'visitedPages',
        ],
      ),
      async (a, c) =>
        this.listingAdvertisementSnapshots.begin(c.officeId, c.userId, {
          channel: a.channel as string,
          provider: a.provider as string,
          accountKey: a.accountKey as string,
          scope: a.scope as string,
          observedAt: a.observedAt as string,
          expectedTotal: a.expectedTotal as number | null,
          manifestHash: a.manifestHash as string,
          fileSha256: a.fileSha256 as string | null,
          activeFilter: a.activeFilter as Record<string, unknown>,
          paginationComplete: a.paginationComplete as boolean,
          visitedPages: a.visitedPages as number[],
        }),
      ['advertisements:observe'],
    );

    this.add(
      'submit_listing_advertisement_snapshot_item',
      '에이전트가 로컬 JSON에서 읽은 CP 광고 한 건을 원문과 함께 제출합니다. 광고는 매물 없이도 저장됩니다: 우리 데이터에서 찾은 만큼만 termId·propertyId·siteId 중 가장 깊은 단계 하나로 알리고, 못 찾았으면 셋 다 비우고 제출하세요(오류가 아닙니다). error는 광고 자체를 읽지 못했을 때만 씁니다. 찾는 순서: 단지·건물(search_central_sites, find_office_sites) → 동·호(find_dongs, find_units; 호가 없는 건물이면 create_unit으로 층 공간을 만듦) → find_or_create_property → 그 관리매물에 같은 거래유형의 열린 매물이 정확히 하나면 termId, 아니면 propertyId까지만. raw에 siteName(또는 complexName)·dong·ho·floor·fullAddress·transactionType이 있으면 광고의 원문 칸으로 남습니다.',
      obj(
        {
          sessionId: str('광고 snapshot session ID'),
          raw: {
            type: 'object',
            description: 'Reader JSON의 광고 한 건 원문',
            properties: { externalAdId: str('CP사 광고 ID') },
            required: ['externalAdId'],
            additionalProperties: true,
          },
          termId: str('확정한 거래 조건 ID — 매물의 terms[].id (어느 매물의 어느 조건 광고인지까지 정해졌을 때)'),
          propertyId: str('관리매물 ID (호실까지만 정해졌을 때)'),
          siteId: str('단지·건물 ID (건물까지만 찾았을 때)'),
          resolution: {
            type: 'object',
            description:
              '어떻게 그 연결을 정했는지(고른 dongId/unitId, 판단 근거). termId를 줄 때는 필수',
            additionalProperties: true,
          },
          error: str('광고를 읽지 못한 구체적인 이유. 연결을 못 찾은 것은 여기에 쓰지 않습니다'),
        },
        ['sessionId', 'raw'],
      ),
      async (a, c) =>
        this.listingAdvertisementSnapshots.submitItem(
          c.officeId,
          c.userId,
          c.role ?? 'agent',
          {
            sessionId: a.sessionId as string,
            raw: a.raw as Record<string, unknown>,
            listingId: a.termId as string | null,
            propertyId: a.propertyId as string | null,
            siteId: a.siteId as string | null,
            resolution: a.resolution as Record<string, unknown> | null,
            error: a.error as string | null,
          },
        ),
      ['advertisements:observe'],
    );

    this.add(
      'get_listing_advertisement_snapshot',
      'CP 광고 가져오기 세션의 제출·연결·실패·남은 건수와 실패 항목을 조회합니다.',
      obj({ sessionId: str('광고 snapshot session ID') }, ['sessionId']),
      async (a, c) =>
        this.listingAdvertisementSnapshots.get(
          c.officeId,
          a.sessionId as string,
        ),
      ['advertisements:observe'],
    );

    this.add(
      'complete_listing_advertisement_snapshot',
      '읽지 못한 항목(error)이 없고 manifest가 일치할 때 한 트랜잭션으로 광고 원장을 갱신하고, 이번 완전 스냅샷에서 사라진 CP 광고를 ended 처리합니다. 매물에 연결되지 않은 광고도 그대로 저장됩니다. 끝난 뒤 find_listing_advertisements(link=no_listing)로 매물 없는 광고를 모아, 사용자에게 "이 N건은 매물이 없습니다. 등록할까요?"를 물으세요. 사용자가 원하면 매물을 등록하고 link_listing_advertisement로 연결합니다. 사람이 화면에서 이어 둔 연결은 이번 수집이 연결을 찾지 못해도 지워지지 않습니다.',
      obj({ sessionId: str('광고 snapshot session ID') }, ['sessionId']),
      async (a, c) =>
        this.listingAdvertisementSnapshots.complete(
          c.officeId,
          c.userId,
          c.role ?? 'agent',
          a.sessionId as string,
        ),
      ['advertisements:observe'],
    );

    this.add(
      'cancel_listing_advertisement_snapshot',
      '불완전하거나 잘못된 CP 스냅샷 세션을 취소합니다. 기존 ListingAdvertisement 원장은 변경하지 않습니다.',
      obj({ sessionId: str('광고 snapshot session ID') }, ['sessionId']),
      async (a, c) =>
        this.listingAdvertisementSnapshots.cancel(
          c.officeId,
          c.userId,
          c.role ?? 'agent',
          a.sessionId as string,
        ),
      ['advertisements:observe'],
    );

    // ═══════════════════════════════════════════════════════════
    // 내 광고의 네이버 비교 스냅샷 (OfficeAdvertisements)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_advertisement_comparisons',
      '네이버 비교가 있는 내 광고와 그 비교 목록(지금 네이버에 보이는 광고들, 읽은 시각)을 검색합니다. 지나간 흐름은 find_advertisement_comparison_records로 봅니다.',
      obj({
        search: str('검색어 (CP/네이버 광고번호, 단지명, 호수, 중개사명)'),
        ...page,
      }),
      async (a, c) =>
        this.officeAdvertisements.findComparisons(c.officeId, {
          search: a.search as string,
          page: (a.page as number) ?? 1,
          limit: this.clampLimit(a),
        }),
    );

    this.add(
      'save_advertisement_comparisons',
      '내 광고 한 건마다 네이버에서 같은 집으로 보이는 광고 전체 목록을 저장합니다. 목록은 통째로 넣으세요 — 이번 목록에 없는 줄은 내려간 것으로 처리됩니다. 절반만 읽었으면 넣지 마세요(totalCount를 주면 서버가 모자란 목록을 거절합니다). 모든 항목은 listingAdvertisementId와 그 광고의 정확한 naverArticleNo를 가진 줄을 포함해야 합니다. 한 건의 저장은 전부 되거나 전부 안 되고, 저장할 때마다 그때의 순위 · 최저가 요약이 기록으로 쌓입니다. 달라진 것(더 싼 광고가 생김 등)은 이 호출이 끝날 때 한 번에 묶어 알리므로, 여러 광고는 한 호출에 모아 보내세요.',
      obj(
        {
          comparisons: {
            type: 'array' as const,
            description: '내 광고 한 건마다 하나: 그 광고의 네이버 비교 목록 전체 (최대 100)',
            items: obj(
              {
                listingAdvertisementId: str('비교 대상 내 광고 ID'),
                totalCount: num('네이버가 알려 준 같은 집 광고 수. 주면 목록이 이보다 적을 때 거절한다'),
                advertisements: {
                  type: 'array' as const,
                  description: '네이버에서 같은 집으로 보이는 광고 전체 (내 광고 포함, 1개 이상 필수)',
                  items: obj(
                    {
                      articleNo: str('네이버 매물번호'),
                      sourceUrl: str('네이버 광고 URL'),
                      isMine: bool('내 사무소 광고 여부'),
                      isActive: bool('활성 여부 (기본 true)'),
                      articleName: str('매물명'),
                      realtorName: str('등록 중개사명'),
                      realtorId: str('등록 중개사 ID'),
                      representativeTelNo: str('대표 번호'),
                      price: num('매매가 (만원, 매매 전용)'),
                      deposit: num('전세가 또는 월세 보증금 (만원)'),
                      monthlyRent: num('월세 (만원)'),
                      ranking: num('노출 순위'),
                      sameAddrCnt: num('같은 주소 매물 수'),
                      articleConfirmYmd: str('네이버 매물 확인일 (YYYYMMDD)'),
                      floorInfo: str('네이버 공개 층 표현 (예: 12/25, 저/25)'),
                      verificationTypeCode: str('네이버 확인 방식 코드'),
                      seango: bool('선광고 여부'),
                      epju: bool('e편주 여부'),
                      raw: { type: 'object', description: '원본 응답 JSON' },
                    },
                    ['articleNo'],
                  ),
                },
              },
              ['listingAdvertisementId', 'advertisements'],
            ),
          },
        },
        ['comparisons'],
      ),
      async (a, c) =>
        this.officeAdvertisements.saveComparisons(c.officeId, {
          comparisons: a.comparisons as AdvertisementComparisonInput[],
        }),
      ['advertisements:observe'],
    );

    this.add(
      'find_advertisement_comparison_records',
      '네이버 비교를 읽을 때마다 쌓인 요약(내 순위, 같은 집 광고 수, 경쟁 최저가, 나보다 싼 광고 수, 그때의 판단, 직전과 달라진 것)을 최근 것부터 봅니다. 한 광고의 흐름을 보려면 listingAdvertisementId를, 달라진 것만 보려면 changedOnly를 주세요. changes 값: cheaper_appeared, cheaper_gone, own_hidden, own_restored, floor_disadvantage, rank_changed.',
      obj({
        listingAdvertisementId: str('광고 ID (한 광고의 흐름)'),
        changedOnly: bool('직전 기록에서 달라진 것이 있는 줄만'),
        limit: num('가져올 수 (기본 50, 최대 200)'),
      }),
      async (a, c) =>
        this.officeAdvertisements.findRecords(c.officeId, {
          listingAdvertisementId: a.listingAdvertisementId as string | undefined,
          changedOnly: a.changedOnly as boolean | undefined,
          limit: a.limit as number | undefined,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 연락처 (Contacts)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_contacts',
      '연락처 목록을 검색합니다. 이름, 전화번호, 이메일로 검색. 태그 필터.',
      obj({
        search: str('검색어'),
        tags: strArr('태그 (VIP, 단골 등)'),
        ...page,
      }),
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
      obj(
        {
          name: str('이름'),
          phone: str('대표 전화번호'),
          email: str('이메일'),
          tags: strArr('태그'),
          memo: str('메모'),
        },
        ['name'],
      ),
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
      obj(
        {
          id: str('연락처 ID'),
          name: str('이름'),
          phone: str('전화'),
          email: str('이메일'),
          tags: strArr('태그'),
          memo: str('메모'),
        },
        ['id'],
      ),
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
      '관리매물(Property) 목록: 우리 사무소가 관리하는 호실(집) 자체입니다. 지금 내놓은 매물을 찾을 때는 find_listings를 쓰고, 이 도구는 집을 찾거나(매물 등록 전에 propertyId 얻기) 소유자 · 임대차를 볼 때 씁니다. 한 줄에는 어느 집(place) · 소유자 이름과 대표 전화 · 그 집에 걸린 거래 조건(terms, 어느 매물인지는 listingId) · 임대차 요약만 싣습니다. 전체는 get_property로 봅니다.',
      obj({
        siteId: str('단지 ID'),
        unitId: str('호실 ID'),
        siteType: str('매물유형'),
        wardCode: str('법정동코드'),
        search: str('검색어'),
        ...page,
      }),
      async (a, c) =>
        toLightList(
          await this.properties.findAll(c.officeId, {
            siteId: a.siteId as string,
            unitId: a.unitId as string,
            siteType: a.siteType as string,
            wardCode: a.wardCode as string,
            search: a.search as string,
            page: (a.page as number) ?? 1,
            limit: this.clampLimit(a),
          }),
          toPropertyRow,
        ),
    );

    this.add(
      'get_property',
      '관리매물(호실) 상세. 단지, 호실, 소유자, 세입자, 걸린 거래 조건, 상담기록 포함.',
      obj({ id: str('관리매물 ID') }, ['id']),
      async (a, c) => this.properties.findOne(a.id as string, c.officeId),
    );

    this.add(
      'create_property',
      '새 관리매물을 등록합니다. 단지(siteId)는 필수. 호실(unitId)은 건물형(아파트/오피스텔/빌라/상가/생활숙박시설)은 필수, 토지(land)는 금지, 단독/다가구주택(house)은 선택(통건물·호실 모두 가능). 매물로 내놓는 것은 따로 create_listing으로 등록한다(메모도 거기에 적는다).',
      obj({ siteId: str('단지 ID'), unitId: str('호실 ID') }, ['siteId']),
      async (a, c) =>
        this.properties.create(c.officeId, {
          siteId: a.siteId as string,
          unitId: a.unitId as string,
        }),
    );

    this.add(
      'find_or_create_property',
      '그 자리(단지·건물 + 호실)의 관리매물을 돌려주고, 없으면 만듭니다. 광고를 넣을 때 씁니다: 광고를 낸 호실은 우리가 다루는 호실이므로 사용자에게 묻지 않고 만들어도 됩니다. 의뢰·가격 같은 매물 내용은 만들지 않습니다(매물 등록은 사용자에게 물은 뒤 따로). created로 새로 만들었는지 알 수 있습니다.',
      obj(
        { siteId: str('단지·건물 ID'), unitId: str('호실(공간) ID. 단독주택·토지는 생략') },
        ['siteId'],
      ),
      async (a, c) =>
        this.properties.ensure(c.officeId, {
          siteId: a.siteId as string,
          unitId: a.unitId as string | undefined,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 거래 (Deals)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_deals',
      '거래 목록: 어느 집 · 누구 · 어느 단계 · 합의 금액 · 대금 일정 · 계약서 요약 · 수수료 합계. 조건 없이 부르면 사무소의 모든 거래(취소 · 종료 포함)가 오니 조건으로 좁히세요. 수수료 청구와 배분, 연락처 상세는 get_deal로 봅니다.',
      obj({
        activeOnly: bool('진행 중인 거래만 (취소 · 정산 종료 제외)'),
        propertyId: str('이 매물(Property)의 거래만'),
        partnerBrokerId: str('이 파트너 중개사와의 거래만'),
        jointOnly: bool('공동중개 거래만'),
        withoutContract: bool('계약서가 아직 없는 거래만'),
        search: str('단지 이름 · 매수인 · 매도인 이름으로 찾기'),
        limit: num('줄 수 상한 (최대 100)'),
      }),
      // 화면과 같은 기준: 중개사에게는 담당 거래에만 수수료 합계를 싣는다.
      async (a, c) =>
        this.deals.findAll(
          c.officeId,
          {
            activeOnly: a.activeOnly === true,
            propertyId: a.propertyId as string | undefined,
            partnerBrokerId: a.partnerBrokerId as string | undefined,
            jointOnly: a.jointOnly === true,
            withoutContract: a.withoutContract === true,
            search: a.search as string | undefined,
            limit: a.limit as number | undefined,
          },
          { userId: c.userId, role: c.role ?? 'agent' },
        ),
    );

    this.add(
      'get_deal',
      '거래 상세.',
      obj({ id: str('거래 ID') }, ['id']),
      async (a, c) =>
        this.deals.findOne(a.id as string, c.officeId, {
          userId: c.userId,
          role: c.role ?? 'agent',
        }),
    );

    this.add(
      'create_deal',
      '새 거래를 시작합니다. 화면의 거래 전환 창에서 "확정"을 누르는 것과 같으므로, 거래 유형·합의 금액·매수인(임차인)·매도인(임대인)을 사용자에게 확인받은 뒤 부릅니다. matchId를 주면 그 매칭이 "거래 전환" 단계로 함께 넘어가고, 당사자를 비우면 매칭의 손님과 물건의 대표 소유자로 채웁니다.',
      obj(
        {
          termId: str('거래 조건 ID (매물의 terms[].id)'),
          matchId: str('매칭 ID (이 매물의 매칭이어야 합니다)'),
          transactionType: strEnum('거래 유형', ['sale', 'jeonse', 'monthly']),
          agreedPrice: num('합의된 거래가 / 전세금 (만원)'),
          agreedDeposit: num('합의된 보증금 (만원, 월세)'),
          agreedMonthlyRent: num('합의된 월세 (만원)'),
          buyerContactId: str('매수인·임차인 연락처 ID'),
          sellerContactId: str('매도인·임대인 연락처 ID'),
          specialTerms: str('특약'),
          memo: str('메모'),
        },
        ['termId'],
      ),
      (a, c) =>
        this.deals.create(
          c.officeId,
          {
            listingId: a.termId as string,
            matchId: a.matchId as string | undefined,
            transactionType: a.transactionType as string | undefined,
            agreedPrice: a.agreedPrice as number | undefined,
            agreedDeposit: a.agreedDeposit as number | undefined,
            agreedMonthlyRent: a.agreedMonthlyRent as number | undefined,
            buyerContactId: a.buyerContactId as string | undefined,
            sellerContactId: a.sellerContactId as string | undefined,
            specialTerms: a.specialTerms as string | undefined,
            memo: a.memo as string | undefined,
          },
          // 만든 사람을 넘겨야 거래의 담당이 채워진다(비면 직원 정산에 "담당이 정해지지 않음"으로 나온다).
          c.userId ? { userId: c.userId, role: c.role ?? 'agent' } : undefined,
        ),
    );

    this.add(
      'update_deal_stage',
      '거래 단계를 변경합니다. `contracted` 단계에서 계약서를 작성하며, `settling` 이상 단계는 Contract가 존재해야 합니다.',
      obj(
        {
          id: str('거래 ID'),
          stage: strEnum('단계', [
            'preparing',
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
        status: strEnum('상태', ['active', 'hold', 'completed']),
        urgency: strEnum('긴급도', ['urgent', 'normal', 'flexible']),
        transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
        assignedToId: str('담당자 ID'),
        monthlyRentMin: num('최소 월세 (만원)'),
        monthlyRentMax: num('최대 월세 (만원)'),
        ...page,
      }),
      async (a, c) =>
        this.buyerReqs.findAll(c.officeId, {
          status: a.status as string,
          urgency: a.urgency as string,
          transactionType: a.transactionType as string,
          assignedToId: a.assignedToId as string,
          monthlyRentMin: a.monthlyRentMin as number,
          monthlyRentMax: a.monthlyRentMax as number,
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
      obj(
        {
          contactId: str('연락처 ID'),
          transactionType: strEnum('거래유형', ['sale', 'jeonse', 'monthly']),
          siteTypes: strArr('희망 유형 (apartment, villa 등)'),
          priceMin: num('최소 예산 (만원)'),
          priceMax: num('최대 예산 (만원)'),
          depositMin: num('최소 보증금 (만원)'),
          depositMax: num('최대 보증금 (만원)'),
          monthlyRentMin: num('최소 월세 (만원)'),
          monthlyRentMax: num('최대 월세 (만원)'),
          areaMin: num('최소 공급면적 (m²)'),
          areaMax: num('최대 공급면적 (m²)'),
          urgency: strEnum('긴급도', ['urgent', 'normal', 'flexible']),
          memo: str('요건 메모'),
        },
        ['contactId'],
      ),
      async (a, c) =>
        this.buyerReqs.create(c.officeId, {
          contactId: a.contactId as string,
          transactionType: a.transactionType as string,
          siteTypes: a.siteTypes as string[],
          priceMin: a.priceMin as number,
          priceMax: a.priceMax as number,
          depositMin: a.depositMin as number,
          depositMax: a.depositMax as number,
          monthlyRentMin: a.monthlyRentMin as number,
          monthlyRentMax: a.monthlyRentMax as number,
          areaMin: a.areaMin as number,
          areaMax: a.areaMax as number,
          urgency: a.urgency as string,
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
      '상담기록 목록. 연락처, 호실, 매물, 구매 의뢰, 거래, 프로젝트별 필터.',
      obj({
        contactId: str('연락처 ID'),
        propertyId: str('관리매물(호실) ID'),
        listingId: str('매물 ID'),
        buyerIntakeId: str('구매 의뢰 ID'),
        dealId: str('거래 ID'),
        projectId: str('프로젝트 ID'),
        ...page,
      }),
      async (a, c) =>
        this.consultations.findAll(c.officeId, {
          contactId: a.contactId as string,
          propertyId: a.propertyId as string,
          listingIntakeId: a.listingId as string,
          buyerIntakeId: a.buyerIntakeId as string,
          dealId: a.dealId as string,
          projectId: a.projectId as string,
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
      obj(
        {
          contactId: str('연락처 ID'),
          type: strEnum('상담유형', ['phone', 'visit', 'online']),
          content: str('메모 내용'),
          propertyId: str('관련 관리매물(호실) ID'),
          listingId: str('관련 매물 ID'),
          buyerIntakeId: str('관련 구매 의뢰 ID'),
          dealId: str('관련 거래 ID'),
          projectId: str('관련 프로젝트 ID'),
        },
        ['contactId', 'type', 'content'],
      ),
      async (a, c) =>
        this.consultations.create(c.officeId, c.userId, {
          contactId: a.contactId as string,
          type: a.type as string,
          content: a.content as string,
          propertyId: a.propertyId as string,
          listingIntakeId: a.listingId as string,
          buyerIntakeId: a.buyerIntakeId as string,
          dealId: a.dealId as string,
          projectId: a.projectId as string,
        }),
    );

    this.add(
      'get_recent_consultations',
      '최근 상담기록을 조회합니다.',
      obj({ limit: num('조회 수 (기본 10)') }),
      async (a, c) =>
        this.consultations.getRecent(c.officeId, (a.limit as number) ?? 10),
    );

    // ═══════════════════════════════════════════════════════════
    // 매칭 (Matches)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_matches',
      '매칭 목록: 어느 손님(이름 · 연락처 · 희망 조건 요점)에게 어느 집(단지 · 동 · 호 · 가격)을 연결했고 어느 단계인지. 최근에 만든 것부터 50건씩 옵니다 — 조건으로 좁히거나 page로 넘기세요. 손님 조건의 나머지와 단지 상세는 get_match로 봅니다.',
      obj({
        buyerReqId: str('이 구매조건(BuyerRequirement)의 매칭만'),
        propertyId: str('이 매물(Property)의 매칭만'),
        termId: str('이 거래 조건의 매칭만 (매물의 terms[].id)'),
        stage: str(
          '단계 (여럿은 콤마): suggested, buyerInterested, viewingConfirmed, viewing, buyerReviewing, negotiating, dealCreated, closed',
        ),
        openOnly: bool('진행 중인 매칭만 (종료 · 거래 전환 제외)'),
        search: str('단지 이름 · 손님 이름으로 찾기'),
        page: num('쪽 번호 (기본 1)'),
        limit: num('쪽 크기 (기본 50, 최대 100)'),
      }),
      async (a, c) =>
        this.matches.findAll(c.officeId, {
          buyerReqId: a.buyerReqId as string | undefined,
          propertyId: a.propertyId as string | undefined,
          listingId: a.termId as string | undefined,
          stage: a.stage as string | undefined,
          openOnly: a.openOnly === true,
          search: a.search as string | undefined,
          page: a.page as number | undefined,
          limit: a.limit as number | undefined,
        }),
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
      obj(
        {
          termId: str('거래 조건 ID (매물의 terms[].id)'),
          buyerReqId: str('구매조건 ID'),
          memo: str('메모'),
        },
        ['termId', 'buyerReqId'],
      ),
      async (a, c) =>
        this.matches.create(c.officeId, {
          listingId: a.termId as string,
          buyerReqId: a.buyerReqId as string,
          memo: a.memo as string,
        }),
    );

    this.add(
      'update_match_stage',
      '매칭 단계를 변경합니다. "거래 전환"(dealCreated)은 이 도구로 올리지 않습니다 — 그 값을 주면 확인할 거래 조건(dealDraft)을 돌려주니, 사용자에게 확인받고 create_deal에 matchId를 넣어 거래를 만드세요. 그러면 매칭이 함께 넘어갑니다.',
      obj(
        {
          id: str('매칭 ID'),
          stage: strEnum('단계', [...MATCH_STAGE_ORDER]),
          memo: str('메모'),
        },
        ['id', 'stage'],
      ),
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
      '계약 목록: 금액 · 날짜 · 상태 · 당사자 이름 · 집 · 문서의 제목과 상태. 문서 내용과 당사자 상세는 get_contract로 봅니다.',
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
      '주거용 매매계약서의 불변 revision을 만듭니다. 계약·매물·당사자·중개사무소 정보를 자동 입력하며 현재 계약 문서는 덮어쓰지 않습니다.',
      obj(
        {
          contractId: str('매매 Contract ID'),
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
      async (a, c) => this.prepareSaleContractDraft(a, c),
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
      '업무 목록. 광고 자동화는 category=advertisement, status=pending으로 조회합니다.',
      obj({
        status: strEnum('업무 상태', [
          'pending',
          'in_progress',
          'completed',
          'cancelled',
        ]),
        category: str('업무 카테고리 (광고작업은 advertisement)'),
        assignedToId: str('담당자 ID'),
        projectId: str('프로젝트 ID (그 프로젝트에 적은 업무만)'),
      }),
      async (a, c) =>
        this.tasks.findAll(c.officeId, {
          status: a.status as string | undefined,
          category: a.category as string | undefined,
          assignedToId: a.assignedToId as string | undefined,
          projectId: a.projectId as string | undefined,
        }),
      ['tasks:read'],
    );

    this.add(
      'get_task',
      '업무 상세.',
      obj({ id: str('업무 ID') }, ['id']),
      async (a, c) => this.tasks.findOne(a.id as string, c.officeId),
      ['tasks:read'],
    );

    this.add(
      'create_task',
      '새 업무를 생성합니다.',
      obj(
        {
          title: str('제목'),
          content: str('내용'),
          source: strEnum('출처', ['manual', 'system', 'ai']),
          priority: str('우선순위'),
          category: str('카테고리'),
          dueDate: str('마감일 (ISO)'),
          assignedToId: str('담당자 ID'),
          contactId: str('관련 연락처 ID'),
          propertyId: str('관련 관리매물(호실) ID'),
          listingId: str('관련 매물 ID'),
          termId: str('관련 거래 조건 ID'),
          consultationId: str('관련 상담 ID'),
          buyerReqId: str('관련 구매조건 ID'),
          matchId: str('관련 매칭 ID'),
          dealId: str('관련 거래 ID'),
          contractId: str('관련 계약 ID'),
          projectId: str('이 업무를 적어 둘 프로젝트 ID'),
        },
        ['title'],
      ),
      async (a, c) =>
        this.tasks.create(
          c.officeId,
          {
            title: a.title as string,
            content: a.content as string,
            source: (a.source as string) ?? 'ai',
            priority: a.priority as string,
            category: a.category as string,
            dueDate: a.dueDate as string,
            assignedToId: a.assignedToId as string,
            contactId: a.contactId as string,
            propertyId: a.propertyId as string,
            listingIntakeId: a.listingId as string,
            listingId: a.termId as string,
            consultationId: a.consultationId as string,
            buyerReqId: a.buyerReqId as string,
            matchId: a.matchId as string,
            dealId: a.dealId as string,
            contractId: a.contractId as string,
            projectId: a.projectId as string,
          },
          c.userId,
        ),
      ['tasks:write'],
    );

    this.add(
      'claim_task',
      'pending 업무를 현재 MCP 사용자에게 원자적으로 선점하고 in_progress로 전환합니다. 이미 다른 실행자가 선점했으면 실패합니다.',
      obj({ id: str('업무 ID') }, ['id']),
      async (a, c) =>
        this.tasks.claim(a.id as string, c.officeId, c.userId),
      ['tasks:write'],
    );

    this.add(
      'update_task',
      '업무를 수정합니다.',
      obj(
        {
          id: str('업무 ID'),
          title: str('제목'),
          content: str('내용'),
          status: str('상태'),
          priority: str('우선순위'),
          dueDate: str('마감일'),
        },
        ['id'],
      ),
      async (a, c) =>
        this.tasks.update(a.id as string, c.officeId, {
          title: a.title as string,
          content: a.content as string,
          status: a.status as string,
          priority: a.priority as string,
          dueDate: a.dueDate as string,
        }),
      ['tasks:write'],
    );

    // ═══════════════════════════════════════════════════════════
    // 캘린더 (Calendar Events)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_calendar_events',
      '캘린더 일정을 조회합니다. 기간, 유형, 담당자 필터.',
      obj({
        start: str('시작일 (ISO)'),
        end: str('종료일 (ISO)'),
        type: str('유형'),
        userId: str('담당자 ID'),
      }),
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
      obj(
        {
          title: str('제목'),
          description: str('설명'),
          type: strEnum('유형', [
            'viewing',
            'contract',
            'meeting',
            'task',
            'general',
          ]),
          allDay: bool('종일 여부'),
          start: str('시작 (ISO)'),
          end: str('종료 (ISO)'),
          contactId: str('연락처 ID'),
          propertyId: str('관리매물(호실) ID'),
          listingId: str('매물 ID'),
          termId: str('거래 조건 ID'),
          dealId: str('거래 ID'),
        },
        ['title', 'start'],
      ),
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
          listingIntakeId: a.listingId as string,
          listingId: a.termId as string,
          dealId: a.dealId as string,
        }),
    );

    // ═══════════════════════════════════════════════════════════
    // 단지/동/호실 (Sites / Dongs / Units)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_sites',
      '이 사무소가 직접 등록한 비공개 건물 목록(대장에 없는 건물 등). 아파트 같은 공공 단지는 여기에 나오지 않습니다 — 관리 단지는 find_office_sites, 전국 단지 검색은 search_central_sites를 쓰세요.',
      obj({}),
      async (_a, c) => this.sites.findAll(c.officeId),
    );

    this.add(
      'get_site',
      '단지 상세: 주소 · 동 목록 · 평형. 호는 들어 있지 않습니다 — find_dongs로 동을 고른 뒤 find_units(dongId)로 찾으세요. 동 구분이 없는 작은 건물은 find_units(siteId)로 호를 한 번에 봅니다.',
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
      '호실 목록(배열). dongId를 주면 그 동의 호를 모두 돌려줍니다 — 호를 찾을 때는 find_dongs로 동을 고른 뒤 이렇게 부르세요. dongId 없이 siteId만 주거나 아무것도 주지 않으면 한 번에 limit개(기본 300, 최대 500)만 돌려주므로 page로 넘겨 봅니다(단지 하나에 수천 호가 있습니다).',
      obj({
        siteId: str('단지 ID'),
        dongId: str('동 ID'),
        page: num('페이지 번호 (기본 1) — dongId가 없을 때만'),
        limit: num('페이지당 수 (기본 300, 최대 500) — dongId가 없을 때만'),
      }),
      async (a, c) => {
        // 어느 단지 · 동의 호인지 알 id와 이름만 붙여 받는다(단지 · 동의 나머지 칸은 get_site · find_dongs에 있다)
        const all = await this.units.findAll(
          c.officeId,
          { siteId: a.siteId as string, dongId: a.dongId as string },
          { withPlace: true },
        );
        // 결과는 예전과 같은 배열이다(로컬 스킬이 동의 호 전체에서 호를 찾는다). 동으로 좁힌 호출은 자르지 않고,
        // 단지 전체 · 조건 없는 호출만 나눠 준다 — 한 번에 16MB가 나가던 것을 막는다.
        if (a.dongId) return all;
        const limit = Math.min(500, Math.max(1, Math.trunc(Number(a.limit) || 300)));
        const pageNo = Math.max(1, Math.trunc(Number(a.page) || 1));
        return all.slice((pageNo - 1) * limit, pageNo * limit);
      },
    );

    this.add(
      'create_unit',
      '건물 아래에 이 사무소의 공간을 만듭니다. 대장에 호가 없는 건물(다가구, 일반 상가건물)이나 호 없이 층이 거래 단위인 경우에 씁니다. 공공 건물 아래에도 만들 수 있고, 만든 공간은 이 사무소만 봅니다. name(호 이름 또는 "좌측" 같은 구획 이름)과 floor 중 하나는 꼭 줍니다. 층은 숫자입니다: 지하는 음수(B2 = -2), 0층은 없습니다. 여러 층을 한 공간으로 둘 때는 floor와 floorEnd(1~2층 = 1, 2). 같은 이름의 공공 호가 이미 있으면 만들지 않고 그 호의 unitId를 알려 줍니다.',
      obj(
        {
          siteId: str('단지·건물 ID'),
          dongId: str('동 ID (동 구분이 없는 건물은 find_dongs의 숨김용 동)'),
          name: str('호 이름(예: 101) 또는 층의 일부에 붙인 이름(예: 좌측). 층 전체면 생략'),
          floor: num('층. 지하는 음수 (B2 = -2), 0은 쓰지 않음'),
          floorEnd: num('여러 층을 한 공간으로 둘 때의 끝 층'),
          floorLabel: str('숫자로 안 떨어지는 층의 표시 이름 (반지하, M층, 옥탑)'),
          exclusiveAreaM2: num('전용면적 (m²)'),
          supplyAreaM2: num('공급면적 (m²)'),
        },
        ['siteId', 'dongId'],
      ),
      async (a, c) =>
        this.units.create(c.officeId, {
          siteId: a.siteId as string,
          dongId: a.dongId as string,
          name: a.name as string | undefined,
          floor: a.floor as number | undefined,
          floorEnd: a.floorEnd as number | undefined,
          floorLabel: a.floorLabel as string | undefined,
          exclusiveAreaM2: a.exclusiveAreaM2 as number | undefined,
          supplyAreaM2: a.supplyAreaM2 as number | undefined,
        }),
    );

    this.add(
      'get_unit',
      '호실 상세.',
      obj({ id: str('호실 ID') }, ['id']),
      async (a, c) => this.units.findOne(a.id as string, c.officeId),
    );

    // ═══════════════════════════════════════════════════════════
    // 관리단지 구독 (Office Sites)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_office_sites',
      '사무소가 구독 중인 관리 단지 목록.',
      obj({}),
      async (_a, c) => this.officeSites.findAll(c.officeId),
    );

    this.add(
      'search_central_sites',
      '공공 단지와 우리 사무소의 비공개 단지를 검색합니다. 단지명, 주소로 검색.',
      obj({ query: str('검색어') }, ['query']),
      async (a, c) => this.officeSites.searchCentralSites(a.query as string, c.officeId),
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
      obj({ propertyId: str('관리매물(호실) ID') }, ['propertyId']),
      async (a, c) =>
        this.propertyContacts.findByProperty(
          c.officeId,
          a.propertyId as string,
        ),
    );

    this.add(
      'create_property_contact',
      '매물에 관련인을 추가합니다.',
      obj(
        {
          contactId: str('연락처 ID'),
          propertyId: str('관리매물(호실) ID'),
          role: strEnum('역할', [
            'owner',
            'co_owner',
            'representative',
            'lawyer',
            'tax_agent',
          ]),
          shareRatio: num('지분비율 (%)'),
          isResident: bool('실거주 여부'),
          isPrimary: bool('주 연락처'),
          memo: str('메모'),
        },
        ['contactId', 'propertyId', 'role'],
      ),
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
    // 세대·법인 소속 (Parties)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_contact_parties',
      '연락처의 세대 구성원 및 법인 소속 목록.',
      obj({ contactId: str('연락처 ID') }, ['contactId']),
      async (a, c) =>
        this.parties.findByContact(c.officeId, a.contactId as string),
    );

    // ═══════════════════════════════════════════════════════════
    // 세입자 · 임대차 (Property Leases / Tenants)
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_tenants',
      '매물의 임대차(세입자) 목록.',
      obj({ propertyId: str('관리매물(호실) ID') }, ['propertyId']),
      async (a, c) =>
        this.tenants.findByProperty(c.officeId, a.propertyId as string),
    );

    this.add(
      'find_expiring_contracts',
      '임대 계약 만료 임박 임대차(세입자) 목록.',
      obj({ withinDays: num('일수 (기본 90)') }),
      async (a, c) =>
        this.tenants.findExpiringContracts(
          c.officeId,
          (a.withinDays as number) ?? 90,
        ),
    );

    this.add(
      'create_tenant',
      '임대차 및 세입자를 등록합니다.',
      obj(
        {
          propertyId: str('관리매물(호실) ID'),
          contactId: str('연락처 ID'),
          role: str('임차인 역할 (tenant | co_tenant | resident)'),
          deposit: num('보증금 (만원)'),
          monthlyRent: num('월세 (만원)'),
          contractStart: str('계약 시작일'),
          contractEnd: str('계약 종료일'),
          memo: str('메모'),
        },
        ['propertyId', 'contactId'],
      ),
      async (a, c) =>
        this.tenants.create(c.officeId, {
          propertyId: a.propertyId as string,
          contactId: a.contactId as string,
          role: (a.role as string | undefined) ?? undefined,
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
    // 급여·배분율은 화면과 같은 기준으로 가린다(대표와 본인만 본다). 서비스를 바로 부르면 그대로 나간다.
    const asEmployeeViewer = (c: McpContext) =>
      ({
        userId: c.userId,
        officeId: c.officeId,
        role: c.role ?? 'agent',
      }) as Parameters<EmployeesService['forViewer']>[0];

    this.add('find_employees', '직원 목록.', obj({}), async (_a, c) => {
      const viewer = asEmployeeViewer(c);
      const employees = await this.employees.findAll(c.officeId);
      return employees.map((employee) =>
        this.employees.forViewer(viewer, employee),
      );
    });

    this.add(
      'get_employee',
      '직원 상세: 기본 정보와 건수(counts). 딸린 목록은 include에 적은 것만 붙습니다(각 목록은 최근·급한 순으로 일부만). 담당 업무·구매조건 전체는 find_tasks·find_buyer_requirements의 assignedToId로 찾으세요.',
      obj(
        {
          id: str('직원 ID'),
          include: str(
            `함께 받을 목록, 쉼표로 여러 개: ${EMPLOYEE_SECTIONS.join(', ')}`,
          ),
        },
        ['id'],
      ),
      async (a, c) => {
        const wanted = new Set(
          String(a.include ?? '')
            .split(',')
            .map((name) => name.trim())
            .filter(Boolean),
        );
        const unknown = [...wanted].filter((name) => !isEmployeeSection(name));
        if (unknown.length > 0) {
          throw new BadRequestException(
            `include에 쓸 수 없는 값입니다: ${unknown.join(', ')} (쓸 수 있는 값: ${EMPLOYEE_SECTIONS.join(', ')})`,
          );
        }
        const id = a.id as string;
        const viewer = asEmployeeViewer(c);
        const employee: Record<string, unknown> = this.employees.forViewer(
          viewer,
          await this.employees.findProfile(id, c.officeId),
        );
        // 화면과 같은 가리기(급여·수수료)를 목록마다 거친다
        for (const section of EMPLOYEE_SECTIONS) {
          if (!wanted.has(section)) continue;
          employee[EMPLOYEE_INCLUDE_FIELDS[section]] = this.employees.sectionForViewer(
            viewer,
            id,
            section,
            await this.employees.findSection(id, c.officeId, section),
          );
        }
        return employee;
      },
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

    this.registerExternalListingTools();

    // ═══════════════════════════════════════════════════════════
    // 수수료/캐시플로우 (Finance) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_commission_payments',
      '수수료 수금 내역. 사무소 전체 또는 거래별.',
      obj({ dealId: str('거래 ID'), status: str('상태 필터') }),
      async (a, c) => {
        // 화면과 같은 기준: 중개사(agent)는 담당으로 배정된 거래의 청구만, 전화번호 없이 받는다.
        const viewer = c.userId
          ? { userId: c.userId, role: c.role ?? 'agent' }
          : undefined;
        return a.dealId
          ? this.commissionPayments.listByDeal(
              c.officeId,
              a.dealId as string,
              viewer,
            )
          : this.commissionPayments.listByOffice(
              c.officeId,
              { status: a.status as string },
              viewer,
            );
      },
    );

    this.add(
      'get_cashflow_summary',
      '월별 캐시플로우 요약 (수금, 공동중개 줄 몫, 받을 돈).',
      obj({ year: num('연도'), month: num('월') }, ['year', 'month']),
      async (a, c) => {
        // 화면의 캐시플로우와 같은 권한: 대표·매니저만 본다.
        if (!['owner', 'manager'].includes(c.role ?? 'agent')) {
          throw new ForbiddenException(
            '캐시플로우 요약은 대표·매니저만 볼 수 있습니다.',
          );
        }
        return this.cashflow.getSummary(
          c.officeId,
          a.year as number,
          a.month as number,
        );
      },
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
      obj({ propertyId: str('관리매물(호실) ID') }, ['propertyId']),
      async (a, c) =>
        this.publicDocs.listByProperty(c.officeId, a.propertyId as string),
    );

    // ═══════════════════════════════════════════════════════════
    // 매물 사진 (Property Photos) — 읽기만
    // ═══════════════════════════════════════════════════════════
    this.add(
      'find_property_photos',
      '매물의 사진 목록.',
      obj({ propertyId: str('관리매물(호실) ID') }, ['propertyId']),
      async (a, c) =>
        this.propertyPhotos.listByProperty(c.officeId, a.propertyId as string),
    );

    // ═══════════════════════════════════════════════════════════
  }
}
