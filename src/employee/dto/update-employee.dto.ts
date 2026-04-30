// src/employee/dto/update-employee.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  MinLength,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Role, EmployeeStatus } from '@prisma/client';

export class UpdateEmployeeDto {
  @ApiProperty({ required: false, example: 'Ahmet Yılmaz' })
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false, example: 'ahmet@firma.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({ required: false, example: 'NewStrongPass123!' })
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiProperty({ enum: Role, required: false })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiProperty({ enum: EmployeeStatus, required: false })
  @IsEnum(EmployeeStatus)
  @IsOptional()
  status?: EmployeeStatus;

  @ApiProperty({ example: 17002, required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  salary?: number;
}
