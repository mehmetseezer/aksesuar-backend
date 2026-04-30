import { PartialType } from '@nestjs/swagger';
import { CreateSingleDeviceDto } from './create-single-device.dto';

export class UpdateSingleDeviceDto extends PartialType(CreateSingleDeviceDto) {}
