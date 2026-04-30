import { IsString, IsOptional, IsPhoneNumber, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Ahmet Yılmaz' })
  @IsString()
  @Length(2, 100)
  name: string;

  @ApiProperty({ example: '+905551234567' })
  @IsPhoneNumber('TR', {
    message: 'Geçerli bir Türkiye telefon numarası giriniz',
  })
  phone: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsOptional()
  @IsString()
  @Length(11, 11, { message: 'TC Kimlik numarası 11 haneli olmalıdır' })
  identity_no?: string;
}
