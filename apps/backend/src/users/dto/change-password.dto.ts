import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Body `POST /users/me/password`. */
export class ChangePasswordDto {
  @ApiProperty({ example: 'rahasia-lama-123', minLength: 1, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(1, { message: 'currentPassword wajib diisi' })
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ example: 'rahasia-baru-456', minLength: 8, maxLength: 128, writeOnly: true })
  @IsString()
  @MinLength(8, { message: 'newPassword minimal 8 karakter' })
  @MaxLength(128)
  newPassword!: string;
}