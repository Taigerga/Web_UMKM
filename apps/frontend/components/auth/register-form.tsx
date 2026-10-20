"use client";

import Link from "next/link";
import * as React from "react";

import { Button, Field, Input, fieldErrorId } from "@/components/ui";
import { AUTH_ERROR_CODES, ApiError, toFieldErrors } from "@/lib/api-client";
import { register } from "@/lib/auth-client";
import { firstFieldError, formatFormLevelError } from "@/lib/auth-errors";
import type { FieldErrorMap } from "@/lib/auth-errors";

/**
 * Field yang ada di form.
 *
 * `passwordConfirmation` masuk daftar ini supaya pesan validasi bisa
 * ditautkan ke input-nya, TETAPI tidak pernah ikut dikirim ke backend.
 */
const REGISTER_FIELDS = ["name", "email", "password", "passwordConfirmation"] as const;

/** Panjang minimum, sama dengan `RegisterDto.password`. */
const MIN_PASSWORD_LENGTH = 8;

/** Panjang maksimum, sama dengan `RegisterDto.password`. */
const MAX_PASSWORD_LENGTH = 128;

export type PasswordStrength = {
  /** 0..4. Menentukan panjang bar dan labelnya. */
  score: number;
  label: string;
  /** Penjelasan singkat apa yang kurang, kalau ada. */
  hint: string | null;
};

/**
 * Ukur kekuatan password, murni lokal.
 *
 * Ini indikator, bukan gerbang. Backend tetap satu-satunya penentu: ia
 * menerima password 8 karakter apa pun, jadi form yang menolak password yang
 * lebih pendek dari ambang buatan sendiri akan menolak pengguna tanpa alasan.
 * Yang tugasnya lakukan adalah memberitahu apa yang kurang, bukan menaikkan
 * ambang tanpa alasan.
 *
 * Skor memakai empat hal yang benar-benar berkaitan dengan ketahanan terhadap
 * serangan tebak: panjang, variasi huruf besar/kecil, angka, dan simbol.
 */
export function scorePassword(password: string): PasswordStrength {
  if (password.length === 0) {
    return { score: 0, label: "Belum diisi", hint: null };
  }

  // Di bawah minimum backend, skor tidak boleh naik. Menyalakan "Kuat" untuk
  // password yang akan ditolak server hanya mengajari pengguna bahwa
  // indikatornya tidak bisa dipercaya.
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      score: 0,
      label: "Terlalu pendek",
      hint: `Minimal ${MIN_PASSWORD_LENGTH} karakter.`,
    };
  }

  let points = 0;
  if (password.length >= 14) points += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) points += 1;
  if (/\d/.test(password)) points += 1;
  if (/[^\w\s]/.test(password)) points += 1;

  if (points <= 1) {
    return { score: 1, label: "Lemah", hint: "Tambahkan variasi agar lebih sulit ditebak." };
  }
  if (points === 2) {
    return { score: 2, label: "Cukup", hint: null };
  }
  if (points === 3) {
    return { score: 3, label: "Kuat", hint: null };
  }
  return { score: 4, label: "Sangat kuat", hint: null };
}

/**
 * Konfirmasi password harus cocok persis.
 *
 * Aturan ini tidak punya padanan di backend: `RegisterDto` hanya punya satu
 * field password, jadi pencocokannya murni urusan UI. Validasi yang sama
 * dilakukan server — yang ditambahkan di sini hanya yang bisa ditampilkan
 * sebelum request dikirim.
 *
 * String kosong dianggap cocok supaya field baru yang belum diisi tidak langsung
 * menampilkan pesan error.
 */
export function passwordsMatch(password: string, confirmation: string): boolean {
  return confirmation.length === 0 || password === confirmation;
}

function describeError(error: ApiError): { message: string; hint?: string } {
  switch (error.code) {
    case AUTH_ERROR_CODES.VALIDATION_ERROR:
      return { message: "Periksa kembali isian yang ditandai." };
    case AUTH_ERROR_CODES.DUPLICATE:
      // Prisma P2002 pada `users.email`. Pesan backend sengaja generik karena
      // aturan yang sama dipakai semua tabel; di sini ditulis ulang menjadi
      // kalimat yang bisa ditindaklanjuti.
      return {
        message: "Email ini sudah terdaftar.",
        hint: "Coba masuk dengan akun yang sudah ada.",
      };
    case AUTH_ERROR_CODES.THROTTLED:
      return {
        message: "Terlalu banyak percobaan pendaftaran.",
        hint: "Tunggu sebentar lalu coba lagi.",
      };
    case AUTH_ERROR_CODES.NETWORK_ERROR:
      return {
        message: "Tidak bisa menghubungi server.",
        hint: "Periksa koneksi Anda lalu coba lagi.",
      };
    default:
      return {
        message: error.isUserFacing
          ? error.message
          : "Terjadi kesalahan. Coba lagi sebentar.",
      };
  }
}

