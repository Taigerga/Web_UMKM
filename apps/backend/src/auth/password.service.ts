import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Nilai enum `Algorithm.Argon2id` dari `@node-rs/argon2`.
 *
 * Ditulis sebagai angka, bukan diimpor, karena paketnya mendeklarasikan
 * `const enum` ambient - yang tidak boleh diakses saat `isolatedModules`
 * aktif. Nilainya dipaksa benar oleh `password.service.spec.ts`, yang
 * memeriksa awalan PHC hasil hash.
 */
const ARGON2ID = 2;

/**
 * Hashing password dengan argon2id.
 *
 * Parameter lain dibiarkan DEFAULT paket (`memoryCost` 19456 KiB, `timeCost` 2,
 * `parallelism` 1) sesuai spec 6.3. Menyetel ulang parameter di sini berarti
 * semua hash lama harus di-rehash saat login berikutnya, jadi tidak ada alasan
 * untuk menyimpang sebelum ada kebutuhan terukur.
 */
@Injectable()
export class PasswordService {
  /** Hash password plaintext menjadi string PHC (`$argon2id$...`). */
  async hash(plain: string): Promise<string> {
    return hash(plain, { algorithm: ARGON2ID });
  }

  /**
   * Verifikasi password terhadap hash tersimpan.
   *
   * Hash yang rusak (mis. kolom terisi karena penulisan manual) mengembalikan
   * `false`, bukan melempar: caller tidak punya aksi yang berguna selain
   * menolak login, dan melempar akan mengubahnya jadi 500 yang membocorkan
   * bahwa ada akun dengan hash tidak valid.
   */
  async verify(storedHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(storedHash, plain);
    } catch {
      return false;
    }
  }
}