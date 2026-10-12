import { IsBoolean } from 'class-validator';

/**
 * Body `PATCH /admin/users/:userId/status`.
 *
 * Hanya `isActive`, dan tidak ada `role` di sini. Membolehkan peran platform
 * diubah lewat endpoint ini akan membuat admin bisa membuat admin baru tanpa
 * proses, dan bisa menurunkan dirinya sendiri tanpa jalan kembali. Perubahan
 * peran platform bukan wewenang endpoint ini.
 *
 * `isActive` wajib ada dan harus boolean. Tidak ada default yang aman di sini:
 * default `true` akan mengaktifkan kembali akun yang sengaja dinonaktifkan.
 */
export class UpdateUserStatusDto {
  @IsBoolean()
  isActive!: boolean;
}