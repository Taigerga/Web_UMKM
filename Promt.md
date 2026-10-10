# PROMPT.md — Dashboard Analitik Penjualan dan Segmentasi Pelanggan UMKM

## 1. Peran dan Tujuan Proyek

Bertindaklah sebagai **Senior Full-Stack Engineer, Machine Learning Engineer, Data Engineer, Database Architect, dan UI/UX Designer** yang bertanggung jawab merancang dan membangun aplikasi web analitik penjualan untuk UMKM dan bisnis.

Buat aplikasi web bernama sementara **BisnisInsight**, yaitu platform analitik bisnis berbasis web yang membantu pemilik UMKM memahami performa penjualan, memprediksi omzet, mengelompokkan pelanggan, menemukan peluang bundling produk, mendeteksi pelanggan yang berisiko berhenti membeli, dan menemukan anomali penjualan melalui Machine Learning.

Nama BisnisInsight hanya merupakan nama sementara. Evaluasi apakah nama tersebut sesuai dan mudah dikembangkan sebelum menetapkannya sebagai nama final.

Aplikasi tidak boleh hanya berupa landing page atau dashboard statis. Buat sistem yang benar-benar berfungsi, terintegrasi dengan database, memiliki REST API, authentication dan authorization, pemrosesan dataset, pipeline Machine Learning, penyimpanan hasil analisis, visualisasi data, serta fitur ekspor laporan.

Seluruh contoh fitur, algoritma, struktur folder, dan alur yang dijelaskan dalam prompt ini merupakan **referensi awal yang dapat dievaluasi dan ditingkatkan**. Kamu boleh mengubah, menambahkan, menyederhanakan, atau mengganti pendekatan jika memiliki alasan teknis yang jelas. Namun, perubahan harus tetap mempertahankan tujuan utama proyek, minimal lima kemampuan Machine Learning, tiga jenis pengguna, dan integrasi end-to-end yang berfungsi.

Jangan langsung menulis seluruh kode. Periksa kondisi komputer dan project terlebih dahulu, analisis dataset, susun rancangan, kemudian implementasikan sistem secara bertahap.

---

## 2. Aturan Penting Sebelum Implementasi

Sebelum mengubah atau membuat file apa pun, lakukan pemeriksaan lingkungan pengembangan dan kondisi project yang sebenarnya.

### 2.1 Pemeriksaan komputer

Periksa versi teknologi yang sudah terpasang di komputer saya. Jangan mengasumsikan bahwa versi teknologi tertentu sudah tersedia atau langsung menginstal versi terbaru tanpa pemeriksaan.

Periksa setidaknya:

- Sistem operasi dan arsitektur komputer.
- Node.js dan npm.
- Package manager lain jika tersedia, seperti pnpm.
- Python dan pip.
- MySQL Server dan MySQL Client.
- Git.
- NestJS CLI jika terpasang.
- Status ketersediaan compiler atau library sistem yang dibutuhkan.
- Ketersediaan GPU dan CUDA jika relevan dengan kebutuhan ML.
- Versi teknologi serta kompatibilitas antar-package.

Gunakan versi yang sudah tersedia apabila kompatibel dan masih layak digunakan. Jika perlu upgrade atau instalasi, jelaskan alasannya, potensi konflik, dan perubahan yang dibutuhkan terlebih dahulu.

Jangan mengubah konfigurasi global, menghapus package, mengubah versi Node.js atau Python, maupun menjalankan instalasi yang berisiko merusak project lain tanpa alasan yang jelas.

### 2.2 Pemeriksaan project

Jika project sudah ada, periksa struktur folder, `package.json`, lockfile, file konfigurasi, environment variables, schema database, kode frontend, kode backend, dan kode Python yang sudah tersedia.

Baca isi file yang relevan, bukan hanya nama foldernya. Pertahankan kode yang masih sesuai dan hindari membuat ulang fitur yang sudah berfungsi.

Jika project belum ada, buat struktur awal yang sesuai dengan rancangan arsitektur yang dipilih.

### 2.3 Pemeriksaan database MySQL

Sebelum menentukan nama database, periksa database yang sudah ada pada MySQL lokal saya menggunakan koneksi yang sah dan tersedia.

Pilih nama database baru yang unik, deskriptif, dan belum digunakan. Jangan mengasumsikan suatu nama tersedia hanya karena nama tersebut terdengar unik.

Nama database sementara yang dapat dipertimbangkan adalah `bisnis_insight_analytics_db`, tetapi **wajib periksa keberadaannya terlebih dahulu**. Jika sudah digunakan, pilih nama lain yang belum digunakan.

Jangan menghapus, mengubah, atau memodifikasi database lain yang sudah ada. Jangan mencetak password database, token, atau rahasia lainnya ke terminal output maupun laporan.

---

## 3. Teknologi dan Arsitektur Utama

Gunakan teknologi berikut sebagai pilihan awal. Kamu diperbolehkan mengusulkan alternatif jika dapat membuktikan bahwa alternatif tersebut lebih sesuai dengan kebutuhan dan kompatibilitas lingkungan.

| Komponen | Teknologi awal | Tanggung jawab |
|---|---|---|
| Frontend | Next.js | Landing page, authentication UI, dashboard, visualisasi, dan interaksi pengguna |
| Bahasa frontend | TypeScript | Type safety dan pemeliharaan kode |
| Backend | NestJS | REST API, business logic, authorization, validasi, dan orkestrasi proses |
| Bahasa backend | TypeScript | Implementasi backend |
| Database | MySQL | Penyimpanan data pengguna, toko, transaksi, produk, pelanggan, dan hasil analisis |
| ORM | Prisma ORM v7 | Akses database dari NestJS |
| Machine Learning | Python | Preprocessing, training, evaluasi, inference, dan analitik data |
| ML API | FastAPI | Menyediakan endpoint internal untuk model ML jika pemisahan service diperlukan |
| Data processing | pandas, NumPy | Manipulasi, pembersihan, dan transformasi dataset |
| ML forecasting | statsmodels, Prophet, atau scikit-learn | Peramalan penjualan sesuai hasil evaluasi |
| Clustering | scikit-learn | Segmentasi pelanggan |
| Association rules | mlxtend atau library setara | Market Basket Analysis |
| ML interpretability | SHAP jika sesuai | Menjelaskan kontribusi fitur pada prediksi yang didukung |
| Visualisasi | Recharts atau library React yang kompatibel | Grafik penjualan dan analitik |
| Animasi UI | Motion untuk React atau alternatif kompatibel | Animasi transisi dan interaksi |
| Validasi | class-validator/class-transformer atau pendekatan yang sesuai | Validasi DTO pada NestJS |
| API documentation | Swagger/OpenAPI | Dokumentasi REST API |
| Pengujian | Jest, Supertest, pytest | Pengujian frontend/backend sesuai kebutuhan dan ML |
| PDF/Excel | Library kompatibel dengan stack | Ekspor laporan |

Daftar tersebut bukan perintah untuk memasang semua library sekaligus. Pilih dependency berdasarkan kebutuhan nyata, kompatibilitas versi, pemeliharaan, dan ukuran aplikasi.

Gunakan **Next.js sebagai frontend, NestJS sebagai backend utama, MySQL sebagai database utama, Prisma v7 sebagai ORM backend, serta Python sebagai lingkungan Machine Learning**.

Jangan gunakan Docker dan Redis pada tahap awal. Seluruh aplikasi harus dapat dijalankan secara lokal tanpa keduanya.

Jangan membuat microservice tambahan tanpa kebutuhan yang jelas. Pemisahan NestJS dan Python diperbolehkan karena keduanya memiliki tanggung jawab berbeda, tetapi pertahankan arsitektur sesederhana mungkin.

### 3.1 Aturan khusus Prisma v7

Periksa dokumentasi Prisma v7 yang sesuai dengan versi package yang akan digunakan.

Pastikan konfigurasi datasource, Prisma Client, driver adapter jika diperlukan, migration, dan konfigurasi koneksi mengikuti ketentuan Prisma v7 yang sebenarnya. Jangan menyalin konfigurasi dari Prisma versi lama tanpa memverifikasi kompatibilitasnya.

Seluruh akses aplikasi ke database operasional harus melalui backend NestJS dan Prisma, kecuali terdapat alasan teknis yang terdokumentasi.

Python tidak boleh melakukan perubahan langsung ke tabel operasional MySQL. Python menerima input analisis melalui API dan mengembalikan hasil ke NestJS. Jika terdapat kebutuhan penyimpanan artefak atau hasil ML, NestJS tetap mengatur penyimpanannya melalui lapisan database.

---

## 4. Gambaran Arsitektur Sistem

Gunakan arsitektur logis berikut sebagai titik awal:

