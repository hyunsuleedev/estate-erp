import { Module } from '@nestjs/common';
import { BuyerRequirementsModule } from '../buyer-requirements/buyer-requirements.module';
import { CalendarEventsModule } from '../calendar-events/calendar-events.module';
import { ListingIntakesModule } from '../listing-intakes/listing-intakes.module';
import { ListingsModule } from '../listings/listings.module';
import { MatchesModule } from '../matches/matches.module';
import { TasksModule } from '../tasks/tasks.module';
import { CallIntelligenceService } from './call-intelligence.service';
import { CallSuggestionsController } from './call-suggestions.controller';
import { CallSuggestionsService } from './call-suggestions.service';

/** 통화 녹음 받아쓰기·분석과 분석이 제안한 업무 */
@Module({
  imports: [
    TasksModule,
    CalendarEventsModule,
    BuyerRequirementsModule,
    MatchesModule,
    ListingIntakesModule,
    ListingsModule,
  ],
  controllers: [CallSuggestionsController],
  providers: [CallIntelligenceService, CallSuggestionsService],
  exports: [CallIntelligenceService],
})
export class CallIntelligenceModule {}
