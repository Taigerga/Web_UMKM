"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded border p-4">
        <select
          value={storeId ?? ""}
          onChange={(e) => setStoreId(e.target.value)}
          className="rounded border bg-background px-3 py-2 text-sm"
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        {canManage ? (
          <form onSubmit={createProduct} className="flex flex-col gap-3">
            <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU" />
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama produk" />
            <Button type="submit">Tambah produk</Button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground">
            Form tambah produk hanya tersedia untuk pemilik toko.
          </p>
        )}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
      <ul className="flex flex-col gap-2">
        {products.map((product) => (
          <li key={product.id} className="rounded border p-3 text-sm">
            {product.sku} · {product.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
