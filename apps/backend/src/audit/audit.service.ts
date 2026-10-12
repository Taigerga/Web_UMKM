import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { AUDIT_META_ALLOWLIST } from './audit-actions.js';
import type { AuditAction, AuditMetaValue, SanitizedAuditMeta } from './audit-actions.js';
import { currentAuditContext } from './audit-context.js';

/** Panjang maksimum sesuai definisi kolom di `schema.prisma`. */
const MAX_ACTION = 64;
const MAX_ENTITY = 64;
const MAX_IP = 45;
const MAX_USER_AGENT = 255;

/** Nilai yang dipakai saat pemanggilan tidak punya konteks request. */
const UNKNOWN = 'unknown';

/** Batas panjang nilai meta, supaya audit tidak jadi tempat sampah data besar. */
const MAX_META_STRING = 512;

/**
 * Klien yang bisa menulis ke `audit_logs`.
 *
 * Bentuk struktural, bukan `Prisma.TransactionClient`: `record` hanya butuh
 * `create` pada model `auditLogs`, dan bentuk longgar itu membuat
 * `PrismaService` dan klien transaksi bisa keduanya lewat tanpa cast.
 *
 * Kenapa perlu ada: beberapa peristiwa audit tidak boleh ditulis di luar
 * transaksi yang sama dengan perubahannya. `store.member_removed` dan
 * `store.member_role_changed` adalah contohnya - kalau penulisan audit gagal
 * setelah commit, jejaknya hilang permanen karena baris yang mencatatnya sudah
 * dihapus. Lihat `StoresService.removeMember`.
 */
