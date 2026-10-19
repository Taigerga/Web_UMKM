"use client";

import * as React from "react";

import { Badge } from "@/components/ui";
import { unreadNotificationCount } from "@/lib/dashboard-data";

/**
 * Badge jumlah notifikasi yang belum dibaca, dipasang di item menu
 * "Notifikasi" sidebar.
 *
 * Sumber angkanya `GET /notifications/unread-count` yang dipanggil langsung
 * dari peramban (R-7: data bukan konten publik, tidak boleh lewat cache).
 * Aturan tampilnya sengaja ketat: badge hanya ada kalau angkanya > 0 -
 * "belum tahu" (masih memuat) dan "0 belum dibaca" sama-sama tidak tampil,
 * supaya sidebar tidak berisik di kondisi normal.
 */
export function NotificationBell() {
  const [count, setCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void unreadNotificationCount()
      .then((value) => {
        if (!cancelled) setCount(value);
      })
      .catch(() => {
        // Gagal memuat angka bukan alasan menampilkan badge fiktif.
        // Pengguna tetap bisa membuka halaman Notifikasi dari menu.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (count === null || count <= 0) return null;

  return (
    <Badge variant="caution" size="sm" aria-label={`${count} notifikasi belum dibaca`}>
      {count > 99 ? "99+" : count}
    </Badge>
  );
}
