import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Body `POST /auth/login`. */
export class LoginDto {
  @ApiProperty({ example: 'owner@contoh.id', maxLength: 191 })
  @IsEmail({}, { message: 'email harus berupa alamat email yang valid' })
  @MaxLength(191)
  email!: string;

  @ApiProperty({ example: 'rahasia-kuat-123', minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1, { message: 'password wajib diisi' })
  @MaxLength(128)
  password!: string;
}