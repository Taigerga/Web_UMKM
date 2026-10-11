import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AppError } from '../errors/app-error.js';
import type { ApiErrorBody } from '../dto/response.dto.js';

/**
 * Pesan default per status. Dipakai kalau `HttpException` tidak membawa kode
 * aplikasi sendiri, sehingga pesan dari framework (yang bisa memuat path/method)
 * tidak pernah bocor apa adanya ke client.
 */
const DEFAULT_MESSAGES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Permintaan tidak valid.',
  [HttpStatus.UNAUTHORIZED]: 'Autentikasi diperlukan.',
  [HttpStatus.FORBIDDEN]: 'Anda tidak punya akses ke sumber daya ini.',
  [HttpStatus.NOT_FOUND]: 'Data yang diminta tidak ditemukan.',
  [HttpStatus.CONFLICT]: 'Permintaan bertentangan dengan data yang ada.',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Permintaan terlalu besar.',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Permintaan tidak dapat diproses.',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Terlalu banyak permintaan. Coba lagi nanti.',
};

/** Kode error default per status untuk `HttpException` tanpa kode aplikasi. */
const DEFAULT_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'THROTTLED',
};

/** Pesan generik untuk semua kegagalan internal. */
const GENERIC_INTERNAL_MESSAGE =
  'Terjadi kesalahan pada server. Silakan coba lagi.';

/**
 * Placeholder yang menggantikan segmen URL yang berisi rahasia.
 *
 * Cukup panjang untuk jelas bukan nilai asli, dan tidak memuat karakter yang
 * bisa disamarkan sebagai ID.
 */
const REDACTED = '[REDACTED]';

/**
 * Sensor token undangan pada URL sebelum URL itu masuk ke log internal.
 *
 * ## Kenapa ini perlu
 *
 * Task 5 menaruh kredensial setara-bearer di dalam PATH URL, pada dua route:
 * `GET /invitations/:token` (publik) dan `POST /invitations/:token/accept`.
 * Tanpa sensor, setiap 5xx yang tidak terpetakan di salah satu route itu
 * menulis token mentah ke log - dan log 5xx adalah tempat yang paling dibaca
 * orang saat menelusuri insiden, yang justru observational paling mungkin
 * disalin keluar.
 *
 * ## Cakupannya sempit, dan disengaja
 *
 * Hanya segmen yang menyusul `/invitations/`. Route lain tidak berubah sama
 * sekali: baris log untuk `POST /auth/login` tetap memuat path lengkapnya,
 * karena URL lain tidak memuat rahasia. Melemahkan seluruh baris log demi
 * menyelesaikan satu masalah akan menghapus kemampuan menelusuri insiden di
 * semua endpoint lain - harga yang jauh lebih besar dari yang dicegah.
 *
 * Query string ikut mengikuti segmen itu karena `request.url` tidak
 * memisahkan keduanya.
 *
 * @param rawUrl `request.url` apa adanya
 * @returns URL dengan segmen token undangan diganti `[REDACTED]`
 */
export function redactInvitationToken(rawUrl: string): string {
  return rawUrl.replace(
    /(\/invitations\/)([^/?#]+)/g,
    (_match, prefix: string, _token: string) => `${prefix}${REDACTED}`,
  );
}

interface MappedError {
  status: number;
  code: string;
  message: string;
  details?: unknown[];
}

/**
 * Deteksi `PrismaClientKnownRequestError` secara struktural.
 *
 * Sengaja tanpa import runtime dari `@prisma/client`: pada Prisma 7 kelas error
 * hanya tersedia dari path hasil `prisma generate`, sehingga filter ini akan
 * gagal diimpor sebelum client di-generate.
 */
function getPrismaKnownErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const candidate = error as {
    name?: unknown;
    constructor?: { name?: unknown };
    code?: unknown;
  };
  const name =
    typeof candidate.name === 'string'
      ? candidate.name
      : typeof candidate.constructor?.name === 'string'
        ? candidate.constructor.name
        : undefined;
  if (name !== 'PrismaClientKnownRequestError') return undefined;
  return typeof candidate.code === 'string' ? candidate.code : undefined;
}

function mapPrismaKnownError(code: string): MappedError {
  switch (code) {
    case 'P2002':
      return {
        status: HttpStatus.CONFLICT,
        code: 'DUPLICATE',
        message: 'Data duplikat melanggar constraint unik.',
      };
    case 'P2025':
      return {
        status: HttpStatus.NOT_FOUND,
        code: 'NOT_FOUND',
        message: 'Data yang diminta tidak ditemukan.',
      };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        code: 'FK_VIOLATION',
        message: 'Relasi data tidak valid.',
      };
    default:
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        code: 'INTERNAL_ERROR',
        message: GENERIC_INTERNAL_MESSAGE,
      };
  }
}

