import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PublicDocumentsService } from './public-documents.service';
import { PublicDocumentsController } from './public-documents.controller';
import { PublicDocumentProviderService } from './public-document-provider.service';

@Module({
  imports: [PrismaModule],
  controllers: [PublicDocumentsController],
  providers: [PublicDocumentsService, PublicDocumentProviderService],
  exports: [PublicDocumentsService],
})
export class PublicDocumentsModule {}
