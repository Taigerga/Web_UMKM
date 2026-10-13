"use client";

import Link from "next/link";
import * as React from "react";

import { Button, Field, Input, fieldErrorId } from "@/components/ui";
import { AUTH_ERROR_CODES, ApiError, toFieldErrors } from "@/lib/api-client";
import { login } from "@/lib/auth-client";
import { firstFieldError, formatFormLevelError } from "@/lib/auth-errors";
import type { FieldErrorMap } from "@/lib/auth-errors";

/** Field yang ada di form ini. Detail galat di luar daftar ini jadi pesan form. */
const LOGIN_FIELDS = ["email", "password"] as const;

/**
 * Pesan per kode galat.
 *
 * Bercabang di `error.code`, bukan di `error.message`. `message` ditulis untuk
 * dibaca manusia dan bisa berubah kapan saja; `code` yang stabil. Untuk kode
 * yang punya penjelasan khusus di backend (lockout, throttle) pesan ditulis
 * ulang di sini supaya menjelaskan jalan keluarnya, bukan hanya mengulang
 * kalimat backend.
 */
function describeError(error: ApiError): { message: string; hint?: string } {
  switch (error.code) {
    case AUTH_ERROR_CODES.VALIDATION_ERROR:
      return {
        message: "Periksa kembali isian yang ditandai.",
      };
    case AUTH_ERROR_CODES.INVALID_CREDENTIALS:
    case AUTH_ERROR_CODES.UNAUTHORIZED:
      // Pesan yang sama untuk email tak terdaftar dan password salah — itu
      // keputusan backend yang sengaja, supaya endpoint ini tidak jadi alat
      // menebak email mana yang terdaftar.
      return { message: "Email atau password salah." };
    case AUTH_ERROR_CODES.ACCOUNT_LOCKED:
      return {
        message: "Akun terkunci sementara.",
        hint: "Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit.",
      };
    case AUTH_ERROR_CODES.ACCOUNT_DISABLED:
      return {
        message: "Akun ini dinonaktifkan.",
        hint: "Hubungi administrator untuk mengaktifkannya kembali.",
      };
    case AUTH_ERROR_CODES.THROTTLED: {
      const seconds = error.retryAfterSeconds;
      return {
        message: "Terlalu banyak percobaan.",
        hint:
          seconds !== null && seconds > 0
            ? `Coba lagi dalam ${seconds} detik.`
            : "Tunggu sebentar lalu coba lagi.",
      };
    }
    case AUTH_ERROR_CODES.NETWORK_ERROR:
      return {
        message: "Tidak bisa menghubungi server.",
        hint: "Periksa koneksi Anda lalu coba lagi.",
      };
    default:
      return {
        message: error.isUserFacing ? error.message : "Terjadi kesalahan. Coba lagi sebentar.",
      };
  }
}

export type LoginFormProps = {
  /**
   * Halaman tujuan setelah login berhasil.
   *
   * Default `/dashboard` karena itu tujuan normal. Nilai ini datang dari query
   * `next` yang dibaca di peramban, dan `resolveSafeRedirect` di bawah
   * menyaringnya — parameter yang bisa diarahkan ke origin lain tidak boleh
   * diteruskan apa adanya.
   */
  nextPath?: string;
};

/**
 * Asal tetap untuk resolusi URL di {@link resolveSafeRedirect}.
 *
 * `.invalid` dicadangkan RFC 2606 dan tidak akan pernah resolve ke host
 * sungguhan, jadi aman dipakai sebagai dummy. Resolusi dilakukan terhadap asal
 * tetap ini, bukan `window.location.origin`, supaya hasilnya tidak bergantung
 * pada lingkungan tempat fungsi ini dijalankan.
 */
const REDIRECT_PROBE_ORIGIN = "http://redirect-probe.invalid";

/** Tujuan yang dipakai saat nilai `next` ditolak. */
const DEFAULT_REDIRECT = "/dashboard";

