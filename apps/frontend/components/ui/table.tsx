import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Tabel data generik. `columns` mendeskripsikan isi sel sehingga tabel di
 * setiap halaman punya struktur yang sama (header, body, border, padding).
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
  emptyState?: React.ReactNode;
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
  emptyState,
}: TableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-full border-collapse text-sm">
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
                  "px-3 py-2.5 text-xs font-semibold tracking-wide text-ink-muted uppercase",
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
              className="border-b border-line last:border-b-0"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    "px-3 py-3 align-middle text-ink",
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