/**
 * Bentuk payload `HttpException`.
 *
 * `ValidationPipe` mengembalikan `message` sebagai array of string (satu entry
 * per aturan yang gagal). Array itu tidak boleh jadi `message` top-level, tapi
 * juga tidak boleh dibuang — frontend butuh detail per-field untuk merender
 * pesan form. Jadi array dipetakan ke `details`, sementara `message`
 * top-level dibiarkan generik oleh pemanggil.
 */
function extractHttpExceptionPayload(response: unknown): {
  code?: string;
  message?: string;
  details?: unknown[];
} {
  if (typeof response === 'string') {
    return { message: response };
  }
  if (typeof response !== 'object' || response === null) {
    return {};
  }
  const payload = response as {
    code?: unknown;
    message?: unknown;
    error?: unknown;
  };
  const code = typeof payload.code === 'string' ? payload.code : undefined;

  if (Array.isArray(payload.message)) {
    const details = payload.message.filter(
      (item): item is string => typeof item === 'string',
    );
    return { code, details: details.length > 0 ? details : undefined };
  }

  const message =
    typeof payload.message === 'string'
      ? payload.message
      : typeof payload.error === 'string'
        ? payload.error
        : undefined;
  return { code, message };
}

function mapException(exception: unknown): MappedError {
  if (exception instanceof AppError) {
    return {
      status: exception.status,
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  const prismaCode = getPrismaKnownErrorCode(exception);
  if (prismaCode) {
    return mapPrismaKnownError(prismaCode);
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const payload = extractHttpExceptionPayload(exception.getResponse());
    const code = payload.code ?? DEFAULT_CODES[status] ?? 'HTTP_ERROR';
    const message = payload.code
      ? (payload.message ?? DEFAULT_MESSAGES[status] ?? 'Permintaan gagal.')
      : (DEFAULT_MESSAGES[status] ?? 'Permintaan gagal.');
    return { status, code, message, details: payload.details };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_ERROR',
    message: GENERIC_INTERNAL_MESSAGE,
  };
}

/**
 * Kolaps semua error 5xx menjadi kontrak yang sama: `INTERNAL_ERROR` + pesan
 * generik.
 *
 * Ini satu-satunya choke point untuk 5xx, sehingga cabang mana pun yang
 * memetakan 5xx — `AppError`, `HttpException`, Prisma, atau exception tak
 * dikenal — tidak bisa mengirim kode dan pesan aslinya ke client.
 */
function toClientSafeError(mapped: MappedError): MappedError {
  if (mapped.status < HttpStatus.INTERNAL_SERVER_ERROR) {
    return mapped;
  }
  return {
    status: mapped.status,
    code: 'INTERNAL_ERROR',
    message: GENERIC_INTERNAL_MESSAGE,
  };
}

/**
 * Filter global: semua exception dipetakan ke envelope
 * `{ error: { code, message, details? } }`.
 *
 * Stack trace, nomor error Prisma, dan detail internal 5xx hanya ditulis ke log
 * internal — tidak pernah masuk response.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const mapped = mapException(exception);

    // Detail internal hanya boleh masuk ke log, tidak pernah ke response.
    // Dicatat dengan kode & pesan ASLI, sebelum dikolaps untuk client.
    if (mapped.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // URL disensor DULU: token undangan adalah kredensial setara-bearer dan
      // tidak boleh muncul di log meski hanya untuk 5xx (lihat
      // `redactInvitationToken`).
      this.logger.error(
        `${request.method} ${redactInvitationToken(request.url)} -> ${mapped.status} ${mapped.code}: ${mapped.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const safe = toClientSafeError(mapped);
    const body: ApiErrorBody = {
      error: {
        code: safe.code,
        message: safe.message,
        ...(safe.details && safe.details.length > 0
          ? { details: safe.details }
          : {}),
      },
    };

    response.status(safe.status).json(body);
  }
}