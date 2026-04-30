import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GiveAdvanceDto {
  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ example: 'Okul masrafları için' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class MakePaymentDto {
  @ApiProperty({ example: 5000 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  amount: number;

  @ApiProperty({ example: 'MAAŞ', enum: ['MAAŞ', 'KOMİSYON', 'BONUS'] })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Nisan ayı maaş ödemesi' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateEmployeeFinancialsDto {
  @ApiProperty({ example: 17002, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salary?: number;
}
