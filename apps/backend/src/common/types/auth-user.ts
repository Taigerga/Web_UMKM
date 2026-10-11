import type { Role } from './prisma-enums.js';

/**
 * Bentuk user yang sudah terautentikasi, seperti yang diktrak ke controller.
 *
 * Dipisah dari `src/auth/jwt.strategy.ts` supaya `@CurrentUser()` dan guard
 * tidak harus mengimpor dari modul autentikasi: decorator dan guard adalah
 * infrastruktur yang juga dipakai modul lain.
 *
 * `role` adalah peran PLATFORM (`users.role`), bukan peran toko. Peran toko
 * hidup di `store_members.role` dan dibaca lewat `StoreAccessService`.
 *
 * Peringatan: `JwtStrategy.validate` TIDAK cek database. Jadi `role` di sini
 * adalahsnapshot saat token diterbitkan. Menurunkan `users.role` tidak langsung
 * mencabut access token yang sudah terbit (umur 15 menit) - jalur pencabutan
 * yang sesungguhnya ada di `AuthService.refresh`.
 */
export interface AuthUser {
  userId: string;
  email: string;
  role: Role;
}