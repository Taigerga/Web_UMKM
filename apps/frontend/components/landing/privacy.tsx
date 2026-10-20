import { Database, Eye, KeyRound, Layers, Lock, UserCheck } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui";

import { Section } from "./section";

/** Yang sudah ada di Fase 1 — diverifikasi lewat test, bukan klaim. */
const IMPLEMENTED = [
  {
    icon: KeyRound,
    title: "Password di-hash dengan Argon2id",
    body: "Password tidak pernah disimpan apa adanya, dan library yang dipakai Ship prebuilt agar tidak butuh kompilasi native.",
  },
  {
    icon: Lock,
    title: "Refresh token berotasi dengan deteksi pemakaian ulang",
    body: "Setiap token punya keluarga. Bila satu token lama dipakai ulang, seluruh keluarga langsung dicabut.",
  },
  {
    icon: Layers,
    title: "Pemisahan tenant di dua lapis",
    body: "Query selalu dibatasi ke toko yang diminta, dan setiap akses dicek keanggotaannya di backend. Menyembunyikan menu bukan pengaman.",
  },
  {
    icon: Eye,
    title: "Jejak audit untuk tindakan sensitif",
    body: "Perubahan peran, undangan, dan status dicatat bersama pelakunya. Nomor internal dan stack trace tidak pernah keluar ke klien.",
  },
] as const;

/** Yang belum ada — sengaja ditulis, supaya janji tidak melebihi kenyataan. */
const NOT_YET = [
  "Belum ada dashboard analitik. Halaman yang Anda lihat sekarang adalah pratinjau statis.",
  "Belum ada unggah data penjualan. Tersedia mulai Fase 2.",
  "Belum ada model machine learning yang tersambung. Peramalan dan deteksi anomali menyusul di Fase 3–4.",
  "Belum ada audit eksternal atau sertifikasi kepatuhan. Jangan anggap halaman ini sebagai jaminan keamanan.",
  "Pemeriksaan kata sandi lemah dan 2FA belum ada.",
] as const;

export function Privacy() {
  return (
    <Section
      id="privasi"
      tone="forest"
      eyebrow="Privasi dan keamanan"
      title="Apa yang benar-benar kami lakukan"
      description="Bagian ini menjelaskan kontrol yang sudah ada di Fase 1 dan batasnya. Kalau sebuah kontrol belum dibangun, kami tulis begitu."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {IMPLEMENTED.map((item) => (
          <Card
            key={item.title}
            variant="inset"
            className="flex flex-col gap-3 border-forest-line bg-forest-soft"
            padding="lg"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-light/15 text-accent-light"
              >
                <UserCheck className="size-3.5" />
              </span>
              <CardTitle className="text-white">{item.title}</CardTitle>
            </div>
            <CardDescription className="text-forest-line">{item.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Card
        variant="outline"
        className="mt-6 border-forest-line"
        padding="lg"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Database aria-hidden="true" className="size-5 shrink-0 text-accent-light" />
            <p className="font-display text-base font-semibold text-white">
              Yang belum ada di Fase 1
            </p>
          </div>
          <ul className="grid gap-2.5">
            {NOT_YET.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-forest-line">
                <span
                  aria-hidden="true"
                  className="mt-2 size-1.5 shrink-0 rounded-full bg-accent-light"
                />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </Section>
  );
}