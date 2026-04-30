import { IsOptional, IsString, IsNumber } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { Type } from 'class-transformer';

export class SaleQueryDto extends PaginationDto {}
