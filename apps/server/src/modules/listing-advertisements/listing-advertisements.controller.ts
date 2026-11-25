import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
import {
  AdvertisementLinkFilter,
  ExpectedAdvertisedAmounts,
  ListingAdvertisementsService,
} from "./listing-advertisements.service";
import {
  AdvertisementChangeRequestsService,
  CreateAdvertisementChangeRequestItemDto,
  CreateAdvertisementChangeRequestsBatchDto,
  UpdateAdvertisementChangeRequestStatusDto,
} from "./advertisement-change-requests.service";
import { OfficeCpAccountsService } from "./office-cp-accounts.service";
import { AdvertisementRawFields } from "./advertisement-link";

@ApiTags("광고 게재")
@ApiBearerAuth()
@Controller("listing-advertisements")
@UseGuards(JwtAuthGuard)
export class ListingAdvertisementsController {
  constructor(
    private readonly service: ListingAdvertisementsService,
    private readonly changeRequests: AdvertisementChangeRequestsService,
    private readonly cpAccounts: OfficeCpAccountsService,
  ) {}

  /** 사무소가 등록한 CP 계정 목록 */
  @Get("cp-accounts")
  findCpAccounts(
    @CurrentUser() user: CurrentUserPayload,
    @Query("channel") channel: string,
    @Query("includeInactive") includeInactive: string,
  ) {
    return this.cpAccounts.findAll(user.officeId, {
      channel: channel || undefined,
      includeInactive: includeInactive === "true",
    });
  }

  /** CP 계정 등록 · 별칭 갱신 (accountKey = CP 로그인 ID) */
  @Post("cp-accounts")
  upsertCpAccount(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      channel: string;
      accountKey: string;
      accountName?: string | null;
    },
  ) {
    return this.cpAccounts.upsertAccount(user.officeId, body);
  }

  @Patch("cp-accounts/:accountId")
  updateCpAccount(
    @Param("accountId") accountId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { accountName?: string | null; isActive?: boolean },
  ) {
    return this.cpAccounts.update(user.officeId, accountId, body);
  }

  /** 걸려 있는(또는 전체) 광고 변경 요청 */
  @Get("change-requests")
  findOpenChangeRequests(
    @CurrentUser() user: CurrentUserPayload,
    @Query("advertisementId") advertisementId: string,
    @Query("listingId") listingId: string,
    @Query("channel") channel: string,
    @Query("cpAccountId") cpAccountId: string,
    @Query("accountKey") accountKey: string,
    @Query("status") status: string,
    @Query("includeClosed") includeClosed: string,
  ) {
    return this.changeRequests.findOpen(user.officeId, {
      advertisementId: advertisementId || undefined,
      listingId: listingId || undefined,
      channel: channel || undefined,
      cpAccountId: cpAccountId || undefined,
      accountKey: accountKey || undefined,
      status: status || undefined,
      includeClosed: includeClosed === "true",
    });
  }

  /** 신규 게재(publish) 포함 단건 변경 요청 생성 */
  @Post("change-requests")
  createUnifiedChangeRequest(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateAdvertisementChangeRequestItemDto,
  ) {
    return this.changeRequests.createSingle(user.officeId, user.userId, body);
  }

  /** 여러 광고의 변경 요청을 한 묶음 업무(Task, N:1)로 생성 */
  @Post("change-requests/batch")
  createBatchChangeRequests(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateAdvertisementChangeRequestsBatchDto,
  ) {
    return this.changeRequests.createBatch(user.officeId, user.userId, body);
  }

  /** 에이전트·담당자가 요청 진행/실행/실패 상태를 기록 */
  @Patch("change-requests/:requestId")
  updateChangeRequestStatus(
    @Param("requestId") requestId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: UpdateAdvertisementChangeRequestStatusDto,
  ) {
    return this.changeRequests.updateStatus(user.officeId, requestId, body);
  }

  /** 요청 거두기 */
  @Delete("change-requests/:requestId")
  cancelChangeRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.changeRequests.cancel(user.officeId, requestId);
  }

  @Get("price-history")
  findPriceHistory(
    @CurrentUser() user: CurrentUserPayload,
    @Query("listingId") listingId: string,
  ) {
    return this.service.findPriceHistory(user.officeId, listingId);
  }

  @Get()
  findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Query("listingId") listingId: string,
    @Query("channel") channel: string,
    @Query("cpAccountId") cpAccountId: string,
    @Query("status") status: string,
    @Query("search") search: string,
    @Query("propertyId") propertyId: string,
    @Query("link") link: string,
    @Query("requests") requests: string,
    @Query("sortBy") sortBy: string,
    @Query("sortOrder") sortOrder: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    return this.service.findAll(user.officeId, {
      listingId: listingId || undefined,
      channel: channel || undefined,
      cpAccountId: cpAccountId || undefined,
      status: status || undefined,
      search: search || undefined,
      propertyId: propertyId || undefined,
      link: (link as AdvertisementLinkFilter) || undefined,
      requests: requests === "pending" ? "pending" : undefined,
      sortBy:
        (sortBy as "createdAt" | "updatedAt" | "startedAt" | "lastCheckedAt") ||
        undefined,
      sortOrder: (sortOrder as "asc" | "desc") || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post()
  create(
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: AdvertisementRawFields & {
      listingId?: string | null;
      propertyId?: string | null;
      siteId?: string | null;
      cpAccountId?: string | null;
      accountKey?: string | null;
      channel: string;
      status?: string;
      advertisedPrice?: number | null;
      advertisedDeposit?: number | null;
      advertisedMonthlyRent?: number | null;
      startedAt?: string | null;
      endedAt?: string | null;
      url?: string | null;
      memo?: string | null;
      externalAdId?: string | null;
      naverArticleNo?: string | null;
      naverUrl?: string | null;
      lastCheckedAt?: string | null;
      lastSyncedAt?: string | null;
    },
  ) {
    return this.service.create(user.officeId, body);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: AdvertisementRawFields & Partial<{
      cpAccountId: string | null;
      accountKey: string | null;
      channel: string;
      status: string;
      advertisedPrice: number | null;
      advertisedDeposit: number | null;
      advertisedMonthlyRent: number | null;
      startedAt: string | null;
      endedAt: string | null;
      url: string | null;
      memo: string | null;
      externalAdId: string | null;
      naverArticleNo: string | null;
      naverUrl: string | null;
      lastCheckedAt: string | null;
      lastSyncedAt: string | null;
      /** 보고 있던 가격. 그 사이 바뀌었으면 409 */
      expected: ExpectedAdvertisedAmounts | null;
    }>,
  ) {
    return this.service.update(id, user.officeId, body);
  }

  /** 광고 한 건의 흐름: 광고 이력 + 네이버 비교 기록 + 변경 요청 이력 */
  @Get(":id/timeline")
  findTimeline(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findTimeline(id, user.officeId);
  }

  /** 광고를 매물 · 관리 공간 · 건물에 연결하거나 푼다. 아는 가장 깊은 단계 하나만 보낸다. */
  @Patch(":id/link")
  link(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body()
    body: {
      listingId?: string | null;
      propertyId?: string | null;
      siteId?: string | null;
    },
  ) {
    return this.service.link(id, user.officeId, body ?? {});
  }

  /** CP에서 이렇게 바꿔 달라는 요청. 광고 업무가 생긴다 (값을 바로 고치는 것은 PATCH :id). */
  @Post(":id/change-requests")
  createChangeRequest(
    @Param("id") id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateAdvertisementChangeRequestItemDto,
  ) {
    return this.changeRequests.create(user.officeId, user.userId, id, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.officeId);
  }
}
