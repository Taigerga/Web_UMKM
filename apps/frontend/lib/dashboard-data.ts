/**
 * Bentuk data dan pemanggil endpoint untuk halaman dashboard.
 *
 * ## Bentuknya dibaca dari backend, bukan dari nama endpoint
 *
 * Setiap type di bawah adalah salinan interface di `apps/backend/src`, bukan
 * tebakan dari URL:
 *
 * - `StoreSummary` <- `stores/store-access.service.ts` (`GET /stores`)
 * - `StoreMemberView` <- `stores/stores.service.ts` (`GET /stores/:storeId/members`)
 * - `AdminUserView` <- `admin/admin.service.ts` (`GET /admin/users`, `PATCH /admin/users/:userId/status`)
 * - `AdminStoreView` <- `admin/admin.service.ts` (`GET /admin/stores`)
 * - `StoreView` <- `stores/stores.service.ts` (`PATCH /stores/:storeId`)
 *
 * Kalau bentuknya berubah di backend, bagian yang salah compile di sini -
 * bukan UI yang diam-diam menampilkan `undefined`.
 *
 * ## Kenapa semua pemanggil lewat `sessionRequest`
 *
 * `apiRequest` tidak tahu apa-apa soal sesi, dan R-41 butuh penyambungan
 * refresh di setiap request dashboard. `sessionRequest` di
 * `lib/session-refresh.ts` adalah lapisan itu, dan semua pemanggil di file
 * ini memakainya - varian `sessionFetch` hanya untuk unduhan laporan yang
 * butuh `Response` mentah (berkas, bukan JSON amplet). Tidak ada satu pun
 * fetch langsung ke backend yang keluar dari titik ini - kalau nanti ada,
 * berarti ada jalur yang R-41 bisa terlewat.
 *
 * ## Kenapa tidak ada paginasi di UI
 *
 * `GET /admin/users` dan `GET /admin/stores` mengembalikan
 * `{ data, meta }`, dan `apiRequest` sengaja membuang amplopnya sehingga
 * hanya `data` yang terlihat._memakai `pageSize` maksimum (100) dan
 * menampilkan apa adanya yang diterima, dengan catatan jujur kalau barisnya
 * penuh. Menambah sumber kebenaran kedua tentang total - dengan membaca
 * `meta` lewat jalur fetch kedua - berarti mengulang parser envelope
 * `api-client.ts`, dan salinan itu tempat paling rawan menjadi berbeda
 * diam-diam.
 */

import { sessionFetch, sessionRequest } from "./session-refresh";

export type StoreRole = "OWNER" | "STAFF";

/** Peran user di suatu toko, sesuai `StoreMemberRole` backend. */
export type IssuedInvitation = {
  id: string;
  email: string;
  role: StoreRole;
  expiresAt: string;
  token: string;
};

/** Ringkasan undangan yang aman ditampilkan di halaman publik. */
export type InvitationPreview = {
  email: string;
  storeName: string;
  role: StoreRole;
  expiresAt: string;
};

/** Hasil menerima undangan. */
export type AcceptedInvitation = {
  storeId: string;
  storeName: string;
  role: StoreRole;
};

export type NotificationSeverity = "info" | "warning" | "success" | "error";

export type NotificationItem = {
  id: string;
  storeId: string | null;
  type: string;
  title: string;
  body: string | null;
  severity: NotificationSeverity;
  readAt: string | null;
  createdAt: string;
};

/** `StoreStatus` di backend. */
export type StoreStatus = "ACTIVE" | "SUSPENDED";

/** Satu toko milik user, dengan peran user di toko itu. */
export type StoreSummary = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  /** Peran user DI TOKO INI, bukan peran platform-nya. */
  role: StoreRole;
};

/** Detail toko tanpa peran - hasil `PATCH /stores/:storeId`. */
export type StoreView = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
};

/** Toko + peran PEMBUAT-nya - hasil `POST /stores`. */
export type CreatedStore = StoreView & { role: StoreRole };

