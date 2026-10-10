import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiResponse } from '../common/dto/response.dto.js';
import { Public } from '../common/decorators/public.decorator.js';

/**
 * Endpoint kesehatan.
 *
 * `@Public()` di level kelas karena `JwtAuthGuard` sekarang global: tanpa
 * penanda ini, load balancer dan uptime monitor akan mendapat 401.
 *
 * GATE-T6-A: `/health/details` masih publik dan harus dikunci `@Roles('ADMIN')`
 * di Task 6. Jangan dikerjakan di task lain.
 */
@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  /**
   * Liveness check. Sengaja tidak menyentuh database supaya endpoint tetap
   * hidup saat MySQL mati.
   */
  @Get()
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
   * Status komponen. `ADMIN`-only ditambahkan di task otorisasi (Task 6).
   * Tidak boleh membocorkan env, versi internal, atau stack trace.
   */
  @Get('details')
  @ApiOperation({ summary: 'Status komponen sistem (khusus ADMIN)' })
  details(): ApiResponse<{
    status: string;
    timestamp: string;
    components: unknown[];
  }> {
    return {
      data: {
        status: 'ok',
        timestamp: new Date().toISOString(),
        components: [],
      },
    };
  }
}