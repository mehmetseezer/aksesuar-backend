import {
  IsNumber,
  IsOptional,
  Min,
  ValidateIf,
  IsString,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeviceCondition } from '@prisma/client';
import { Type } from 'class-transformer';

export class TradeItemDto {
  @ApiProperty({
    example: 5,
    required: false,
    description: 'Mevcut ikinci el ürün IDsi',
  })
  @IsOptional()
  @IsNumber()
  @ValidateIf((o) => !o.single_device_imei)
  @Type(() => Number)
  single_device_id?: number;

  @ApiProperty({
    example: '356789012345678',
    required: false,
    description: 'Yeni eklenecek ürünün IMEI numarası',
  })
  @IsString()
  @IsOptional()
  @ValidateIf((o) => !o.single_device_id)
  single_device_imei?: string;

  @ApiProperty({ example: 1, description: 'İade/takas edilen miktar' })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({
    example: 5000.0,
    description: 'Birim alış fiyatı (takas değeri)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  unit_cost: number;

  @ApiProperty({ example: 'iPhone 13', required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: '128GB, Blue', required: false })
  @IsOptional()
  @IsString()
  specs?: string;

  @ApiPropertyOptional({ enum: DeviceCondition })
  @IsOptional()
  @IsEnum(DeviceCondition)
  device_condition?: DeviceCondition;

  @ApiProperty({ example: 'Ekranda çizikler var', required: false })
  @IsOptional()
  @IsString()
  condition_note?: string;

  @ApiPropertyOptional({ example: '128GB' })
  @IsOptional()
  @IsString()
  capacity?: string;

  @ApiPropertyOptional({ example: '12 Ay' })
  @IsOptional()
  @IsString()
  warranty?: string;
}