/** Satu anggota toko beserta user-nya. */
export type StoreMember = {
  userId: string;
  role: StoreRole;
  joinedAt: string;
  user: { id: string; email: string; name: string; role: string };
};

/** Satu baris daftar pengguna milik admin. */
export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
};

/** Satu baris daftar toko seluruh platform. */
export type AdminStore = {
  id: string;
  name: string;
  city: string | null;
  timezone: string;
  status: StoreStatus;
  createdById: string;
  createdAt: string;
};

/**
 * Batas `pageSize` di backend (`PageQueryDto`).
 *
 * Dikirim eksplisit karena `meta` tidak dipakai: membaca "halaman 1" tanpa
 * mengatakan berapa barisnya sama denganreadsheet yang diam-diam dipotong.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * `GET /stores` - toko yang bisa diakses user.
 *
 * Daftar ini berasal dari keanggotaan milik user itu sendiri, bukan dari
 * parameter apa pun yang dikirim klien, jadi tidak ada `storeId` yang bisa
 * dicoba untuk menyasar toko orang lain.
 */
/**
 * Cache singkat untuk hasil `GET /stores`.
 *
 * Setiap halaman dashboard memanggil `listAccessibleStores` untuk memilih
 * toko aktifnya, dan di dev React StrictMode menjalankan efek mount dua
 * kali - tanpa cache ini, membuka beberapa halaman dengan cepat berarti
 * mengulang request yang data jawabannya sama persis. Bergabung dengan
 * throttler backend (300 request/menit per IP, lihat `app.module.ts`),
 * pengulangan itu yang dulu tampak sebagai 429 Too Many Requests di console.
 *
 * Dua penyelamat yang saling melengkapi:
 * - **Single flight**: permintaan yang masih berjalan dibagi ke semua
 *   pemanggil - effect ganda StrictMode dan dua panel yang mount bersamaan
 *   menerima SATU request.
 * - **TTL 15 detik**: halaman yang dibuka ulang dalam sepersekian detik
 *   memakai jawaban yang sudah ada. Daftar toko yang bisa diakses praktis
 *   tidak berubah dalam 15 detik; di luar itu, keputusan toko aktif justru
 *   harus berbasis data yang murah diperbarui.
 *
 * Mutasi yang mengubah isi daftar (`createStore`, `acceptInvitation`)
 * memanggil `invalidateAccessibleStores` supaya pembacaan berikutnya
 * benar-benar kembali ke backend.
 */
const STORES_CACHE_TTL_MS = 15_000;

let storesCache: { at: number; value: StoreSummary[] } | null = null;
let storesInFlight: Promise<StoreSummary[]> | null = null;

export function invalidateAccessibleStores(): void {
  storesCache = null;
  storesInFlight = null;
}

export function listAccessibleStores(): Promise<StoreSummary[]> {
  if (storesCache && Date.now() - storesCache.at < STORES_CACHE_TTL_MS) {
    return Promise.resolve(storesCache.value);
  }

  // `??=` menjamin semua pemanggil yang bertumpuk berbagi promise yang
  // sama. `.finally` mengosongkannya dijalankan, sukses maupun gagal -
  // kalau gagal, pemanggil berikutnya berhak mencoba lagi ke backend.
  storesInFlight ??= sessionRequest<StoreSummary[]>("/stores")
    .then((value) => {
      storesCache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      storesInFlight = null;
    });

  return storesInFlight;
}

/**
 * `POST /stores` - buat toko baru; pemanggil otomatis jadi OWNER.
 *
 * `city` dikirim hanya kalau ada isinya, bukan sebagai `undefined`: body JSON
 * dengan `city: undefined` tetap ikut kalau diserialisasi oleh pemanggil lain,
 * sedangkan `CreateStoreDto` menolak field yang bukan string. Memilih bentuk
 * body di sini membuat kontraknya satu tempat.
 */
export function createStore(input: {
  name: string;
  city?: string;
}): Promise<CreatedStore> {
  const body =
    input.city === undefined
      ? { name: input.name }
      : { name: input.name, city: input.city };

  return sessionRequest<CreatedStore>("/stores", { method: "POST", body }).then(
    (created) => {
      // Toko baru langsung masuk daftar aksesible user ini - cache daftar
      // toko yang masih menyimpan snapshot lama harus dibuang.
      invalidateAccessibleStores();
      return created;
    },
  );
}

