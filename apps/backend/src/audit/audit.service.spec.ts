import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service.js';
import { AUDIT_ACTIONS, AUDIT_META_ALLOWLIST } from './audit-actions.js';
import { runWithAuditContext } from './audit-context.js';
import type { PrismaService } from '../database/prisma.service.js';

/**
 * `AuditService.record` adalah SATU-SATUNYA pintu ke tabel `audit_logs`.
 *
 * Test di sini menguji mekanismenya secara langsung, tanpa HTTP dan tanpa
 * database sungguhan, karena tiga sifat yang diuji tidak bisa diamati dari luar:
 *
 * 1. **R-23** - `record` tidak boleh melempar. Kegagalan audit tidak boleh
 *    menggagalkan operasi bisnis.
 * 2. **Redaksi meta default-deny** - kunci yang tidak ada di allowlist per
 *    `action` DIBUANG, dan pembuangan itu berteriak lewat `Logger.warn`.
 *    Itulah yang membuat test e2e "sequence nyata tidak pernah memunculkan
 *    peringatan redaksi" tidak-vakum: begitu ada call site yang menambah
 *    `password` ke `meta`, peringatan muncul dan test gagal.
 * 3. **Kegagalan menulis bukan saluran kebocoran** - pesan error Prisma bisa
 *    memuat nilai yang dikirim, jadi ke log teknis hanya masuk NAMA error.
 */

interface CreateCall {
  data: Record<string, unknown>;
}

/** Prisma palsu yang mencatat payload `auditLogs.create`. */
function makeFakePrisma(behaviour?: { rejectWith?: Error }) {
  const calls: CreateCall[] = [];

  const prisma = {
    auditLogs: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        calls.push({ data });
        if (behaviour?.rejectWith) return Promise.reject(behaviour.rejectWith);
        return Promise.resolve({ id: 'audit-1' });
      },
    },
  } as unknown as PrismaService;

  return { prisma, calls };
}

/** Tangkap semua `Logger.warn` selama `fn` berjalan. */
async function captureWarnings<T>(
  fn: () => Promise<T>,
): Promise<{ result: T; warnings: string[] }> {
  const warnings: string[] = [];
  const spy = vi
    .spyOn(Logger.prototype, 'warn')
    .mockImplementation((...args: unknown[]) => {
      warnings.push(args.map((a) => (a instanceof Error ? a.name : String(a))).join(' '));
    });
  try {
    const result = await fn();
    return { result, warnings };
  } finally {
    spy.mockRestore();
  }
}

function makeService(prisma: PrismaService): AuditService {
  return new AuditService(prisma);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Penulisan dasar
// ---------------------------------------------------------------------------

describe('AuditService.record: menulis baris', () => {
  it('menulis actorId, storeId, action, entity, dan entityId apa adanya', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({
      actorId: 'U1',
      storeId: 'S1',
      action: AUDIT_ACTIONS.STORE_CREATED,
      entity: 'store',
      entityId: 'S1',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.data).toMatchObject({
      actorId: 'U1',
      storeId: 'S1',
      action: 'store.created',
      entity: 'store',
      entityId: 'S1',
    });
  });

  it('actorId, storeId, dan entityId kosong ditulis null', async () => {
    // Kolomnya nullable. Bentuk null eksplisit dipin supaya "tidak disebut"
    // tidak bisa berubah makna diam-diam.
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({ action: AUDIT_ACTIONS.INVITATION_PREVIEWED, entity: 'invitation' });

    expect(calls[0]!.data).toMatchObject({ actorId: null, storeId: null, entityId: null });
  });

  it('action dan entity dipotong ke panjang kolom', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({ action: 'a'.repeat(200), entity: 'e'.repeat(200) });

    expect(String(calls[0]!.data['action'])).toHaveLength(64);
    expect(String(calls[0]!.data['entity'])).toHaveLength(64);
  });

  it('ip dan userAgent diambil dari konteks request lalu dipotong sesuai kolom', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await runWithAuditContext({ ip: '1'.repeat(80), userAgent: 'U'.repeat(400) }, () =>
      audit.record({ action: 'x', entity: 'y' }),
    );

    expect(calls[0]!.data['ip']).toHaveLength(45);
    expect(calls[0]!.data['userAgent']).toHaveLength(255);
  });

  it('tanpa konteks request, ip dan userAgent tetap terisi (kolomnya NOT NULL)', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({ action: 'x', entity: 'y' });

    expect(calls[0]!.data['ip']).toBe('unknown');
    expect(calls[0]!.data['userAgent']).toBe('unknown');
  });
});

