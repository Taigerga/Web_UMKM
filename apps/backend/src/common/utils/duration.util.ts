/**
 * Duration TTL string (`"15m"`, `"7d"`, `"900s"`, `"60000ms"`).
 *
 * `@nestjs/jwt` sudah bisa membaca format ini sendiri untuk `expiresIn`,
 * tapi cookie `Max-Age` butuh milidetik. Format yang sama, dihitung di satu
 * tempat supaya tidak ada dua parser yang bisa berbeda pendapat.
 */
const UNITS_IN_MS: Readonly<Record<string, number>> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

/**
 * Ubah TTL string jadi milidetik.
 *
 * Sengaja menolak apa pun yang tidak dikenali, bukan memakai fallback: TTL
 * yang diam-diam jadi 0 berarti cookie langsung mati di browser dan user
 * tampak logout sendiri. Lebih baik startup/request gagal dengan pesan jelas.
 *
 * @throws Error bila format tidak valid
 */
export function durationToMs(duration: string): number {
  const raw = duration.trim().toLowerCase();
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(raw);
  if (!match) {
    throw new Error(
      `TTL tidak valid: "${duration}". Gunakan format seperti "15m", "900s", atau "7d".`,
    );
  }
  const amount = Number(match[1]);
  const unit = UNITS_IN_MS[match[2] as string];
  if (unit === undefined || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(`TTL tidak valid: "${duration}".`);
  }
  return amount * unit;
}