/**
 * `GET /stores/:storeId/members`.
 *
 * `storeId` selalu datang dari data yang baru saja dibaca backend - bukan
 * dari query string - dan tetap di-`encodeURIComponent` karena ia masuk URL.
 */
export function listStoreMembers(storeId: string): Promise<StoreMember[]> {
  return sessionRequest<StoreMember[]>(
    `/stores/${encodeURIComponent(storeId)}/members`,
  );
}

/**
 * `PATCH /stores/:storeId` - ubah nama dan kota.
 *
 * Hanya tersedia bagi OWNER toko itu; backend menjawab
 * `INSUFFICIENT_ROLE` (403) untuk STAFF. Tombolnya tidak dirender untuk
 * STAFF, dan jawaban backend tetap yang berlaku terakhir kalau token
 * dipalsukan atau peran berubah di tengah sesi.
 */
export function updateStore(
  storeId: string,
  input: { name: string; city: string },
): Promise<StoreView> {
  return sessionRequest<StoreView>(`/stores/${encodeURIComponent(storeId)}`, {
    method: "PATCH",
    body: input,
  });
}

/**
 * `POST /stores/:storeId/invitations` - terbitkan undangan pegawai.
 *
 * Hanya OWNER toko yang boleh memanggilnya (backend `@Roles + @StoreAccess`).
 * Token mentah yang dikembalikan muncul SATU KALI; simpan lalu kirim lewat
 * email/out-of-band, karena berikutnya yang tercatat hanya digest-nya.
 */
export function inviteMember(
  storeId: string,
  input: { email: string; role: StoreRole },
): Promise<IssuedInvitation> {
  return sessionRequest<IssuedInvitation>(
    `/stores/${encodeURIComponent(storeId)}/invitations`,
    { method: "POST", body: input },
  );
}

/**
 * `GET /invitations/:token` (publik) - ringkasan undangan sebelum diterima.
 */
export function previewInvitation(token: string): Promise<InvitationPreview> {
  return sessionRequest<InvitationPreview>(`/invitations/${encodeURIComponent(token)}`);
}

/**
 * `POST /invitations/:token/accept` (auth) - terima undangan dan jadi anggota.
 */
