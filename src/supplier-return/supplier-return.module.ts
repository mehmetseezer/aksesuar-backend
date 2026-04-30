import { Module } from '@nestjs/common';
import { SupplierReturnService } from './supplier-return.service';
import { SupplierReturnController } from './supplier-return.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SupplierReturnController],
  providers: [SupplierReturnService],
})
export class SupplierReturnModule {}