export interface AuditWriter {
  auditLogs: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/** Awal pesan warn, supaya kegagalan audit bisa disaring dari log teknis. */
const WARN_PREFIX = 'audit gagal dicatat';

/** Satu entri audit yang diminta pemanggil. */
export interface AuditEntry {
  /** User yang melakukan aksi. `undefined` untuk peristiwa tanpa pelaku. */
  actorId?: string;
  /**
   * Toko yang relevan, kalau ada.
   *
   * Tidak wajib: `audit_logs` sengaja tidak punya foreign key ke `stores`
   * supaya jejaknya tetap terbaca setelah tokonya dihapus.
   */
  storeId?: string;
  action: string;
  entity: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}

/**
 * Satu-satunya pintu penulisan ke `audit_logs`.
 *
 * ## R-23: `record` tidak pernah melempar
 *
 * Kegagalan audit tidak boleh menggagalkan operasi bisnis. Konsekuensinya tidak
 * simetris, jadi urutannya perlu dinyatakan. Gagal membuat toko adalah masalah
 * besar bagi pengguna; satu baris audit yang hilang adalah masalah operasional
 * yang masih bisa diperbaiki. Maka setiap kegagalan -
 * database, serialisasi, bahkan `entry` yang rusak total - ditangkap dan dicatat
 * sebagai `warn`, lalu `record` tetap resolve.
 *
 * ## Kenapa pesan error tidak ikut dicatat
 *
 * Prisma menyertakan nilai yang gagal disimpan di pesan error-nya. Kalau pesan itu
 * masuk ke log teknis, redaksi pada `meta` jadi tidak berarti: rahasianya bocor
 * lewat jalur yang justru tidak diaudit. Yang dicatat hanya nama kelas error
 * (`Error`, `PrismaClientKnownRequestError`, `PrismaClientValidationError`) plus
 * tindakan yang gagal - cukup untuk diagnosis, tidak cukup untuk membocorkan.
 *
 * ## Meta: allowlist per tindakan, default-deny
 *
 * `meta` dari pemanggil SELALU diperlakukan sebagai tidak dipercaya. Hanya kunci
 * yang tercantum di `AUDIT_META_ALLOWLIST` untuk tindakan itu yang diteruskan;
 * sisanya dibuang, dan setiap pembuangan dicatat sebagai `warn`.
 *
 * Tindakan yang tidak terdaftar membuang seluruh `meta`, sehingga tindakan baru
 * tidak diam-diam mendapat meta bebas.
 *
 * Peringatan pembuangan itu bukan hiasan. Justru karena ada suaranya, test e2e
 * "sequence nyata tidak pernah memunculkan peringatan redaksi" bisa gagal ketika
 * ada call site yang menambahkan `password` ke `meta`. Tanpa peringatan itu,
 * test tersebut hanya membuktikan bahwa call site yang sekarang ada tidak punya
 * `password` - bukan bahwa `password` tidak bisa masuk.
 *
 * ## Mengapa tidak memakai `tenantModel`
 *
 * `audit_logs` sengaja di luar `TENANT_MODELS`: kolom `storeId`-nya tidak punya
 * foreign key, supaya log tetap terbaca setelah tokonya dihapus, dan admin harus
 * bisa membacanya lintas tenant. Yang membatasi pembacaan audit adalah peran
 * platform, bukan scoping tenant.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Jumlah kegagalan penulisan audit sejak proses ini berjalan.
   *
   * ## Kenapa perlu ada penghitung, bukan cuma baris log
   *
   * R-23 melarang kegagalan audit menggagalkan operasi bisnis. Itu benar, tapi
   * konsekuensinya adalah kelas kegagalan yang tidak terlihat: akun sudah
   * dinonaktifkan, sesi sudah dicabut, dan TIDAK ADA yang mencatat bahwa itu
   * terjadi. Untuk operasi yang tidak bisa dibatalkan - menonaktifkan akun,
   * mencabut keanggotaan - satu baris `warn` di log teknis adalah kontrol
   * pengganti yang tipis: log teknis justru tempat yang paling jarang dibaca
   * tepat ketika dibutuhkan.
   *
   * Penghitung membuat kondisi itu TERLIHAT tanpa harus menggali log, dan tanpa
   * mengubah R-23: operasinya tetap berhasil, hanya jejaknya hilang dan itu
   * sekarang bisa diketahui. Dieksposur di `/health/details` sebagai
   * angka polos - tanpa rincian, tanpa nama aksi, tanpa apa pun yang bisa jadi
   * kanal kebocoran lewat endpoint yang bukan untuk publik.
   *
   * ## Batasnya, terus terang
   *
   * Ini penghitung **dalam proses**. Restart mengembalikan ke nol, jadi ini bukan
   * catatan yang bukaannya saat insiden selesai. Yang diawinya adalah
   * deteksi cepat "ada yang salah dengan audit", bukan rekonstruksi kejadian.
   * Rekonstruksi yang bertahan butuh outbox atau retry queue - itu urusan fase
   * berikutnya, dan sengaja tidak dibangun di sini.
   *
   * Monotonik, tidak pernah turun: tidak ada `reset()`. Nilai 1 dan 3 sama-sama
   * berarti "ada masalah"; yang penting arahnya naik, supaya tidak bisa
   * tersamar sebagai kondisi sehat.
   */
  failureCount = 0;

