import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { PurchaseItemDto } from './purchase-item.dto';

export class CreatePurchaseDto {
  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o) => o.hasBulkProduct()) // Eğer yeni ürün varsa zorunlu
  @IsNumber()
  @Type(() => Number)
  supplier_id?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  customer_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  employee_id?: number;

  @ApiProperty({ type: [PurchaseItemDto] })
  @ValidateNested({ each: true })
  @Type(() => PurchaseItemDto)
  items: PurchaseItemDto[];

  @ApiPropertyOptional({ example: 30000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  paid_amount?: number;

  @ApiPropertyOptional({ example: 1000.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  paid_amount_usd?: number;

  @ApiPropertyOptional({ example: 'TL' })
  @IsOptional()
  @IsString()
  payment_currency?: 'TL' | 'USD';

  @ApiPropertyOptional({ example: 'TL' })
  @IsOptional()
  @IsString()
  cost_currency?: 'TL' | 'USD';

  @ApiPropertyOptional({ example: 'Toptan alım' })
  @IsOptional()
  @IsString()
  description?: string;

  // Yardımcı metod (validasyon için)
  private hasBulkProduct(): boolean {
    return this.items?.some((item) => !!item.bulk_product_id) ?? false;
  }
}
