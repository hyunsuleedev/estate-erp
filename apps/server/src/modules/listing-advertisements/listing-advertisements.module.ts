import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ListingAdvertisementsController } from "./listing-advertisements.controller";
import { ListingAdvertisementsService } from "./listing-advertisements.service";
import { AdvertisementChangeRequestsService } from "./advertisement-change-requests.service";

@Module({
  imports: [PrismaModule],
  controllers: [ListingAdvertisementsController],
  providers: [ListingAdvertisementsService, AdvertisementChangeRequestsService],
  exports: [ListingAdvertisementsService, AdvertisementChangeRequestsService],
})
export class ListingAdvertisementsModule {}