export function acceptInvitation(token: string): Promise<AcceptedInvitation> {
  return sessionRequest<AcceptedInvitation>(
    `/invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  ).then((accepted) => {
    // Menerima undangan menambah keanggotaan - daftar toko aksesible user
    // ini berubah, jadi snapshot cache-nya sudah tidak sah.
    invalidateAccessibleStores();
    return accepted;
  });
}

/** `GET /admin/users` - khusus ADMIN. */
export function listAdminUsers(): Promise<AdminUser[]> {
  return sessionRequest<AdminUser[]>(`/admin/users?page=1&pageSize=${MAX_PAGE_SIZE}`);
}

/**
 * `PATCH /admin/users/:userId/status`.
 *
 * `userId` di path adalah TARGET, pelaku selalu backend yang ambil dari
 * token. `isActive` wajib dikirim eksplisit - `UpdateUserStatusDto` tidak
 * punya default, jadi body's yang kosong ditolak `VALIDATION_ERROR`.
 */
export function setUserActive(
  userId: string,
  isActive: boolean,
): Promise<AdminUser> {
  return sessionRequest<AdminUser>(
    `/admin/users/${encodeURIComponent(userId)}/status`,
    { method: "PATCH", body: { isActive } },
  );
}

/** `GET /admin/stores` - khusus ADMIN. */
export function listAdminStores(): Promise<AdminStore[]> {
  return sessionRequest<AdminStore[]>(`/admin/stores?page=1&pageSize=${MAX_PAGE_SIZE}`);
}

/** `GET /admin/ml-jobs` - monitor job ML lintas toko (ADMIN). */
export function listAdminMlJobs(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<
  Array<{
    id: string;
    storeId: string | null;
    jobType: string;
    status: string;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  }>
> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));
  const suffix = query.toString();
  return sessionRequest(
    `/admin/ml-jobs${suffix ? `?${suffix}` : ""}`,
  );
}

/** `GET /admin/ml-models` - status ML service/model (ADMIN). */
export function adminMlModels(): Promise<unknown> {
  return sessionRequest("/admin/ml-models");
}

/**
 * `GET /notifications` - notifikasi pengguna, dengan filter toko/status/paging.
 */
export function listNotifications(params?: {
  storeId?: string;
  status?: "all" | "unread" | "read";
  limit?: number;
  offset?: number;
}): Promise<NotificationItem[]> {
  const query = new URLSearchParams();
  if (params?.storeId) query.set("storeId", params.storeId);
  if (params?.status && params.status !== "all") query.set("status", params.status);
  if (params?.limit !== undefined) query.set("limit", String(params.limit));
  if (params?.offset !== undefined) query.set("offset", String(params.offset));

  const suffix = query.toString();
  return sessionRequest<NotificationItem[]>(
    `/notifications${suffix ? `?${suffix}` : ""}`,
  );
}

/** `GET /notifications/unread-count`. */
export function unreadNotificationCount(storeId?: string): Promise<number> {
  const query = new URLSearchParams();
  if (storeId) query.set("storeId", storeId);
  const suffix = query.toString();
  return sessionRequest<{ count: number }>(
    `/notifications/unread-count${suffix ? `?${suffix}` : ""}`,
  ).then((result) => result.count);
}

/** `PATCH /notifications/:id/read`. */
export function markNotificationRead(id: string): Promise<NotificationItem> {
  return sessionRequest<NotificationItem>(
    `/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH" },
  );
}

/** `POST /notifications/read-all`. */
export function markAllNotificationsRead(storeId?: string): Promise<number> {
  const query = new URLSearchParams();
  if (storeId) query.set("storeId", storeId);
  const suffix = query.toString();
  return sessionRequest<{ updated: number }>(
    `/notifications/read-all${suffix ? `?${suffix}` : ""}`,
    { method: "POST" },
  ).then((result) => result.updated);
}

/* ------------------------------------------------------------------ */
/* Produk dan order toko                                               */
/* ------------------------------------------------------------------ */

/**
 * Satu produk katalog - bentuk `products.service.ts` sebagaimana dipakai UI:
 * `id`, `sku`, `name`. Kalau service nanti menambah field (kategori, unit,
 * harga), tambah di sini - bukan di komponen.
 */
export type StoreProduct = { id: string; sku: string; name: string };

/**
 * `GET /stores/:storeId/products` - katalog produk toko.
 */
export function listStoreProducts(storeId: string): Promise<StoreProduct[]> {
  return sessionRequest<StoreProduct[]>(
    `/stores/${encodeURIComponent(storeId)}/products`,
  );
}

/**
 * `POST /stores/:storeId/products` - tambah produk.
 *
 * Wewenang OWNER/ADMIN (`@Roles`); `canManageStore` memutuskan UI-nya
 * sebelum tombol ini dirender.
 */
export function createStoreProduct(
  storeId: string,
  input: { sku: string; name: string; category: string; unit: string },
): Promise<StoreProduct> {
  return sessionRequest<StoreProduct>(
    `/stores/${encodeURIComponent(storeId)}/products`,
    { method: "POST", body: input },
  );
}

/**
 * Satu order toko sebagaimana dipakai UI: `id` + `items` untuk hitungan
 * "N item". Backend `include: { items: true, customer: true }` - field lain
 * ditambah di sini (bukan di komponen) kalau UI mulai memakainya.
 */
export type StoreOrder = { id: string; items?: Array<{ id: string }> };

/**
 * `GET /stores/:storeId/orders` - daftar order toko, berhalaman.
 *
 * Backend mengembalikan fitur `meta.total`, jadi pager di panel Pesanan
 * tahu harus berhenti di mana; default 20/order per halaman sesuai kontrak
 * `PageQueryDto` modul admin. Sebelum ini endpoint mengembalikan SEMUA
 * order dan panelnya menggulir tanpa ujung setelah unggah dataset besar.
 */
