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

import { listAdminUsers, setUserActive } from "@/lib/dashboard-data";
import type { AdminUser } from "@/lib/dashboard-data";
import { describeDataError } from "@/lib/dashboard-errors";

import { PageCapNote } from "./stores-panel";
import { toApiError, useApiResource } from "./use-api-resource";

/**
 * Tabel pengguna seluruh platform, khusus ADMIN.
 *
 * ## Kenapa 403 di sini adalah bukti, bukan bug
 *
 * `GET /admin/users` dijaga `@Roles(Role.ADMIN)`. Pegawai yang membuka
 * `/dashboard/admin/users` langsung lewat URL TIDAK akan diarahkan oleh
 * frontend - halaman ini akan mounted, memanggil backend, dan backend yang
 * menjawab 403 `FORBIDDEN_ROLE`. Itu persis yang R-39 minta: menu yang
 * disembunyikan cuma kerapian, penolakan ada di server.
 *
 * ## Kenapa status akun bisa diubah tapi peran platform tidak
 *
 * `PATCH /admin/users/:userId/status` hanya menerima `isActive`.
 * `UpdateUserStatusDto` tidak punya `role`, jadi frontend tidak punya jalan
 * untuk membuat admin baru atau menurunkan admin - dan tidak perlu
 * menyembunyikan kontrol yang memang tidak ada di endpoint.
 */
export function AdminUsersPanel() {
  const load = React.useCallback(() => listAdminUsers(), []);
  const users = useApiResource(load);

  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  async function toggleActive(user: AdminUser): Promise<void> {
    if (pendingId !== null) return;
    setPendingId(user.id);
    setActionError(null);
    try {
      await setUserActive(user.id, !user.isActive);
      // Daftar dimuat ulang, bukan ditambal lokal: backend juga mencabut
      // seluruh refresh token user itu, dan isi tabel bisa saja berubah
      // karena alasan lain di detik yang sama.
      users.reload();
    } catch (caught) {
      const copy = describeDataError(toApiError(caught));
      setActionError([copy.title, copy.description].filter(Boolean).join(" "));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {actionError !== null ? (
        <p role="alert" className="rounded-lg border border-critical/30 bg-critical-wash px-4 py-3 text-sm text-critical">
          {actionError}
        </p>
      ) : null}

      {users.status === "loading" ? (
        <TableSkeleton rows={5} columns={5} />
      ) : users.status === "error" && users.error !== null ? (
        <ErrorState
          title={describeDataError(users.error).title}
          description={describeDataError(users.error).description}
          action={
            <Button variant="outline" onClick={users.reload}>
              Coba lagi
            </Button>
          }
        />
      ) : users.data !== null && users.data.length > 0 ? (
        <>
          <Table<AdminUser>
            minWidth="min-w-[42rem]"
            columns={[
              { key: "name", header: "Nama", render: (row) => row.name },
              { key: "email", header: "Email", render: (row) => row.email },
              {
                key: "role",
                header: "Peran platform",
                render: (row) => <RoleBadge role={row.role} />,
              },
              {
                key: "status",
                header: "Status",
                render: (row) => (
                  <Badge variant={row.isActive ? "positive" : "neutral"} size="sm">
                    {row.isActive ? "Aktif" : "Nonaktif"}
                  </Badge>
                ),
              },
              {
                key: "actions",
                header: "Aksi",
                align: "right",
                render: (row) => (
                  <Button
                    variant={row.isActive ? "outline" : "primary"}
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() => {
                      void toggleActive(row);
                    }}
                  >
                    {pendingId === row.id
                      ? "Menyimpan..."
                      : row.isActive
                        ? "Nonaktifkan"
                        : "Aktifkan"}
                  </Button>
                ),
              },
            ]}
            rows={users.data}
            rowKey={(row) => row.id}
            caption="Menonaktifkan akun juga mencabut seluruh refresh token-nya. Access token yang sudah terbit tetap berlaku sampai kedaluwarsa - itu batas yang hanya bisa ditutup dengan daftar penolakan token di backend."
          />
          <PageCapNote shown={users.data.length} noun="pengguna" />
        </>
      ) : (
        <EmptyState
          title="Belum ada pengguna"
          description="Daftar ini terisi otomatis dari pendaftaran. Kalau masih kosong, berarti belum ada yang mendaftar lewat aplikasi ini."
        />
      )}
    </div>
  );
}

/**
 * Badge peran platform.
 *
 * Label ditulis di sini, satu tempat, supaya daftar pengguna dan daftar toko
 * tidak punya dua kamus peran yang bisa berbeda. Peran yang tidak dikenal
 * ditampilkan apa adanya - bukan dipaksa jadi salah satu dari dua label itu.
 */
function RoleBadge({ role }: { role: string }) {
  if (role === "ADMIN") {
    return (
      <Badge variant="forest" size="sm">
        Admin
      </Badge>
    );
  }
  if (role === "OWNER") {
    return (
      <Badge variant="accent" size="sm">
        Pemilik
      </Badge>
    );
  }
  return (
    <Badge variant="neutral" size="sm">
      {role}
    </Badge>
  );
}