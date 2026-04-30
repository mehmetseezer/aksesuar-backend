import {
  IsString,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CommissionType } from '@prisma/client';

export class CreateCommissionRuleDto {
  @ApiProperty({ description: 'Kural adı' })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'Komisyonun geçerli olması için gereken minimum kar miktarı',
  })
  @IsNumber()
  @Min(0)
  min_profit: number;

  @ApiProperty({
    description: 'Komisyon tipi (PERCENTAGE veya STATIC)',
    enum: CommissionType,
  })
  @IsEnum(CommissionType)
  type: CommissionType;

  @ApiProperty({ description: 'Komisyon değeri (yüzde veya sabit miktar)' })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({
    description: 'Kademeli artış için adım miktarı (örn: her 10.000 artışta)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  step_amount?: number;

  @ApiPropertyOptional({
    description:
      'Kademeli artış için eklenecek komisyon miktarı (örn: 1.000 ekle)',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  step_value?: number;

  @ApiPropertyOptional({ description: 'Kural aktif mi?' })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @ApiPropertyOptional({ description: 'Personele özel kural ise personel ID' })
  @IsNumber()
  @IsOptional()
  employee_id?: number;
}
