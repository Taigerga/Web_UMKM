import { Section } from "./section";

const FAQS = [
  {
    q: "Apakah angka di halaman ini data asli?",
    a: "Bukan. Seluruh nama produk, kota, dan nominal berasal dari dataset sintetis yang dibuat untuk demonstrasi. Tidak ada data toko atau data pelanggan nyata yang ditampilkan di halaman ini.",
  },
  {
    q: "Kapan saya bisa mulai mengunggah data penjualan?",
    a: "Unggah dan validasi data dijadwalkan masuk pada Fase 2. Saat ini yang tersedia baru halaman depan dan fondasi akses; belum ada layar unggah.",
  },
  {
    q: "Apakah prediksi di halaman ini hasil model yang sudah dilatih?",
    a: "Belum. Integrasi machine learning dijadwalkan pada Fase 3–4. Angka prediksi yang Anda lihat sekarang hanya ilustrasi tata letak, bukan keluaran model.",
  },
  {
    q: "Bagaimana data toko saya dilindungi?",
    a: "Setiap akses toko dicek keanggotaannya di backend, dan query selalu dibatasi ke toko yang diminta. Ada dua lapis: filter pada level query dan pemeriksaan akses per permintaan. Menyembunyikan menu di antarmuka bukan pengaman.",
  },
  {
    q: "Apakah BisnisInsight sudah lolos audit keamanan?",
    a: "Belum. Yang ada di Fase 1 adalah fondasi yang bisa diuji — hashing Argon2id, rotasi refresh token dengan deteksi pemakaian ulang, dan jejak audit. Audit eksternal dan sertifikasi belum dikerjakan.",
  },
  {
    q: "Apakah ada armada Elasticsearch atau layanan pihak ketiga yang menyimpan data saya?",
    a: "Tidak. Halaman ini tidak mengirim data Anda ke layanan pihak ketiga. Unggah berkas dan pemrosesan analitik belum tersedia, jadi belum ada data yang keluar dari server kami.",
  },
] as const;

export function Faq() {
  return (
    <Section
      id="faq"
      eyebrow="FAQ"
      title="Pertanyaan yang paling sering muncul"
      description="Kalau jawaban Anda tidak ada di sini, tanyakan langsung — kami lebih memilih jawaban lengkap daripada halaman yang sepi."
    >
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {FAQS.map((faq) => (
          <details key={faq.q} className="group px-5 py-4 sm:px-6">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold text-ink marker:hidden">
              {faq.q}
              <span
                aria-hidden="true"
                className="shrink-0 text-lg leading-none text-ink-faint transition-transform duration-150 group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-ink-muted">{faq.a}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}