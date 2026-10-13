"use client";

import * as React from "react";

import type { ApiError } from "@/lib/api-client";
import { logout as endSession, me } from "@/lib/auth-client";
import type { AuthProfile } from "@/lib/auth-client";
import {
  ensureFreshAccessToken,
  msUntilNextRefresh,
  onSessionEnded,
  refreshSession,
} from "@/lib/session-refresh";

import { useApiResource } from "./use-api-resource";

/**
 * Sumber kebenaran sesi di sisi peramban untuk seluruh dashboard.
 *
 * ## Kenapa profil diambil dari `GET /auth/me`, bukan dari cookie
 *
 * Cookie `bi_at` hanya bisa dibaca di peramban dan tidak bisa dibaca di
 * Server Component, sedangkan `app/(dashboard)/layout.tsx` sengaja tidak
 * membaca apa pun: layout yang bersih dari runtime data adalah shell yang
 * secara struktural tidak mungkin memuat state sesi siapa pun (R-7, R-34).
 * Jadi peran dan nama user datang dari satu request ke backend, yang juga
 * mengembalikan daftar toko yang boleh diakses - sumber yang sama dengan
 * yang dipakai backend untuk menegakkan akses.
 *
 * Konsekuensinya: menu per peran baru muncul setelah request itu selesai.
 * Itu bukan kilat yang perlu diatasi dengan menebak peran dari cookie - peran
 * hasil tebakan akan pernah bisa salah, dan UI yang salah lebih berbahaya
 * daripada UI yang muncul setengah detik kemudian.
 *
 * ## Kenapa satu provider untuk seluruh dashboard
 *
 * Refresh terjadwal (R-41), pemuatan profil, dan callback "sesi berakhir"
 * milik satu siklus hidup peramban. Kalau diulang per halaman, setiap
 * navigasi memasang timer sendiri dan satu tab bisa punya tiga penjadwal
 * refresh yang saling menabrak.
 */

/** Jeda sebelum mencoba refresh lagi setelah satu kegagalan. */
const RETRY_DELAY_MS = 60_000;

/** Halaman tujuan setelah sesi berakhir sendiri. */
const LOGIN_PATH = "/login";

export type SessionState = {
  /** `loading` sampai `me()` selesai, lalu `ready`. */
  status: "loading" | "ready";
  profile: AuthProfile | null;
  error: ApiError | null;
  /** Muat ulang profil. Dipakai tombol "coba lagi" saat gagal. */
  reload: () => void;
  /** Cabut sesi: panggil backend lalu kembali ke halaman masuk. */
  logout: () => Promise<void>;
};

const SessionContext = React.createContext<SessionState | null>(null);

/**
 * Sesi yang sedang berjalan.
 *
 * Melempar di luar provider, bukan mengembalikan `null`: komponen yang salah
 * tempat akan jadi error saat pengembangan, bukan halaman yang diam-diam
 * menampilkan menu kosong.
 */
export function useSession(): SessionState {
  const value = React.useContext(SessionContext);
  if (value === null) {
    throw new Error("useSession harus dipakai di dalam <SessionProvider>.");
  }
  return value;
}

/**
 * Kembalikan pengguna ke halaman masuk dengan alasan yang terbaca.
 *
 * `next` memakai `window.location.pathname` milik dashboard, yang selalu path
 * internal - jadi tidak ada parameter dari luar yang ikut tersalin di sini.
 */
function goToLogin(): void {
  const target = `${window.location.pathname}${window.location.search}`;
  window.location.replace(`${LOGIN_PATH}?next=${encodeURIComponent(target)}`);
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const profile = useApiResource<AuthProfile>(React.useCallback(() => me(), []));

  /**
   * Auto-refresh terjadwal (R-41).
   *
   * Timer disusun ulang setelah SETIAP percobaan, dan setelah berhasil ia
   * membaca `exp` yang baru. Setelah gagal ia menunggu 60 detik sebelum
   * mencoba lagi - bukan langsung menjadwal ulang dari `exp` lama yang sudah
   * lewat, karena itu akan mengubah satu kegagalan jaringan menjadi polling
   * tiap 5 detik.
   */
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function clearTimer(): void {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    }

    function refreshThenReschedule(): void {
      void refreshSession().then((refreshed) => {
        if (disposed) return;
        if (refreshed) {
          schedule();
          return;
        }
        // Gagal. Kalau cookie sudah hilang, sesi memang selesai dan
        // `onSessionEnded` yang akan mengarahkan ke halaman masuk.
        if (msUntilNextRefresh() === null) return;
        timer = setTimeout(refreshThenReschedule, RETRY_DELAY_MS);
      });
    }

    function schedule(): void {
      clearTimer();
      const delay = msUntilNextRefresh();
      if (delay === null) return;
      timer = setTimeout(refreshThenReschedule, delay);
    }

    schedule();

    // Tab yang lama tertidur bisa bangun dengan access token yang sudah lewat
    // jauh. `visibilitychange` menutup celah itu tanpa perlu polling.
    function onVisibilityChange(): void {
      if (document.visibilityState === "visible") {
        void ensureFreshAccessToken().then(schedule);
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  // Refresh yang benar-benar gagal mengakhiri sesi. Callback ini dipasang
  // sekali saja: state profil sengaja tidak jadi dependensi, supaya
  // `goToLogin` tidak dipasang ulang pada setiap render.
  React.useEffect(
    () =>
      onSessionEnded(() => {
        goToLogin();
      }),
    [],
  );

  const logout = React.useCallback(async () => {
    try {
      await endSession();
      goToLogin();
    } catch {
      // `endSession()` sudah membersihkan cookie lokal yang bisa ia
      // bersihkan. Kalau network gagal, tetap tinggalkan halaman: menahan
      // pengguna di dashboard setelah ia menekan "Keluar" lebih buruk
      // daripada logout yang gagal.
      goToLogin();
    }
  }, []);

  const value = React.useMemo<SessionState>(
    () => ({
      status: profile.status === "loading" ? "loading" : "ready",
      profile: profile.data,
      error: profile.error,
      reload: profile.reload,
      logout,
    }),
    [profile.status, profile.data, profile.error, profile.reload, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}