import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Tabel data generik. `columns` mendeskripsikan isi sel sehingga tabel di
 * setiap halaman punya struktur yang sama (header, body, border, padding).
 *
 * `minWidth` Lebar minimum tabel (mis. `min-w-[26rem]`). Tabel dengan kolom
 * banyak butuh ruang lebih dari viewport di layar sempit, jadi lebarnya
 * dibatasi minimum dan tabel digulir di dalam wadahnya sendiri lewat
 * `overflow-x-auto` — halaman tidak pernah ikut tergulir ke samping.
 * Pakai prop ini, jangan menulis `min-w-[...]` di pemanggil: itulah yang
 * membuat gaya tabel bercabang.
 */
export type TableColumn<T> = {
  key: string;
  header: React.ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  cellClassName?: string;
  render: (row: T, index: number) => React.ReactNode;
};

export type TableProps<T> = {
  columns: Array<TableColumn<T>>;
  rows: readonly T[];
  rowKey: (row: T, index: number) => string;
  caption?: React.ReactNode;
  className?: string;
  /** Lebar minimum tabel. Kosongkan kalau tabelmu muat di layar sempit. */
  minWidth?: string;
  emptyState?: React.ReactNode;
  /**
   * Kelas tambahan per baris (fungsi murni dari baris + indeks). Dipakai
   * misalnya oleh landing untuk animasi stagger buku kas; default-nya tidak
   * mengubah apa pun.
   */
  rowClassName?: (row: T, index: number) => string;
};

const alignClass = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const;

export function Table<T>({
  columns,
  rows,
  rowKey,
  caption,
  className,
  minWidth,
  emptyState,
  rowClassName,
}: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className={cn("w-full border-collapse text-sm", minWidth)}>
        {caption ? (
          <caption className="pb-3 text-left text-xs text-ink-muted">{caption}</caption>
        ) : null}
        <thead>
          <tr className="border-b border-line-strong">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  "px-4 py-3 text-xs font-medium text-ink-muted",
                  alignClass[column.align ?? "left"],
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className={cn(
                "border-b border-line last:border-b-0",
                rowClassName?.(row, index),
              )}
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-4 py-3 align-middle text-ink",
                    alignClass[column.align ?? "left"],
                    column.cellClassName,
                  )}
                >
                  {column.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}