import { Module } from '@nestjs/common';
import { TradeService } from './trade.service';
import { TradeController } from './trade.controller';
import { SaleModule } from '../sale/sale.module';
import { PurchaseModule } from '../purchase/purchase.module';

@Module({
  imports: [SaleModule, PurchaseModule],
  providers: [TradeService],
  controllers: [TradeController],
})
export class TradeModule {}
