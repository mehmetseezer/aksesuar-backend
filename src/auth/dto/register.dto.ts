import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  MinLength,
  IsString,
  IsIn,
  IsOptional,
} from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @ApiProperty({ example: 'yeni@nexus.com' })
  @IsEmail({}, { message: 'Geçerli bir email adresi giriniz' })
  email: string;

  @ApiProperty({ example: 'Ahmet Yılmaz' })
  @IsNotEmpty({ message: 'İsim boş olamaz' })
  @IsString()
  name: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty({ message: 'Şifre boş olamaz' })
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır' })
  password: string;

  @ApiProperty({ enum: Role, example: Role.ADMIN })
  @IsIn([Role.ADMIN, Role.MANAGER, Role.STAFF], {
    message: 'Rol ADMIN, MANAGER veya STAFF olmalıdır',
  })
  role: Role;

  @ApiPropertyOptional({
    example: 'nexus',
    description: 'Mevcut şirkete katılmak için',
  })
  @IsOptional()
  @IsString()
  subdomain?: string;

  @ApiPropertyOptional({
    example: 'Yeni Teknoloji Ltd.',
    description: 'Yeni şirket oluşturmak için',
  })
  @IsOptional()
  @IsString()
  companyName?: string;
}
