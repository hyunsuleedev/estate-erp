import { Module } from '@nestjs/common';
import { OfficeSitesService } from './office-sites.service';
import { OfficeSitesController } from './office-sites.controller';

@Module({
  controllers: [OfficeSitesController],
  providers: [OfficeSitesService],
  exports: [OfficeSitesService],
})
export class OfficeSitesModule {}
