import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ApiResponse } from '../common/dto/response.dto.js';

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