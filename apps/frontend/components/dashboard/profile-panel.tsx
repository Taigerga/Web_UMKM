"use client";

import * as React from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Table,
  TableSkeleton,
} from "@/components/ui";

import { describeDataError } from "@/lib/dashboard-errors";

import { useSession } from "./session-provider";

/**
 * Profil akun yang sedang login.
 *
 * ## Kenapa ini hanya baca
 *
 * `GET /auth/me` adalah satu-satunya endpoint profil di backend, dan ia tidak
 * punya pasangan untuk menulis. Jadi tidak ada form ubah nama, tidak ada
 * tombol ganti password - tombol yang terlihat bisa diklik tapi selalu gagal
 * adalah lebih buruk daripada tidak ada tombolnya sama sekali.
 *
 * Yang ditampilkan persis apa yang dikembalikan `me()`: identitas, peran
 * platform, dan toko yang boleh diakses. Daftar toko itu dibaca dari server,
 * jadi ini bukan ringkasan frontend dari cache browser.
 */
export function ProfilePanel() {
  const { status, profile, error, reload } = useSession();

  if (status === "loading") {
    return <TableSkeleton rows={2} columns={2} />;
  }

  if (profile === null) {
    return (
      <ErrorState
        title={error === null ? "Profil tidak bisa dimuat." : describeDataError(error).title}
        description={
          error === null
            ? "Backend tidak mengembalikan profil untuk sesi ini."
            : describeDataError(error).description
        }
        action={
          <Button variant="outline" onClick={reload}>
            Coba lagi
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Akun Anda</CardTitle>
          <CardDescription>
            Data ini berasal dari `GET /auth/me` dan hanya bisa dibaca. Backend
            belum punya endpoint untuk mengubahnya.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama" value={profile.name} />
            <Field label="Email" value={profile.email} />
            <div className="flex flex-col gap-1">
              <dt className="text-sm text-ink-muted">Peran platform</dt>
              <dd>
                <Badge variant={profile.role === "ADMIN" ? "navy" : "accent"} size="sm">
                  {profile.role}
                </Badge>
              </dd>
            </div>
            <Field label="ID akun" value={profile.id} mono />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Toko yang bisa Anda akses</CardTitle>
          <CardDescription>
            Daftar ini ditentukan keanggotaan toko Anda di server. Akun admin
            tidak otomatis mendapat akses ke toko siapa pun.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profile.stores.length > 0 ? (
            <Table<{ id: string; name: string; role: string; status: string }>
              columns={[
                { key: "name", header: "Toko", render: (row) => row.name },
                {
                  key: "role",
                  header: "Peran Anda di toko",
                  render: (row) => (
                    <Badge
                      variant={row.role === "OWNER" ? "accent" : "neutral"}
                      size="sm"
                    >
                      {row.role === "OWNER" ? "Pemilik" : "Pegawai"}
                    </Badge>
                  ),
                },
                {
                  key: "status",
                  header: "Status toko",
                  render: (row) => (
                    <Badge variant={row.status === "ACTIVE" ? "positive" : "critical"} size="sm">
                      {row.status === "ACTIVE" ? "Aktif" : "Nonaktif"}
                    </Badge>
                  ),
                },
              ]}
              rows={profile.stores}
              rowKey={(row) => row.id}
            />
          ) : (
            <p className="text-sm text-ink-muted">
              Belum ada toko yang bisa Anda akses. Setelah toko dibuat atau Anda
              menerima undangan ke suatu toko, daftar ini terisi.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className={mono ? "font-mono text-sm text-ink" : "text-sm text-ink"}>{value}</dd>
    </div>
  );
}