```text
Pengguna
   |
   v
Next.js Frontend
   |
   | HTTPS / REST API
   v
NestJS Backend
   |
   +---- Authentication & Authorization
   |
   +---- Business Modules
   |       |
   |       +---- User & Staff Management
   |       +---- Store Management
   |       +---- Sales & Transaction Management
   |       +---- Product & Customer Management
   |       +---- Dataset Import & Validation
   |       +---- Analytics & Reports
   |       +---- Notification Management
   |       +---- ML Job Management
   |
   +---- Prisma ORM v7
   |       |
   |       v
   |      MySQL
   |
   +---- Internal ML API
           |
           v
       Python Service
           |
           +---- Data Preprocessing
           +---- Sales Forecasting
           +---- Customer Segmentation
           +---- Market Basket Analysis
           +---- Churn Prediction
           +---- Sales Anomaly Detection
           |
           v
       Model Artifacts & Results
```

Diagram ini adalah gambaran tanggung jawab, bukan ketentuan bahwa seluruh proses harus berjalan secara sinkron.

Tentukan apakah setiap proses ML sebaiknya berjalan secara synchronous atau asynchronous. Analisis sederhana dapat dilakukan secara synchronous, sedangkan training dan analisis dataset besar sebaiknya mempertimbangkan job processing asynchronous agar request tidak mengalami timeout.

Karena Redis dan Docker tidak digunakan pada tahap awal, tentukan mekanisme job processing yang sesuai. Contohnya, gunakan tabel job pada MySQL dan worker terpisah jika memang dibutuhkan. Pastikan tidak terjadi eksekusi job ganda, status job dapat dipantau, dan proses dapat dipulihkan jika gagal.

Jelaskan batas tanggung jawab setiap service, protokol komunikasi, mekanisme error handling, dan alur penyimpanan hasil analisis.

---

## 5. Tipe Pengguna dan Hak Akses

Sistem memiliki tiga tipe pengguna utama.

### 5.1 Admin platform

Admin bertanggung jawab mengelola dan memantau platform secara keseluruhan.

Fitur yang diperlukan:

- Dashboard ringkasan seluruh toko yang terdaftar.
- Melihat, mengelola, mengaktifkan, atau menonaktifkan akun sesuai kebijakan.
- Mengelola toko dan memantau status toko.
- Melihat jumlah pengguna, toko aktif, upload dataset, dan aktivitas analisis.
- Memantau status Python ML Service, API backend, dan database.
- Melihat status model, versi model, hasil evaluasi, waktu training terakhir, dan kegagalan proses ML.
- Melihat log sistem dan audit log aktivitas penting.
- Memantau antrean analisis atau ML job.
- Melihat error import dataset dan kegagalan analisis.
- Mengelola konfigurasi platform yang memang menjadi tanggung jawab admin.

Admin platform tidak otomatis berhak melihat seluruh data transaksi atau informasi pelanggan secara rinci jika tidak diperlukan. Terapkan prinsip least privilege dan audit untuk akses sensitif.

### 5.2 Pemilik UMKM

Pemilik adalah pemilik satu atau beberapa toko yang terdaftar pada platform.

Fitur yang diperlukan:

- Registrasi, login, dan pengelolaan profil.
- Membuat toko dan mengatur informasi toko.
- Mengelola toko yang dimilikinya.
- Mengundang pegawai ke toko tertentu.
- Menentukan peran dan status keanggotaan pegawai.
- Mengunggah data penjualan CSV atau Excel.
- Mengunduh template dataset.
- Melihat hasil validasi dan laporan kualitas data.
- Melihat dashboard analitik toko.
- Menjalankan analisis Machine Learning.
- Memantau status proses analisis.
- Melihat hasil forecasting, segmentasi pelanggan, rekomendasi bundling, churn prediction, dan deteksi anomali.
- Mengelola produk dan pelanggan.
- Melihat riwayat upload, riwayat analisis, dan laporan.
- Mengunduh laporan PDF/Excel.
- Mengekspor daftar pelanggan berdasarkan segmen.
- Mengatur notifikasi dan preferensi analisis.
- Melihat histori aktivitas penting pada tokonya.

Pemilik hanya boleh mengakses data toko yang memang menjadi miliknya. Jangan mengizinkan pemilik mengakses toko lain hanya dengan mengubah ID pada URL atau request API.

### 5.3 Pegawai UMKM

Pegawai memiliki akses terbatas berdasarkan penugasan toko.

Fitur yang diperlukan:

- Login dan melihat profil.
- Melihat dashboard toko yang ditugaskan.
- Melihat laporan dan hasil analisis yang diizinkan.
- Menginput data penjualan harian melalui formulir.
- Mengunggah data penjualan harian jika diizinkan oleh pemilik.
- Melihat status dan hasil validasi data yang diunggahnya.
- Melihat riwayat input atau upload miliknya jika diperlukan.

Pegawai tidak boleh mengelola akun, mengundang pegawai lain, mengubah kepemilikan toko, mengubah konfigurasi analisis, atau menghapus dataset yang sudah diproses kecuali pemilik memberikan kewenangan khusus yang didefinisikan secara eksplisit.

Dashboard pegawai bersifat read-only untuk data analitik dan laporan. Pengecualian hanya untuk aktivitas input atau upload data harian. Pegawai tidak boleh menjalankan training model atau analisis yang berpotensi mengubah hasil analitik utama tanpa izin pemilik.

### 5.4 Matriks hak akses

Buat matriks permission sebelum implementasi.

| Fitur | Admin | Pemilik | Pegawai |
|---|---|---|---|
| Mengelola akun platform | Ya | Profil sendiri dan anggota toko sesuai kewenangan | Profil sendiri |
| Membuat toko | Sesuai kebijakan platform | Ya | Tidak |
| Melihat dashboard seluruh platform | Ya | Tidak | Tidak |
| Melihat dashboard toko | Sesuai izin admin | Toko miliknya | Toko yang ditugaskan |
| Upload data penjualan | Sesuai kebijakan | Ya | Ya, sesuai izin |
| Input penjualan harian | Sesuai kebijakan | Ya | Ya |
| Mengelola produk/pelanggan | Sesuai kebijakan | Ya | Tidak, kecuali diizinkan |
| Menjalankan analisis ML | Pemantauan atau tindakan administratif yang dibutuhkan | Ya | Tidak |
| Mengelola hasil analisis | Pemantauan platform | Toko miliknya | Read-only |
| Menghapus atau rollback dataset | Administrasi sesuai kebijakan dan audit | Toko miliknya | Tidak |
| Mengunduh laporan | Sesuai kewenangan | Toko miliknya | Read-only, sesuai izin |
| Melihat log sistem | Ya | Aktivitas tokonya sendiri | Aktivitas yang relevan |
| Mengundang pegawai | Tidak wajib; sesuai kebijakan | Ya | Tidak |

Matriks tersebut merupakan baseline. Kamu boleh memperbaikinya, tetapi setiap perubahan harus terdokumentasi dan konsisten pada frontend maupun backend.

---

## 6. Halaman Publik dan Desain Frontend

Aplikasi harus memiliki halaman publik yang menjelaskan fungsi platform sebelum pengguna diminta login.

**Jangan menjadikan halaman login sebagai halaman utama.**

### 6.1 Landing page

Buat halaman utama profesional yang mencakup:

- Navbar dengan logo, fitur, cara kerja, manfaat, dan tombol login/daftar.
- Hero section yang menjelaskan manfaat platform secara langsung.
- Headline yang berorientasi pada hasil, misalnya membantu UMKM memahami penjualan dan pelanggan melalui data.
- CTA untuk mencoba platform atau membuat akun.
- Preview dashboard analitik dalam bentuk visualisasi atau mockup yang konsisten dengan produk sebenarnya.
- Bagian fitur Machine Learning.
- Bagian cara kerja: unggah data, proses analisis, pahami hasil, ambil keputusan.
- Bagian manfaat untuk pemilik UMKM.
- Penjelasan privasi dan keamanan data.
- FAQ.
- Footer dengan informasi produk dan tautan yang relevan.

Jangan menampilkan angka, hasil prediksi, jumlah pengguna, atau testimoni palsu seolah-olah berasal dari sistem nyata. Data demo harus diberi label yang jelas.

### 6.2 Halaman authentication

Sediakan:

- Login.
- Registrasi pemilik UMKM.
- Lupa password dan reset password jika mekanisme email tersedia.
- Verifikasi akun jika diperlukan.
- Accept invitation untuk pegawai.
- Logout.
- Halaman error authentication.

Pegawai tidak boleh memperoleh akses ke toko hanya dengan melakukan registrasi. Akses toko harus berasal dari undangan atau penugasan yang valid.

### 6.3 Dashboard berbeda berdasarkan role

Sediakan layout dashboard yang sesuai untuk Admin, Pemilik, dan Pegawai. Ketiganya boleh menggunakan design system yang sama, tetapi navigasi, ringkasan, dan permission harus berbeda.

### 6.4 Standar UI/UX

Gunakan desain modern, profesional, dan berorientasi pada analitik bisnis.

Referensi visual:

- Warna utama navy atau biru gelap.
- Aksen cyan atau biru terang.
- Background netral yang nyaman dibaca.
- Card dan tabel dengan hierarki informasi yang jelas.
- Sidebar dashboard yang mudah dinavigasi.
- Typography yang konsisten.
- Grafik dengan label, satuan, legenda, dan tooltip.
- Loading state, skeleton, empty state, error state, dan success feedback.
- Responsive layout untuk desktop, tablet, dan mobile.
- Kontras warna dan aksesibilitas yang memadai.

