import { Module } from '@nestjs/common';
import { PrismaModule } from '../database/prisma.module.js';
import { InvitationsController } from './invitations.controller.js';
import { InvitationsService } from './invitations.service.js';

/**
 * Modul undangan.
 *
 * Sengaja tidak mengimpor `StoresModule`: operasi toko dan operasi undangan
 * tidak saling membutuhkan. `StoresService` tidak pernah memanggil
 * `InvitationsService` - undangan dibuat, dan keanggotaan terbentuk langsung
 * saat undangan diterima. `InvitationsService` juga tidak memanggil
 * `StoresService`: ia hanya butuh `store_invites`, `stores`, `users`, dan
 * `store_members`, semuanya lewat `PrismaService` ter-scope sendiri.
 */
@Module({
  imports: [PrismaModule],
  controllers: [InvitationsController],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}