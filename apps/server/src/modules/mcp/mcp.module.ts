import { Module } from '@nestjs/common';
import { ListingsModule } from '../listings/listings.module';
import { ContactsModule } from '../contacts/contacts.module';
import { PropertiesModule } from '../properties/properties.module';
import { DealsModule } from '../deals/deals.module';
import { BuyerRequirementsModule } from '../buyer-requirements/buyer-requirements.module';
import { ConsultationsModule } from '../consultations/consultations.module';
import { MatchesModule } from '../matches/matches.module';
import { ContractsModule } from '../contracts/contracts.module';
import { TasksModule } from '../tasks/tasks.module';
import { CalendarEventsModule } from '../calendar-events/calendar-events.module';
import { SitesModule } from '../sites/sites.module';
import { DongsModule } from '../dongs/dongs.module';
import { UnitsModule } from '../units/units.module';
import { OfficeSitesModule } from '../office-sites/office-sites.module';
import { PropertyContactsModule } from '../property-contacts/property-contacts.module';
import { ContactRelationsModule } from '../contact-relations/contact-relations.module';
import { TenantsModule } from '../tenants/tenants.module';
import { EmployeesModule } from '../employees/employees.module';
import { OfficesModule } from '../offices/offices.module';
import { ExternalListingsModule } from '../external-listings/external-listings.module';
import { FinanceModule } from '../finance/finance.module';
import { PublicDocumentsModule } from '../public-documents/public-documents.module';
import { PropertyPhotosModule } from '../property-photos/property-photos.module';
import { AgentModule } from '../agent/agent.module';
import { InboxModule } from '../inbox/inbox.module';
import { McpController } from './mcp.controller';
import { OAuthDiscoveryController } from './oauth-discovery.controller';
import { McpServerFactory } from './mcp-server.factory';
import { McpToolsService } from './mcp-tools.service';
import { McpAuthGuard } from './mcp-auth.guard';
import { ApiKeyService } from './api-key.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Module({
  imports: [
    ListingsModule,
    ContactsModule,
    PropertiesModule,
    DealsModule,
    BuyerRequirementsModule,
    ConsultationsModule,
    MatchesModule,
    ContractsModule,
    TasksModule,
    CalendarEventsModule,
    SitesModule,
    DongsModule,
    UnitsModule,
    OfficeSitesModule,
    PropertyContactsModule,
    ContactRelationsModule,
    TenantsModule,
    EmployeesModule,
    OfficesModule,
    ExternalListingsModule,
    FinanceModule,
    PublicDocumentsModule,
    PropertyPhotosModule,
    AgentModule,
    InboxModule,
  ],
  controllers: [McpController, OAuthDiscoveryController],
  providers: [
    McpServerFactory,
    McpToolsService,
    McpAuthGuard,
    ApiKeyService,
    JwtAuthGuard,
  ],
  exports: [ApiKeyService],
})
export class McpModule {}
