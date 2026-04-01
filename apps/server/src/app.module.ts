import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { validateEnv } from './config/env.validation';
import { AuthModule } from './modules/auth/auth.module';
import { PropertiesModule } from './modules/properties/properties.module';
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
import { RequestContextMiddleware } from './common/request-context/request-context.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    AuthModule,
    SitesModule,
    OfficeSitesModule,
    DongsModule,
    UnitsModule,
    PropertiesModule,
    ContactsModule,
    ContactRelationsModule,
    PropertyContactsModule,
    TenantsModule,
    BuyerRequirementsModule,
    ConsultationsModule,
    TasksModule,
    MatchesModule,
    DealsModule,
    CalendarEventsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
