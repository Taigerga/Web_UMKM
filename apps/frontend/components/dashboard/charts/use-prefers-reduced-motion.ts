"use client";

import * as React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Preferensi `prefers-reduced-motion` pengguna (PROMT §6.4).
 *
 * Chart memakai ini untuk mematikan animasi Recharts saat pemilik halaman
 * meminta pengurangan gerak - grafik tetap benar, hanya transisinya yang
 * hilang. Dipasang lewat `useSyncExternalStore` (pola rekomendasi React untuk
 * mengikuti nilai eksternal) sehingga perubahan preferensi di tengah sesi
 * langsung dipatuhi dan tidak ada setState di dalam effect.
 */
export function usePrefersReducedMotion(): boolean {
  const subscribe = React.useCallback((onChange: () => void) => {
    const query = window.matchMedia(QUERY);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // Snapshot dibaca saat render oleh useSyncExternalStore (bukan callback
  // state). matchMedia().matches selalu boolean stabil; server snapshot
  // false karena media query hanya bermakna di peramban.
  const getSnapshot = () => window.matchMedia(QUERY).matches;
  const getServerSnapshot = () => false;

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
