import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ListingAdvertisementsModule } from "../listing-advertisements/listing-advertisements.module";
import { ListingAdvertisementSnapshotsService } from "./listing-advertisement-snapshots.service";

@Module({
  imports: [PrismaModule, ListingAdvertisementsModule],
  providers: [ListingAdvertisementSnapshotsService],
  exports: [ListingAdvertisementSnapshotsService],
})
export class ListingAdvertisementSnapshotsModule {}
