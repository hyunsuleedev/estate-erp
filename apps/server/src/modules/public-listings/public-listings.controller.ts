import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import {
  CurrentUser,
  CurrentUserPayload,
} from "../../common/decorators/current-user.decorator";
import { PublicListingsService } from "./public-listings.service";
import {
  PublicListingQuery,
  SavePublicListingDto,
} from "./public-listings.dto";
@Controller("public-listings")
@UseGuards(JwtAuthGuard)
export class PublicListingsController {
  constructor(private readonly service: PublicListingsService) {}
  @Get("listing/:id")
  settings(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.settings(user.officeId, id);
  }
  @Put("listing/:id")
  save(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SavePublicListingDto,
  ) {
    return this.service.save(user.officeId, id, dto);
  }
}
@Controller("public")
export class PublicCatalogController {
  constructor(private readonly service: PublicListingsService) {}
  @Get("homes")
  @Header("Cache-Control", "no-store")
  search(@Query() query: PublicListingQuery) {
    return this.service.search(query);
  }
  @Get("map")
  @Header("Cache-Control", "no-store")
  map(@Query() query: PublicListingQuery) {
    return this.service.map(query);
  }
  @Get("offices/:id")
  @Header("Cache-Control", "no-store")
  office(
    @Param("id", ParseUUIDPipe) id: string,
    @Query() query: PublicListingQuery,
  ) {
    return this.service.office(id, query);
  }
  @Get("homes/:id")
  @Header("Cache-Control", "no-store")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.service.detail(id);
  }
}
