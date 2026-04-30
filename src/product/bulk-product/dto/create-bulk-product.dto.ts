import { IsString, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBulkProductDto {
  @ApiPropertyOptional({ example: '8681234567890' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiProperty({ example: 'Apple' })
  @IsString()
  brand: string;

  @ApiPropertyOptional({ example: 'iPhone 15' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 'Telefon' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 10, default: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity?: number;

  @ApiProperty({ example: 25000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  purchase_price: number;

  @ApiProperty({ example: 35000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  selling_price: number;
}
