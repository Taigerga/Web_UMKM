import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, MaxLength } from 'class-validator';
import { StoreMemberRole } from '../../common/types/prisma-enums.js';

/**
 * Body `POST /stores/:storeId/invitations`.
 *
 * `role` diterima apa adanya karena `@StoreAccess(OWNER)` sudah membatasi siapa
 * yang boleh mengeluarkan undangan. Membuat STAFF adalah wewenang OWNER
 * menurut spec 6.4.
 *
 * Yang tidak ada di DTO ini: `storeId` dan `expiresAt`. Keduanya berasal dari
 * route dan dari konfigurasi server. Kalau `storeId` diterima dari body, OWNER
 * toko A bisa menerbitkan undangan yang tercatat milik toko B.
 */
export class CreateInvitationDto {
  @ApiProperty({ example: 'pegawai@contoh.id', maxLength: 191 })
  @IsEmail({}, { message: 'email harus berupa alamat email yang valid' })
  @MaxLength(191)
  email!: string;

  @ApiProperty({ enum: StoreMemberRole, example: StoreMemberRole.STAFF })
  @IsEnum(StoreMemberRole, { message: 'role harus OWNER atau STAFF' })
  role!: StoreMemberRole;
}