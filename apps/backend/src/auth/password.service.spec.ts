import { describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

/**
 * `PasswordService.hash` meneruskan `algorithm: 2` secara literal, bukan
 * mengimpor `Algorithm.Argon2id` dari `@node-rs/argon2`.
 *
 * Itu karena paketnya mendeklarasikan `const enum` ambient, yang tidak boleh
 * diakses saat `isolatedModules` aktif. Test di bawah adalah jaring
 * pengamannya: kalau angka 2 ternyata bukan Argon2id, atau default paket
 * berubah, awalan PHC hasil hash akan berbeda dan test ini gagal - jadi
 * konstanta angka itu tidak bisa diam-diam jadi algoritma yang salah.
 */
describe('PasswordService', () => {
  const service = new PasswordService();

  it('hash memakai argon2id (bukan argon2i/argon2d)', async () => {
    const hash = await service.hash('rahasia-kuat-123');

    // Awalan PHC memuat nama algoritme secara literal.
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toMatch(/^\$argon2i\$/);
    expect(hash).not.toMatch(/^\$argon2d\$/);
  });

  it('verify menerima password benar dan menolak yang salah', async () => {
    const hash = await service.hash('rahasia-kuat-123');

    await expect(service.verify(hash, 'rahasia-kuat-123')).resolves.toBe(true);
    await expect(service.verify(hash, 'rahasia-kuat-124')).resolves.toBe(false);
    await expect(service.verify(hash, '')).resolves.toBe(false);
  });

  it('setiap hash unik walau plaintext sama (salt acak)', async () => {
    const a = await service.hash('rahasia-sama');
    const b = await service.hash('rahasia-sama');

    expect(a).not.toBe(b);
    // Tapi keduanya tetap memverifikasi password yang sama.
    await expect(service.verify(a, 'rahasia-sama')).resolves.toBe(true);
    await expect(service.verify(b, 'rahasia-sama')).resolves.toBe(true);
  });

  it('hash rusak menghasilkan false, bukan exception', async () => {
    // Kolom `passwordHash` bisa saja terisi nilai non-PHC (mis. seed lama).
    // `verify` yang melempar akan mengubahnya jadi 500 yang membocorkan bahwa
    // ada akun dengan hash rusak.
    await expect(service.verify('bukan-hash-argon2', 'apa-saja')).resolves.toBe(false);
    await expect(service.verify('', 'apa-saja')).resolves.toBe(false);
  });
});