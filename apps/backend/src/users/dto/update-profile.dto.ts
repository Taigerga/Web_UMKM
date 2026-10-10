import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body `PATCH /users/me`.
 *
 * Kedua field opsional: yang dikirim adalah yang diubah, dan `whitelist` +
 * `forbidNonWhitelisted` membuat field lain (termasuk `role`, `passwordHash`,
 * `isActive`) ditolak, bukan diabaikan diam-diam.
 */
export class UpdateProfileDto {
  @ApiProperty({ example: 'Budi Santoso', minLength: 2, maxLength: 191, required: false })
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'name minimal 2 karakter' })
  @MaxLength(191)
  name?: string;

  @ApiProperty({ example: 'budi@contoh.id', maxLength: 191, required: false })
  @IsOptional()
  @IsEmail({}, { message: 'email harus berupa alamat email yang valid' })
  @MaxLength(191)
  email?: string;
}