Tambahkan animasi menggunakan Motion atau teknologi lain yang kompatibel untuk transisi halaman, sidebar, card, modal, grafik, dan feedback interaksi. Animasi harus halus, ringan, dan memiliki tujuan UX; hindari animasi berlebihan yang mengganggu pembacaan data.

Hormati preferensi `prefers-reduced-motion`. Pastikan seluruh fitur utama tetap berfungsi ketika animasi dikurangi atau dinonaktifkan.

Gunakan komponen yang reusable, design tokens, dan konsistensi visual di seluruh halaman.

---

## 7. Modul Manajemen Data

### 7.1 Upload dataset

Pemilik dan pegawai yang diberi izin harus dapat mengunggah data penjualan dalam format CSV dan Excel.

Sediakan:

- Tombol unduh template CSV/Excel.
- Panduan format kolom.
- Validasi ukuran dan tipe file.
- Preview data sebelum import.
- Pemetaan kolom jika format dataset berbeda.
- Deteksi kesalahan sebelum data masuk ke sistem.
- Progress upload dan pemrosesan.
- Ringkasan hasil import.
- Riwayat upload.
- Status proses.
- Informasi pengunggah dan waktu upload.

### 7.2 Validasi dan pembersihan data

Lakukan validasi berdasarkan skema data yang telah disepakati.

Periksa:

- Kolom wajib.
- Nama kolom dan tipe data.
- Nilai kosong.
- Format tanggal dan timezone.
- Duplikasi berdasarkan definisi kunci bisnis.
- Nilai negatif atau nilai yang tidak masuk akal.
- Quantity, harga, diskon, dan total transaksi.
- ID produk dan pelanggan yang tidak ditemukan.
- Transaksi tanpa detail item.
- Inkonsistensi antarfile.
- Data di luar rentang waktu yang didukung.

Jangan otomatis menghapus seluruh baris hanya karena terdapat satu kesalahan tanpa memberikan laporan yang jelas. Bedakan antara kesalahan fatal, data yang dapat diperbaiki, data yang dapat diterima dengan peringatan, dan data yang harus ditolak.

Buat laporan kualitas data yang mencakup:

- Jumlah baris yang diterima.
- Jumlah baris yang ditolak.
- Jumlah duplikat.
- Jumlah nilai kosong.
- Kesalahan format.
- Peringatan nilai tidak wajar.
- Aturan pembersihan yang diterapkan.
- Dampak pembersihan terhadap data.

Simpan informasi sumber dan hasil pemrosesan agar proses dapat diaudit dan diulang.

### 7.3 Riwayat upload dan rollback

Setiap proses upload harus memiliki identitas batch dan status yang jelas.

Sediakan fitur untuk:

- Melihat riwayat upload.
- Melihat ringkasan validasi.
- Melihat dataset yang digunakan untuk analisis.
- Menghapus atau membatalkan batch sesuai kebijakan.
- Melakukan rollback terhadap data yang berasal dari batch tertentu.
- Memulihkan konsistensi hasil analisis setelah rollback.

Rollback tidak boleh sekadar menghapus file. Pastikan data transaksi, relasi, agregasi, dan hasil analisis yang bergantung pada batch tersebut ditangani dengan benar.

Gunakan transaksi database untuk operasi yang perlu atomik. Catat setiap penghapusan dan rollback pada audit log.

### 7.4 CRUD produk dan pelanggan

Sediakan fitur untuk:

- Menambah, melihat, mengubah, dan menghapus atau menonaktifkan produk.
- Menambah, melihat, mengubah, dan menghapus atau menganonimkan data pelanggan sesuai kebutuhan.
- Mencari, memfilter, mengurutkan, dan melakukan pagination.
- Melihat hubungan pelanggan dengan transaksi.
- Melihat hubungan produk dengan item transaksi.

Perhatikan integritas historis. Perubahan harga produk saat ini tidak boleh otomatis mengubah harga pada transaksi lama.

---

## 8. Dataset Awal yang Wajib Dianalisis

Terdapat lima file dataset awal yang harus diperiksa dan dipahami sebelum merancang pipeline Machine Learning:

1. `customer_master.csv`
2. `dataset_statistics.csv`
3. `ecommerce_sales_customer_analytics_150k.csv`
4. `order_items.csv`
5. `product_catalog.csv`

Cari file-file tersebut pada folder project dan lokasi dataset yang tersedia. Jika belum ditemukan, laporkan kondisi tersebut dan minta lokasi file atau cari file yang relevan di lokasi project yang sudah diketahui. Jangan membuat data seolah-olah berasal dari dataset asli.

Buat direktori data yang terstruktur, misalnya:

```text
data/
├── raw/
│   ├── customer_master.csv
│   ├── dataset_statistics.csv
│   ├── ecommerce_sales_customer_analytics_150k.csv
│   ├── order_items.csv
│   └── product_catalog.csv
├── staging/
├── processed/
├── rejected/
├── samples/
└── data_dictionary/
```

Struktur ini merupakan usulan awal. Sesuaikan berdasarkan karakteristik dataset, ukuran file, lisensi, privasi, dan kebutuhan penyimpanan.

### 8.1 Analisis isi dataset

Jangan hanya membaca nama file atau mengasumsikan kolomnya.

Untuk setiap file:

- Periksa nama kolom.
- Periksa tipe data.
- Periksa jumlah baris dan kolom.
- Periksa nilai kosong.
- Periksa duplikasi.
- Periksa distribusi nilai.
- Periksa format tanggal.
- Periksa identifier dan relasi antarfile.
- Periksa rentang tanggal transaksi.
- Periksa apakah terdapat label atau target untuk supervised learning.
- Periksa apakah data sintetis, data nyata, atau data yang sudah diagregasi.
- Periksa kemungkinan kebocoran target atau data leakage.
- Buat data dictionary berdasarkan kolom yang benar-benar tersedia.

Jangan mengasumsikan nama kolom seperti `customer_id`, `order_id`, `order_date`, `quantity`, `price`, `sales`, atau `category` tersedia sebelum memeriksanya.

### 8.2 Tentukan fungsi masing-masing dataset

Evaluasi kemungkinan fungsi berikut:

- `customer_master.csv`: sumber master pelanggan dan atribut pelanggan.
- `dataset_statistics.csv`: statistik, ringkasan, atau metadata dataset jika sesuai dengan isinya.
- `ecommerce_sales_customer_analytics_150k.csv`: dataset analitik penjualan dan pelanggan jika kolomnya mendukung.
- `order_items.csv`: detail item per transaksi jika struktur datanya sesuai.
- `product_catalog.csv`: master produk dan atribut produk jika tersedia.

Fungsi tersebut hanya hipotesis awal. Tentukan fungsi final berdasarkan isi file.

### 8.3 Relasi dan konsolidasi data

Petakan relasi antarfile sebelum menggabungkannya.

Pastikan:

- Join key benar.
- Kardinalitas relasi diketahui.
- Tidak terjadi penggandaan transaksi saat join.
- Data pelanggan dan produk tidak terduplikasi tanpa alasan.
- Nilai penjualan tidak dihitung dua kali.
- Grain setiap tabel dipahami, misalnya satu baris per pelanggan, transaksi, atau item transaksi.

Buat dokumentasi pemetaan dataset sumber ke skema aplikasi.

### 8.4 Pemisahan dataset penelitian dan data toko

Bedakan dataset awal untuk pengembangan/eksperimen dari data penjualan yang diunggah pengguna ke aplikasi.

Dataset awal boleh digunakan untuk eksperimen dan demonstrasi sesuai lisensinya. Namun, jangan otomatis memasukkan seluruh dataset awal ke toko pengguna atau menganggap data tersebut berasal dari toko nyata.

Buat mekanisme agar pengguna dapat menjalankan analisis pada dataset toko miliknya sendiri.

Jangan menyimpan file sensitif di direktori publik. Tentukan kebijakan backup, retensi, dan penghapusan file.

---

## 9. Desain Database MySQL dan Prisma ORM v7

Rancang schema database berdasarkan kebutuhan bisnis dan hasil pemeriksaan dataset.

Model berikut merupakan kandidat awal, bukan daftar wajib yang harus dibuat seluruhnya:

### Authentication dan akun

- `User`
- `UserSession` jika diperlukan
- `PasswordResetToken` jika diperlukan
- `Store`
- `StoreMembership`
- `StoreInvitation`

### Data bisnis

- `Product`
- `Customer`
- `Sale` atau `Order`
- `OrderItem`
- `SalesUpload`
- `SalesUploadRow` atau tabel staging yang sesuai
- `DataQualityReport`

### Machine Learning

- `MlModel`
- `MlModelVersion`
- `MlJob`
- `MlJobLog` jika diperlukan
- `SalesForecast`
- `CustomerSegment`
- `CustomerSegmentAssignment`
- `ProductAssociationRule`
- `CustomerChurnPrediction`
- `SalesAnomaly`
- `AnalyticsSnapshot` jika diperlukan

### Sistem

- `Notification`
- `ReportExport`
- `AuditLog`
- `SystemEvent` jika diperlukan

