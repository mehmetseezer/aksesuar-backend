import {
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { TradeItemDto } from './trade-item.dto';
import { SaleItemDto } from '../../sale/dto/sale-item.dto';

export class CreateTradeDto {
  @ApiProperty({ example: 1, description: 'Takas yapan müşterinin IDsi' })
  @IsNumber()
  @Type(() => Number)
  customer_id: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  employee_id?: number;

  @ApiProperty({
    type: [TradeItemDto],
    description: 'Müşteriden alınan eski ürün(ler)',
  })
  @ValidateNested({ each: true })
  @Type(() => TradeItemDto)
  trade_in_items: TradeItemDto[];

  @ApiProperty({
    type: [SaleItemDto],
    description: 'Müşteriye satılan yeni ürün(ler)',
  })
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  sale_items: SaleItemDto[];

  @ApiProperty({
    example: 1000.0,
    description: 'Fark için alınan nakit ödeme tutarı',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  paid_amount: number;

  @ApiPropertyOptional({
    example: 'iPhone 11 takas ile iPhone 15 alımı',
    description: 'İşlem açıklaması',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
