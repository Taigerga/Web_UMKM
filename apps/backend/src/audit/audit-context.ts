import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Konteks request yang dipakai `AuditService` untuk mengisi `ip` dan
 * `userAgent`.
 *
 * ## Kenapa perlu ada
 *
 * `audit_logs` mewajibkan `ip` dan `userAgent` (keduanya `NOT NULL`), jadi
 * pemanggil `record` harus menyediakannya. Dua opsi lain ditolak:
 *
 * - biarkan pemanggil yang mengisi -> setiap controller harus meneruskan
 *   request ke service, dan ada jalur yang akan terlupa;
 * - tulis placeholder tetap -> kolomnya jadi tidak informatif.
 *
 * `AsyncLocalStorage` menyelesaikan tanpa mengubah tanda tangan service mana pun:
 * middleware membungkus eksekusi request, dan `record` membaca apa yang ada di
 * sana.
 *
 * Konteks bisa saja tidak ada: pemanggilan service langsung dari task terjadwal
 * atau dari unit test. Itu bukan kondisi error, dan `AuditService` memakai
 * `unknown` untuk kedua kolom.
 */
export interface AuditRequestContext {
  ip: string;
  userAgent: string;
}

const storage = new AsyncLocalStorage<AuditRequestContext>();

/** Jalankan `fn` dengan konteks request aktif. */
export function runWithAuditContext<T>(context: AuditRequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** Konteks request yang sedang aktif, atau `undefined` di luar request. */
export function currentAuditContext(): AuditRequestContext | undefined {
  return storage.getStore();
}