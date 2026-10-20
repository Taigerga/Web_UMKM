import { Database } from "lucide-react";

import { Card, CardDescription, CardTitle } from "@/components/ui";
import { cn } from "@/lib/cn";

import { Section } from "./section";

/**
 * Kontrol keamanan yang benar-benar ada — diverifikasi lewat test, bukan
 * klaim. Ikonnya digambar sendiri sebagai SVG stroke dengan warna teks,
 * supaya empat kartu tidak melewatkan satu ikon yang sama berulang.
 */

type IconProps = { className?: string };

function IconKey({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-5", className)}>
      <circle cx="8" cy="16" r="4" />
      <path d="M10.9 13.1 20 4M17 7l2.5 2.5M14.5 9.5 17 12" />
    </svg>
  );
}

function IconRotate({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-5", className)}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3v5h-5" />
    </svg>
  );
}

function IconShield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-5", className)}>
      <path d="M12 3 5 5.5v5c0 4.7 2.9 8.6 7 10.5 4.1-1.9 7-5.8 7-10.5v-5Z" />
      <path d="m9.5 11.5 2 2 3.5-4" />
    </svg>
  );
}

function IconTrace({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn("size-5", className)}>
      <path d="M4 6h10M4 12h16M4 18h7" />
      <circle cx="19" cy="6" r="1.5" />
    </svg>
  );
}

/** Yang sudah ada — tiap kartu membawa ikonnya sendiri. */
const IMPLEMENTED: Array<{
  icon: (props: IconProps) => React.ReactNode;
  title: string;
  body: string;
}> = [
  {
    icon: IconKey,
    title: "Password di-hash dengan Argon2id",
    body: "Password tidak pernah disimpan apa adanya, dan library yang dipakai Ship prebuilt agar tidak butuh kompilasi native.",
  },
  {
    icon: IconRotate,
    title: "Refresh token berotasi dengan deteksi pemakaian ulang",
    body: "Setiap token punya keluarga. Bila satu token lama dipakai ulang, seluruh keluarga langsung dicabut.",
  },
  {
    icon: IconShield,
    title: "Pemisahan tenant di dua lapis",
    body: "Query selalu dibatasi ke toko yang diminta, dan setiap akses dicek keanggotaannya di backend. Menyembunyikan menu bukan pengaman.",
  },
  {
    icon: IconTrace,
    title: "Jejak audit untuk tindakan sensitif",
    body: "Perubahan peran, undangan, dan status dicatat bersama pelakunya. Nomor internal dan stack trace tidak pernah keluar ke klien.",
  },
];

/** Yang belum ada — sengaja ditulis, supaya janji tidak melebihi kenyataan. */
const NOT_YET = [
  "Autentikasi dua faktor (2FA) dan pemeriksaan kebocoran sandi belum ada.",
  "Belum ada audit eksternal atau sertifikasi kepatuhan. Jangan anggap halaman ini sebagai jaminan keamanan.",
  "Belum ada ekspor/berbagi laporan ke kanal lain; laporan diunduh manual dari dasbor.",
] as const;

export function Privacy() {
  return (
    <Section
      id="privasi"
      tone="forest"
      eyebrow="Privasi dan keamanan"
      title="Apa yang benar-benar kami lakukan"
      description="Kontrol berikut sudah ada dalam kode dan dijalankan di setiap permintaan. Kalau sebuah kontrol belum dibangun, kami tulis begitu."
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
                className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-light/15 text-accent-light"
              >
                {item.icon({ className: "size-4" })}
              </span>
              <CardTitle className="text-white">{item.title}</CardTitle>
            </div>
            <CardDescription className="text-white/75">{item.body}</CardDescription>
          </Card>
        ))}
      </div>

      <Card variant="outline" className="mt-6 border-forest-line" padding="lg">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <Database aria-hidden="true" className="size-5 shrink-0 text-accent-light" />
            <p className="font-display text-base font-semibold text-white">
              Yang masih terbuka
            </p>
          </div>
          <ul className="grid gap-2.5">
            {NOT_YET.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/75">
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
