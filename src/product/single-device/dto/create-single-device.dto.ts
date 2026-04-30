import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { DeviceStatus, DeviceCondition } from '@prisma/client';

export class CreateSingleDeviceDto {
  @ApiProperty({ example: '356789012345678' })
  @IsString()
  imei: string;

  @ApiProperty({ example: 'Samsung Galaxy S23 Ultra' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: '256GB' })
  @IsOptional()
  @IsString()
  capacity?: string;

  @ApiPropertyOptional({ example: '12 Ay' })
  @IsOptional()
  @IsString()
  warranty?: string;

  @ApiPropertyOptional({ example: 95, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  battery_health?: number;

  @ApiPropertyOptional({ enum: DeviceCondition, default: DeviceCondition.USED })
  @IsOptional()
  @IsEnum(DeviceCondition)
  device_condition?: DeviceCondition;

  @ApiPropertyOptional({ example: 'Ekranda çizikler var' })
  @IsOptional()
  @IsString()
  condition_note?: string;

  @ApiPropertyOptional({ enum: DeviceStatus, default: DeviceStatus.IN_STOCK })
  @IsOptional()
  @IsEnum(DeviceStatus)
  status?: DeviceStatus;

  @ApiProperty({ example: 18000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  purchase_price: number;
}
