# Matriks Otorisasi — BisnisInsight Fase 1

Dokumen ini menerjemahkan tabel di spec §6.4 menjadi sesuatu yang bisa
diverifikasi: setiap baris di sini ditunjuk ke mekanisme yang menjaganya di kode,
supaya "kebijaksanaan" bisa ditantang dengan test, bukan hanya dengan pembacaan.

Kolom **Dijaga oleh** adalah bagian yang ditambahkan terhadap spec. Spec
menyatakan *apa* yang boleh; dokumen ini menyatakan *di mana* itu ditegakkan.

---

## Tabel spec §6.4, apa adanya

| Aksi | ADMIN | OWNER | STAFF |
|---|---|---|---|
| Daftar / login | Ya | Ya | Ya (via undangan) |
| Buat toko | Tidak | Ya | Tidak |
| Lihat toko | Semua | Miliknya | Yang ditugaskan |
| Undang pegawai | Tidak | Miliknya | Tidak |
| Ubah peran / cabut akses | Bust platform | Miliknya | Tidak |
| List user & toko (platform) | Ya | Tidak | Tidak |
| Status service | Ya | Tidak | Tidak |

> **Staff tidak bisa mendaftar untuk masuk ke toko.** Registrasi selalu
> menghasilkan OWNER tanpa toko; akses toko hanya lewat undangan atau pembuatan
> toko sendiri.

---

## Versi yang bisa ditelusuri ke kode

Kolom "Endpoint" menambahkan route nyata dari Phase 1 spec §6.5. Kotak ✅/❌
menyatakan hasil yang SEBENARNYA, bukan yang seharusnya. Setiap sel yang tidak
sesuai spec ditandai dan dijelaskan di bagian "Sel yang menyimpang".

| Aksi | Endpoint | ADMIN | OWNER | STAFF | Dijaga oleh |
|---|---|---|---|---|---|
| Daftar | `POST /auth/register` | ✅ | ✅ | ✅ | `@Public()`. Role ditulis literal `OWNER` di `AuthService.register`; `RegisterDto` tidak punya field `role` dan `ValidationPipe` memakai `forbidNonWhitelisted` |
| Login | `POST /auth/login` | ✅ | ✅ | ✅ | `@Public()` |
| Refresh | `POST /auth/refresh` | ✅ | ✅ | ✅ | `@Public()` + `AuthService.refresh` memeriksa `isActive` dan `lockedUntil` lagi |
| Keluar | `POST /auth/logout` | ✅ | ✅ | ✅ | `@Public()`, idempoten |
| Lihat toko milik sendiri | `GET /stores` | ✅¹ | ✅ | ✅ | `JwtAuthGuard`; data berasal dari `StoreAccessService.listAccessible`, bukan dari parameter |
| Buat toko | `POST /stores` | ❌ | ✅ | ❌ | `@Roles(OWNER)` — peran PLATFORM dari token |
| Lihat detail toko | `GET /stores/:storeId` | ✅¹ | ✅ | ✅ | `@StoreAccess()` + `assertAccess` |
| Ubah nama/kota toko | `PATCH /stores/:storeId` | ❌² | ✅ | ❌ | `@StoreAccess(OWNER)` |
| Lihat anggota toko | `GET /stores/:storeId/members` | ✅¹ | ✅ | ✅ | `@StoreAccess()` + `tenantModel('storeMembers', storeId)` |
| Undang pegawai | `POST /stores/:storeId/invitations` | ❌² | ✅ | ❌ | `@StoreAccess(OWNER)` |
| Ubah peran anggota | `PATCH /stores/:storeId/members/:userId` | ❌² | ✅ | ❌ | `@StoreAccess(OWNER)` + aturan owner terakhir (`LAST_OWNER`, 409) |
| Cabut anggota | `DELETE /stores/:storeId/members/:userId` | ❌² | ✅ | ❌ | `@StoreAccess(OWNER)` + aturan owner terakhir |
| Lihat undangan (publik) | `GET /invitations/:token` | ✅ | ✅ | ✅ | `@Public()`; aman karena tokennya 256 bit acak dan yang tersimpan hanya digest-nya |
| Terima undangan | `POST /invitations/:token/accept` | ✅ | ✅ | ✅ | butuh JWT; email akun harus cocok dengan email undangan |
| Profil diri | `GET /users/me`, `PATCH /users/me` | ✅ | ✅ | ✅ | `JwtAuthGuard`; `userId` selalu dari token, tidak pernah dari body |
| Ganti password | `POST /users/me/password` | ✅ | ✅ | ✅ | `JwtAuthGuard` + verifikasi password lama |
| List user platform | `GET /admin/users` | ✅ | ❌ | ❌ | `@Roles(ADMIN)` |
| Ubah status akun | `PATCH /admin/users/:userId/status` | ✅ | ❌ | ❌ | `@Roles(ADMIN)` |
| List toko platform | `GET /admin/stores` | ✅ | ❌ | ❌ | `@Roles(ADMIN)` |
| Status service (liveness) | `GET /health` | ✅ | ✅ | ✅ | `@Public()` — load balancer tidak punya token |
| Status komponen | `GET /health/details` | ✅ | ❌ | ❌ | `@Roles(ADMIN)`, `@Public()` hanya di handler `check` |

