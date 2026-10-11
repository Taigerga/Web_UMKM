import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Body `POST /stores`.
 *
 * Field yang TIDAK ada di sini sama sekali: `status`, `createdById`, `timezone`,
 * `role`.
 *
 * - `status` hanya boleh diubah admin platform (Task 6). Kalau OWNER bisa
 *   menulisnya, dia bisa mencabut suspend tokonya sendiri.
 * - `createdById` ditulis server dari access token. Menerimanya dari body
 *   berarti user bisa membuat toko "milik" orang lain - dan karena pembuat
 *   otomatis jadi OWNER, itu becomeescalation langsung.
 * - `role` bukan milik toko yang sedang dibuat. Peran di toko itu selalu
 *   `OWNER` untuk pembuat, jadi tidak ada yang perlu dikirim.
 *
 * `ValidationPipe` global memakai `whitelist` + `forbidNonWhitelisted`, jadi
 * percobaan mengirim field di luar daftar ini DITOLAK dengan `VALIDATION_ERROR`,
 * bukan diabaikan diam-diam.
 */
export class CreateStoreDto {
  @ApiProperty({ example: 'Warung Bu Tuti', minLength: 2, maxLength: 191 })
  @IsString()
  @MinLength(2, { message: 'name minimal 2 karakter' })
  @MaxLength(191)
  name!: string;

  @ApiPropertyOptional({ example: 'Bandung', maxLength: 191, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  city?: string;
}