/**
 * Form pendaftaran.
 *
 * Client Component, dengan alasan yang sama seperti `LoginForm` (R-34).
 *
 * **Tidak ada field `role` di sini, dan tidak akan pernah ada** (R-35).
 * Backend menjalankan `ValidationPipe` dengan `forbidNonWhitelisted: true` dan
 * `RegisterDto` tidak mendeklarasikan `role`, jadi mengirimnya menghasilkan 400
 * `VALIDATION_ERROR`, bukan diabaikan diam-diam. Peran selalu `OWNER` yang
 * ditulis literal di `AuthService.register`.
 */
export function RegisterForm() {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrorMap>({
    perField: {},
    formLevel: [],
  });
  const [formMessage, setFormMessage] = React.useState<{
    message: string;
    hint?: string;
  } | null>(null);

  const strength = scorePassword(password);
  const mismatch = !passwordsMatch(password, confirmation);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || mismatch) return;

    setPending(true);
    setFieldErrors({ perField: {}, formLevel: [] });
    setFormMessage(null);

    try {
      // Body HANYA berisi tiga field yang ada di `RegisterDto`. Tidak ada
      // `role`, tidak ada `passwordConfirmation` — keduanya akan ditolak 400.
      await register({ email: email.trim(), name: name.trim(), password });
      // Pendaftaran mengembalikan sesi penuh, jadi ini setara login. `replace`
      // supaya tombol kembali tidak mengembalikan ke form yang sudah dipakai,
      // yang akan mengirim password lagi kalau di-submit ulang.
      window.location.replace("/dashboard");
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.code === AUTH_ERROR_CODES.VALIDATION_ERROR) {
          setFieldErrors(toFieldErrors(caught, REGISTER_FIELDS));
        } else {
          if (caught.code === AUTH_ERROR_CODES.DUPLICATE) {
            // Email juga ditandai di bawah input-nya, bukan hanya di banner:
            // itu field yang perlu diperbaiki pengguna.
            setFieldErrors({
              perField: { email: ["Email ini sudah terdaftar."] },
              formLevel: [],
            });
          }
          setFormMessage(describeError(caught));
        }
      } else {
        setFormMessage({ message: "Terjadi kesalahan. Coba lagi sebentar." });
      }
      setPending(false);
    }
  }

  // Detail validasi yang tidak bisa dikaitkan ke field mana pun tetap
  // ditampilkan. Melewatkannya berarti `property role should not exist`
  // - pelanggaran kontrak R-35 yang justru paling perlu terlihat - hilang
  // tanpa jejak di form yang paling mungkin mengirim `role`.
  const fieldLevel = formatFormLevelError(fieldErrors);
  const nameError = firstFieldError(fieldErrors, "name");
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

      <Field label="Nama" htmlFor="name" error={nameError}>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          invalid={nameError !== undefined}
          aria-describedby={nameError ? fieldErrorId("name") : undefined}
          onChange={(event) => setName(event.target.value)}
          placeholder="Budi Santoso"
        />
      </Field>

      <Field
        label="Email"
        htmlFor="email"
        error={emailError}
        hint="Dipakai untuk masuk dan menerima laporan mingguan."
      >
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

      <Field
        label="Password"
        htmlFor="password"
        error={passwordError}
        hint={`Minimal ${MIN_PASSWORD_LENGTH} karakter.`}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={password}
          invalid={passwordError !== undefined}
          aria-describedby={passwordError ? fieldErrorId("password") : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>

      <PasswordStrengthMeter strength={strength} />

      <Field
        label="Konfirmasi password"
        htmlFor="passwordConfirmation"
        error={mismatch ? "Konfirmasi password tidak sama." : undefined}
      >
        <Input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          invalid={mismatch}
          aria-describedby={
            mismatch ? fieldErrorId("passwordConfirmation") : undefined
          }
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </Field>

      <Button type="submit" size="lg" fullWidth disabled={pending || mismatch}>
        {pending ? "Mendaftarkan..." : "Buat akun"}
      </Button>

      <p className="text-sm text-ink-muted">
        Sudah punya akun?{" "}
        <Link
          href="/login"
          className="font-medium text-accent underline underline-offset-4"
        >
          Masuk
        </Link>
      </p>
    </form>
  );
}

/**
 * Indikator kekuatan password.
 *
 * `role="status"` supaya pembaca layar_member tahu nilai berubah tanpa harus
 * memindahkan fokus. Memindahkan fokus saat pengguna sedang mengetik akan
 * memutus apa yang sedang diketik dan membingungkan pengguna pembaca layar.
 */
function PasswordStrengthMeter({ strength }: { strength: PasswordStrength }) {
  const percent = (strength.score / 4) * 100;
  const color =
    strength.score <= 1 ? "bg-critical" : strength.score === 2 ? "bg-caution" : "bg-positive";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-ink-muted">Kekuatan password</span>
        <span role="status" aria-live="polite" className="text-xs font-medium text-ink-muted">
          {strength.label}
        </span>
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-wash"
        aria-hidden="true"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-150 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {strength.hint ? (
        <p className="text-xs leading-relaxed text-ink-muted">{strength.hint}</p>
      ) : null}
    </div>
  );
}