¹ **ADMIN tetap harus jadi anggota.** Lihat R-18 di bawah.
² **Admin tidak bisa menulis lewat jalur toko.** `@Roles(ADMIN)` tidak dipasang
  di route bertanda `@StoreAccess()`, jadi `RolesGuard` dan `StoreScopeGuard`
  menolak lebih dulu.

---

## Dua hal yang perlu dibaca sebelum memakai tabel ini

### 1. "Semua" pada kolom ADMIN untuk data toko berarti: sebagai anggota

`ADMIN` adalah peran platform. Ia **tidak** memberi akses ke data bisnis toko
orang lain. Setiap route bertanda `@StoreAccess()` tetap memerlukan baris nyata
di `store_members`, termasuk untuk `ADMIN`.

Kalau ini longgar, satu akun admin yang bocor berarti seluruh data semua UMKM,
dan "least privilege" hanya jadi hiasan. Konsekuensinya: `ADMIN` yang juga
anggota toko punya akses biasa sebagai anggota, dan hanya bisa masuk ke
`/admin/*` lewat `@Roles('ADMIN')`.

Test: `test/idor.e2e.spec.ts` — "ADMIN platform bukan member toko tetap 403",
dan `test/admin.e2e.spec.ts` — "admin yang juga anggota toko tetap perlu
keanggotaan untuk data bisnisnya (R-18)".

### 2. "Bust platform" pada kolom ADMIN untuk ubah peran anggota

`ADMIN` **tidak** bisa mengubah peran keanggotaan toko. Dia bisa mengelola akun
(`PATCH /admin/users/:userId/status`) dan melihat directory platform, tetapi
manage keanggotaan tetap milik OWNER toko tersebut. Ini keputusan sadar:
`PATCH /admin/users/:userId/status` hanya menerima `isActive`, dan `role` tidak
pernah ada di body DTO-nya.

---

## Rantai guard (R-17)

Urutan di `src/app.module.ts` adalah urutan eksekusi, dan tidak boleh diacak:

| # | Guard | Menjawab | Shaft |
|---|---|---|---|
| 1 | `JwtAuthGuard` | Siapa? | Route `@Public()` dilewati |
| 2 | `RolesGuard` | Peran platform? | Route tanpa `@Roles()` lolos |
| 3 | `StoreScopeGuard` | Keanggotaan toko? | Route tanpa `@StoreAccess()` lolos |

Urutannya bukan preferensi. Tanpa #1, dua guard berikutnya tidak punya
`req.user` untuk diperiksa. #2 murah dan menyaring yang memang tidak boleh
masuk area admin. #3 satu query database, jadi paling mahal dan tidak boleh
jalan untuk request yang sudah gugur di #2.

