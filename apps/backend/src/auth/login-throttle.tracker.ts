import type { ExecutionContext } from '@nestjs/common';
import { normalizeEmail } from './email.util.js';

/**
 * Panjang maksimum email yang ikut jadi bagian kunci.
 *
 * Penyerang boleh mengirim email sepanjang 100 KB; tanpa batas, setiap
 * permintaan menghasilkan kunci berbeda dan limit jadi tidak berguna. 254
 * adalah panjang maksimum email yang valid menurut RFC 5321, jadi apa pun
 * yang lebih panjang sudah pasti bukan email sungguhan.
 */
const MAX_EMAIL_LENGTH = 254;

/**
 * Slot tetap untuk request yang email-nya tidak bisa dipakai.
 *
 * Sengaja KONSTAN, bukan ikut isi body. Kalau garbage ikut jadi kunci,
 * penyerang cukup mengirim email berbeda tiap request untuk mendapat kunci
 * baru tiap kali - persis bypass yang harus dicegah. Dengan slot konstan,
 * semua request tanpa email dari satu IP berbagi SATU penghitung.
 */
const NO_EMAIL_SLOT = '-';

/**
 * Bagian kunci untuk request yang email-nya tidak bisa dibaca.
 *
 * Body kosong, `email` bukan string, atau body bukan objek semuanya jatuh ke
 * slot konstan {@link NO_EMAIL_SLOT}, sehingga request garbage tidak pernah
 * mendapat kunci sendiri.
 */
function emailSlot(rawBody: unknown): string {
  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    return NO_EMAIL_SLOT;
  }

  const rawEmail = (rawBody as Record<string, unknown>)['email'];
  if (typeof rawEmail !== 'string') {
    return NO_EMAIL_SLOT;
  }

  const trimmed = rawEmail.trim();
  if (trimmed.length === 0) {
    return NO_EMAIL_SLOT;
  }

  // Normalisasi dengan fungsi yang SAMA dengan yang dipakai `AuthService` saat
  // lookup user. Kalau tracker dan service berbeda pendapat soal normalisasi,
  // penyerang bisa memutar kapitalisasi (`Victim@contoh.id` vs `victim@contoh.id`)
  // untuk mendapat penghitung baru - dan limitnya jadi tidak melindungi akun
  // yang sebenarnya diserang.
  return normalizeEmail(trimmed.slice(0, MAX_EMAIL_LENGTH));
}

/**
 * Tracker throttler untuk endpoint login: kunci = IP + email.
 *
 * ## Kenapa bukan per-IP saja
 *
 * Spec 6.3 meminta "5 percobaan login / menit per IP+email", dan alasannya
 * nyata: dengan kunci per-IP saja, penyerang yang datang dari banyak IP bisa
 * menebak satu akun tanpa pernah menyentuh batas mana pun. Komponen email
 * itulah yang menutup lubang itu - satu akun punya SATU penghitung, berapa pun
 * jumlah IP yang mengirimnya.
 *
 * ## Kenapa kunci tetap menyertakan IP
 *
 * Komponen IP mencegah penyerang dari banyak IP menghajar BERBEDA email
 * sekaligus (credential stuffing / spraying). Tanpa IP, satu penyerang bisa
 * mengunci seluruh akun yang sedang tidak dipakai orang lain - itu jadi Denial
 * of Service, bukan rate limit.
 *
 * ## Request tanpa email yang bisa dibaca
 *
 * Semua fallback berakhir di slot konstan, sehingga request garbage TIDAK
 * mendapat penghitung sendiri: ia berbagi dengan request garbage lain dari IP
 * yang sama. Ini menutup bypass "kirim email acak tiap request", sekaligus
 * menjaga tracker tidak melempar saat body tidak berbentuk JSON.
 *
 * Sengaja tidak melempar, bahkan untuk error tak terduga. Fungsi ini dipanggil
 * `ThrottlerGuard` di jalur request; snagainya membuat limit tidak berjalan
 * sekaligus mengubah setiap request login jadi 500.
 */
export function loginThrottleTracker(
  request: Record<string, unknown>,
  _context?: ExecutionContext,
): string {
  const ip = typeof request?.['ip'] === 'string' ? request['ip'] : '';

  try {
    return `${ip}|${emailSlot(request['body'])}`;
  } catch {
    // Jarang sekali, tapi lebih baik diam-diam memakai kunci per-IP daripada
    // membuat seluruh endpoint login gagal.
    return `${ip}|${NO_EMAIL_SLOT}`;
  }
}
