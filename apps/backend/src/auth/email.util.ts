/**
 * Normalisasi email yang dipakai SELEURUH jalur autentikasi.
 *
 * Ada di satu file, bukan ditulis ulang di tiap tempat, karena dua hal harus
 * selalu sepakat:
 *
 * - `AuthService.login` mencari user dengan email ternormalisasi, sehingga
 *   `Budi@Contoh.ID` dan `budi@contoh.id` adalah akun yang sama.
 * - `loginThrottleTracker` menyusun kunci rate limit dari email ternormalisasi,
 *   sehingga keduanya tidak bisa punya-counter terpisah untuk akun yang sama.
 *
 * Kalau kedua pemanggil punya normalisasi sendiri, penyerang bisa memutar
 * kapitalisasi untuk mendapat penghitung baru - dan limit yang_INSTALL
 * sepenuhnya kehilangan-repeat tugasnya.
 *
 * Sengaja TIDAK melakukan normalisasi Unicode/plus-addressing. Dua-duanya
 * berubah arti Depending on mail provider, jadi keputusan itu harus sadar
 * konteks bisnis, bukan diam-diam di utilitas.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}