import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsString,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'admin@nexus.com',
    description: 'Kullanıcı email adresi',
  })
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  email: string;

  @ApiProperty({ example: '123456', description: 'Şifre (en az 6 karakter)' })
  @IsNotEmpty({ message: 'Şifre boş olamaz' })
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır' })
  password: string;

  @ApiProperty({
    example: 'nexus',
    description: 'Şirket alt alan adı (Opsiyonel)',
    required: false,
  })
  @IsOptional()
  @IsString()
  subdomain?: string;
}
