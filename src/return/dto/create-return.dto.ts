import {
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ReturnItemDto } from './return-item.dto';

export class CreateReturnDto {
  @ApiProperty({ example: 12, description: 'İade edilecek satışın IDsi' })
  @IsNumber()
  @Type(() => Number)
  sale_id: number;

  @ApiProperty({ type: [ReturnItemDto], description: 'İade kalemleri' })
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items: ReturnItemDto[];

  @ApiPropertyOptional({ example: 'Kutu hasarlı', description: 'İade sebebi' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    example: 4500.0,
    description: 'Geri ödenecek nakit tutarı',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  refund_amount?: number;

  @ApiPropertyOptional({
    example: 'Müşteri vazgeçti',
    description: 'Ek notlar',
  })
  @IsOptional()
  @IsString()
  description?: string;
}
