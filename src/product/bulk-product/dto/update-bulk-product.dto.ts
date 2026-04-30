import { PartialType } from '@nestjs/swagger';
import { CreateBulkProductDto } from './create-bulk-product.dto';

export class UpdateBulkProductDto extends PartialType(CreateBulkProductDto) {}
