import { Module } from '@nestjs/common';
import { ReturnService } from './return.service';
import { ReturnController } from './return.controller';

@Module({
  providers: [ReturnService],
  controllers: [ReturnController],
})
export class ReturnModule {}
