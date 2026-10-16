/**
 * Daftar tindakan audit dan `meta` yang boleh menyertainya.
 *
 * ## Kenapa allowlist, bukan denylist
 *
 * Denylist ("buang kunci bernama `password`") bisa dikalahkan dengan satu nama
 * baru: `pass`, `credential`, `tokenHash`. Penyerangnya tidak perlu memakai nama
 * yang sudah dilarang, cukup nama yang belum ada di daftar. Allowlist menutup
 * kelas celah itu: kunci yang tidak disebut TIDAK masuk, apa pun namanya.
 *
 * ## Kenapa per-tindakan, bukan satu daftar global
 *
 * Karena arti `meta` berbeda-bedanya. `store.updated` boleh memuat `fields`
 * (nama kolom yang berubah), `admin.user_status_changed` boleh memuat
 * `from`/`to`. Daftar global akan memaksa pilihan antara daftar yang terlalu
 * longgar (apa pun boleh masuk ke tindakan mana pun) atau daftar yang memaksa
 * semua tindakan memakai nama yang tidak relevan padanya.
 *
 * ## Yang tidak boleh muncul di sini, selamanya
 *
 * Password, hash password, refresh token, access token, dan token undangan
 * mentah maupun hash-nya. Test "tidak ada kunci allowlist yang bernama seperti
 * field rahasia" menjaga daftar ini.
 *
 * Nilai yang diterima: `string`, `number`, `boolean`, `null`, atau array dari
 * tipe yang sama. Objek dan fungsi dibuang `AuditService.record`, jadi `meta`
 * tidak pernah jadi tempat bersembunyi bagi struktur yang tidak diaudit.
 */

/**
 * Tindakan audit, format `<area>.<peristiwa>`.
 *
 * Kolom `action` jadi terbaca tanpa konteks, dan prefiks area tetap stabil
 * ketika tabel bertambah.
 */
export const AUDIT_ACTIONS = {
  AUTH_REGISTER: 'auth.register',
  AUTH_LOGIN: 'auth.login',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_REFRESH: 'auth.refresh',
  AUTH_PASSWORD_CHANGED: 'auth.password_changed',

  STORE_CREATED: 'store.created',
  STORE_UPDATED: 'store.updated',
  STORE_INVITATION_CREATED: 'store.invitation_created',
  STORE_MEMBER_ROLE_CHANGED: 'store.member_role_changed',
  STORE_MEMBER_REMOVED: 'store.member_removed',

  INVITATION_PREVIEWED: 'invitation.previewed',
  INVITATION_ACCEPTED: 'invitation.accepted',

  ADMIN_USER_STATUS_CHANGED: 'admin.user_status_changed',
  ADMIN_USER_LISTED: 'admin.user_listed',
  ADMIN_STORE_LISTED: 'admin.store_listed',

  CUSTOMER_EXPORTED: 'customer.exported',
} as const;

/** Union dari semua tindakan yang sah. */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

/**
 * `meta` yang boleh menyertai setiap tindakan.
 *
 * Setiap nilai `AUDIT_ACTIONS` wajib punya entri di sini: `satisfies
 * Record<AuditAction, readonly string[]>` membuat penambahan action tanpa
 * allowlist ditolak compiler, bukan ditunggu review.
 */
export const AUDIT_META_ALLOWLIST = {
  [AUDIT_ACTIONS.AUTH_REGISTER]: [],
  // `outcome` dan `reason` hanya, tanpa email. Kegagalan login tetap
  // dicatat: mencatat email ke dalam audit berarti ikut terekspos data yang
  // justru tidak boleh keluar dari respons 401 itu sendiri. `reason` adalah
  // adalah kode aplikasi yang sudah ada di respons 401/403, bukan informasi
  // baru.
  [AUDIT_ACTIONS.AUTH_LOGIN]: ['outcome', 'reason'],
  [AUDIT_ACTIONS.AUTH_LOGOUT]: [],
  [AUDIT_ACTIONS.AUTH_REFRESH]: [],
  [AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED]: [],

  // `store.updated` memuat NAMA kolom yang berubah, bukan nilainya: nama toko
  // adalah data bisnis tenant yang sudah ada di `stores`, menyalinnya ke audit
  // hanya menghasilkan salinan yang bisa basi.
  [AUDIT_ACTIONS.STORE_CREATED]: [],
  [AUDIT_ACTIONS.STORE_UPDATED]: ['fields'],
  [AUDIT_ACTIONS.STORE_INVITATION_CREATED]: ['role'],
  [AUDIT_ACTIONS.STORE_MEMBER_ROLE_CHANGED]: ['from', 'to'],
  [AUDIT_ACTIONS.STORE_MEMBER_REMOVED]: ['role'],

  // `invitation.previewed` sengaja tanpa meta: halamannya dipanggil publik oleh
  // siapa pun yang memegang token, dan email tujuan adalah data pribadi orang
  // yang belum tentu pengguna. Baris audit cukup membuktikan ada yang melihat
  // undangan itu.
  [AUDIT_ACTIONS.INVITATION_PREVIEWED]: [],
  [AUDIT_ACTIONS.INVITATION_ACCEPTED]: ['role'],

  [AUDIT_ACTIONS.ADMIN_USER_STATUS_CHANGED]: ['from', 'to'],
  [AUDIT_ACTIONS.ADMIN_USER_LISTED]: [],
  [AUDIT_ACTIONS.ADMIN_STORE_LISTED]: [],

  // Ekspor pelanggan: cukup bukti "siapa mengunduh segmen apa, berapa baris".
  // Nama/email pelanggan adalah data pribadi dan sengaja tidak masuk audit.
  [AUDIT_ACTIONS.CUSTOMER_EXPORTED]: ['segment', 'count'],
} as const satisfies Record<AuditAction, readonly string[]>;

/** Bentuk meta yang boleh ditulis. */
export type AuditMetaValue =
  | string
  | number
  | boolean
  | null
  | Array<string | number | boolean>;

/** Bentuk `meta` setelah redaksi: hanya kunci yang diizinkan, tanpa objek. */
export type SanitizedAuditMeta = Record<string, AuditMetaValue>;