Jangan membuat tabel hanya karena nama tersebut tercantum di prompt. Tentukan apakah setiap entitas benar-benar diperlukan, bagaimana relasinya, dan apakah data lebih tepat disimpan sebagai tabel relasional, JSON terbatas, file artefak, atau hasil yang dihitung ulang.

### 9.1 Ketentuan desain database

- Gunakan primary key dan foreign key yang konsisten.
- Tentukan unique constraint dan index berdasarkan pola query.
- Gunakan tipe data yang tepat untuk uang, tanggal, persentase, dan status.
- Hindari floating-point untuk penyimpanan nominal uang.
- Pertimbangkan decimal dengan presisi yang sesuai.
- Tentukan strategi soft delete atau hard delete berdasarkan kebutuhan.
- Tentukan aturan penghapusan dan retensi data.
- Pastikan data satu toko tidak bercampur dengan toko lain.
- Terapkan unique constraint untuk mencegah undangan ganda yang masih aktif.
- Buat strategi versioning untuk model dan hasil analisis.
- Pastikan setiap hasil analisis dapat ditelusuri ke toko, rentang tanggal, dataset, dan versi model yang menghasilkannya.
- Simpan timestamp pembuatan dan pembaruan jika relevan.

### 9.2 Multi-tenant data isolation

Aplikasi harus mendukung banyak pemilik dan banyak toko.

Tentukan apakah satu pengguna boleh memiliki beberapa toko dan apakah pegawai dapat ditugaskan ke lebih dari satu toko.

Pastikan seluruh query yang mengakses data toko melakukan pemeriksaan kepemilikan atau keanggotaan di backend.

Jangan mengandalkan ID toko yang dikirim oleh frontend sebagai bukti kewenangan.

Buat pengujian untuk memastikan pengguna toko A tidak dapat membaca, mengubah, menghapus, atau mengekspor data toko B.

### 9.3 Konfigurasi Prisma v7

Buat konfigurasi Prisma v7 sesuai dokumentasi dan versi yang benar-benar digunakan.

Pisahkan:

- Prisma schema.
- Konfigurasi koneksi database.
- Prisma Client.
- Database module/provider NestJS.
- Migration.
- Seed development.
- Repository atau data-access layer jika memang diperlukan.

Gunakan migration untuk perubahan schema. Jangan menggunakan prosedur yang menghapus atau mereset database secara otomatis pada environment yang berisi data penting.

Nama database final harus ditentukan setelah pemeriksaan database lokal selesai.

---

## 10. Machine Learning: Minimal Lima Kemampuan

Aplikasi harus memiliki minimal lima kemampuan analitik Machine Learning/data mining berikut.

Algoritma yang tercantum adalah kandidat awal. Kamu boleh mengganti algoritma setelah melakukan analisis data dan evaluasi yang dapat dipertanggungjawabkan.

### 10.1 Sales Forecasting

Tujuan: memprediksi penjualan atau omzet untuk 7, 30, dan 90 hari ke depan.

Kandidat model:

- SARIMA/SARIMAX.
- Prophet.
- XGBoost atau model boosting lain untuk forecasting berbasis fitur.
- Baseline seperti naïve forecast atau seasonal naïve.

Pilih model berdasarkan ketersediaan data, frekuensi transaksi, panjang histori, pola musiman, kualitas data, dan hasil evaluasi.

Fitur yang mungkin digunakan, jika tersedia:

- Tanggal transaksi.
- Total penjualan.
- Jumlah transaksi.
- Jumlah item terjual.
- Riwayat penjualan.
- Hari dalam minggu atau bulan.
- Pola musiman.
- Variabel eksternal jika tersedia dan sah digunakan.

Jangan mengklaim prediksi 90 hari dapat diandalkan jika histori penjualan tidak memadai.

Evaluasi menggunakan time-based split atau rolling-origin validation. Jangan menggunakan random split yang menyebabkan kebocoran waktu.

Pertimbangkan MAE, RMSE, dan WAPE atau metrik lain yang sesuai. Tangani periode dengan penjualan nol saat menghitung persentase error.

Output minimal:

- Forecast 7, 30, dan 90 hari.
- Grafik histori dan prediksi.
- Prediction interval jika didukung.
- Metrik evaluasi.
- Rentang data yang digunakan.
- Waktu pembaruan model.
- Penjelasan singkat mengenai hasil.
- Peringatan apabila kualitas data tidak memadai.

### 10.2 Customer Segmentation — RFM + K-Means

Tujuan: mengelompokkan pelanggan berdasarkan perilaku pembelian.

Bangun fitur RFM:

- Recency: jarak waktu sejak transaksi terakhir.
- Frequency: jumlah transaksi dalam periode yang ditentukan.
- Monetary: nilai pembelian selama periode yang ditentukan.

Tentukan definisi transaksi, periode observasi, tanggal referensi, serta penanganan refund dan transaksi batal.

Lakukan scaling atau transformasi fitur jika diperlukan sebelum K-Means.

Tentukan jumlah cluster menggunakan kombinasi interpretasi bisnis, elbow method, silhouette score, stabilitas cluster, dan ukuran segmen.

Jangan menetapkan jumlah cluster secara sembarangan atau menjamin bahwa label seperti VIP, Loyal, Potential Loyalist, dan At Risk selalu terbentuk secara otomatis.

Buat proses untuk menginterpretasikan cluster berdasarkan karakteristik aktualnya. Label bisnis harus diberikan berdasarkan profil cluster, bukan berdasarkan nomor cluster saja.

Output minimal:

- Jumlah pelanggan per segmen.
- Persentase pelanggan per segmen.
- Kontribusi omzet per segmen.
- Karakteristik setiap segmen.
- Grafik distribusi segmen.
- Daftar pelanggan yang termasuk ke dalam segmen, sesuai permission.
- Rekomendasi aksi yang relevan.
- Informasi periode dan versi model.

### 10.3 Market Basket Analysis

Tujuan: menemukan produk yang sering dibeli bersama dan mengidentifikasi peluang bundling.

Kandidat algoritma:

- FP-Growth.
- Apriori.

Gunakan data transaksi yang memiliki identitas transaksi dan item produk yang benar.

Hitung metrik yang relevan, misalnya:

- Support.
- Confidence.
- Lift.

Filter aturan berdasarkan ambang batas yang dapat dikonfigurasi. Jangan menyimpulkan bahwa produk memiliki hubungan sebab-akibat hanya karena sering dibeli bersama.

Output minimal:

- Kombinasi produk.
- Support, confidence, dan lift.
- Jumlah transaksi yang mendukung aturan jika dapat dihitung.
- Rekomendasi bundling.
- Periode transaksi yang dianalisis.
- Peringatan jika volume transaksi terlalu kecil.

Jika struktur dataset tidak mendukung identifikasi transaksi dan item, jelaskan keterbatasannya sebelum menerapkan algoritma.

### 10.4 Customer Churn Prediction

Tujuan: memperkirakan pelanggan yang berisiko tidak melakukan pembelian lagi.

Kandidat algoritma:

- Random Forest.
- XGBoost atau model boosting yang kompatibel.
- Model klasifikasi lain jika lebih sesuai.

Sebelum training, definisikan churn berdasarkan konteks bisnis, misalnya tidak melakukan pembelian selama sejumlah hari tertentu setelah periode observasi. Jangan menetapkan batas hari secara sembarangan.

Pastikan label dapat dibentuk dari histori transaksi yang memadai. Gunakan pemisahan data berdasarkan waktu agar informasi masa depan tidak bocor ke fitur training.

Evaluasi menggunakan precision, recall, F1-score, PR-AUC, dan kalibrasi probabilitas jika relevan. Pertimbangkan ketidakseimbangan kelas.

Jika menggunakan SHAP, jelaskan fitur yang memengaruhi prediksi dengan bahasa yang mudah dimengerti. Hindari menyajikan korelasi sebagai sebab-akibat.

Output minimal:

- Daftar pelanggan berisiko.
- Skor risiko.
- Kategori risiko dengan ambang batas yang dapat dijelaskan.
- Faktor yang berkontribusi terhadap prediksi jika didukung.
- Rekomendasi tindakan retensi.
- Metrik evaluasi dan batasan model.

### 10.5 Sales Anomaly Detection

Tujuan: mendeteksi lonjakan atau penurunan penjualan yang tidak biasa.

Kandidat algoritma:

- Isolation Forest.
- Metode statistik atau time-series anomaly detection sebagai pembanding.

Tentukan grain analisis, misalnya penjualan harian per toko, per kategori, atau per produk.

Buat fitur yang relevan, misalnya nilai penjualan, jumlah transaksi, perubahan terhadap periode sebelumnya, dan fitur kalender apabila tersedia.

Bandingkan hasil deteksi dengan baseline atau pola historis yang masuk akal.

Output minimal:

- Tanggal atau periode anomali.
- Nilai aktual.
- Nilai pembanding atau baseline.
- Tingkat atau skor anomali.
- Jenis anomali: lonjakan atau penurunan jika dapat disimpulkan.
- Penjelasan singkat.
- Grafik histori dan penanda anomali.
- Rekomendasi pemeriksaan.

