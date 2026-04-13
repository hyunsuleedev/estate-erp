import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PublicDocumentsService } from './public-documents.service';
import { PublicDocumentsController } from './public-documents.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PublicDocumentsController],
  providers: [PublicDocumentsService],
  exports: [PublicDocumentsService],
})
export class PublicDocumentsModule {}
