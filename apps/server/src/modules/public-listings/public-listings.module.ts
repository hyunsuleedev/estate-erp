import { Module } from "@nestjs/common";
import {
  PublicListingsController,
  PublicCatalogController,
} from "./public-listings.controller";
import { PublicListingsService } from "./public-listings.service";
@Module({
  controllers: [PublicListingsController, PublicCatalogController],
  providers: [PublicListingsService],
})
export class PublicListingsModule {}
