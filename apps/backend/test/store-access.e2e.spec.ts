import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/database/prisma.service.js';
import { StoreAccessService } from '../src/stores/store-access.service.js';
import { buildTestApp } from './utils/test-app.js';

/**
 * Test `StoreAccessService` secara langsung, tanpa lewat HTTP.
 *
 * Kenapa dipisah dari `test/idor.e2e.spec.ts`: `isOwner` adalah KESIMPULAN,
 * bukan sebuah route. Menempelkannya ke sebuah endpoint berarti menguji
 * `StoreScopeGuard`, bukan `isOwner` - persis jebakan yang ditemukan di review
 * untuk tes urutan guard R-17. Test ini memanggil instance service-nya langsung
 * supaya yang diuji benar-benar method-nya.
 *
 * `isOwner` ada karena aturan OWNER TERAKHIR di Task 5 bergantung padanya
 * (RF-2). Kontrak `boolean`-nya harus benar sebelum ada yang memakainya.
 */
let app: INestApplication;
let prisma: PrismaService;
let storeAccess: StoreAccessService;

async function resetDatabase(client: PrismaService): Promise<void> {
  await client.auditLogs.deleteMany({});
  await client.refreshTokens.deleteMany({});
  await client.storeInvites.deleteMany({});
  await client.storeMembers.deleteMany({});
  await client.stores.deleteMany({});
  await client.users.deleteMany({});
}

beforeAll(async () => {
  app = await buildTestApp();
  prisma = app.get(PrismaService);
  storeAccess = app.get(StoreAccessService);
});

afterAll(async () => {
  await resetDatabase(prisma);
  await app.close();
});

beforeEach(async () => {
  await resetDatabase(prisma);
});

async function makeUser(): Promise<string> {
  const user = await prisma.users.create({
    data: { email: `io-${randomUUID()}@test.local`, name: 'IO', passwordHash: 'x' },
  });
  return user.id;
}

async function makeStore(createdById: string, status: 'ACTIVE' | 'SUSPENDED' = 'ACTIVE') {
  return prisma.stores.create({
    data: { name: `Toko ${randomUUID().slice(0, 8)}`, createdById, status },
  });
}

async function addMember(storeId: string, userId: string, role: 'OWNER' | 'STAFF') {
  return prisma.storeMembers.create({ data: { storeId, userId, role } });
}

describe('StoreAccessService.isOwner', () => {
  it('OWNER -> true', async () => {
    const ownerId = await makeUser();
    const store = await makeStore(ownerId);
    await addMember(store.id, ownerId, 'OWNER');

    await expect(storeAccess.isOwner(ownerId, store.id)).resolves.toBe(true);
  });

  it('STAFF -> false, dan OWNER toko yang sama tetap true', async () => {
    const ownerId = await makeUser();
    const staffId = await makeUser();
    const store = await makeStore(ownerId);
    await addMember(store.id, ownerId, 'OWNER');
    await addMember(store.id, staffId, 'STAFF');

    // Dua membership di toko yang sama, jadi selisihnya murni soal peran - bukan
    // soal siapa yang pertama kali dibeli.
    await expect(storeAccess.isOwner(staffId, store.id)).resolves.toBe(false);
    await expect(storeAccess.isOwner(ownerId, store.id)).resolves.toBe(true);
  });

  it('bukan anggota -> false, bukan error', async () => {
    const ownerId = await makeUser();
    const strangerId = await makeUser();
    const store = await makeStore(ownerId);
    await addMember(store.id, ownerId, 'OWNER');

    // Tidak melempar: pemanggilnya adalah pertanyaan ("apakah ini owner
    // terakhir?"), bukan permintaan izin. `false` harus mencakup user yang
    // sama sekali bukan anggota - kalau `isOwner` melempar di sini, Task 5 akan
    // butuh try/catch di setiap pemanggilan.
    await expect(storeAccess.isOwner(strangerId, store.id)).resolves.toBe(false);
  });

  it('OWNER toko SUSPENDED -> true, sementara HAK AKSES tetap ditolak', async () => {
    const ownerId = await makeUser();
    const store = await makeStore(ownerId, 'SUSPENDED');
    await addMember(store.id, ownerId, 'OWNER');

    // Toko yang dinonaktifkan tetap punya owner, dan aturan owner terakhir
    // harus tetap bisa dijawab untuk toko itu. Kalau `isOwner` ikut melempar
    // `STORE_SUSPENDED`, Task 5 akan buntu persis di toko yang paling butuh
    // diperbaiki.
    await expect(storeAccess.isOwner(ownerId, store.id)).resolves.toBe(true);

    // Perbedaannya nyata: yang ditanyakan HAK AKSES memang tetap ditolak.
    await expect(storeAccess.assertAccess(ownerId, store.id)).rejects.toMatchObject({
      status: 403,
      code: 'STORE_SUSPENDED',
    });
  });

  it('toko yang tidak ada -> false, bukan error', async () => {
    const ownerId = await makeUser();
    await makeStore(ownerId);

    // `storeId` karangan tidak boleh membuat pemanggil crash; aturan owner
    // terakhir butuh jawaban yang bisa ditindaklanjuti, termasuk saat target
    // tokonya sudah tidak ada.
    await expect(storeAccess.isOwner(ownerId, 'toko-yang-tidak-pernah-ada')).resolves.toBe(
      false,
    );
  });

  it('OWNER satu toko BUKAN owner toko lain', async () => {
    // Kasus yang akan dipakai Task 5: user yang owns di satu toko tapi cuma
    // STAFF di toko lain. Kalau `isOwner` ternyata bekerja seperti oracle global
    // "pernah punya toko", aturan owner terakhir akan salah di mana-mana.
    const ownerId = await makeUser();
    const storeOwned = await makeStore(ownerId);
    const storeOther = await makeStore(ownerId);
    await addMember(storeOwned.id, ownerId, 'OWNER');
    await addMember(storeOther.id, ownerId, 'STAFF');

    await expect(storeAccess.isOwner(ownerId, storeOwned.id)).resolves.toBe(true);
    await expect(storeAccess.isOwner(ownerId, storeOther.id)).resolves.toBe(false);
  });
});