Tiga guard dideklarasikan di `AppModule`, bukan tersebar di beberapa module:
`APP_GUARD` yang tersebar menghasilkan urutan yang bergantung pada urutan pemindaian
modul.

**Kenapa #2 dan #3 default-lolos, bukan default-tolak.** Tidak semua route punya
batas peran platform atau batas tenant. Memaksa setiap controller mengingat
`@Roles()` adalah cara pasti lupa di salah satunya. Route tanpa `@Roles()`
berarti "semua user terautentikasi boleh" — itu terlihat sebagai keputusan, bukan
kelalaian. Yang menutup data tenant tetap `StoreScopeGuard` dan
`assertAccess`.

---

## Mekanisme specifics

| Yang dijaga | Di mana | Test |
|---|---|---|
| `@Roles()` | `RolesGuard`, `src/common/guards/roles.guard.ts` | `test/idor.e2e.spec.ts` |
| `@StoreAccess()` | `StoreScopeGuard`, `src/stores/guards/store-scope.guard.ts` | `test/store-access.e2e.spec.ts` |
| Keanggotaan + status toko + peran minimum | `StoreAccessService.assertAccess` | `test/stores.e2e.spec.ts` (lapisan service, tanpa HTTP) |
| Isolasi baris tenant | `PrismaService.tenantModel` + `withTenantScope` | `test/database.e2e.spec.ts` |
| Redaksi URL token undangan di log 5xx | `redactInvitationToken`, `all-exceptions.filter.ts` | `test/stores.e2e.spec.ts` |
| Tidak ada `passwordHash` / token di respons | Bentuk `PublicUser` ditulis eksplisit, bukan "sebutkan semua kecuali" | `test/auth.e2e.spec.ts` |
| Tidak ada `passwordHash` / token di `audit_logs` | `AuditService.sanitizeMeta` + allowlist per `action` | `test/audit.e2e.spec.ts` |
| Kegagalan audit tidak menggagalkan operasi bisnis | `AuditService.record` tidak melempar (R-23) | `test/audit.e2e.spec.ts` |

### Dua lapis untuk setiap operasi tenant

Setiap route yang menyentuh satu toko punya **dua** lapis, bukan satu:

1. `@StoreAccess()` di controller — pemeriksaan pertama, yang membuat request
   HTTP cepat ditolak.
2. `assertAccess` di `StoresService` — pemeriksaan kedua, yang berlaku juga
   untuk pemanggil non-HTTP (task terjadwal, modul lain).

Tanpa lapis kedua, aturan "toko suspended memblokir baca dan tulis" hanya berlaku
untuk jalur HTTP. Test "toko SUSPENDED memblokir baca dan tulis di layer service"
memanggil `StoresService` langsung, tanpa guard sama sekali — kalau pemeriksaan
hanya ada di guard, test itu lolos.

### Jejak audit

`audit_logs` mencatat **aktivitas pengguna**, bukan kondisi sistem. 5xx masuk ke
log teknis, bukan ke `audit_logs`: tabel audit dibaca owner toko, dan diagnosis
platform bukan miliknya. Test "error 5xx tidak menulis apa pun ke audit_logs"
menjaga pemisahan itu.

`storeId` di `audit_logs` sengaja **tanpa foreign key** supaya jejaknya tetap
terbaca setelah tokonya dihapus.

---

## Sel yang menyimpang dari spec

Tidak ada. Tabel di atas menuliskan hasil yang diukur, dan setiap sel yang
menyimpang akan ditandai di sini beserta alasannya.

Satu hal yang **tidak** ada di spec tapi tetap ada di kode dan dicatat di sini:
`DELETE /stores/:storeId` (hapus toko) tidak pernah ada. Spec tidak menyebutnya,
`stores` tidak punya `soft delete`, dan endpoint yang bisa menghapus seluruh
riwayat anggota sebuah UMKM tanpa jejak adalah kapabilitas yang harus diminta
secara sadar. Test "R-19: penghapusan toko tetap tidak ada" memanggil route itu
dan mengharapkan 404.
