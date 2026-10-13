"use client";

import * as React from "react";

import { ApiError } from "@/lib/api-client";

/**
 * Pembaca satu resource API dengan keempat state yang wajib ada.
 *
 * Setiap halaman yang memanggil backend di folder ini wajib punya loading,
 * kosong, error, dan sukses. Hook ini adalah tempat keempatnya dipaksakan
 * supaya tidak ada panel yang diam-diam hanya punya dua.
 *
 * ## Kenapa tidak ada `setState` di dalam badan efek
 *
 * State disimpan bersama `nonce` yang membangkitkannya, dan komponen
 * membandingkan keduanya saat render. Hasilnya: efek HANYA menulis state dari
 * dalam callback promise (yang memang langganan sistem luar), dan render
 * menentukan sendiri apakah hasil itu masih milik permintaan yang
 * sekarang - tanpa perlu `setState` sinkron di awal efek yang memicu
 * render bertingkat.
 *
 * Cara lain - `setState(loading)` di awal efek lalu `setState(result)` di
 * `.then` - menghasilkan dua render per muat halaman dan, lebih buruk,
 * `setState` sinkron di badan efek bisa menggagalkan render bila effects-nya
 * dijalankan dua kali di lingkungan pengembangan.
 *
 * ## `load` harus stabil
 *
 * Efeknya bergantung pada `[load, nonce]`, jadi pemanggil wajib membungkus
 * loader-nya dengan `useCallback` yang dependensinya stabil (biasanya
 * `storeId`). Kalau tidak, setiap render membuat loader baru, `loading`
 * kembali menyala, dan hasilnya request berulang tanpa henti - persis
 * kebocoran bandwidth yang R-7 coba cegah dengan "selalu fresh".
 */

export type ResourceState<T> = {
  /** `loading` sampai request pertama selesai, lalu `ready` atau `error`. */
  status: "loading" | "ready" | "error";
  data: T | null;
  /** Selalu `ApiError`, bahkan kalau yang tertangkap adalah `TypeError`. */
  error: ApiError | null;
  /** Muat ulang. Membuang data lama, jadi tidak ada layar basi. */
  reload: () => void;
};

/**
 * Ubah apa pun yang tertangkap menjadi `ApiError`.
 *
 * `ApiError` selalu punya `code`, dan UI bercabang di situ. Melempar
 * `TypeError` apa adanya ke komponen React akan menggagalkan seluruh render
 * dengan pesan yang tidak menjelaskan apa pun ke pengguna.
 */
export function toApiError(caught: unknown): ApiError {
  if (caught instanceof ApiError) return caught;
  return new ApiError({
    status: 0,
    code: "HTTP_ERROR",
    message: "Terjadi kesalahan di sisi peramban. Coba muat ulang halaman.",
    details: caught instanceof Error ? [caught.message] : [],
  });
}

type Settled<T> = {
  /** Nonce yang Details settlement ini berasal dari. */
  nonce: number;
  status: "ready" | "error";
  data: T | null;
  error: ApiError | null;
};

export function useApiResource<T>(load: () => Promise<T>): ResourceState<T> {
  const [settled, setSettled] = React.useState<Settled<T> | null>(null);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    let active = true;

    load()
      .then((data) => {
        if (!active) return;
        setSettled({ nonce, status: "ready", data, error: null });
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setSettled({ nonce, status: "error", data: null, error: toApiError(caught) });
      });

    // `active` mencegah hasil request lama menimpa hasil yang baru saat
    // pengguna menekan "coba lagi" dengan cepat, atau pindah halaman di
    // tengah request. Ini bentuk paling umum dari "data satu sesi muncul di
    // sesi lain": render yang membaca state milik request yang sudah
    // dibatalkan.
    return () => {
      active = false;
    };
  }, [load, nonce]);

  const reload = React.useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  // Hasil yang bukan milik nonce sekarang bukan milik tampilan ini: dia
  // milik permintaan lama yang sudah dibatalkan, jadi diperlakukan sebagai
  // "belum ada data" dan statusnya kembali ke loading.
  const current = settled !== null && settled.nonce === nonce ? settled : null;

  return {
    status: current === null ? "loading" : current.status,
    data: current === null ? null : current.data,
    error: current === null ? null : current.error,
    reload,
  };
}