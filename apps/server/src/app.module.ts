import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { ListingsModule } from './modules/listings/listings.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { MatchesModule } from './modules/matches/matches.module';
import { DealsModule } from './modules/deals/deals.module';
import { SitesModule } from './modules/sites/sites.module';
import { DongsModule } from './modules/dongs/dongs.module';
import { UnitsModule } from './modules/units/units.module';
import { PropertyContactsModule } from './modules/property-contacts/property-contacts.module';
import { ContactRelationsModule } from './modules/contact-relations/contact-relations.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { BuyerRequirementsModule } from './modules/buyer-requirements/buyer-requirements.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { OfficeSitesModule } from './modules/office-sites/office-sites.module';
import { CalendarEventsModule } from './modules/calendar-events/calendar-events.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { OfficesModule } from './modules/offices/offices.module';
import { ExternalListingsModule } from './modules/external-listings/external-listings.module';
import { AgentModule } from './modules/agent/agent.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PartnerBrokersModule } from './modules/partner-brokers/partner-brokers.module';
import { PublicDocumentsModule } from './modules/public-documents/public-documents.module';
import { PropertyPhotosModule } from './modules/property-photos/property-photos.module';
import { McpModule } from './modules/mcp/mcp.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { InboxModule } from './modules/inbox/inbox.module';
import { RegionsModule } from './modules/regions/regions.module';
import { ServiceVendorsModule } from './modules/service-vendors/service-vendors.module';
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    /**
     * Throttler — Brute Force 방어 추가 레이어 (Supabase 자체 rate limit 위에).
     *
     * - default: 일반 API 60 req/min/IP
     * - auth: 로그인/refresh/logout 등 민감 endpoint는 컨트롤러에서 @Throttle({ auth: ... }) 명시
     *
     * Phase 2+: Redis storage로 전환 (`ThrottlerStorageRedisService`) — 멀티 인스턴스 환경 대비.
     */
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000, // 1분
        limit: 60,
      },
      {
        name: 'auth',
        ttl: 60_000, // 1분
        limit: 10, // 로그인 시도 분당 10회
      },
    ]),
    PrismaModule,
    SupabaseModule,
    AuthModule,
    SitesModule,
    OfficeSitesModule,
    DongsModule,
    UnitsModule,
    PropertiesModule,
    ListingsModule,
    ContactsModule,
    ContactRelationsModule,
    PropertyContactsModule,
    TenantsModule,
    BuyerRequirementsModule,
    ConsultationsModule,
    TasksModule,
    MatchesModule,
    DealsModule,
    ContractsModule,
    EmployeesModule,
    OfficesModule,
    CalendarEventsModule,
    ExternalListingsModule,
    AgentModule,
    InboxModule,
    RegionsModule,
    FinanceModule,
    PartnerBrokersModule,
    PublicDocumentsModule,
    PropertyPhotosModule,
    ServiceVendorsModule,
    McpModule,
  ],
  providers: [
    // 글로벌 Throttler 가드 — 모든 라우트에 default(60req/min) 자동 적용
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
