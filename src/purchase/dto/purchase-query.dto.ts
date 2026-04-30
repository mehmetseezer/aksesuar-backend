import { IsOptional, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PurchaseQueryDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Tedarikçi ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  supplier_id?: number;

  @ApiPropertyOptional({ description: 'Müşteri ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customer_id?: number;
}
