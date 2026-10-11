import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { StoreMemberRole } from '../../common/types/prisma-enums.js';

/**
 * Body `PATCH /stores/:storeId/members/:userId`.
 *
 * Hanya `role`. `userId` dan `storeId` berasal dari PATH, dan `joinedAt` ditulis
 * server. Kalau `userId` diterima dari body, OWNER toko A bisa mengubah peran
 * anggota toko B.
 *
 * Menaikkan STAFF menjadi OWNER diizinkan (spec 6.4: "Ubah peran / cabut
 * akses" adalah wewenang OWNER). Yang DITOLAK adalah operasi yang membuat toko
 * kehilangan owner terakhirnya - lihat `StoresService.updateMember`.
 */
export class UpdateMemberDto {
  @ApiProperty({ enum: StoreMemberRole, example: StoreMemberRole.STAFF })
  @IsEnum(StoreMemberRole, { message: 'role harus OWNER atau STAFF' })
  role!: StoreMemberRole;
}