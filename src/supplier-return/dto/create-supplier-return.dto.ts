import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class SupplierReturnItemDto {
  @IsNumber()
  @IsOptional()
  purchase_item_id?: number;

  @IsNumber()
  @IsOptional()
  bulk_product_id?: number;

  @IsNumber()
  @IsOptional()
  single_device_id?: number;

  @IsNumber()
  quantity: number;

  @IsNumber()
  unit_price: number;
}

export class CreateSupplierReturnDto {
  @IsNumber()
  supplier_id: number;

  @IsNumber()
  @IsOptional()
  purchase_id?: number;

  @IsNumber()
  total_amount: number;

  @IsNumber()
  received_amount: number;

  @IsString()
  @IsOptional()
  reason?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnItemDto)
  items: SupplierReturnItemDto[];

  @IsString()
  @IsOptional()
  received_currency?: string;

  @IsNumber()
  @IsOptional()
  usd_rate?: number;

  @IsString()
  @IsOptional()
  description?: string;
}
