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
 * Tracker throttler untuk endpoint login: kunci = `<ip>|<email>`.
 *
 * ## Yang sebenarnya dilindungi (dan yang TIDAK)
 *
 * Kunci ini adalah GABUNGAN ip dan email, jadi satu pasangan (IP, email)
 * punya satu penghitung. Konsekuensinya:
 *
 * - Penyerang dari SATU IP yang menebak SATU email: terbatas 5/menit. ✅
 * - Penyerang dari SATU IP yang menyapu BANYAK email (credential stuffing):
 *   kunci berbeda per email, jadi tidak dibatasi oleh throttle ketat ini; yang
 *   menahan adalah batas per-IP pada throttler `default`.
 * - Penyerang dari BANYAK IP yang menebak SATU email (distributed guessing):
 *   **TIDAK dibatasi oleh tracker ini.** Tiap IP mendapat penghitungnya sendiri
 *   karena IP adalah bagian dari kunci. Tracker ini tidak menutup serangan
 *   seperti itu, dan tidak akan - mengubahnya berarti mengabaikan spec
 *   "per IP+email" dan membiarkan satu penyerang mengunci seluruh akun.
 *
 * Yang benar-benar menutup distributed guessing adalah lockout akun:
 * `MAX_FAILED_LOGIN_ATTEMPTS` kegagalan beruntun mengunci akun tersebut
 * (`lockedUntil`), dan itu dihitung per AKUN di database - bukan per IP, jadi
 * tidak bisa dipecah dengan menambah IP. Lihat `AuthService.registerFailedAttempt`.
 *
 * Kalau suatu saat produk memutuskan distributed guessing harus dibatasi juga,
 * itu bukan perubahan sepele pada tracker ini: butuh penghitung per email
 * TANPA IP (throttler kedua), kuota global, dan penanganan false positive.
 *
 * ## Request tanpa email yang bisa dibaca
 *
 * Semua fallback berakhir di slot konstan, sehingga request garbage TIDAK
 * mendapat penghitung sendiri: ia berbagi dengan request garbage lain dari IP
 * yang sama. Ini menutup bypass "kirim email acak tiap request", sekaligus
 * menjaga tracker tidak melempar saat body tidak berbentuk JSON.
 *
 * Slot konstan bukan berarti request tanpa email lolos begitu saja - keduanya
 * tetap punya penghitung, cuma dihitung bersama per IP.

 * ## Kenapa tracker tidak melempar
 *
 * Fungsi ini dipanggil `ThrottlerGuard` di jalur request; snagainya membuat
 * limit tidak berjalan sekaligus mengubah setiap request login jadi 500.
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