  /**
   * Catat satu peristiwa.
   *
   * `Promise` ini SELALU resolve - R-23 tidak berubah. Yang membawa kabar
   * adalah nilai kembaliannya: `true` kalau baris benar-benar ditulis,
   * `false` kalau gagal.
   *
   * ## Kenapa nilai kembali, bukan exception
   *
   * Kalau `record` melempar sentinel error, setiap pemanggil after-commit harus
   * membungkus panggilannya dengan `try/catch` supaya R-23 tetap berlaku - dan
   * pemanggil baru yang lupa akan menemukan R-23 dilanggar saat integration,
   * bukan saat compile.
   *
   * Dengan nilai kembali, `record` tetap tidak melempar untuk siapa pun.
   * Pemanggil after-commit yang mengabaikan nilai itu berperilaku persis seperti
   * dulu, dan itu memang yang mereka mau.
   *
   * ## Kenapa ini penting untuk pemanggil DI DALAM transaksi
   *
   * InnoDB me-rollback SELURUH transaksi pada deadlock, dan pada lock-wait timeout
   * ketika `innodb_rollback_on_timeout=1` - bukan cuma statement yang gagal.
   *
   * Kalau `record` menelan error itu dan membiarkan callback selesai normal,
   * Prisma mengirim COMMIT untuk transaksi yang sudah tidak ada. MySQL
   * memperlakukannya sebagai commit kosong yang BERHASIL, dan pemanggil mendapat
   * 200 dengan perubahan yang sudah dibatalkan - tanpa baris audit. Kegagalan
   * senyap yang tidak bisa dideteksi, jadi pemanggil dalam-transaksi wajib
   * memeriksa nilai kembalian ini dan melempar agar `$transaction` rollback.
   *
   * @param entry peristiwa yang dicatat
   * @param client klien opsional; kalau diisi, baris ikut commit/rollback
   *   transaksi pemanggil
   * @returns `true` kalau barisnya benar-benar ditulis
   */
  async record(entry: AuditEntry, client?: AuditWriter): Promise<boolean> {
    const invalid = invalidReason(entry);
    if (invalid !== undefined) {
      // Entry cacat berarti tidak ada yang tercatat, jadi ini dihitung
      // kegagalan juga - meski tidak ada error di database yang bisa
      // membuktikannya.
      this.failureCount += 1;
      this.logger.warn(
        `${WARN_PREFIX} (entri tidak valid) ${invalid}. ` +
          'Pemanggil harus mengirim action dan entity berupa string non-kosong.',
      );
      return false;
    }

    try {
      const context = currentAuditContext();
      const meta = this.sanitizeMeta(entry.action, entry.meta);

      // `client` dipakai kalau pemanggil perlu baris audit ini ikut
      // commit/rollback transaksinya. Tanpa argumen ini, penulisan terjadi di
      // koneksi utama - yang benar untuk sebagian besar pemanggil, dan salah untuk operasi
      // yang jejaknya tidak bisa direkonstruksi setelah commit.
      const target = client ?? this.prisma;

      await target.auditLogs.create({
        data: {
          actorId: entry.actorId ?? null,
          storeId: entry.storeId ?? null,
          action: truncate(entry.action, MAX_ACTION),
          entity: truncate(entry.entity, MAX_ENTITY),
          entityId: entry.entityId ?? null,
          ip: truncate(context?.ip ?? UNKNOWN, MAX_IP),
          userAgent: truncate(context?.userAgent ?? UNKNOWN, MAX_USER_AGENT),
          // Kunci `meta` tidak disebut sama sekali saat tidak ada yang boleh
          // ditulis, bukan ditulis `undefined`. Kolomnya jadi NULL, dan tidak
          // ada ambiguitas Prisma antara "tidak disebut" dan "NULL".
          ...(meta ? { meta } : {}),
        },
      });

      return true;
    } catch (error) {
      // Penambahnya DI DALAM catch, bukan sesudahnya: kalau satu-satunya
      // tempat menaikkan ada di luar blok try, catch yang melempar akan
      // melewatinya - dan justru kasus itulah yang paling perlu terlihat.
      this.failureCount += 1;
      this.logger.warn(
        `${WARN_PREFIX} (${errorName(error)}) untuk tindakan ${describeAction(entry?.action)}`,
      );
      return false;
    }
  }

