"use client";

import * as React from "react";
import { Button, Input } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  createManualOrder,
  listAccessibleStores,
  listStoreOrders,
} from "@/lib/dashboard-data";
import type { StoreOrder, StoreSummary } from "@/lib/dashboard-data";

export function OrdersPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [orders, setOrders] = React.useState<StoreOrder[]>([]);
  const [message, setMessage] = React.useState<string | null>(null);
  const [customerCode, setCustomerCode] = React.useState("C1");
  const [customerName, setCustomerName] = React.useState("Ridho");
  const [sku, setSku] = React.useState("P1");
  const [qty, setQty] = React.useState("1");
  const [price, setPrice] = React.useState("3000");

  // Semua request lewat sessionRequest (lib/dashboard-data.ts): token
  // ditempel di sana, begitu pula refresh + satu kali percobaan ulang saat
  // 401 - pesan galat berasal dari ApiError, bukan dari `res.json()` manual.
  const load = React.useCallback(async () => {
    if (!storeId) return;
    setOrders(await listStoreOrders(storeId));
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
    void listStoreOrders(storeId)
      .then((items) => {
        if (!cancelled) setOrders(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memuat order");
        }
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
      // orderDate memakai tanggal hari ini, bukan tanggal tulisan tangan -
      // ini formulir input harian, dan tanggal tetap yang memicu filter
      // periode di analytics.
      await createManualOrder(storeId, {
        customerCode,
        customerName,
        orderDate: new Date().toISOString().slice(0, 10),
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
