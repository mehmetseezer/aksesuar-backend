import { IsString, IsOptional, IsPhoneNumber, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierDto {
  @ApiProperty({ example: 'ABC Teknoloji Ltd. Şti.' })
  @IsString()
  @Length(2, 150)
  name: string;

  @ApiPropertyOptional({ example: '+902161234567' })
  @IsOptional()
  @IsPhoneNumber('TR', {
    message: 'Geçerli bir Türkiye telefon numarası giriniz',
  })
  phone?: string;
}
