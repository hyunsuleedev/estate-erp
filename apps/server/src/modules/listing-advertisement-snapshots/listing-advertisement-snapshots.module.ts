import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ListingAdvertisementSnapshotsService } from "./listing-advertisement-snapshots.service";

@Module({
  imports: [PrismaModule],
  providers: [ListingAdvertisementSnapshotsService],
  exports: [ListingAdvertisementSnapshotsService],
})
export class ListingAdvertisementSnapshotsModule {}
