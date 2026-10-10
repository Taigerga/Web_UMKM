import { describe, expect, it } from 'vitest';
import { durationToMs } from './duration.util.js';

/**
 * `durationToMs` dipakai untuk `Max-Age` cookie access token.
 *
 * Parser menolak format asing secara KERAS (melempar), bukan memakai fallback.
 * Kalau fallback diam-diam dipakai, TTL bisa jadi 0: cookie langsung mati di
 * browser dan user tampak logout sendiri tanpa jejak.
 */
describe('durationToMs', () => {
  it('menghitung satuan yang umum dipakai', () => {
    expect(durationToMs('15m')).toBe(900_000);
    expect(durationToMs('900s')).toBe(900_000);
    expect(durationToMs('1h')).toBe(3_600_000);
    expect(durationToMs('7d')).toBe(604_800_000);
    expect(durationToMs('60000ms')).toBe(60_000);
  });

  it('toleransi spasi dan huruf besar', () => {
    expect(durationToMs(' 15M ')).toBe(900_000);
  });

  it('menolak format yang tidak dikenali, bukan diam-diam jadi 0', () => {
    // cases yang paling mungkin salah ketik di file .env
    expect(() => durationToMs('15')).toThrow();
    expect(() => durationToMs('15min')).toThrow();
    expect(() => durationToMs('abc')).toThrow();
    expect(() => durationToMs('')).toThrow();
    // Nol juga ditolak: TTL 0 berarti cookie mati seketika.
    expect(() => durationToMs('0m')).toThrow();
  });
});