export type StoreOrderPage = {
  data: StoreOrder[];
  meta: { page: number; pageSize: number; total: number };
};

export function listStoreOrders(
  storeId: string,
  page = 1,
  pageSize = 20,
): Promise<StoreOrderPage> {
  const query = `?page=${page}&pageSize=${pageSize}`;
  return sessionRequest<StoreOrderPage>(
    `/stores/${encodeURIComponent(storeId)}/orders${query}`,
  );
}

/**
 * `POST /stores/:storeId/orders/manual` - input penjualan harian.
 *
 * PROMT §5.3/§5.4: STAFF juga boleh; endpoint meng-upsert pelanggan lewat
 * `customerCode`, jadi `customerName` baru dipakai saat pelanggan belum ada.
 */
export function createManualOrder(
  storeId: string,
  input: {
    customerCode: string;
    customerName: string;
    orderDate: string;
    channel: "online" | "offline";
    items: Array<{ productSku: string; qty: number; price: number }>;
  },
): Promise<StoreOrder> {
  return sessionRequest<StoreOrder>(
    `/stores/${encodeURIComponent(storeId)}/orders/manual`,
    { method: "POST", body: input },
  );
}

/* ------------------------------------------------------------------ */
/* Dataset toko (unggah/validasi/commit/rollback)                      */
/* ------------------------------------------------------------------ */

/**
 * Status dataset yang dipakai UI. Backend punya siklus lebih banyak
 * (`tech-analisa` -> `UPLOADED` -> `VALIDATED` -> `COMMITTED`); UI hanya
 * menampilkan string statusnya apa adanya.
 */
export type DatasetView = {
  id: string;
  status: string;
  rowCount: number;
  fileName: string;
};

/**
 * `POST /stores/:storeId/datasets` - unggah berkas dataset (multipart).
 *
 * Wewenang OWNER/ADMIN di backend; tombolnya disembunyikan untuk STAFF supaya
 * UI tidak menawarkan aksi yang pasti dijawab 403 (backend tetap penegak).
 * `FormData` dikirim apa adanya lewat `sessionRequest` - content-type
 * multipart dengan boundary dihitung browser, bukan manual.
 */
export function uploadDataset(storeId: string, file: File): Promise<DatasetView> {
  const body = new FormData();
  body.append("file", file);
  return sessionRequest<DatasetView>(
    `/stores/${encodeURIComponent(storeId)}/datasets`,
    { method: "POST", body },
  );
}

/** `POST /stores/:storeId/datasets/:datasetId/validate`. */
export function validateDataset(
  storeId: string,
  datasetId: string,
): Promise<DatasetView> {
  return sessionRequest<DatasetView>(
    `/stores/${encodeURIComponent(storeId)}/datasets/${encodeURIComponent(datasetId)}/validate`,
    { method: "POST" },
  );
}

/** `POST /stores/:storeId/datasets/:datasetId/commit`. */
export function commitDataset(
  storeId: string,
  datasetId: string,
): Promise<DatasetView> {
  return sessionRequest<DatasetView>(
    `/stores/${encodeURIComponent(storeId)}/datasets/${encodeURIComponent(datasetId)}/commit`,
    { method: "POST" },
  );
}

/** `POST /stores/:storeId/datasets/:datasetId/rollback`. */
export function rollbackDataset(
  storeId: string,
  datasetId: string,
): Promise<DatasetView> {
  return sessionRequest<DatasetView>(
    `/stores/${encodeURIComponent(storeId)}/datasets/${encodeURIComponent(datasetId)}/rollback`,
    { method: "POST" },
  );
}

/* ------------------------------------------------------------------ */
/* Analitik per toko                                                   */
/* ------------------------------------------------------------------ */

/** Periode ringkasan analitik; `90d` hanya milik trend, `ytd` hanya summary. */
export type SalesPeriod = "7d" | "30d" | "ytd";

