"use client";

import * as React from "react";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
} from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  createStoreProduct,
  listAccessibleStores,
  listStoreProducts,
} from "@/lib/dashboard-data";
import type { StoreProduct, StoreSummary } from "@/lib/dashboard-data";
import { canManageStore } from "@/lib/dashboard-nav";

export function CatalogPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [products, setProducts] = React.useState<StoreProduct[]>([]);
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const canManage = canManageStore(stores, storeId);

  // Semua request lewat sessionRequest (lib/dashboard-data.ts): token
  // ditempel di sana, begitu pula refresh + satu kali percobaan ulang saat
  // 401 - pesan galat berasal dari ApiError, bukan dari `res.json()` manual.
  const load = React.useCallback(async () => {
    if (!storeId) return;
    setProducts(await listStoreProducts(storeId));
  }, [storeId]);

  React.useEffect(() => {
    if (session.status !== "ready") return;
    void listAccessibleStores().then((items) => {
      setStores(items);
      if (items.length > 0) setStoreId(items[0].id);
    });
  }, [session.status]);

  React.useEffect(() => {
    if (!storeId) return;
    // Muat produk lewat callback promise: setState hanya dijalankan dari
    // callback `.then`, bukan langsung di badan effect (aturan
    // react-hooks/set-state-in-effect).
    let cancelled = false;
    void listStoreProducts(storeId)
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memuat katalog");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    try {
      await createStoreProduct(storeId, {
        sku,
        name,
        category: "Umum",
        unit: "pc",
      });
      setSku("");
      setName("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Katalog Produk</CardTitle>
          <CardDescription>
            SKU di sini dipakai saat menginput penjualan harian dan membaca
            dataset.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
            Toko
            <select
              value={storeId ?? ""}
              onChange={(e) => setStoreId(e.target.value)}
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:border-accent"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          {canManage ? (
            <form onSubmit={createProduct} className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
                SKU
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="mis. P01"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
                Nama produk
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mis. Kopi bubuk 250 g"
                />
              </label>
              <div className="flex items-end">
                <Button type="submit">Tambah produk</Button>
              </div>
            </form>
          ) : (
            <p className="rounded-lg bg-neutral-wash px-3 py-2 text-xs text-ink-muted">
              Form tambah produk hanya tersedia untuk pemilik toko.
            </p>
          )}
          {message ? (
            <p
              role="status"
              className={
                message.includes("berhasil") || message.includes("ditambah")
                  ? "rounded-lg bg-positive-wash px-3 py-2 text-sm text-positive"
                  : "rounded-lg bg-critical-wash px-3 py-2 text-sm text-critical"
              }
            >
              {message}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Daftar Produk</CardTitle>
        </CardHeader>
        <CardContent>
          {products.length === 0 ? (
            <EmptyState
              title="Belum ada produk"
              description="Tambahkan produk pertama di atas, atau sinkronkan katalog dari dataset yang di-commit."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {products.map((product) => (
                <li
                  key={product.id}
                  className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm"
                >
                  <span className="rounded-md bg-neutral-wash px-2 py-0.5 font-mono text-xs text-ink-muted">
                    {product.sku}
                  </span>
                  <span className="text-ink">{product.name}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
