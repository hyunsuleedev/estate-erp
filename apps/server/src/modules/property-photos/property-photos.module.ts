import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PropertyPhotosService } from './property-photos.service';
import { PropertyPhotosController } from './property-photos.controller';

@Module({
  imports: [PrismaModule],
  controllers: [PropertyPhotosController],
  providers: [PropertyPhotosService],
  exports: [PropertyPhotosService],
})
export class PropertyPhotosModule {}
