import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/** Bentuk body sukses tunggal. */
export interface ApiResponse<T> {
  data: T;
}

/** Metadata paginasi yang selalu menyertai daftar. */
export interface PaginatedMeta {
  page: number;
  pageSize: number;
  total: number;
}

/** Bentuk body sukses berupa daftar. */
export interface PaginatedResult<T> {
  data: T[];
  meta: PaginatedMeta;
}

/** Bentuk body error yang dipakai seluruh aplikasi. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

/** Query paginasi default untuk seluruh endpoint daftar. */
export class PageQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}