  /**
   * Redaksi `meta`: hanya kunci berizin, hanya nilai berbentuk JSON sederhana.
   *
   * Mengembalikan `undefined` saat tidak ada yang boleh ditulis, supaya kolom
   * `meta` benar-benar NULL dan bukan objek kosong.
   */
  private sanitizeMeta(
    action: string,
    meta: Record<string, unknown> | undefined,
  ): SanitizedAuditMeta | undefined {
    if (meta === undefined || meta === null) return undefined;

    const keys = Object.keys(meta);
    if (keys.length === 0) return undefined;

    const allowed = this.allowedKeysFor(action);
    const sanitized: SanitizedAuditMeta = {};
    const dropped: string[] = [];

    for (const key of keys) {
      if (!allowed.includes(key)) {
        dropped.push(key);
        continue;
      }

      const value = this.sanitizeValue(meta[key]);
      if (value === undefined) {
        dropped.push(key);
        continue;
      }

      sanitized[key] = value;
    }

    if (dropped.length > 0) {
      this.warnDropped(action, dropped);
    }

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }

  /**
   * Kunci yang boleh menyertai `action`.
   *
   * Tindakan di luar daftar menghasilkan daftar kosong, bukan daftar semua kunci
   * yang pernah dikenal.
   */
  private allowedKeysFor(action: string): readonly string[] {
    return AUDIT_META_ALLOWLIST[action as AuditAction] ?? [];
  }

  /**
   * Nilai meta yang boleh ditulis ke kolom JSON; `undefined` berarti "buang".
   *
   * Objek dan fungsi dibuang di sini, bukan hanya lewat allowlist, karena kunci
   * yang diizinkan pun bisa dipanggil dengan bentuk yang salah. Membiarkan
   * objek lolos akan membuat `meta` jadi tempat menyembunyikan field di dalam
   * anak objek yang tidak pernah melewati allowlist.
   */
  private sanitizeValue(value: unknown): AuditMetaValue | undefined {
    if (value === null) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    if (typeof value === 'string') return truncate(value, MAX_META_STRING);

    if (Array.isArray(value)) {
      const items: Array<string | number | boolean> = [];
      for (const item of value) {
        if (typeof item === 'string') {
          items.push(truncate(item, MAX_META_STRING));
        } else if (typeof item === 'number' && Number.isFinite(item)) {
          items.push(item);
        } else if (typeof item === 'boolean') {
          items.push(item);
        } else {
          // Array bersarang atau objek di dalam array: bentuknya tidak pernah
          // dipakai, dan menerimanya hanya membuka pintu baru.
          return undefined;
        }
      }
      return items;
    }

    return undefined;
  }

  /** Peringatan saat kunci atau nilai `meta` dibuang. */
  private warnDropped(action: string, keys: string[]): void {
    this.logger.warn(
      `${WARN_PREFIX} (redaksi meta) untuk tindakan ${describeAction(action)}: ` +
        `kunci dibuang: ${keys.join(', ')}. ` +
        'Tambahkan kunci ke AUDIT_META_ALLOWLIST hanya jika isinya bukan rahasia.',
    );
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/** Nama kelas error tanpa pesannya. Lihat catatan kelas `AuditService`. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

/** Nama tindakan untuk pesan log, aman walau `entry` sendiri rusak. */
function describeAction(action: unknown): string {
  return typeof action === 'string' ? action : '(tidak diketahui)';
}

/**
 * Alasan `entry` tidak bisa ditulis, atau `undefined` kalau bentuknya benar.
 *
 * Fungsi ini total: input apa pun menghasilkan string atau `undefined`, tidak
 * pernah melempar. Kalau ia melempar, `record` tidak lagi bisa membedakan
 * "entri rusak" dari "database mati", dan pesan tunggal menutup keduanya.
 */
function invalidReason(entry: unknown): string | undefined {
  if (typeof entry !== 'object' || entry === null) {
    return `entry bukan objek (diterima ${typeof entry})`;
  }

  const { action, entity } = entry as { action?: unknown; entity?: unknown };

  if (typeof action !== 'string' || action.length === 0) {
    return `action bukan string non-kosong (diterima ${typeof action})`;
  }

  if (typeof entity !== 'string' || entity.length === 0) {
    return `entity bukan string non-kosong (diterima ${typeof entity})`;
  }

  return undefined;
}