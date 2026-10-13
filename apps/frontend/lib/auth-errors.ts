/**
 * Pemetaan `error.details` dari backend ke field form.
 *
 * ## Bentuk `details` yang sebenarnya
 *
 * `AllExceptionsFilter` mengambil array `message` dari `ValidationPipe` dan
 * menyalinnya apa adanya ke `details`. `ValidationPipe` dengan konfigurasi
 * default menghasilkan **array of string**, bukan array of object. Contoh nyata
 * dari `POST /api/v1/auth/register` yang sudah dijalankan:
 *
 * ```json
 * {"error":{"code":"VALIDATION_ERROR","message":"Permintaan tidak valid.",
 *   "details":["property role should not exist",
 *              "email harus berupa alamat email yang valid",
 *              "name minimal 2 karakter",
 *              "password minimal 8 karakter"]}}
 * ```
 *
 * Dua fakta penting yang hanya terlihat dari respons nyata:
 *
 * 1. **Tidak ada nama field terstruktur.** Yang ada cuma teks bebas. Jadi
 *    `details` tidak bisa dipakai langsung sebagai peta field, dan-siapa pun
 *    yang mengira `details` berisi `{ field, message }` akan salah.
 * 2. **Nama field tetap HADIR, sebagai prefiks.** `class-validator` menulis
 *    `<namaProperti> <pesanAturan>` (dan `forbidNonWhitelisted` menulis
 *    `property <nama> should not exist`). Karena pesan di DTO auth ditulis dalam
 *    bahasa Indonesia dengan awalan nama field — `email harus berupa...`,
 *    `name minimal 2 karakter` — pencocokan prefiks terhadap daftar field yang
 *    diketahui bekerja, dan nama field tidak pernah ditebak dari isi kalimat.
 *
 * Implementasi ini sengaja memakai daftar field yang DIKETAHUI per form, bukan
 * Attempts memindai semua kata. Form yang salah mengirim field yang tidak ada
 * di daftarnya akan menaruh pesannya di `formLevel`, bukan di bawah input yang
 * salah — dan itu lebih baik daripada menautkan pesan ke field yang keliru.
 */

/** Field yang bisa muncul di form auth. */
export const AUTH_FIELDS = ["email", "password", "name", "passwordConfirmation"] as const;

export type AuthFieldName = (typeof AUTH_FIELDS)[number];

/** Kode galat yang cabang di UI auth. String bebas: hanya perlu stabil. */
export type ApiErrorCode = string;

/** Nama field yang ditampilkan ke pengguna. */
export const FIELD_LABELS: Record<AuthFieldName, string> = {
  email: "Email",
  name: "Nama",
  password: "Password",
  passwordConfirmation: "Konfirmasi password",
};

/**
 * Hasil pemetaan detail galat ke field.
 *
 * `perField` screams stabil: daftar pesan untuk satu field, berurutan. Baris
 * pertama yang dipakai untuk pesan singkat di bawah input, sisanyakept untuk
 * `aria-describedby` supaya pengguna tetap bisa membacanya.
 *
 * `formLevel` untuk detail yang tidak bisa dikaitkan ke field mana pun —
 * misalnya `property role should not exist` pada form yang memang tidak punya
 * field `role`.
 */
export type FieldErrorMap = {
  perField: Partial<Record<AuthFieldName, string[]>>;
  formLevel: string[];
};

/**
 * Pesan yang TIDAK boleh jatuh ke bawah field tertentu.
 *
 * "role should not exist" muncul kalau form mengirim field yang memang tidak
 * ada di DTO — R-35 melarang hal itu, jadi kalau sampai muncul di UI, ia
 * menjelaskan masalah kontrak, bukan kesalahan input pengguna. Menampilkannya
 * sebagai pesan form generik jujur; menaruhnya di bawah `email` akan menyesatkan.
 */
const NON_FIELD_HINTS = [/^property\s+\S+\s+should not exist$/i];

/**
 * Pecah `details` menjadi peta per-field dan sisa pesan level form.
 *
 * @param details `error.details` mentah dari backend (array of string).
 * @param fields  Field yang ada di form ini. Detail yang tidak cocok salah satu
 *                dari field ini jatuh ke `formLevel`.
 */
export function mapDetailsToFields(
  details: readonly string[],
  fields: readonly AuthFieldName[],
): FieldErrorMap {
  const perField: Partial<Record<AuthFieldName, string[]>> = {};
  const formLevel: string[] = [];

  for (const detail of details) {
    const text = detail.trim();
    if (text.length === 0) continue;

    // Pesan kontrak (field tak dikenal) tidak dikaitkan ke field mana pun.
    if (NON_FIELD_HINTS.some((re) => re.test(text))) {
      formLevel.push(text);
      continue;
    }

    const field = fields.find((candidate) =>
      // `class-validator` menulis "<namaField> <pesan>". Cocokkan prefiks pada
      // batas kata supaya `password` tidak ikut cocok "password minimal..."
      // saat field yang dicari `passwordConfirmation`.
      new RegExp(`^${candidate}\\b`, "i").test(text),
    );

    if (field) {
      const bucket = perField[field] ?? [];
      bucket.push(text);
      perField[field] = bucket;
    } else {
      formLevel.push(text);
    }
  }

  return { perField, formLevel };
}

/** Pesan singkat pertama untuk sebuah field, atau `undefined` kalau bersih. */
export function firstFieldError(
  map: FieldErrorMap,
  field: AuthFieldName,
): string | undefined {
  const messages = map.perField[field];
  return messages && messages.length > 0 ? messages[0] : undefined;
}

/** Gabung semua pesan level form menjadi satu string per baris. */
export function formatFormLevelError(map: FieldErrorMap): string | undefined {
  return map.formLevel.length > 0 ? map.formLevel.join(" ") : undefined;
}