Jangan menganggap semua anomali sebagai kesalahan atau fraud. Anomali hanya menandakan pola yang perlu ditinjau.

### 10.6 Evaluasi kelayakan kelima model

Sebelum training, buat matriks kelayakan:

| Model | Data minimum yang dibutuhkan | Tantangan utama |
|---|---|---|
| Forecasting | Histori penjualan bertanggal | Histori pendek, musiman, data kosong |
| RFM + K-Means | ID pelanggan, tanggal transaksi, nilai pembelian | Pelanggan tanpa histori, distribusi tidak seimbang |
| Market Basket | ID transaksi dan produk per transaksi | Transaksi atau item tidak lengkap |
| Churn | Histori pelanggan dan definisi churn yang dapat dilabeli | Label tidak tersedia, data leakage |
| Anomaly Detection | Seri waktu atau observasi penjualan yang memadai | Volume rendah, pola musiman |

Jika data tidak mendukung suatu model, jangan membuat hasil palsu. Identifikasi data tambahan yang diperlukan, implementasikan pipeline yang sesuai, dan tampilkan status belum layak dijalankan atau belum cukup data.

Kelima kemampuan tersebut harus dirancang dalam aplikasi, tetapi ketersediaan hasil analisis harus mencerminkan kondisi data sebenarnya.

---

## 11. Pengembangan Python ML Service

Buat service Python terpisah jika diperlukan untuk mengisolasi dependency Machine Learning dari backend NestJS.

FastAPI dapat digunakan sebagai internal API untuk inference dan job management. Pilih library yang kompatibel dengan Python pada komputer saya.

Pisahkan kode menjadi bagian-bagian berikut:

- Konfigurasi.
- Schemas request/response.
- Data preprocessing.
- Feature engineering.
- Training.
- Evaluation.
- Inference.
- Model registry atau metadata model.
- Model artifact management.
- ML job execution.
- Logging.
- Tests.

Jangan menempatkan seluruh kode Machine Learning dalam satu file besar.

### 11.1 Training pipeline

Training harus menjadi proses yang berbeda dari inference.

Alur yang diharapkan:

1. Mengidentifikasi dataset sumber.
2. Memeriksa kualitas data.
3. Membentuk dataset training.
4. Melakukan preprocessing dan feature engineering.
5. Membagi data sesuai karakteristik model.
6. Melatih baseline.
7. Melatih kandidat model.
8. Melakukan evaluasi.
9. Membandingkan metrik.
10. Menyimpan model yang layak beserta metadata dan versi.
11. Mencatat parameter, periode data, dan hasil evaluasi.
12. Menandai model sebagai siap digunakan jika memenuhi kriteria.

Jangan menjalankan training ulang setiap kali pengguna membuka dashboard.

Training ulang harus dilakukan berdasarkan tindakan yang berwenang, jadwal, atau kebijakan yang ditentukan.

### 11.2 Inference pipeline

Inference menggunakan model yang sudah dilatih dan memenuhi kriteria.

Alurnya:

1. NestJS memvalidasi request.
2. NestJS memastikan pengguna memiliki akses ke toko.
3. NestJS menentukan dataset dan periode analisis.
4. NestJS mengirim input yang diperlukan ke Python.
5. Python memvalidasi schema request.
6. Python melakukan preprocessing yang konsisten dengan training.
7. Python memuat versi model yang sesuai.
8. Python menjalankan inference.
9. Python mengembalikan hasil dan metadata.
10. NestJS memvalidasi hasil.
11. NestJS menyimpan hasil melalui Prisma apabila diperlukan.
12. Frontend menampilkan hasil.

Pastikan model, preprocessing, dan feature schema menggunakan versi yang kompatibel. Tangani model yang belum tersedia, input tidak valid, proses gagal, serta timeout.

### 11.3 Model artifact dan dataset

Buat direktori untuk artefak model, misalnya:

```text
services/ml/
├── app/
├── training/
├── evaluation/
├── inference/
├── preprocessing/
├── schemas/
├── tests/
├── artifacts/
│   ├── forecasting/
│   ├── segmentation/
│   ├── market_basket/
│   ├── churn/
│   └── anomaly_detection/
└── scripts/
```

Ini adalah rancangan awal. Sesuaikan dengan framework dan kebutuhan proyek.

Jangan menyimpan dataset besar atau model artifact ke dalam tabel MySQL tanpa alasan. Tentukan kapan metadata disimpan di MySQL dan kapan file disimpan di filesystem lokal atau object storage.

Untuk development lokal, filesystem yang terlindungi dapat digunakan. Pastikan file upload pengguna, dataset mentah, dan artefak model tidak dapat diakses langsung oleh publik.

Jangan commit file `.env`, credential, data sensitif, atau model besar ke Git tanpa pertimbangan yang tepat.

---

## 12. REST API dan Versioning

Backend harus menyediakan REST API yang konsisten dan terdokumentasi.

Gunakan prefix versi, misalnya:

`/api/v1/...`

Tentukan konvensi response, validasi, pagination, filtering, sorting, error code, dan status HTTP. Gunakan Swagger/OpenAPI untuk dokumentasi API.

Endpoint berikut adalah daftar awal yang harus dievaluasi dan disesuaikan.

