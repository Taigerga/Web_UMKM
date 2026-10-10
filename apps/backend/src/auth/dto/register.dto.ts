import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body `POST /auth/register`.
 *
 * Sengaja TIDAK punya field `role`, `isActive`, atau `failedLoginCount`.
 *
 * `ValidationPipe` global memakai `whitelist: true` + `forbidNonWhitelisted:
 * true`, jadi field yang tidak ada di DTO akan DITOLAK dengan
 * `VALIDATION_ERROR`, bukan diam-diam diabaikan. Itulah yang membuat
 * "pengguna tidak bisa memilih peran sendiri saat mendaftar" menjadi
 * property yang ditegakkan, bukan sekadar konvensi.
 */
export class RegisterDto {
  @ApiProperty({ example: 'owner@contoh.id', maxLength: 191 })
  @IsEmail({}, { message: 'email harus berupa alamat email yang valid' })
  @MaxLength(191)
  email!: string;

  @ApiProperty({ example: 'Budi Santoso', minLength: 2, maxLength: 191 })
  @IsString()
  @MinLength(2, { message: 'name minimal 2 karakter' })
  @MaxLength(191)
  name!: string;

  @ApiProperty({
    example: 'rahasia-kuat-123',
    minLength: 8,
    maxLength: 128,
    writeOnly: true,
  })
  @IsString()
  @MinLength(8, { message: 'password minimal 8 karakter' })
  @MaxLength(128)
  password!: string;
}