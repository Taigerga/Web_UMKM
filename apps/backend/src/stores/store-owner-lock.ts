import type { Prisma } from '../generated/prisma/client.js';

/**
 * Klien transaksi Prisma yang dipakai seluruh helper lock di task ini.
 *
 * `Prisma.TransactionClient` adalah tipe resmi Prisma 7 untuk objek yang
 * diteruskan ke callback `$transaction(async (tx) => ...)`. Tipe ini hanya untuk
 * anotasi, bukan penguncian.
 */
export type StoreTxClient = Prisma.TransactionClient;

/**
 * Ambil lock baris induk toko dengan `SELECT ... FOR UPDATE` (R-21).
 *
 * ## Kenapa lock baris `stores`, bukan baris `store_members`
 *
 * Aturan owner terakhir itu bersyarat: "tolak kalau operasi ini membuat jumlah
 * owner menjadi 0". Menilai kondisi itu berarti MEMBACA jumlah owner, lalu
 * menulis. Dua operasi yang membaca lalu menulis tanpa serialisasi bisa
 * keduanya membaca jumlah yang sama lalu keduanya menulis, dan jaminan yang
 * dituju hilang.
 *
 * Kuncinya: semua operasi yang mengubah jumlah owner harus berhenti di titik
 * yang sama sebelum membaca. Baris `stores` adalah titik itu, karena:
 *
 * - ada tepat satu baris per toko, jadi kuncinya baris yang sama untuk semua
 *   operasi pada toko tersebut;
 * - `stores` BUKAN model tenant (`TENANT_MODELS` tidak memuatnya: primary
 *   key-nya `id`, tidak punya kolom `storeId`), jadi membacanya lewat
 *   `prisma.stores` biasa sudah benar dan tidak melewati aturan tenant scope;
 * - baris itu adalah induk yang dirujuk `store_members`, jadi transaksi lain
 *   yang menulis keanggotaan toko tersebut ikut menunggu di titik yang sama.
 *
 * MySQL/InnoDB menjalankan `SELECT ... FOR UPDATE` pada primary key sebagai
 * record lock: transaksi lain yang membaca baris itu dengan `FOR UPDATE`
 * menunggu sampai transaksi pertama selesai.
 *
 * ## Kenapa `$queryRaw`, bukan Prisma API
 *
 * Prisma tidak punya API locking-baca yang seragam lintas versi, dan
 * `withTenantScope` justru MENOLAK semua `$queryRaw*` dengan sengaja (raw query
 * menembus seluruh scoping). Keduanya keputusan sadar, bukan kelalaian:
 * pemanggilan di sini menyasar satu tabel yang memang tidak punya scoping
 * tenant, dan teks SQL-nya konstan - tidak ada input pengguna yang masuk ke
 * dalam teks query.
 *
 * `storeId` masuk sebagai PARAMETER (`?`), bukan lewat interpolasi string, jadi
 * mustahil menjadi SQL injection.
 */
export async function lockStoreRow(tx: StoreTxClient, storeId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM stores WHERE id = ${storeId} FOR UPDATE`;
}