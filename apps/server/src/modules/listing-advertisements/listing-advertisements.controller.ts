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
import { ListingAdvertisementsService } from "./listing-advertisements.service";

@ApiTags("광고 게재")
@ApiBearerAuth()
@Controller("listing-advertisements")
@UseGuards(JwtAuthGuard)
export class ListingAdvertisementsController {
  constructor(private readonly service: ListingAdvertisementsService) {}

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
    @Query("status") status: string,
    @Query("source") source: string,
    @Query("search") search: string,
    @Query("sortBy") sortBy: string,
    @Query("sortOrder") sortOrder: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
  ) {
    return this.service.findAll(user.officeId, {
      listingId: listingId || undefined,
      channel: channel || undefined,
      status: status || undefined,
      source: source || undefined,
      search: search || undefined,
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
    body: {
      listingId: string;
      channel: string;
      status?: string;
      source?: string;
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
    body: Partial<{
      channel: string;
      status: string;
      source: string;
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
    }>,
  ) {
    return this.service.update(id, user.officeId, body);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.officeId);
  }
}
