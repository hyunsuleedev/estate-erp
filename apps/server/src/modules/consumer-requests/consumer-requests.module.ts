import {
  Body,
  Controller,
  Get,
  Header,
  Module,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { RealtimeModule } from "../../realtime/realtime.module";
import { ConsumerAuthGuard } from "./consumer-auth.guard";
import { ConsumerRequestsService } from "./consumer-requests.service";
import { CreateConsumerRequestDto } from "./consumer-requests.dto";
@Controller("public")
class ConsumerRequestsController {
  constructor(private readonly service: ConsumerRequestsService) {}
  @Get("request-regions") regions(@Query("q") q: string) {
    return this.service.regions(q);
  }
  @Get("requests")
  @Header("Cache-Control", "no-store")
  @UseGuards(ConsumerAuthGuard)
  history(@Req() req: { consumerId: string }) {
    return this.service.history(req.consumerId);
  }
  @Post("requests")
  @Header("Cache-Control", "no-store")
  @UseGuards(ConsumerAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  create(
    @Req() req: { consumerId: string },
    @Body() dto: CreateConsumerRequestDto,
  ) {
    return this.service.create(req.consumerId, dto);
  }
}
@Module({
  imports: [RealtimeModule],
  controllers: [ConsumerRequestsController],
  providers: [ConsumerAuthGuard, ConsumerRequestsService],
})
export class ConsumerRequestsModule {}
