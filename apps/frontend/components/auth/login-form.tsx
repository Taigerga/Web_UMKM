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
 * Hanya izinkan redirect ke path internal.
 *
 * `next` berasal dari URL, jadi nilainya dikendalikan pengguna. Tanpa
 * penyaringan, `/login?next=https://phishing.example` akan terlihat biasa di URL tapi
 * mengirim pengguna ke situs lain tepat setelah ia mengetikkan password-nya di
 * situs yang benar. Ini pola open redirect, dan tempat paling buruk untuk itu
 * adalah login.
 */
export function resolveSafeRedirect(raw: string | undefined | null): string {
  if (typeof raw !== "string") return "/dashboard";
  const value = raw.trim();
  // Harus diawali satu slash, dan tidak dua — `//host` adalah URL protocol-
  // relative yang menunjuk situs lain meski diawali `/`.
  if (!value.startsWith("/") || value.startsWith("//")) return "/dashboard";
  // Tolak yang mencoba keluar dari path dengan menyamar sebagai path biasa.
  if (value.includes("\\")) return "/dashboard";
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
