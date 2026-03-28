import { Module } from '@nestjs/common';
import { DongsService } from './dongs.service';
import { DongsController } from './dongs.controller';

@Module({
  controllers: [DongsController],
  providers: [DongsService],
  exports: [DongsService],
})
export class DongsModule {}