/** Karakter kontrol ASCII: U+0000-U+001F dan U+007F. */
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Hanya izinkan redirect ke path internal pada origin yang sama.
 *
 * `next` berasal dari URL, jadi nilainya dikendalikan pengguna. Tanpa
 * penyaringan, `/login?next=https://phishing.example` terlihat biasa di address
 * bar tapi mengirim pengguna ke situs lain tepat setelah ia mengetikkan
 * password-nya di situs yang benar. Ini pola open redirect, dan tempat paling
 * buruk untuk itu adalah login.
 *
 * ## Tiga lapis, dan lapis ketiga yang benar-benar menahan
 *
 * 1. **Tolak karakter kontrol ASCII.** WAJIB jadi pemeriksaan pertama, sebelum
 *    apa pun yang lain. Parser URL WHATWG membuang tab, LF, dan CR dari input
 *    SEBELUM mem-parse-nya, jadi `/<tab>/evil.example` - yang diawali `/` dan
 *    tidak mengandung `\` - berubah menjadi `http://evil.example/` saat
 *    diproses. Semua pemeriksaan struktur di bawah akan lolos atas nilai itu.
 * 2. **Harus diawali satu slash, tanpa backslash.** Menolak `//host` (URL
 *    protocol-relative) dan `\` (yang beberapa peramban normalkan jadi `/`).
 * 3. **Verifikasi asal hasil resolusi.** Ini yang sebenarnya menahan. Lapis 1
 *    dan 2 menolak input yang *terlihat* berbahaya; lapis 3 menjawab pertanyaan
 *    yang lebih jujur: setelah URL itu diproses, ke mana peramban benar-benar
 *    akan pergi? Kalau parser mengubah nilai yang lolos menjadi URL lintas
 *    origin, asal tidak akan sama dan nilainya ditolak.
 *
 * Lapis 3 membuat lapis 1 dan 2 bukan satu-satunya pertahanan: denylist saja
 * tidak cukup selama parser masih bisa mentransformasi nilai yang diizinkan
 * menjadi lintas-origin - dan itulah justru yang terjadi pada bug ini.
 */
export function resolveSafeRedirect(raw: string | undefined | null): string {
  if (typeof raw !== "string") return DEFAULT_REDIRECT;

  // (1) Karakter kontrol dulu, sebelum pemeriksaan lain.
  if (CONTROL_CHARS.test(raw)) return DEFAULT_REDIRECT;

  const value = raw.trim();
  if (value.length === 0) return DEFAULT_REDIRECT;

  // (2) Bentuk path internal.
  if (!value.startsWith("/") || value.startsWith("//")) return DEFAULT_REDIRECT;
  if (value.includes("\\")) return DEFAULT_REDIRECT;

  // (3) Verifikasi asal setelah resolusi. Satu-satunya lapisan yang melihat
  // hasil akhir parser, jadi satu-satunya yang bisa menjamin tujuan tetap
  // di origin yang sama.
  try {
    const resolved = new URL(value, REDIRECT_PROBE_ORIGIN);
    if (resolved.origin !== REDIRECT_PROBE_ORIGIN) return DEFAULT_REDIRECT;
  } catch {
    return DEFAULT_REDIRECT;
  }

  return value;
}

/**
 * Form masuk.
 *
 * Client Component dengan alasan, bukan kebiasaan (R-34): isian adalah
 * interaksi, dan setiapthings di sini memanggil backend langsung dari
 * peramban. Tidak ada `fetch` server-side, tidak ada prefetch state auth.
 * Menyimpan password atau access token di state server berarti keduanya bisa
 * ikut terbawa ke render halaman berikutnya.
 */
export function LoginForm({ nextPath = "/dashboard" }: LoginFormProps) {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrorMap>({
    perField: {},
    formLevel: [],
  });
  const [formMessage, setFormMessage] = React.useState<{
    message: string;
    hint?: string;
  } | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFieldErrors({ perField: {}, formLevel: [] });
    setFormMessage(null);

    try {
      await login({ email: email.trim(), password });
      // `replace` supaya tombol "kembali" tidak mengembalikan ke form login
      // setelah sesi sudah aktif — mengulang submit di situ akan mengirim
      // password lagi.
      window.location.replace(resolveSafeRedirect(nextPath));
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === AUTH_ERROR_CODES.VALIDATION_ERROR) {
          setFieldErrors(toFieldErrors(caught, LOGIN_FIELDS));
        } else {
          setFormMessage(describeError(caught));
        }
      } else {
        setFormMessage({
          message: "Terjadi kesalahan. Coba lagi sebentar.",
        });
      }
      setPending(false);
    }
  }

  // Detail validasi yang tidak bisa dikaitkan ke field mana pun tetap
  // ditampilkan, bukan dibuang. Membuangnya diam-diam membuat keluhan server
  // yang nyata tidak terlihat oleh orang yang justru bisa memperbaikinya.
  const fieldLevel = formatFormLevelError(fieldErrors);
  const emailError = firstFieldError(fieldErrors, "email");
  const passwordError = firstFieldError(fieldErrors, "password");

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {fieldLevel ? (
        <div
          role="alert"
          className="rounded-lg border border-critical/30 bg-critical-wash px-4 py-3"
        >
          <p className="text-sm font-semibold text-critical">
            Periksa kembali isian yang ditandai.
          </p>
          <p className="text-sm text-ink-muted">{fieldLevel}</p>
        </div>
      ) : null}

      {formMessage ? (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg border border-critical/30 bg-critical-wash px-4 py-3"
        >
          <p className="text-sm font-semibold text-critical">{formMessage.message}</p>
          {formMessage.hint ? (
            <p className="text-sm text-ink-muted">{formMessage.hint}</p>
          ) : null}
        </div>
      ) : null}

      <Field label="Email" htmlFor="email" error={emailError}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          invalid={emailError !== undefined}
          aria-describedby={emailError ? fieldErrorId("email") : undefined}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nama@tokoanda.id"
        />
      </Field>

      <Field label="Password" htmlFor="password" error={passwordError}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          invalid={passwordError !== undefined}
          aria-describedby={passwordError ? fieldErrorId("password") : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <Button type="submit" size="lg" fullWidth disabled={pending}>
        {pending ? "Memeriksa..." : "Masuk"}
      </Button>

      <p className="text-sm text-ink-muted">
        Belum punya akun?{" "}
        <Link
          href="/register"
          className="font-medium text-accent-deep underline underline-offset-4"
        >
          Buat akun gratis
        </Link>
      </p>
    </form>
  );
}
