import { IsOptional, IsEnum } from 'class-validator';
import { AuditAction } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AuditQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;
}
