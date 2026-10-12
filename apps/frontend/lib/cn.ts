import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Gabungkan class dari `clsx` (kondisional) lalu resolusikan konflik Tailwind
 * dengan `tailwind-merge`, sehingga class yang datang dari props selalu
 * menang atas class default komponen.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}