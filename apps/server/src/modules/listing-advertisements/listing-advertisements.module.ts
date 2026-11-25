import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TasksModule } from "../tasks/tasks.module";
import { ListingAdvertisementsController } from "./listing-advertisements.controller";
import { ListingAdvertisementsService } from "./listing-advertisements.service";
import { AdvertisementChangeRequestsService } from "./advertisement-change-requests.service";
import { OfficeCpAccountsService } from "./office-cp-accounts.service";

@Module({
  imports: [PrismaModule, TasksModule],
  controllers: [ListingAdvertisementsController],
  providers: [
    OfficeCpAccountsService,
    ListingAdvertisementsService,
    AdvertisementChangeRequestsService,
  ],
  exports: [
    OfficeCpAccountsService,
    ListingAdvertisementsService,
    AdvertisementChangeRequestsService,
  ],
})
export class ListingAdvertisementsModule {}
