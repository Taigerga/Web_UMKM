/**
 * Error domain-level yang dipetakan global oleh `AllExceptionsFilter`.
 *
 * Pesan yang dipakai untuk `status >= 500` akan diganti filter menjadi teks
 * generik agar detail internal tidak bocor ke client.
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