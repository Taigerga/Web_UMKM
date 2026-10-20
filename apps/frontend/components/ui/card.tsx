import * as React from "react";

import { cn } from "@/lib/cn";

export type CardVariant = "default" | "outline" | "inset" | "forest";
export type CardPadding = "none" | "sm" | "md" | "lg";

export const cardVariants = {
  variant: {
    default: "bg-surface border border-line shadow-card",
    outline: "bg-transparent border border-line-strong",
    inset: "bg-neutral-wash border border-line",
    forest: "bg-forest text-white border border-forest",
  },
  padding: {
    none: "p-0",
    sm: "p-4",
    md: "p-6",
    lg: "p-8",
  },
} as const;

export type CardProps = React.HTMLAttributes<HTMLDivElement> & {
  variant?: CardVariant;
  padding?: CardPadding;
};

/** Wadah permukaan. `variant` untuk treatment visual, `padding` untuk ritme internal. */
export function Card({
  className,
  variant = "default",
  padding = "md",
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)]",
        cardVariants.variant[variant],
        cardVariants.padding[padding],
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("font-display text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm leading-relaxed text-ink-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4", className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center gap-3 border-t border-line pt-4",
        className,
      )}
      {...props}
    />
  );
}