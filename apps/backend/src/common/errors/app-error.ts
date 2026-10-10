/**
 * Error domain-level yang dipetakan global oleh `AllExceptionsFilter`.
 *
 * Untuk `status < 500`, `code` dan `message` dikirim apa adanya ke client.
 * Untuk `status >= 500`, `AllExceptionsFilter` mengkolapsnya menjadi
 * `INTERNAL_ERROR` + pesan generik; `code`, `message`, dan `details` asli
 * hanya masuk ke log internal. Jadi jangan pernah menaruh host, port, kredensial,
 * atau nomor error database di dalam `message` 5xx dengan harapan sampai ke log
 * yang lebih berguna — log tetap menerimanya, tapi respons client tidak.
 */
export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown[];

  constructor(code: string, status: number, message: string, details?: unknown[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static unauthorized(
    message = 'Autentikasi diperlukan.',
    code = 'UNAUTHORIZED',
  ): AppError {
    return new AppError(code, 401, message);
  }

  static forbidden(
    message = 'Anda tidak punya akses ke sumber daya ini.',
    code = 'FORBIDDEN',
  ): AppError {
    return new AppError(code, 403, message);
  }

  static notFound(
    message = 'Data yang diminta tidak ditemukan.',
    code = 'NOT_FOUND',
  ): AppError {
    return new AppError(code, 404, message);
  }

  static conflict(code: string, message: string): AppError {
    return new AppError(code, 409, message);
  }

  static badRequest(
    code: string,
    message: string,
    details?: unknown[],
  ): AppError {
    return new AppError(code, 400, message, details);
  }
}