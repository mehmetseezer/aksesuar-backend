import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { SaleItemDto } from './sale-item.dto';

export class CreateSaleDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  customer_id?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'İşlemi yapan personel ID (boşsa mevcut kullanıcı)',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  employee_id?: number;

  @ApiProperty({ type: [SaleItemDto] })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @ApiProperty({ example: 70000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  paid_amount: number;

  @ApiPropertyOptional({ example: 'Peşin satış' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    example: 1,
    description: 'Ödemenin aktarılacağı tedarikçi ID',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  supplier_id?: number;

  @ApiPropertyOptional({
    example: 5000.0,
    description: 'Tedarikçiye aktarılacak tutar',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  supplier_amount?: number;
}
