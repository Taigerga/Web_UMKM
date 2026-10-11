import { createHash, randomBytes } from 'node:crypto';

/**
 * Token undangan: acak kriptografis, disimpan sebagai SHA-256 (R-22).
 *
 * Berpisah dari `src/auth/refresh-token.service.ts` dan TIDAK mengimpor
 * `hashRefreshToken` dari sana. Alasannya bukan sekadar soal rasa: dua token
 * punya masa hidup, pemilik, dan tabel yang berbeda, jadi perubahan satu tidak
 * boleh diam-diam mengubah makna yang lain. Yang sama adalah PRIMITIFNYA -
 * SHA-256 atas token mentah - dan itu yang ditulis eksplisit di sini supaya
 * assertion test punya tempat yang jelas untuk menguji.
 *
 * Panjang 32 byte (256 bit) memakai `randomBytes`, bukan `randomUUID`:
 * `randomUUID` v4 memberi 122 bit dan formatnya terlihat sebagai UUID, sehingga
 * mudah disamarkan dengan id baris. 32 byte base64url juga aman di URL path
 * tanpa encoding tambahan, yang penting karena token ada di
 * `POST /invitations/:token/accept`.
 */

/** Token mentah untuk undangan. Hanya dikembalikan SATU KALI, saat pembuatan. */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * SHA-256 hex dari token mentah.
 *
 * Dipisah sebagai fungsi agar test bisa membuktikan kolom `tokenHash` berisi
 * digest, bukan token apa adanya - persis seperti `hashRefreshToken`.
 */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}