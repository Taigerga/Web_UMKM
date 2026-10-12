import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiResponse } from '../common/dto/response.dto.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../common/types/prisma-enums.js';
import { PrismaService } from '../database/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';

/** Bentuk satu komponen yang dilaporkan `/health/details`. */
interface HealthComponent {
  name: string;
  status: 'up' | 'down';
  /** Waktu pemeriksaan; ISO-8601. */
  checkedAt: string;
}

/** Bentuk respons `/health/details`. */
interface HealthDetailsBody {
  status: 'ok' | 'degraded';
  timestamp: string;
  components: HealthComponent[];
  /**
   * Jumlah kegagalan penulisan `audit_logs` sejak proses berjalan.
   *
   * Angka polos, tanpa rincian. Yang perlu terlihat adalah "ada yang salah",
   * bukan apa yang salah: rincian apa pun di sini bisa jadi kanal kebocoran
   * lewat endpoint yang bukan untuk publik.
   *
   * `status` sengaja tidak ikut memantulkan kondisi ini. Endpoint ini menjawab
   * "apakah komponen sistem sehat", dan sistem yang sehat boleh punya audit
   * yang gagal menulis - membuat `status` berubah akan membuat monitoring
   * bersiklus hanya karena satu insert yang gagal, dan itu akan melatih orang
   * mengabaikannya.
   */
  auditFailures: number;
}

/**
 * Endpoint kesehatan.
 *
 * ## `@Public()` per handler, bukan per kelas
 *
 * `@Public()` ada di level kelas sejak Task 1 dan itu benar untuk `/health`:
 * load balancer dan uptime monitor tidak punya access token. `details`
 * berbeda - isinya jauh lebih informatif, jadi harus di balik `@Roles('ADMIN')`.
 *
 * Penandanya dipindah ke handler `check` supaya `details` tidak ikut terbuka.
 * Metadata dibaca `getAllAndOverride(handler, class)`, jadi penanda di kelas akan
 * menimpa apa pun di handler - persis jebakan yang sudah ditulis di
 * `AuthController`.
 *
 * ## GATE-T6-A
 *
 * `/health/details` terbuka publik sejak Task 1, dan ditutup di Task 6 ini:
 * 401 tanpa token, 403 untuk peran non-ADMIN, 200 untuk ADMIN.
 *
 * ## Apa yang boleh keluar dari `details`
 *
 * Hanya status komponen dan waktu database. Versi runtime, `process.env`,
 * konfigurasi, penggunaan memori, dan stack trace tidak muncul - bukan karena
 * disembunyikan oleh filter, tapi karena tidak pernah dimasukkan ke objek
 * respons. Filter global hanya mengubah 5xx; respons 200 dikirim apa adanya.
 *
 * Satu-satunya tambahan dari bentuk minimum itu adalah `auditFailures` - angka
 * polos tanpa rincian. Alasannya ada di `HealthDetailsBody`.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Liveness check. Sengaja tidak menyentuh database supaya endpoint tetap
   * hidup saat MySQL mati.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'Liveness check (tanpa akses database)' })
  @ApiOkResponse({
    schema: {
      example: { data: { status: 'ok', timestamp: '2026-01-01T00:00:00.000Z' } },
    },
  })
  check(): ApiResponse<{ status: string; timestamp: string }> {
    return { data: { status: 'ok', timestamp: new Date().toISOString() } };
  }

  /**
   * Status komponen sistem. ADMIN saja.
   *
   * Satu-satunya komponen adalah database, karena itu satu-satunya dependency
   * yang bisa gagal. Menambah komponen berarti menambah query ke setiap
   * pemanggilan, jadi komponen baru harus punya kegagalan yang mungkin terjadi
   * - bukan angka yang sekadar enak dilihat.
   *
   * Kegagalan database tidak dilempar sebagai error: endpoint ini menjawab "ada
   * yang tidak sehat", dan melempar 500 membuatnya tidak bisa melaporkan
   * apa pun. Yang dikembalikan tetap `200` dengan komponen `down`.
   */
  @Get('details')
  @ApiBearerAuth('bearer')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Status komponen sistem (khusus ADMIN)' })
  async details(): Promise<ApiResponse<HealthDetailsBody>> {
    const database = await this.checkDatabase();

    return {
      data: {
        status: database.status === 'up' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        components: [database],
        auditFailures: this.audit.failureCount,
      },
    };
  }

  /**
   * Satu query kecil ke database.
   *
   * `SELECT 1` sudah cukup membuktikan koneksi hidup dan pool berfungsi; query
   * yang lebih berat membuat endpoint health jadi beban sendiri tepat saat
   * database sedang bermasalah.
   *
   * Error ditangkap dan diterjemahkan jadi `down`. Pesan error aslinya tidak
   * ikut: isinya memuat host, port, dan kredensial, dan `details` tidak boleh
   * menjadi tempat bocornya. Filter global juga tidak berperan di sini karena
   * tidak ada error yang dilempar.
   */
  private async checkDatabase(): Promise<HealthComponent> {
    const checkedAt = new Date().toISOString();

    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { name: 'database', status: 'up', checkedAt };
    } catch {
      return { name: 'database', status: 'down', checkedAt };
    }
  }
}
