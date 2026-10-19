"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { canManageStore } from "@/lib/dashboard-nav";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";

type Product = { id: string; sku: string; name: string };

export function CatalogPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [products, setProducts] = React.useState<Product[]>([]);
  const [sku, setSku] = React.useState("");
  const [name, setName] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const canManage = canManageStore(stores, storeId);

  async function api(path: string, method: string, body?: unknown) {
    const res = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal");
    return json.data;
  }

  const load = React.useCallback(async () => {
    if (!storeId) return;
    setProducts(await api(`/stores/${storeId}/products`, "GET"));
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
    void api(`/stores/${storeId}/products`, "GET")
      .then((items) => {
        if (!cancelled) setProducts(items as Product[]);
      })
      .catch(() => {
        if (!cancelled) setMessage("Gagal memuat katalog");
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function createProduct(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    try {
      await api(`/stores/${storeId}/products`, "POST", {
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
