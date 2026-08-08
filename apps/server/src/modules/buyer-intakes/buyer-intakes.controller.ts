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
import type { BuyerIntakeContactRole } from "@estate-erp/shared";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import {
  BuyerIntakesService,
  type BuyerIntakeContactInput,
} from "./buyer-intakes.service";

@ApiTags("구매 의뢰")
@ApiBearerAuth()
@Controller("buyer-intakes")
@UseGuards(JwtAuthGuard)
export class BuyerIntakesController {
  constructor(private readonly service: BuyerIntakesService) {}

  @Get()
  findAll(
    @Query("contactId") contactId: string,
    @Query("lifecycleStatus") lifecycleStatus: string,
    @Query("status") status: string,
    @Query("urgency") urgency: string,
    @Query("transactionType") transactionType: string,
    @Query("siteTypes") siteTypes: string,
    @Query("assignedToId") assignedToId: string,
    @Query("preferredSiteIds") preferredSiteIds: string,
    @Query("provinceCodes") provinceCodes: string,
    @Query("districtCodes") districtCodes: string,
    @Query("wardCodes") wardCodes: string,
    @Query("priceMin") priceMin: string,
    @Query("priceMax") priceMax: string,
    @Query("depositMin") depositMin: string,
    @Query("depositMax") depositMax: string,
    @Query("monthlyRentMin") monthlyRentMin: string,
    @Query("monthlyRentMax") monthlyRentMax: string,
    @Query("areaMin") areaMin: string,
    @Query("areaMax") areaMax: string,
    @Query("nextContactAfter") nextContactAfter: string,
    @Query("nextContactBefore") nextContactBefore: string,
    @Query("moveInAfter") moveInAfter: string,
    @Query("moveInBefore") moveInBefore: string,
    @Query("search") search: string,
    @Query("sortBy") sortBy: string,
    @Query("sortOrder") sortOrder: string,
    @Query("page") page: string,
    @Query("limit") limit: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    const num = (value: string) => (value ? Number(value) : undefined);
    return this.service.findAll(user.officeId, {
      contactId: contactId || undefined,
      lifecycleStatus: lifecycleStatus || undefined,
      status: status || undefined,
      urgency: urgency || undefined,
      transactionType: transactionType || undefined,
      siteTypes: siteTypes || undefined,
      assignedToId: assignedToId || undefined,
      preferredSiteIds: preferredSiteIds || undefined,
      provinceCodes: provinceCodes || undefined,
      districtCodes: districtCodes || undefined,
      wardCodes: wardCodes || undefined,
      priceMin: num(priceMin),
      priceMax: num(priceMax),
      depositMin: num(depositMin),
      depositMax: num(depositMax),
      monthlyRentMin: num(monthlyRentMin),
      monthlyRentMax: num(monthlyRentMax),
      areaMin: num(areaMin),
      areaMax: num(areaMax),
      nextContactAfter: nextContactAfter || undefined,
      nextContactBefore: nextContactBefore || undefined,
      moveInAfter: moveInAfter || undefined,
      moveInBefore: moveInBefore || undefined,
      search: search || undefined,
      sortBy: (sortBy as "createdAt" | "receivedAt" | "updatedAt") || undefined,
      sortOrder: (sortOrder as "asc" | "desc") || undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get(":id")
  findOne(@Param("id") id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findOne(id, user.officeId);
  }

  @Post()
  create(
    @Body()
    dto: {
      brokerageCaseId?: string;
      lifecycleStatus?: string;
      receivedAt?: string;
      memo?: string;
      contacts: BuyerIntakeContactInput[];
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.create(user.officeId, dto);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body()
    dto: {
      lifecycleStatus?: string;
      receivedAt?: string;
      memo?: string | null;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(id, user.officeId, dto);
  }

  @Post(":id/contacts")
  addContact(
    @Param("id") id: string,
    @Body() dto: BuyerIntakeContactInput,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.addContact(id, user.officeId, dto);
  }

  @Patch(":id/contacts/:contactId")
  updateContact(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @Body()
    dto: {
      role?: BuyerIntakeContactRole;
      isPrimary?: boolean;
    },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.updateContact(id, contactId, user.officeId, dto);
  }

  @Delete(":id/contacts/:contactId")
  removeContact(
    @Param("id") id: string,
    @Param("contactId") contactId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.removeContact(id, contactId, user.officeId);
  }
}
