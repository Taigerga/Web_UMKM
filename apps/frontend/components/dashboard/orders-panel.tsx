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
  createManualOrder,
  listAccessibleStores,
  listStoreOrders,
} from "@/lib/dashboard-data";
import type { StoreOrder, StoreOrderPage, StoreSummary } from "@/lib/dashboard-data";

export function OrdersPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [orders, setOrders] = React.useState<StoreOrder[]>([]);
  const [meta, setMeta] = React.useState<StoreOrderPage["meta"] | null>(null);
  const [page, setPage] = React.useState(1);
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
    try {
      const result = await listStoreOrders(storeId, page);
      setOrders(result.data);
      setMeta(result.meta);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : "Gagal memuat order");
    }
  }, [storeId, page]);

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
    void listStoreOrders(storeId, page)
      .then((result) => {
        if (!cancelled) {
          setOrders(result.data);
          setMeta(result.meta);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "Gagal memuat order");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, page]);

  // Ganti toko mengembalikan pembaca ke halaman pertama - nomor halaman
  // dari toko sebelumnya tidak punya arti untuk toko yang baru.
  function changeStore(next: string): void {
    setStoreId(next);
    setPage(1);
  }

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
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Input Penjualan Harian</CardTitle>
          <CardDescription>
            Catat penjualan hari ini agar ringkasan dan analitik langsung ikut
            memperhitungkannya.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
            Toko
            <select
              value={storeId ?? ""}
              onChange={(e) => changeStore(e.target.value)}
              className="h-10 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:border-accent"
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              Kode pelanggan
              <Input
                value={customerCode}
                onChange={(e) => setCustomerCode(e.target.value)}
                placeholder="mis. C01"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              Nama pelanggan
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="mis. Ridho"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              SKU produk
              <Input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="mis. P1"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              Jumlah
              <Input
                type="number"
                min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
              Harga satuan
              <Input
                type="number"
                min="0"
                step="1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="mis. 3000"
              />
            </label>
            <div className="flex items-end">
              <Button type="submit">Buat order manual</Button>
            </div>
          </form>
          {message ? (
            <p
              role="status"
              className={
                message.includes("dibuat")
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
          <CardTitle>Order Terbaru</CardTitle>
          {meta !== null && meta.total > 0 ? (
            <CardDescription>
              {meta.total} order total — halaman {meta.page} dari{" "}
              {Math.max(1, Math.ceil(meta.total / meta.pageSize))}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <EmptyState
              title="Belum ada order"
              description="Order manual yang Anda buat akan muncul di sini, lengkap dengan jumlah itemnya."
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {orders.map((order) => (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-line bg-paper px-3 py-2.5 text-sm"
                >
                  <span className="font-mono text-xs text-ink-muted">
                    #{order.id.slice(0, 8)}
                  </span>
                  <span className="text-ink">
                    {order.items?.length ?? 0} item
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/*
            Pager: hasil unggah dataset bisa berisi ratusan order; tanpa
            halaman, daftar terasa tidak berujung (laporan 20 Okt, bug #4).
            Batas halaman dihitung dari `meta.total`, jadi tombolnya mati
            otomatis di tepi.
          */}
          {meta !== null && meta.total > meta.pageSize ? (
            <div className="mt-4 flex items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={meta.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <span className="text-xs text-ink-muted">
                Halaman {meta.page} / {Math.max(1, Math.ceil(meta.total / meta.pageSize))}
              </span>
              <Button
                variant="outline"
                disabled={meta.page >= Math.ceil(meta.total / meta.pageSize)}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
