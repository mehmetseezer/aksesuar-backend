import {
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
  IsString,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceCondition } from '@prisma/client';
import { Type } from 'class-transformer';

export class PurchaseItemDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  bulk_product_id?: number;

  @ApiProperty({ example: 5, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  single_device_id?: number;

  // Yeni ürün ekleme alanları
  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  is_new_product?: boolean;

  @ApiProperty({ example: 'bulk', required: false })
  @IsOptional()
  @IsString()
  type?: 'bulk' | 'single';

  @ApiPropertyOptional({ example: 'Apple' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: 'iPhone 13' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'Aksesuar' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: '356789012345678', required: false })
  @IsString()
  @IsOptional()
  imei?: string;

  @ApiProperty({ example: '356789012345678', required: false })
  @IsString()
  @IsOptional()
  single_device_imei?: string; // Frontend'den gelen eski alan adı

  @ApiPropertyOptional({ example: 'iPhone 13 128GB' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: '128GB' })
  @IsOptional()
  @IsString()
  capacity?: string;

  @ApiPropertyOptional({ example: '12 Ay' })
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional({ enum: DeviceCondition })
  @IsOptional()
  @IsEnum(DeviceCondition)
  condition?: DeviceCondition;

  @ApiPropertyOptional({ enum: DeviceCondition })
  @IsOptional()
  @IsEnum(DeviceCondition)
  device_condition?: DeviceCondition; // Frontend'den gelen alan adı

  @ApiPropertyOptional({ example: 'Kılcal çizikler mevcut' })
  @IsOptional()
  @IsString()
  condition_note?: string;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  battery_health?: number;

  @ApiProperty({ example: 2, default: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ example: 15000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unit_cost: number;
}
