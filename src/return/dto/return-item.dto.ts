import { IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ReturnItemDto {
  @ApiProperty({ example: 5, description: 'Orijinal satış kaleminin IDsi' })
  @IsNumber()
  @Type(() => Number)
  sale_item_id: number;

  @ApiProperty({ example: 1, description: 'İade edilecek miktar' })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}