### Authentication

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/refresh` jika menggunakan refresh token.
- Endpoint reset password jika mekanismenya diimplementasikan.

### User dan membership

- `GET /api/v1/users/me`
- `PATCH /api/v1/users/me`
- `GET /api/v1/stores/:storeId/members`
- `POST /api/v1/stores/:storeId/invitations`
- `POST /api/v1/invitations/:token/accept`
- Endpoint perubahan role dan pencabutan akses sesuai permission.

### Store

- `POST /api/v1/stores`
- `GET /api/v1/stores`
- `GET /api/v1/stores/:storeId`
- `PATCH /api/v1/stores/:storeId`
- Endpoint penonaktifan atau pengelolaan status sesuai kebijakan.

### Products dan customers

- `GET /api/v1/stores/:storeId/products`
- `POST /api/v1/stores/:storeId/products`
- `GET /api/v1/stores/:storeId/products/:productId`
- `PATCH /api/v1/stores/:storeId/products/:productId`
- `DELETE /api/v1/stores/:storeId/products/:productId`
- Endpoint CRUD pelanggan yang sesuai.

### Sales dan upload

- `GET /api/v1/stores/:storeId/sales`
- `POST /api/v1/stores/:storeId/sales` untuk input manual.
- `POST /api/v1/stores/:storeId/sales/import`
- `GET /api/v1/stores/:storeId/sales/import/template`
- `GET /api/v1/stores/:storeId/uploads`
- `GET /api/v1/stores/:storeId/uploads/:uploadId`
- Endpoint validasi, commit, pembatalan, dan rollback jika diperlukan.

### Dashboard dan analytics

- `GET /api/v1/stores/:storeId/dashboard/overview`
- `GET /api/v1/stores/:storeId/analytics/sales`
- `GET /api/v1/stores/:storeId/analytics/products`
- `GET /api/v1/stores/:storeId/analytics/customers`

### Machine Learning

- Endpoint forecasting.
- Endpoint customer segmentation.
- Endpoint market basket.
- Endpoint churn prediction.
- Endpoint anomaly detection.
- Endpoint status job dan hasil analisis.
- Endpoint histori analisis.
- Endpoint metadata model yang aman untuk ditampilkan.

Contoh pola endpoint:

- `POST /api/v1/stores/:storeId/analytics/forecast`
- `POST /api/v1/stores/:storeId/analytics/segmentation`
- `POST /api/v1/stores/:storeId/analytics/market-basket`
- `POST /api/v1/stores/:storeId/analytics/churn`
- `POST /api/v1/stores/:storeId/analytics/anomalies`
- `GET /api/v1/stores/:storeId/analytics/jobs/:jobId`

Jangan mengasumsikan seluruh proses harus memakai `POST` atau menghasilkan job asynchronous. Tentukan metode berdasarkan perilaku endpoint yang benar.

### Reports dan notifications

- Endpoint daftar laporan.
- Endpoint pembuatan laporan.
- Endpoint download PDF/Excel.
- Endpoint ekspor pelanggan berdasarkan segmen.
- Endpoint notifikasi.
- Endpoint status baca notifikasi.

### Admin

- Endpoint manajemen pengguna platform.
- Endpoint pemantauan toko.
- Endpoint health/status service.
- Endpoint status model dan job ML.
- Endpoint audit log dan system log yang aman.

Semua endpoint admin harus memiliki permission khusus. Jangan memberikan akses admin hanya berdasarkan role yang dikirim oleh frontend.

### Aturan implementasi REST API

Untuk setiap endpoint, dokumentasikan:

- Tujuan.
- HTTP method.
- URL.
- Role yang boleh mengakses.
- Parameter path/query.
- Request body.
- Response JSON.
- Status HTTP.
- Validasi.
- Kemungkinan error.
- Dampak terhadap database.
- Apakah endpoint memicu job ML.
- Apakah endpoint menghasilkan file.

Jangan membuat endpoint yang hanya mengembalikan mock data untuk menggantikan fitur inti yang seharusnya sudah terhubung ke database.

---

## 13. Alur Komunikasi Next.js → NestJS → Python → MySQL

Gunakan alur berikut sebagai referensi implementasi.

### 13.1 Upload dataset

1. Pemilik membuka halaman upload.
2. Next.js menampilkan template dan petunjuk.
3. Pengguna memilih CSV/Excel.
4. Next.js mengirim file ke REST API NestJS.
5. NestJS memeriksa authentication, permission toko, ukuran file, dan format.
6. NestJS membuat catatan upload dan mengelola file secara aman.
7. Data diperiksa melalui pipeline import dan validasi.
8. Hasil validasi disimpan melalui Prisma ke MySQL.
9. Frontend menampilkan jumlah baris valid, ditolak, duplikat, dan kesalahan.
10. Dataset hanya dimasukkan ke data bisnis aktif setelah melewati aturan validasi dan proses konfirmasi yang ditentukan.

Jika pemrosesan dilakukan asynchronous, tampilkan status `queued`, `processing`, `completed`, atau `failed` sesuai implementasi.

### 13.2 Menjalankan analisis Machine Learning

1. Pengguna membuka dashboard analitik toko.
2. Pengguna memilih jenis analisis dan periode data.
3. Next.js mengirim request ke endpoint `/api/v1`.
4. NestJS memvalidasi pengguna, permission, dataset, dan parameter.
5. NestJS membuat job analisis jika proses membutuhkan waktu lama.
6. NestJS menyiapkan data yang relevan dari database melalui Prisma.
7. NestJS mengirim payload yang diperlukan ke internal Python API.
8. Python menjalankan preprocessing dan inference.
9. Python mengembalikan hasil serta metadata model.
10. NestJS memvalidasi response dan menyimpan hasil melalui Prisma.
11. Status job diperbarui.
12. Next.js mengambil hasil melalui REST API.
13. Dashboard menampilkan grafik, ringkasan, tabel, dan penjelasan hasil.

Jangan mengirim seluruh database ke Python jika hanya sebagian data yang diperlukan.

### 13.3 Menampilkan dashboard

1. Pengguna login.
2. Frontend mendapatkan identitas pengguna.
3. Backend mengembalikan daftar toko yang boleh diakses.
4. Pengguna memilih toko.
5. Next.js meminta data dashboard melalui REST API.
6. NestJS memvalidasi keanggotaan toko.
7. NestJS mengambil agregasi penjualan dan hasil analisis yang relevan.
8. NestJS mengembalikan response terstruktur.
9. Frontend menampilkan KPI, grafik, tabel, notifikasi, dan ringkasan.

Jangan melatih model ketika dashboard dibuka kecuali terdapat alasan dan mekanisme eksplisit.

---

## 14. Authentication dan Authorization

Implementasikan authentication dan authorization secara menyeluruh.

Evaluasi session berbasis cookie atau access token dan refresh token berdasarkan arsitektur yang dipilih. Untuk aplikasi web, pertimbangkan cookie `HttpOnly`, `Secure` pada production, dan konfigurasi `SameSite` yang sesuai.

Ketentuan:

- Password di-hash dengan algoritma yang sesuai.
- Token dan secret disimpan secara aman.
- Validasi permission dilakukan pada backend.
- Gunakan guard dan decorator NestJS jika sesuai.
- Terapkan RBAC untuk role Admin, Pemilik, dan Pegawai.
- Terapkan pemeriksaan membership toko untuk setiap akses data toko.
- Terapkan proteksi terhadap IDOR dan privilege escalation.
- Terapkan rate limiting pada authentication dan endpoint sensitif.
- Validasi semua input API.
- Cegah SQL injection melalui penggunaan ORM dan query yang aman.
- Terapkan kebijakan CORS yang ketat.
- Lindungi upload dari file berbahaya dan file berukuran berlebihan.
- Jangan mengekspos path file internal atau stack trace kepada pengguna.
- Catat aktivitas sensitif dalam audit log.

Jika menggunakan JWT, tentukan masa berlaku access token, strategi refresh, logout, dan pencabutan akses. Jika menggunakan session, jelaskan penyimpanan dan invalidasi session.

Jangan menyimpan password, token, atau credential ke log.

---

## 15. Dashboard Analitik dan Visualisasi

Buat dashboard dengan informasi yang berguna untuk pengambilan keputusan bisnis.

### 15.1 Ringkasan bisnis

Tampilkan KPI sesuai data yang tersedia:

- Total omzet.
- Jumlah transaksi.
- Jumlah item terjual.
- Rata-rata nilai transaksi.
- Jumlah pelanggan.
- Produk terlaris.
- Pertumbuhan dibanding periode sebelumnya.
- Ringkasan kualitas data.
- Waktu pembaruan analisis.

Definisikan formula setiap KPI. Bedakan omzet kotor, omzet bersih, diskon, refund, dan keuntungan.

Jangan menyebut omzet sebagai laba apabila data biaya tidak tersedia. Jangan menyebut nilai penjualan sebagai profit tanpa data biaya yang memadai.

### 15.2 Grafik penjualan

Sediakan:

- Tren penjualan harian, mingguan, dan bulanan.
- Perbandingan periode.
- Penjualan per produk.
- Penjualan per kategori jika tersedia.
- Jumlah transaksi.
- Distribusi nilai transaksi.
- Hasil forecasting dan rentang prediksi jika tersedia.

### 15.3 Dashboard segmentasi pelanggan

Tampilkan:

- Distribusi segmen.
- Kontribusi omzet per segmen.
- Karakteristik tiap segmen.
- Jumlah pelanggan per segmen.
- Daftar pelanggan sesuai permission.
- Perubahan distribusi segmen dari waktu ke waktu jika tersedia.

### 15.4 Dashboard rekomendasi produk

Tampilkan:

- Kombinasi produk yang sering dibeli bersama.
- Nilai support, confidence, dan lift.
- Rekomendasi bundling.
- Penjelasan singkat tentang alasan rekomendasi.
- Batasan data yang digunakan.

### 15.5 Dashboard churn dan anomali

Tampilkan:

- Jumlah pelanggan berdasarkan kategori risiko.
- Perubahan skor risiko dari waktu ke waktu jika tersedia.
- Pelanggan yang perlu ditindaklanjuti.
- Anomali penjualan.
- Grafik historis dan baseline.
- Waktu kejadian.
- Rekomendasi pemeriksaan.

Setiap dashboard harus memiliki filter periode, loading state, empty state, error state, dan informasi kapan data terakhir diperbarui.

---

## 16. Laporan, Ekspor, dan Notifikasi

### 16.1 Laporan

Sediakan laporan PDF dan Excel yang dapat diunduh.

Isi laporan dapat mencakup:

- Identitas toko.
- Periode laporan.
- Ringkasan KPI.
- Grafik penjualan.
- Produk terlaris.
- Analisis pelanggan.
- Hasil segmentasi.
- Hasil forecasting.
- Rekomendasi bundling.
- Churn prediction.
- Deteksi anomali.
- Kualitas data.
- Catatan keterbatasan analisis.

Laporan harus menggunakan data aktual yang telah disimpan atau dihitung melalui backend, bukan data contoh statis.

Pastikan ekspor dibatasi berdasarkan permission toko. Terapkan pagination atau pemrosesan asynchronous untuk laporan berukuran besar.

### 16.2 Ekspor daftar pelanggan

Pemilik yang memiliki izin dapat mengekspor daftar pelanggan berdasarkan segmen.

Sediakan filter segmen dan periode. Terapkan minimisasi data, pembatasan akses, serta pencatatan aktivitas ekspor.

Jangan otomatis mengirim pesan WhatsApp atau email tanpa integrasi resmi dan persetujuan yang sesuai. Tahap awal cukup menyediakan ekspor yang aman untuk kebutuhan kampanye.

### 16.3 Notifikasi

Contoh notifikasi yang dapat dikembangkan:

- Prediksi penjualan meningkat.
- Produk berpotensi laris.
- Pelanggan bernilai tinggi sudah lama tidak bertransaksi.
- Risiko churn meningkat.
- Terjadi anomali penjualan.
- Upload dataset selesai atau gagal.
- Analisis ML selesai atau gagal.
- Model perlu diperbarui.

Gunakan aturan yang jelas dan dapat dikonfigurasi. Jangan mengirim notifikasi berulang untuk kondisi yang sama tanpa mekanisme deduplikasi atau cooldown.

### 16.4 Penjelasan hasil dalam bahasa awam

Setiap hasil ML perlu disertai penjelasan yang mudah dimengerti.

Contoh:

"Segmen Pelanggan Setia berisi 120 pelanggan dan menyumbang 48% omzet pada periode analisis."

Angka pada contoh tersebut hanya ilustrasi. Aplikasi harus menghitung angka sebenarnya berdasarkan dataset yang dianalisis.

Contoh lain:

"Penjualan diperkirakan meningkat pada minggu depan berdasarkan pola transaksi historis. Prediksi memiliki ketidakpastian dan tidak menjamin hasil aktual."

Jangan menampilkan hasil atau alasan yang tidak didukung data. Sertakan konteks periode, batasan, dan ketidakpastian apabila relevan.

---

## 17. Struktur Referensi Folder Monorepo

Gunakan monorepo sebagai pilihan awal agar frontend, backend, dan Python service mudah dikelola bersama. Pilih struktur yang paling sesuai dengan tools yang tersedia pada komputer saya. Sesuai kan kalau misal di folder frontend saya pakai nya app bukan src untuk next js berarti berubah.

Contoh struktur:

```text
bisnis-insight/
├── apps/
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── app/
│   │   │   ├── components/
│   │   │   ├── features/
│   │   │   ├── layouts/
│   │   │   ├── hooks/
│   │   │   ├── lib/
│   │   │   ├── services/
│   │   │   ├── types/
│   │   │   └── styles/
│   │   ├── public/
│   │   ├── tests/
│   │   ├── package.json
│   │   └── ...
│   │
│   └── backend/
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/
│       │   ├── config/
│       │   ├── auth/
│       │   ├── users/
│       │   ├── stores/
│       │   ├── memberships/
│       │   ├── products/
│       │   ├── customers/
│       │   ├── sales/
│       │   ├── uploads/
│       │   ├── data-quality/
│       │   ├── analytics/
│       │   ├── ml/
│       │   ├── reports/
│       │   ├── notifications/
│       │   ├── admin/
│       │   ├── audit/
│       │   └── database/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed/
│       ├── test/
│       ├── package.json
│       └── ...
│
├── services/
│   └── ml/
│       ├── app/
│       │   ├── main.py
│       │   ├── api/
│       │   ├── core/
│       │   ├── schemas/
│       │   ├── preprocessing/
│       │   ├── features/
│       │   ├── models/
│       │   ├── inference/
│       │   ├── jobs/
│       │   └── utils/
│       ├── training/
│       ├── evaluation/
│       ├── tests/
│       ├── scripts/
│       ├── artifacts/
│       ├── requirements.txt
│       └── ...
│
├── data/
│   ├── raw/
│   ├── staging/
│   ├── processed/
│   ├── rejected/
│   ├── samples/
│   └── data_dictionary/
│
├── storage/
│   ├── uploads/
│   ├── reports/
│   └── temporary/
│
├── docs/
│   ├── architecture.md
│   ├── database-design.md
│   ├── api-specification.md
│   ├── dataset-analysis.md
│   ├── ml-pipeline.md
│   ├── authorization-matrix.md
│   └── development-guide.md
│
├── scripts/
├── .gitignore
├── .env.example
├── README.md
└── ...
```

Struktur tersebut adalah rancangan awal. Jangan membuat seluruh direktori kosong hanya untuk mengikuti diagram. Buat struktur berdasarkan modul dan tanggung jawab nyata.

Untuk frontend, gunakan Next.js App Router dengan route group atau pola sejenis jika bermanfaat, misalnya pemisahan halaman publik, authentication, dan dashboard.

Untuk backend, gunakan module-based architecture NestJS dengan pemisahan controller, service, DTO, guard, dan lapisan database sesuai kebutuhan.

Untuk Python, pisahkan training, evaluation, preprocessing, dan inference. Hindari kode duplikat antara pipeline training dan inference.

Jelaskan alasan penggunaan monorepo, cara menjalankan setiap aplikasi, dan bagaimana dependency antarbagian dikelola.

---

## 18. Pola Implementasi dan Kualitas Kode

Terapkan separation of concerns dan prinsip SOLID secara proporsional.

### Frontend

- Pisahkan UI, business interaction, dan API client.
- Gunakan komponen reusable.
- Hindari menempatkan semua logika dalam satu page.
- Gunakan type definitions yang konsisten.
- Tangani loading, error, dan empty state.
- Hindari mock data pada fitur yang sudah terintegrasi.

### Backend

- Controller menangani HTTP request/response.
- Service mengelola business logic.
- DTO digunakan untuk validasi input.
- Guard/decorator mengelola authentication dan authorization.
- Prisma menjadi lapisan akses database.
- Integrasi ML berada di module khusus.
- Gunakan transaksi database jika beberapa operasi harus atomik.

Jangan membuat abstraction atau repository untuk setiap tabel tanpa kebutuhan nyata. Gunakan pola yang memudahkan pengujian dan pemeliharaan.

### Python

- Pisahkan pipeline training dan inference.
- Gunakan schema input/output.
- Buat preprocessing reproducible.
- Simpan metadata model.
- Tangani data kosong, tipe data salah, dan model yang tidak tersedia.
- Buat unit test untuk preprocessing dan evaluasi.
- Hindari training otomatis setiap kali endpoint inference dipanggil.

### Kontrak API

Dokumentasikan request dan response antara frontend, NestJS, dan Python. Jika memungkinkan, gunakan OpenAPI atau skema tervalidasi agar kontrak tidak berbeda antar-service.

---

## 19. Keamanan, Logging, dan Operasional

Implementasikan kebutuhan berikut berdasarkan risiko dan kompleksitas proyek:

- Validasi input pada backend.
- Authentication dan authorization.
- Multi-tenant isolation.
- Rate limiting.
- CORS yang sesuai.
- Upload file yang aman.
- Error handling terpusat.
- Structured logging.
- Audit log.
- Health check service.
- Environment configuration.
- Backup dan restore database.
- Database migration.
- Pengelolaan secret.
- Timeout dan retry yang terbatas pada komunikasi antar-service.
- Idempotency untuk operasi import atau job yang berisiko terduplikasi.
- Monitoring status model dan job.
- Retensi file dan data.

Pisahkan log teknis dari audit log pengguna. Jangan menyimpan data pelanggan sensitif atau credential secara berlebihan.

Sediakan health endpoint untuk backend dan ML service. Jangan mengekspos informasi internal, environment variables, atau detail stack trace kepada pengguna publik.

Karena Docker dan Redis tidak digunakan, dokumentasikan cara menjalankan service lokal, pengelolaan environment, dan mekanisme background job yang dipilih.

---

## 20. Pengujian

Jangan menyatakan sistem selesai hanya karena aplikasi berhasil dijalankan.

Buat pengujian bertahap.

### 20.1 Frontend

- Navigasi halaman.
- Authentication flow.
- Protected routes.
- Responsive layout.
- Validasi form.
- Error dan empty state.
- Integrasi API.
- Animasi dan reduced-motion behavior.

### 20.2 Backend

- Unit test service.
- Integration test REST API.
- Authentication dan authorization.
- Permission per toko.
- Validasi upload.
- CRUD.
- Pagination dan filtering.
- Export laporan.
- Error handling.
- Pengujian IDOR dan privilege escalation.

### 20.3 Database

- Migration.
- Foreign key dan constraint.
- Relasi data.
- Integritas transaksi.
- Isolasi data antartoko.
- Rollback upload.
- Backup dan restore jika relevan.

### 20.4 Machine Learning

- Validasi data.
- Preprocessing.
- Feature engineering.
- Training dan evaluation pipeline.
- Data leakage.
- Evaluasi model.
- Inference dengan model tersimpan.
- Input tidak valid.
- Model artifact tidak ditemukan.
- Dataset terlalu kecil.
- Integrasi hasil ML dengan backend.

### 20.5 End-to-end

Uji alur nyata:

1. Pemilik melakukan registrasi dan login.
2. Pemilik membuat toko.
3. Pemilik mengundang pegawai.
4. Pegawai menerima undangan.
5. Pemilik mengunggah dataset.
6. Sistem melakukan validasi dan pembersihan.
7. Data disimpan ke database.
8. Pemilik menjalankan analisis.
9. Python menghasilkan prediksi atau hasil analisis.
10. NestJS menyimpan hasil.
11. Dashboard menampilkan hasil aktual.
12. Pemilik mengunduh laporan.
13. Pegawai hanya melihat data toko yang ditugaskan.
14. Pegawai tidak dapat mengakses toko lain.
15. Admin dapat memantau status sistem dan log yang diizinkan.

Pastikan alur tersebut benar-benar terhubung, bukan hanya simulasi.

---

## 21. Urutan Pengerjaan yang Wajib Diikuti

Kerjakan proyek secara bertahap. Jangan membuat semua fitur sekaligus dalam satu perubahan besar.

### Tahap 1 — Audit lingkungan dan project

- Periksa komputer dan versi teknologi.
- Periksa project yang ada.
- Periksa MySQL dan nama database.
- Periksa kelima dataset.
- Catat kendala kompatibilitas.
- Buat laporan hasil audit.

**Output:** laporan environment, kondisi project, inventaris dataset, dan rekomendasi teknis.

### Tahap 2 — Analisis dataset

- Profiling kelima dataset.
- Pemeriksaan kolom dan tipe data.
- Analisis kualitas data.
- Pemetaan relasi.
- Data dictionary.
- Identifikasi kebutuhan preprocessing.
- Evaluasi kelayakan lima model ML.

**Output:** `docs/dataset-analysis.md`, data dictionary, dan rekomendasi pipeline.

### Tahap 3 — Rancangan arsitektur

- Tentukan struktur monorepo.
- Tetapkan teknologi dan versi kompatibel.
- Buat diagram arsitektur.
- Tentukan REST API `/api/v1`.
- Tentukan alur data.
- Tentukan mekanisme komunikasi Python.
- Tentukan background job jika diperlukan.
- Tentukan strategi penyimpanan file dan model artifact.

**Output:** `docs/architecture.md`, `docs/api-specification.md`, dan `docs/ml-pipeline.md`.

### Tahap 4 — Desain database

- Rancang entitas dan relasi.
- Buat ERD.
- Tentukan nama database setelah pemeriksaan MySQL.
- Konfigurasi Prisma v7.
- Buat migration.
- Buat seed development yang aman.
- Uji integritas schema.

**Output:** schema Prisma, migration, dokumentasi database, dan database yang dapat dijalankan.

### Tahap 5 — Backend dasar

- Setup NestJS.
- Konfigurasi REST API versioning.
- Konfigurasi validation dan error handling.
- Konfigurasi Prisma.
- Implementasikan authentication.
- Implementasikan RBAC dan multi-tenant authorization.
- Implementasikan user, store, dan membership.

**Output:** backend dasar yang memiliki API berfungsi dan dapat diuji.

### Tahap 6 — Modul data bisnis

- CRUD produk dan pelanggan.
- Input penjualan manual.
- Upload CSV/Excel.
- Template dataset.
- Validasi dan data quality report.
- Riwayat upload.
- Rollback dataset.
- Pengujian integritas transaksi.

**Output:** pipeline data yang berfungsi dari input sampai MySQL.

### Tahap 7 — Python ML Service

- Setup Python environment.
- Buat struktur service.
- Buat preprocessing bersama yang reproducible.
- Buat baseline setiap model.
- Implementasikan training dan evaluation.
- Simpan model artifact dan metadata.
- Buat inference API.
- Buat test untuk masing-masing model.

**Output:** service ML yang dapat dijalankan dan diuji secara terpisah.

### Tahap 8 — Integrasi NestJS dan Python

- Implementasikan ML client pada NestJS.
- Tentukan kontrak request/response.
- Implementasikan timeout dan error handling.
- Implementasikan ML job jika dibutuhkan.
- Simpan status job dan hasil analisis.
- Implementasikan pembatasan akses.
- Uji integrasi seluruh model.

**Output:** pipeline ML yang terhubung dengan backend.

### Tahap 9 — Frontend dan UI/UX

- Buat design system.
- Buat landing page publik.
- Buat authentication pages.
- Buat layout Admin.
- Buat layout Pemilik.
- Buat layout Pegawai.
- Buat halaman manajemen data.
- Buat dashboard analitik.
- Buat halaman Machine Learning.
- Buat halaman laporan.
- Hubungkan seluruh halaman dengan API.
- Implementasikan animasi dan responsive layout.

**Output:** frontend yang berfungsi dengan data backend nyata.

### Tahap 10 — Laporan dan notifikasi

- Implementasikan ekspor PDF/Excel.
- Implementasikan ekspor daftar pelanggan.
- Implementasikan notifikasi.
- Implementasikan ringkasan hasil dalam bahasa awam.
- Uji pembatasan akses data dan file.

**Output:** fitur output dan tindak lanjut bisnis.

### Tahap 11 — Integrasi, QA, dan keamanan

- Jalankan seluruh automated tests.
- Uji end-to-end.
- Uji multi-tenant isolation.
- Uji error handling.
- Uji performa query dan upload.
- Uji akurasi dan keterbatasan model.
- Uji migration dan backup/restore.
- Perbaiki bug yang ditemukan.

**Output:** laporan QA dan daftar masalah yang telah diperbaiki maupun yang masih tersisa.

### Tahap 12 — Dokumentasi dan deployment

- Buat README.
- Dokumentasikan setup lokal.
- Dokumentasikan `.env.example`.
- Dokumentasikan migration.
- Dokumentasikan training dan inference.
- Dokumentasikan endpoint REST API.
- Dokumentasikan troubleshooting.
- Siapkan konfigurasi deployment tanpa Docker pada tahap awal.
- Pastikan semua secret dan data sensitif terlindungi.

**Output:** aplikasi yang dapat dijalankan oleh developer lain berdasarkan dokumentasi.

---

## 22. Aturan Pelaksanaan untuk AI Coding Agent

Ikuti aturan kerja berikut:

1. Jangan langsung menghasilkan banyak kode sebelum melakukan audit.
2. Jangan mengarang isi dataset atau nama kolom yang belum diperiksa.
3. Jangan mengasumsikan database baru tersedia sebelum memeriksa MySQL.
4. Jangan menginstal versi teknologi tanpa memeriksa kompatibilitas.
5. Jangan menggunakan Docker atau Redis pada tahap awal.
6. Jangan mencampurkan tanggung jawab frontend, backend, dan ML.
7. Jangan menghubungkan Next.js langsung ke MySQL.
8. Jangan memberikan akses lintas toko tanpa permission yang valid.
9. Jangan menghasilkan hasil Machine Learning palsu untuk menutupi model yang belum siap.
10. Jangan menjalankan training model setiap kali dashboard dibuka.
11. Jangan menghapus atau mereset database yang sudah ada.
12. Jangan mengganti kode yang sudah berfungsi tanpa alasan teknis.
13. Jangan membuat UI yang hanya berupa tampilan statis.
14. Jangan meninggalkan tombol atau form utama tanpa fungsi.
15. Jangan mengklaim testing berhasil tanpa benar-benar menjalankannya.
16. Jangan mengabaikan error, warning, atau masalah dependency.
17. Jangan membuat file konfigurasi yang berisi credential asli.
18. Jangan menambahkan dependency hanya untuk mengikuti contoh struktur.
19. Jangan mengerjakan semua tahap dalam satu perubahan besar.
20. Jangan berhenti pada rancangan jika implementasi sudah diizinkan dan lingkungan mendukungnya.

Setelah setiap tahap, jelaskan perubahan yang dibuat, file utama yang ditambahkan atau diubah, cara menjalankan, pengujian yang dilakukan, hasil pengujian, dan masalah yang masih ada.

Jika terdapat keputusan arsitektur yang belum jelas, bandingkan opsi yang masuk akal dan pilih berdasarkan kebutuhan, bukan berdasarkan kompleksitas atau popularitas teknologi.

Jika terjadi kegagalan, cari akar masalahnya dan perbaiki secara terukur. Jangan menyembunyikan kegagalan dengan mock response atau menonaktifkan pengujian.

---

## 23. Deliverables Akhir

Pastikan proyek memiliki deliverables berikut:

1. Aplikasi web UMKM dengan landing page publik.
2. Authentication dan tiga dashboard berbeda.
3. Pengelolaan akun, toko, dan pegawai.
4. Upload CSV/Excel beserta template.
5. Validasi, pembersihan, dan laporan kualitas data.
6. Riwayat upload dan rollback.
7. CRUD produk dan pelanggan.
8. REST API dengan versioning dan dokumentasi.
9. Integrasi Next.js, NestJS, Prisma v7, MySQL, dan Python.
10. Lima kemampuan Machine Learning yang sudah diimplementasikan dan diuji sesuai kelayakan data.
11. Dashboard analitik dan visualisasi hasil.
12. Laporan PDF/Excel.
13. Ekspor pelanggan berdasarkan segmen.
14. Notifikasi dan penjelasan hasil analisis.
15. Monitoring status service dan model untuk Admin.
16. Pengujian unit, integrasi, dan end-to-end.
17. Dokumentasi arsitektur, database, dataset, API, dan ML pipeline.
18. Panduan instalasi, konfigurasi, development, dan deployment lokal.

Fitur yang tidak dapat diselesaikan karena keterbatasan dataset, dependency, atau lingkungan harus dilaporkan secara eksplisit, disertai penyebab dan langkah tindak lanjut.

---

## 24. Tindakan Pertama

**Mulai dari Tahap 1 dan jangan langsung membangun seluruh aplikasi.**

Lakukan audit environment, project, database MySQL, dan lima dataset. Setelah itu, berikan laporan awal yang mencakup:

1. Versi teknologi yang benar-benar terpasang di komputer.
2. Struktur project saat ini dan kondisi file yang relevan.
3. Status keberadaan dan isi kelima dataset.
4. Ringkasan kolom, tipe data, jumlah baris, kualitas data, dan relasi yang ditemukan.
5. Nama database MySQL yang dipilih setelah memeriksa nama yang sudah digunakan.
6. Rekomendasi arsitektur dan struktur folder.
7. Kelayakan awal setiap model Machine Learning.
8. Risiko teknis, dependency, dan kebutuhan tambahan.
9. Urutan implementasi yang disesuaikan dengan hasil audit.

Setelah laporan awal tersedia, lanjutkan secara bertahap sesuai urutan pengerjaan. Jika informasi yang diperlukan belum tersedia, jelaskan secara spesifik apa yang kurang dan bagaimana memperolehnya. Jangan mengarang hasil pemeriksaan atau menganggap pekerjaan sudah selesai sebelum ada bukti implementasi dan pengujian.
