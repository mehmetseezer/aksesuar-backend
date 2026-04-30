// src/employee/dto/change-password.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({ example: 'CurrentPass123!' })
  @IsNotEmpty()
  oldPassword: string;

  @ApiProperty({ example: 'NewStrongPass123!' })
  @IsNotEmpty()
  @MinLength(6)
  newPassword: string;
}
