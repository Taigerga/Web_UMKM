import { AcceptInvitation } from "@/components/auth/accept-invitation";

/**
 * Semua isi halaman bergantung pada `params.token` (dibaca runtime), dan
 * Client Component di dalamnya hanya mengambil data lewat fetch ke backend
 * (R-7: tidak ada `"use cache"` untuk data tenant). Tidak ada shell statis
 * yang layak di-prerender, jadi route ini sengaja dibolehkan blocking,
 * mengikuti pola `app/(dashboard)/dashboard/page.tsx`.
 */
export const instant = false;

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return <AcceptInvitation token={token} />;
}
