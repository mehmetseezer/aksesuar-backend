import { IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SaleItemDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  @ValidateIf((o) => !o.single_device_id)
  @Type(() => Number)
  bulk_product_id?: number;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsNumber()
  @ValidateIf((o) => !o.bulk_product_id)
  @Type(() => Number)
  single_device_id?: number;

  @ApiProperty({ example: 1, default: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ example: 35000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unit_price: number;
}
