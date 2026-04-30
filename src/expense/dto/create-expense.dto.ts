import { IsString, IsNumber, Min, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @ApiProperty({ example: 'Ofis Kirası' })
  @IsString()
  title: string;

  @ApiProperty({ example: 5000.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ example: 'GENEL', default: 'GENEL' })
  @IsOptional()
  @IsString()
  @IsIn([
    'GENEL',
    'ALIM',
    'SATIŞ İADESİ',
    'FATURA',
    'MAAŞ',
    'YEMEK',
    'KİRA',
    'ULAŞIM',
    'KARGO',
    'VERGİ',
    'DİĞER',
    'AVANS',
    'KOMİSYON',
  ])
  category?: string;

  @ApiPropertyOptional({ example: 'Nisan ayı ofis kirası' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  employee_id?: number;
}
