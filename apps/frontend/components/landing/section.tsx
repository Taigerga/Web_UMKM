import { SampleDataBadge } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * Kerangka bagian: judul + label Structural + konten.
 *
 * Garis rambut di kiri bukan hiasan — ia menandai awal unit informasi yang
 * berdiri sendiri, sehingga pemindai halaman bisa tahu di mana satu bagian
 * berakhir dan bagian berikutnya dimulai.
 */
export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  tone = "paper",
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  tone?: "paper" | "surface" | "navy";
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn(
        "border-t border-line py-16 sm:py-20 lg:py-24",
        tone === "surface" && "bg-surface",
        tone === "navy" && "border-navy-line bg-navy text-white",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="max-w-2xl border-l-2 border-accent-deep pl-5">
          {eyebrow ? (
            <p
              className={cn(
                "text-xs font-semibold tracking-[0.18em] uppercase",
                tone === "navy" ? "text-accent" : "text-accent-deep",
              )}
            >
              {eyebrow}
            </p>
          ) : null}
          <h2
            className={cn(
              "mt-3 font-display text-3xl leading-tight font-semibold tracking-tight sm:text-4xl",
              tone === "navy" ? "text-white" : "text-ink",
            )}
          >
            {title}
          </h2>
          {description ? (
            <p
              className={cn(
                "mt-4 text-base leading-relaxed",
                tone === "navy" ? "text-navy-line" : "text-ink-muted",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

/** Poin navigasi yang dirujuk navbar dan footer. Satu sumber kebenaran. */
export const NAV_LINKS = [
  { href: "#pratinjau", label: "Pratinjau" },
  { href: "#fitur-ml", label: "Fitur ML" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#manfaat", label: "Manfaat" },
  { href: "#privasi", label: "Privasi" },
  { href: "#faq", label: "FAQ" },
] as const;

/** Tautan internal ke section halaman ini — bukan route, jadi `<a>` biasa. */
export function SectionLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "text-sm font-medium text-ink-muted transition-colors hover:text-ink",
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Patokan brandserta penanda bahwa isi di bawahnya adalah ilustrasi. */
export function SampleFigure({
  children,
  className,
  note,
}: {
  children: React.ReactNode;
  className?: string;
  note?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)} data-sample="true">
      <div className="flex flex-wrap items-center gap-2">
        <SampleDataBadge />
        {note ? <span className="text-xs text-ink-muted">{note}</span> : null}
      </div>
      {children}
    </div>
  );
}