/**
 * Copy `SalesSummary` dari `apps/backend/src/analytics/analytics.service.ts`
 * (`GET /stores/:storeId/analytics/summary`).
 */
export type SalesSummary = {
  totalSales: number;
  totalOrders: number;
  totalItems: number;
  avgOrderValue: number;
  avgItemsPerOrder: number;
  period: "7d" | "30d" | "ytd";
};

/** Deret penjualan harian - copy `SalesTrend` dari service yang sama. */
export type SalesTrend = Array<{
  date: string;
  sales: number;
  orderCount: number;
  itemCount: number;
}>;

/** Copy `TopProduct` dari `analytics.service.ts`. */
export type TopProduct = {
  productId: string;
  sku: string;
  name: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
};

/** `GET /stores/:storeId/analytics/summary?period=`. */
export function getSalesSummary(
  storeId: string,
  period: SalesPeriod,
): Promise<SalesSummary> {
  return sessionRequest<SalesSummary>(
    `/stores/${encodeURIComponent(storeId)}/analytics/summary?period=${period}`,
  );
}

/**
 * `GET /stores/:storeId/analytics/trend`.
 *
 * Catatan kontrak backend: query `period` di sini menerima `7d|30d|90d`,
 * BUKAN daftar yang sama dengan summary (`7d|30d|ytd`) - tipenya sengaja
 * dipisah, bukan dipinjam.
 */
export function getSalesTrend(
  storeId: string,
  period: "7d" | "30d" | "90d",
): Promise<SalesTrend> {
  return sessionRequest<SalesTrend>(
    `/stores/${encodeURIComponent(storeId)}/analytics/trend?period=${period}`,
  );
}

/** `GET /stores/:storeId/analytics/top-products?limit=`. */
export function getTopProducts(storeId: string, limit = 10): Promise<TopProduct[]> {
  return sessionRequest<TopProduct[]>(
    `/stores/${encodeURIComponent(storeId)}/analytics/top-products?limit=${limit}`,
  );
}

/**
 * Job analitik ML satu toko - bentuknya seperti `data` dari
 * `GET /stores/:storeId/analytics/jobs/:jobId` di `analytics.controller.ts`.
 */
export type AnalyticsJob = {
  jobId: string;
  status: string;
  jobType: string;
  result?: unknown;
  explanation?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
};

/**
 * `POST /stores/:storeId/analytics/run`.
 *
 * Jawaban 202 berisi `jobId` untuk dipol; pengiriman analisis asinkron
 * berarti halaman boleh ditutup tanpa kehilangan proses (hasil tersimpan
 * di database).
 */
export function startAnalyticsJob(
  storeId: string,
  jobType: string,
): Promise<{ jobId: string; status: string }> {
  return sessionRequest<{ jobId: string; status: string }>(
    `/stores/${encodeURIComponent(storeId)}/analytics/run`,
    { method: "POST", body: { jobType, parameters: {} } },
  );
}

/**
 * `GET /stores/:storeId/analytics/jobs/:jobId` - dipol dengan interval.
 *
 * Setiap tick adalah `sessionRequest` utuh: token dibaca ulang dan
 * direfresh bila perlu, jadi job panjang tidak mati di tengah karena access
 * token kedaluwarsa.
 */
export function getAnalyticsJob(
  storeId: string,
  jobId: string,
): Promise<AnalyticsJob> {
  return sessionRequest<AnalyticsJob>(
    `/stores/${encodeURIComponent(storeId)}/analytics/jobs/${encodeURIComponent(jobId)}`,
  );
}

/**
 * Unduh laporan (`GET /stores/:storeId/reports/...`).
 *
 * Response-nya berkas HTML/PDF/CSV, bukan amplet JSON, jadi `Response`
 * mentahnya yang dikembalikan lewat `sessionFetch` - pemanggil membaca
 * `Content-Disposition` untuk nama berkas lalu menyimpan blob-nya.
 */
export function downloadStoreReport(path: string): Promise<Response> {
  return sessionFetch(path);
}