import { Module } from '@nestjs/common';
import { BulkProductController } from './bulk-product/bulk-product.controller';
import { BulkProductService } from './bulk-product/bulk-product.service';
import { SingleDeviceController } from './single-device/single-device.controller';
import { SingleDeviceService } from './single-device/single-device.service';

@Module({
  controllers: [BulkProductController, SingleDeviceController],
  providers: [BulkProductService, SingleDeviceService],
})
export class ProductModule {}
