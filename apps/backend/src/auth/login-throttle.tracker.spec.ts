import { describe, expect, it } from 'vitest';
import { loginThrottleTracker } from './login-throttle.tracker.js';

/**
 * Test untuk tracker rate limit login (spec 6.3: "5 percobaan login / menit
 * per IP+email").
 *
 * ## Kenapa diuji sebagai unit, bukan lewat HTTP
 *
 * Harness e2e (supertest) menghubungkan dari loopback, jadi semua request
 * terlihat datang dari IP yang sama dan variasinya tidak bisa disimulasikan.
 * Menipu server dengan `trust proxy` hanya demi test akan menguji keying
 * dengan IP palsu - yang sah adalah menguji fungsi susun kuncinya langsung,
 * dengan input `req` yang dibuat sendiri sehingga IP benar-benar bisa varied.
 *
 * Bentuk kuncinya adalah `${ip}|${email}`: satu penghitung per PASANGAN
 * (IP, email). Tiga hal yang dijaga test ini justru cara-cara yang
 * akan membuka bypass:
 *
 * - email berbeda harus dapat kunci BERBEDA pada IP sama (kalau tidak,
 *   penyerang bisa mencoba semua akun tanpa pernah kena limit);
 * - email sama harus dapat slot email yang SAMA di IP berbeda (kalau tidak,
 *   komponen yang dikunci per email akan terpecah per IP dan brute force
 *   multi-IP tidak tertangkap);
 * - request tanpa email yang terbaca harus dapat slot TETAP (kalau tidak,
 *   "kirim email acak tiap request" jadi bypass).
 */
describe('loginThrottleTracker', () => {
  const req = (ip: string, body: unknown): Record<string, unknown> => ({
    ip,
    body,
  });

  const emailSlotOf = (key: string): string => key.split('|')[1] ?? '';

  it('memisahkan kunci untuk email berbeda pada IP yang sama', () => {
    const a = loginThrottleTracker(req('10.0.0.1', { email: 'a@contoh.id' }));
    const b = loginThrottleTracker(req('10.0.0.1', { email: 'b@contoh.id' }));

    // Kalau kunci ini sama, penyerang bisa mencoba "a@contoh.id" sebanyak
    // mungkin lalu "b@contoh.id" sebanyak mungkin, tanpa pernah kena limit.
    expect(a).not.toBe(b);
    expect(emailSlotOf(a)).toBe('a@contoh.id');
    expect(emailSlotOf(b)).toBe('b@contoh.id');
  });

  it('memakai slot email yang sama untuk email sama, dari IP berapa pun', () => {
    // Bagian email inilah yang menutup brute force lintas IP terhadap satu
    // akun: berapa pun jumlah IP yang mengirim, slot email-nya tetap satu,
    // jadi agregatanya tidak bisa dipecah dengan pindah IP.
    const fromA = loginThrottleTracker(req('10.0.0.1', { email: 'a@contoh.id' }));
    const fromB = loginThrottleTracker(req('10.0.0.2', { email: 'a@contoh.id' }));
    const fromC = loginThrottleTracker(
      req('203.0.113.7', { email: 'a@contoh.id' }),
    );

    expect(emailSlotOf(fromA)).toBe('a@contoh.id');
    expect(emailSlotOf(fromB)).toBe('a@contoh.id');
    expect(emailSlotOf(fromC)).toBe('a@contoh.id');
  });

  it('mempertahankan komponen IP agar spraying ke banyak email tetap terbatas', () => {
    // Tanpa komponen IP, satu penyerang bisa mengunci seluruh akun yang
    // sedang tidak dipakai orang lain - itu Denial of Service, bukan rate
    // limit. Komponen IP memastikan spraying dibatasi per sumber.
    const key = loginThrottleTracker(req('10.0.0.1', { email: 'a@contoh.id' }));
    expect(key.startsWith('10.0.0.1|')).toBe(true);

    // Dan IP berbeda menghasilkan kunci berbeda, sehingga request atas email
    // yang sama dari IP berbeda TIDAK bisa saling membebaskan: setiap IP
    // tetap punya jatah sendiri.
    const other = loginThrottleTracker(req('10.0.0.2', { email: 'a@contoh.id' }));
    expect(other).not.toBe(key);
  });

  it('menormalisasi email agar variasi kapitalisasi tidak lolos', () => {
    // `AuthService.login` mencari user dengan `normalizeEmail`, jadi
    // `Victim@Contoh.ID` dan `victim@contoh.id` adalah akun yang sama.
    // Kalau tracker tidak ikut menormalisasi, penyerang tinggal memutar
    // kapitalisasi untuk mendapat penghitung baru atas akun yang sama.
    const upper = loginThrottleTracker(req('10.0.0.1', { email: 'Victim@Contoh.ID' }));
    const lower = loginThrottleTracker(req('10.0.0.1', { email: 'victim@contoh.id' }));
    const spaced = loginThrottleTracker(
      req('10.0.0.1', { email: '  victim@contoh.id  ' }),
    );

    expect(upper).toBe(lower);
    expect(spaced).toBe(lower);
  });

  it('request tanpa email yang terbaca mendapat slot TETAP, bukan kunci sendiri', () => {
    // Ini yang menutup bypass "kirim email acak tiap request". Kalau setiap
    // garbage mendapat slot sendiri, penyerang tinggal mengacak payload
    // untuk membuat kunci baru terus-menerus.
    const noBody = loginThrottleTracker(req('10.0.0.1', undefined));
    const nullBody = loginThrottleTracker(req('10.0.0.1', null));
    const arrayBody = loginThrottleTracker(req('10.0.0.1', [{ email: 'a@contoh.id' }]));
    const nonString = loginThrottleTracker(req('10.0.0.1', { email: 12345 }));
    const objectEmail = loginThrottleTracker(req('10.0.0.1', { email: { a: 1 } }));
    const blank = loginThrottleTracker(req('10.0.0.1', { email: '   ' }));

    for (const key of [nullBody, arrayBody, nonString, objectEmail, blank]) {
      expect(key).toBe(noBody);
    }

    // Dan slot itu BEDA dari email sungguhan, supaya request tanpa email tidak
    // ikut menghabiskan kuota akun yang sedang diserang.
    const real = loginThrottleTracker(req('10.0.0.1', { email: 'a@contoh.id' }));
    expect(noBody).not.toBe(real);
  });

  it('memotong email yang sangat panjang supaya kunci tetap bisa dihitung', () => {
    const long = `${'a'.repeat(100_000)}@contoh.id`;
    const key = loginThrottleTracker(req('10.0.0.1', { email: long }));

    expect(typeof key).toBe('string');
    expect(key.length).toBeLessThan(1000);
    expect(key).not.toBe(
      loginThrottleTracker(req('10.0.0.1', { email: 'a@contoh.id' })),
    );
  });

  it('tidak melempar pada request yang tidak lengkap', () => {
    // `ThrottlerGuard` memanggil tracker di jalur request. Kalau tracker
    // melempar, setiap request login jadi 500 dan limit justru tidak
    // berjalan sama sekali.
    expect(() => loginThrottleTracker({})).not.toThrow();
    expect(() => loginThrottleTracker({ ip: undefined })).not.toThrow();
    expect(() => loginThrottleTracker({ ip: 123 })).not.toThrow();
    expect(() =>
      loginThrottleTracker(req('10.0.0.1', 'bukan-objek')),
    ).not.toThrow();
  });
});