// ---------------------------------------------------------------------------
// Meta: allowlist per action, default-deny
// ---------------------------------------------------------------------------

describe('AuditService.record: meta memakai allowlist per action', () => {
  it('kunci yang ada di allowlist action itu diteruskan apa adanya', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({
      action: AUDIT_ACTIONS.STORE_UPDATED,
      entity: 'store',
      meta: { fields: ['name', 'city'] },
    });

    expect(calls[0]!.data['meta']).toEqual({ fields: ['name', 'city'] });
  });

  it('kunci di luar allowlist dibuang, dan pembuangannya berteriak', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    const { warnings } = await captureWarnings(() =>
      audit.record({
        action: AUDIT_ACTIONS.STORE_UPDATED,
        entity: 'store',
        // Meniru kesalahan yang paling mungkin terjadi: ada yang menyalin
        // seluruh DTO ke `meta`.
        meta: { fields: ['name'], password: 'rahasia-123' } as Record<string, unknown>,
      }),
    );

    const meta = calls[0]!.data['meta'] as Record<string, unknown>;
    expect(meta).toEqual({ fields: ['name'] });
    expect(meta).not.toHaveProperty('password');
    expect(JSON.stringify(calls)).not.toContain('rahasia-123');

    // Inilah SUARA yang membuat test e2e tidak-vakum.
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('password');
  });

  it('action yang tidak terdaftar membuang seluruh meta (default-deny)', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    const { warnings } = await captureWarnings(() =>
      audit.record({
        action: 'somba.itu.aja',
        entity: 'apa',
        meta: { email: 'a@b.c' },
      }),
    );

    expect(calls[0]!.data['meta']).toBeUndefined();
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('somba.itu.aja');
  });

  it('nilai objek, fungsi, dan array bersarang dibuang; array primitif diterima', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({
      action: AUDIT_ACTIONS.STORE_UPDATED,
      entity: 'store',
      meta: {
        fields: ['name'],
        // Bentuk yang tidak boleh pernah masuk JSON audit.
        dalam: { passwordHash: 'argon2' },
        fungsi: () => 1,
        tersarang: [{ a: 1 }],
      } as Record<string, unknown>,
    });

    const meta = calls[0]!.data['meta'] as Record<string, unknown>;
    expect(meta).toEqual({ fields: ['name'] });
  });

  it('meta kosong tidak menulis kolom meta sama sekali', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record({ action: AUDIT_ACTIONS.STORE_CREATED, entity: 'store', meta: {} });

    expect(calls[0]!.data).not.toHaveProperty('meta');
  });

  it('setiap action yang terdaftar punya allowlist meta yang eksplisit', async () => {
    // Yang membuat default-deny tidak berlaku diam-diam ke action baru:
    // menambah action tanpa menambah allowlist-nya tidak bisa lolos.
    for (const action of Object.values(AUDIT_ACTIONS)) {
      expect(Object.hasOwn(AUDIT_META_ALLOWLIST, action)).toBe(true);
    }
  });

  it('tidak ada kunci allowlist yang bernama seperti field rahasia', async () => {
    // Penjaga kedua terhadap allowlist itu sendiri. Kalau ada yang menambahkan
    // `password` ke allowlist, test ini gagal sebelum kebocoran terjadi.
    const forbidden = /password|token|secret|hash|credential|jwt/i;
    for (const [action, keys] of Object.entries(AUDIT_META_ALLOWLIST)) {
      for (const key of keys) {
        expect(`${action}.${key}`).not.toMatch(forbidden);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// R-23: record tidak boleh melempar
// ---------------------------------------------------------------------------

describe('AuditService.record: tidak pernah melempar (R-23)', () => {
  it('gagal menulis tidak melempar dan dicatat sebagai warn', async () => {
    const { prisma } = makeFakePrisma({ rejectWith: new Error('koneksi database mati') });
    const audit = makeService(prisma);

    const { warnings } = await captureWarnings(() =>
      audit.record({
        actorId: 'U1',
        action: AUDIT_ACTIONS.STORE_CREATED,
        entity: 'store',
      }),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(AUDIT_ACTIONS.STORE_CREATED);
  });

  it('pesan error yang memuat rahasia tidak ikut ditulis ke log teknis', async () => {
    // Prisma menyertakan nilai yang gagal disimpan di pesan error-nya. Kalau
    // pesan itu ikut dicatat, redaksi meta jadi tidak berarti: rahasianya bocor
    // lewat jalur lain.
    const { prisma } = makeFakePrisma({
      rejectWith: new Error('Gagal: password=rahasia-123 pada store S1'),
    });
    const audit = makeService(prisma);

    const { warnings } = await captureWarnings(() =>
      audit.record({ action: AUDIT_ACTIONS.AUTH_LOGIN, entity: 'user' }),
    );

    expect(warnings).toHaveLength(1);
    expect(warnings.join('\n')).not.toContain('rahasia-123');
    // Yang dicatat cukup untuk diagnosis: nama error dan aksi yang gagal.
    expect(warnings[0]).toContain('Error');
  });

  it('entry yang rusak total pun tidak melempar, dan alasannya disebut', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    const { warnings } = await captureWarnings(() =>
      audit.record(undefined as unknown as { action: string; entity: string }),
    );

    await expect(audit.record(undefined as unknown as { action: string; entity: string }))
      .resolves.toBeUndefined();

    // Pesannya harus menyebut APA yang salah, bukan cuma "gagal". Bug di call site
    // dan masalah infrastruktur menghasilkan pesan yang berbeda; kalau keduanya
    // memakai satu pesan, salah satunya selalu didiagnosis dengan tebakan.
    expect(warnings[0]).toContain('entri tidak valid');
    expect(warnings[0]).toContain('entry bukan objek');
    // Dan tidak ada penulisan ke database sama sekali - entri cacat tidak
    // boleh menghasilkan baris setengah jadi.
    expect(calls).toEqual([]);
  });

  it('entry dengan action atau entity kosong ditolak dengan alasan yang menyebut fieldnya', async () => {
    const { prisma, calls } = makeFakePrisma();
    const audit = makeService(prisma);

    const { warnings } = await captureWarnings(() =>
      audit.record({ action: '', entity: 'user' }),
    );
    expect(warnings[0]).toContain('action bukan string non-kosong');

    const second = await captureWarnings(() =>
      audit.record({ action: 'auth.login', entity: undefined as unknown as string }),
    );
    expect(second.warnings[0]).toContain('entity bukan string non-kosong');

    expect(calls).toEqual([]);
  });

  it('entri cacat dan database mati menghasilkan pesan yang BERBEDA', async () => {
    // Satu pesan untuk dua kegagalan berbeda berarti salah satunya selalu
    // didiagnosis dengan tebakan. Bug di pemanggil dan database mati butuh
    // tindakan yang berbeda dari siapa pun yang membaca log itu.
    const broken = makeService(makeFakePrisma().prisma);
    const down = makeService(
      makeFakePrisma({ rejectWith: new Error('koneksi mati') }).prisma,
    );

    const a = await captureWarnings(() => broken.record(undefined as unknown as never));
    const b = await captureWarnings(() => down.record({ action: 'auth.login', entity: 'user' }));

    expect(a.warnings[0]).toContain('entri tidak valid');
    expect(b.warnings[0]).toContain('Error');
    expect(a.warnings[0]).not.toBe(b.warnings[0]);
  });
});

// ---------------------------------------------------------------------------
// Penghitung kegagalan yang bertahan melewati restart
// ---------------------------------------------------------------------------

describe('AuditService: penghitung kegagalan audit', () => {
  it('bermula di nol dan tidak bergerak saat penulisan berhasil', async () => {
    const { prisma } = makeFakePrisma();
    const audit = makeService(prisma);

    expect(audit.failureCount).toBe(0);

    await audit.record({ action: AUDIT_ACTIONS.STORE_CREATED, entity: 'store' });
    await audit.record({ action: AUDIT_ACTIONS.AUTH_LOGIN, entity: 'user' });

    expect(audit.failureCount).toBe(0);
  });

  it('bertambah satu untuk setiap kegagalan penulisan, dan tidak pernah turun', async () => {
    // Kenaikan, bukan set: dua kegagalan berturut-turut harus bernilai 2. Kalau
    // ini hanya bernilai 1, angka 1 jadi tidak bisa dibedakan dari "baru saja
    // terjadi" - dan jumlahnya yang penting saat menangani insiden.
    const { prisma } = makeFakePrisma({ rejectWith: new Error('mati') });
    const audit = makeService(prisma);

    await audit.record({ action: AUDIT_ACTIONS.STORE_CREATED, entity: 'store' });
    expect(audit.failureCount).toBe(1);

    await audit.record({ action: AUDIT_ACTIONS.AUTH_LOGIN, entity: 'user' });
    expect(audit.failureCount).toBe(2);

    await audit.record({ action: AUDIT_ACTIONS.AUTH_LOGOUT, entity: 'user' });
    expect(audit.failureCount).toBe(3);
  });

  it('naik juga saat entry ditolak karena bentuknya salah', async () => {
    // Entri cacat berarti TIDAK ADA yang tercatat. Itu bentuk kegagalan yang
    // paling mudah hilang karena tidak ada error di database - jadi harus ikut
    // dihitung, bukan hanya kegagalan driver.
    const { prisma } = makeFakePrisma();
    const audit = makeService(prisma);

    await audit.record(undefined as unknown as { action: string; entity: string });
    expect(audit.failureCount).toBe(1);
  });

  it('TIDAK naik saat meta dibuang redaksi - penulisan tetap berhasil', async () => {
    // Pembuangan redaksi bukan kegagalan: barisnya tetap ditulis, hanya
    // isinya dipangkas. Menghitungnya akan membuat penghitung naik setiap kali
    // ada call site yang mencoba mengirim kunci tak terizinkan, dan itu akan
    // memburamkan sinyal yang seharusnya tajam.
    const { prisma } = makeFakePrisma();
    const audit = makeService(prisma);

    await captureWarnings(() =>
      audit.record({
        action: AUDIT_ACTIONS.STORE_UPDATED,
        entity: 'store',
        meta: { fields: ['name'], password: 'x' } as Record<string, unknown>,
      }),
    );

    expect(audit.failureCount).toBe(0);
  });

  it('penambahnya ada DI DALAM catch, sehingga tidak bisa terlewat olehcatch yang melempar', async () => {
    // Penghitung harus naik tepat di tempat gagalnya, bukan sesudahnya. Kalau
    // satu-satunya penambahnya berada setelah blok try/catch, maka catch yang
    // melempar akan melewatinya - dan justru kasus itulah yang paling perlu
    // terlihat.
    const { prisma } = makeFakePrisma({ rejectWith: new Error('mati') });
    const audit = makeService(prisma);

    await audit.record({ action: AUDIT_ACTIONS.STORE_CREATED, entity: 'store' });
    expect(audit.failureCount).toBe(1);
  });
});
