import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PartnerBrokersController } from './partner-brokers.controller';
import { PartnerBrokersService } from './partner-brokers.service';

@Module({
  imports: [PrismaModule],
  controllers: [PartnerBrokersController],
  providers: [PartnerBrokersService],
  exports: [PartnerBrokersService],
})
export class PartnerBrokersModule {}
