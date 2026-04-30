import { IsOptional, IsString, IsNumber } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Type } from 'class-transformer';

export class SupplierQueryDto extends PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minDebt?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxDebt?: number;
}
