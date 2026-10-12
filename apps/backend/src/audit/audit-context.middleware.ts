import type { Request } from 'express';
import { runWithAuditContext } from './audit-context.js';
import type { AuditRequestContext } from './audit-context.js';

/** Nilai yang dipakai saat header tidak ada. */
const UNKNOWN = 'unknown';

/**
 * IP klien untuk `audit_logs`.
 *
 * `request.ip` dipakai, bukan `socket.remoteAddress` mentah: Express sudah
 * memperhitungkan rantai proxy untuk field itu, dan nilai yang salah di sini
 * berarti jejak audit menunjuk ke proxy, bukan ke pelaku.
 *
 * Alias IPv4-mapped dibuka supaya satu klien tidak menghasilkan dua bentuk
 * alamat tergantung cara OS menuliskan loopback.
 */
export function clientIp(request: Request): string {
  const raw = request.ip ?? request.socket?.remoteAddress ?? UNKNOWN;
  return raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw;
}

/** `User-Agent` permintaan, atau `unknown` kalau header tidak ada. */
export function clientUserAgent(request: Request): string {
  const header = request.headers['user-agent'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 ? value : UNKNOWN;
}

/**
 * Middleware yang mengikat konteks request untuk audit dan exception filter.
 *
 * Yang diikat hanya dua string yang dibutuhkan audit, bukan objek `Request`
 * itu sendiri: menyimpan request di `AsyncLocalStorage` akan menahan seluruh
 * graf objeknya - body dan header ikut - selama request berjalan.
 *
 * Middleware ini tidak boleh bisa membuat request gagal, jadi tidak ada
 * try/catch dan tidak ada penanganan error di sini.
 */
export function auditContextMiddleware(
  request: Request,
  _response: unknown,
  next: () => void,
): void {
  const context: AuditRequestContext = {
    ip: clientIp(request),
    userAgent: clientUserAgent(request),
  };

  runWithAuditContext(context, next);
}