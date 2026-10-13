/**
 * Judul halaman dashboard.
 *
 * Sengaja Server Component tanpa satu pun accessor runtime: judulnya identik
 * untuk semua pengunjung, jadi aman ikut masuk static shell. Tidak ada
 * `cookies()`, tidak ada `searchParams`, tidak ada fetch - semua itu hidup di
 * Client Component di bawahnya (R-7).
 */
export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
        {title}
      </h1>
      <p className="max-w-2xl text-sm leading-relaxed text-ink-muted">{description}</p>
      {children}
    </header>
  );
}