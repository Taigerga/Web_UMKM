"use client";

import * as React from "react";

import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Table,
  TableSkeleton,
} from "@/components/ui";

import { listAdminStores } from "@/lib/dashboard-data";
import type { AdminStore } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";

import { PageCapNote } from "./stores-panel";
import { useApiResource } from "./use-api-resource";

/**
 * Daftar toko seluruh platform, khusus ADMIN.
 *
 * ## Apa yang TIDAK ada di halaman ini
 *
 * Tidak ada omzet, tidak ada jumlah produk, tidak ada transaksi. Endpoint
 * `GET /admin/stores` memang directory platform: `@Roles('ADMIN')` tanpa
 * `@StoreAccess()`, jadi admin melihat NAMA toko tanpa menjadi anggota-nya
 * (R-18). Menampilkan metrik penjualan di sini berarti membuka data bisnis
 * UMKM orang kepada siapa pun yang punya peran admin - dan itu justru yang
 * R-18 larang.
 *
 * Karena itu daftar ini hanya direktori: nama, kota, zona waktu, status, dan
 * siapa yang membuatnya.
 */
export function AdminStoresPanel() {
  const load = React.useCallback(() => listAdminStores(), []);
  const stores = useApiResource(load);

  return (
    <div className="flex flex-col gap-4">
      {stores.status === "loading" ? (
        <TableSkeleton rows={5} columns={4} />
      ) : stores.status === "error" && stores.error !== null ? (
        <ErrorState
          title={describeDataError(stores.error).title}
          description={describeDataError(stores.error).description}
          action={
            <Button variant="outline" onClick={stores.reload}>
              Coba lagi
            </Button>
          }
        />
      ) : stores.data !== null && stores.data.length > 0 ? (
        <>
          <Table<AdminStore>
            minWidth="min-w-[38rem]"
            columns={[
              { key: "name", header: "Nama toko", render: (row) => row.name },
              {
                key: "city",
                header: "Kota",
                render: (row) => (row.city === null || row.city.length === 0 ? "-" : row.city),
              },
              {
                key: "timezone",
                header: "Zona waktu",
                render: (row) => row.timezone,
              },
              {
                key: "status",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.status === "ACTIVE" ? "positive" : "critical"} size="sm">
                    {row.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                  </Badge>
                ),
              },
              {
                key: "createdAt",
                header: "Dibuat",
                render: (row) => (
                  <time dateTime={row.createdAt}>
                    {new Date(row.createdAt).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </time>
                ),
              },
            ]}
            rows={stores.data}
            rowKey={(row) => row.id}
            caption="Direktori platform, bukan data penjualan. Admin belum tentu anggota toko ini, jadi halaman ini sengaja tidak menampilkan omzet, produk, atau transaksi apa pun."
          />
          <PageCapNote shown={stores.data.length} noun="toko" />
        </>
      ) : (
        <EmptyState
          title="Belum ada toko di platform"
          description="Toko muncul di sini setelah pemiliknya membuatkannya lewat aplikasi. Daftar ini hanya direktori: nama dan status, tanpa data penjualan siapa pun."
        />
      )}
    </div>
  );
}