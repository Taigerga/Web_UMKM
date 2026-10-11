import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateInviteToken, hashInviteToken } from './invite-token.util.js';

/**
 * `generateInviteToken` dan `hashInviteToken` (R-22).
 *
 * Yang dipin test ini:
 * - token yang dihasilkan cukup panjang dan TIDAK bisa ditebak (32 byte acak);
 * - yang disimpan adalah SHA-256 dari token mentah, bukan tokennya;
 * - hash-nya 64 hex, persis seperti `tokenHash` di refresh token.
 *
 * Kalau `generateInviteToken` diubah jadi `randomUUID()` atau `'token-_fixed'`,
 * test "dua token berbeda" dan "panjang" gagal. Kalau `hashInviteToken`
 * diubah jadi `token => token`, test "digest bukan token mentah" gagal - dan
 * itulah yang membuat kebocoran tabel `store_invites` tidak langsung berarti
 * undangan bisa dipakai orang.
 */
describe('invite-token.util', () => {
  it('token mentah bukan UUID dan cukup panjang untuk ditebak', () => {
    const token = generateInviteToken();

    // 32 byte -> 43 karakter base64url. Longgar di atas supaya margin aman,
    // tapi jauh di atas 36 karakter UUID.
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    // base64url: tidak boleh mengandung karakter yang harus di-escape di URL.
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('dua token berbeda setiap kali', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateInviteToken()));
    expect(tokens.size).toBe(200);
  });

  it('hash adalah SHA-256 token mentah, 64 hex', () => {
    const token = generateInviteToken();
    const hash = hashInviteToken(token);

    // Dihitung ulang di sini dengan API standar, bukan lewat fungsi yang sama,
    // supaya test tidak hanya menguji bahwa fungsi ini idempoten dengan dirinya.
    expect(hash).toBe(createHash('sha256').update(token).digest('hex'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash yang disimpan tidak mengandung token mentah', () => {
    const token = generateInviteToken();
    expect(hashInviteToken(token)).not.toBe(token);
    expect(hashInviteToken(token).includes(token)).toBe(false);
  });

  it('token berbeda menghasilkan hash berbeda (tidak ada ruang bersama)', () => {
    expect(hashInviteToken('a')).not.toBe(hashInviteToken('b'));
  });
});