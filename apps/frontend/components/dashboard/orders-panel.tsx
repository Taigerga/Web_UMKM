"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";

type Order = { id: string; items?: unknown[] };

export function OrdersPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [orders, setOrders] = React.useState<Order[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [customerCode, setCustomerCode] = React.useState("C1");
  const [customerName, setCustomerName] = React.useState("Ridho");
  const [sku, setSku] = React.useState("P1");
  const [qty, setQty] = React.useState("1");
  const [price, setPrice] = React.useState("3000");

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
    setOrders(await api(`/stores/${storeId}/orders`, "GET"));
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
    // Muat order lewat callback promise: setState hanya di callback `.then`,
    // bukan langsung di badan effect (react-hooks/set-state-in-effect).
    let cancelled = false;
    void api(`/stores/${storeId}/orders`, "GET")
      .then((items) => {
        if (!cancelled) setOrders(items as Order[]);
      })
      .catch(() => {
        if (!cancelled) setMessage("Gagal memuat order");
      });
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!storeId) return;
    try {
      // Customer dibuat/upsert otomatis oleh endpoint order manual dari
      // customerCode, jadi tidak perlu POST /customers di sini. Itu juga
      // membuat formulir ini aman dipakai pegawai (input harian, PROMT §5.3).
      await api(`/stores/${storeId}/orders/manual`, "POST", {
        customerCode,
        customerName,
        orderDate: "2026-01-01",
        channel: "online",
        items: [{ productSku: sku, qty: Number(qty), price: Number(price) }],
      });
      setMessage("Order dibuat");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Gagal");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border p-4">
        <select value={storeId ?? ""} onChange={(e) => setStoreId(e.target.value)} className="mb-3 rounded border bg-background px-3 py-2 text-sm">
          {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
        </select>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} placeholder="Kode pelanggan" />
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama pelanggan" />
          <Input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU produk" />
          <Input value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
          <Input value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Harga" />
          <Button type="submit">Buat order manual</Button>
        </form>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
      </div>
      <ul className="flex flex-col gap-2">
        {orders.map((order) => (
          <li key={order.id} className="rounded border p-3 text-sm">
            {order.id} · {order.items?.length ?? 0} item
          </li>
        ))}
      </ul>
    </div>
  );
}
