<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## R-7 — Data tenant TIDAK BOLEH memakai `'use cache'`

`next.config.ts` menyalakan `cacheComponents: true` **dan** `partialPrefetching: true`.
Dengan prefetch yang agresif, cache key yang tidak awareness-user bisa membuat **User B
menerima hasil query User A**. Itu kebocoran data, bukan sekadar bug performa.

Aturan ini berlaku untuk **seluruh data toko**: laporan analitik, daftar produk, ringkasan
kas, data pelanggan, apa pun yang berasal dari `storeId`. Halaman yang paling rawan adalah
`app/(dashboard)/**` — di situlah kesalahan ini paling berbahaya dan paling mungkin terjadi,
karena halaman itu memang pembacaan data tenant. Landing page tidak perlu aturan ini: isinya
identik untuk semua pengunjung dan tidak memakai data tenant sama sekali.

### Yang boleh memakai `'use cache'`

Hanya konten yang **benar-benar identik untuk semua pengunjung**:

- landing page (`app/(public)/page.tsx`) — teks dan angka ilustrasi yang ditulis di source
- teks statis, daftar fitur, dokumentasi

### Tiga bentuk kegagalan yang harus dihindari

1. **Membaca runtime API di dalam cached scope.** `cookies()`, `headers()`, dan
   `searchParams` tidak boleh dibaca di dalam `'use cache'`. Ambil nilainya di luar scope,
   lalu teruskan sebagai argumen.
2. **Meneruskan nilai runtime ke cached function.** `const storeId = await getStoreId()`
   lalu `getReport(storeId)` yang diberi `'use cache'` — `storeId` itu jadi bagian dari
   cache key, dan pemanggilnya bisa melakukan cache poisoning lintas pengguna.
3. **Query tenant di dalam scope tanpa identitas tenant di cache key.** Prisma
   `$extends` menyuntikkan filter `storeId`, tetapi filter itu **tidak** otomatis masuk ke
   cache key `use cache`. Dua toko berbeda dengan parameter identik akan saling menimpa
   entri yang sama.

### Yang harus dilakukan

**Seluruh data tenant diambil lewat Client Component yang memanggil backend langsung**
(`fetch` ke NestJS di port 3000). Selalu fresh, dan tidak ada risiko cache lintas pengguna.
Untuk dashboard analitik, "fresh by design" memang perilaku yang benar — tidak ada yang
dikorbankan.

Kalau sebuah konten publik butuh data yang bergantung pada URL, simpan runtime-derived
value **di luar** cached scope dan teruskan sebagai argumen eksplisit, sehingga nilainya
benar-benar ikut bagian dari cache key.

## Pelabelan data di konten publik

Dataset yang tersedia **sintetis**. Setiap angka, grafik, dan hasil prediksi di konten publik
wajib membawa label "Data contoh" yang terlihat.

Gunakan komponennya, jangan label manual:

```tsx
import { SampleFigure } from "@/components/landing/section";

<SampleFigure note="Omzet mingguan, juta rupiah">
  {/* figure apa pun di dalam sini otomatis terlabeli */}
</SampleFigure>;
```

`SampleFigure` membungkus isi dengan `SampleDataBadge` yang selalu tampil. Ini **konvensi,
bukan jaminan** — belum ada test runner di package ini yang menegakkan aturan ini, jadi
figure baru tetap perlu diperiksa manual sebelum commit.