import { Module } from "@nestjs/common";
import { BuyerIntakesController } from "./buyer-intakes.controller";
import { BuyerIntakesService } from "./buyer-intakes.service";

@Module({
  controllers: [BuyerIntakesController],
  providers: [BuyerIntakesService],
  exports: [BuyerIntakesService],
})
export class BuyerIntakesModule {}
