"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import {
  commitDataset,
  listAccessibleStores,
  rollbackDataset,
  uploadDataset,
  validateDataset,
} from "@/lib/dashboard-data";
import type { DatasetView, StoreSummary } from "@/lib/dashboard-data";
import { canManageStore } from "@/lib/dashboard-nav";

export function DataPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [dataset, setDataset] = React.useState<DatasetView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  // Unggah, validasi, commit, dan rollback dataset di backend hanya untuk
  // OWNER/ADMIN (@Roles). Sembunyikan kontrolnya untuk pegawai supaya UI
  // tidak menawarkan aksi yang pasti dijawab 403 - backend tetap penegak.
  const canManage = canManageStore(stores, storeId);

  React.useEffect(() => {
    if (session.status !== "ready" || !session.profile) return;
    void listAccessibleStores()
      .then((items) => {
        setStores(items);
        if (items.length > 0) setStoreId(items[0].id);
      })
      .catch((error) => {
        setMessage(error instanceof Error ? error.message : "Gagal memuat toko");
      });
  }, [session.status, session.profile]);

  // Semua request - termasuk unggah multipart - lewat sessionRequest
  // (lib/dashboard-data.ts). FormData dikirim apa adanya oleh `sendRequest`,
  // dan 401 tetap diputar dengan refresh + satu kali percobaan ulang.
  async function upload(file: File) {
    if (!storeId) return;
    setBusy(true);
    setMessage(null);
    try {
      const data = await uploadDataset(storeId, file);
      setDataset(data);
      setMessage("Unggah selesai");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unggah gagal");
    } finally {
      setBusy(false);
    }
  }

  async function validate() {
    if (!storeId || !dataset) return;
    setBusy(true);
    try {
      const data = await validateDataset(storeId, dataset.id);
      setDataset(data);
      setMessage("Validasi selesai");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Validasi gagal");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!storeId || !dataset) return;
    setBusy(true);
    try {
      const data = await commitDataset(storeId, dataset.id);
      setDataset(data);
      setMessage("Dataset dicommit");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Commit gagal");
    } finally {
      setBusy(false);
    }
  }

  async function rollback() {
    if (!storeId || !dataset) return;
    setBusy(true);
    try {
      const data = await rollbackDataset(storeId, dataset.id);
      setDataset(data);
      setMessage("Dataset di-rollback");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rollback gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Unggah Data Toko</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-sm">
          <span>Toko</span>
          <select
            value={storeId ?? ""}
            onChange={(event) => setStoreId(event.target.value)}
            className="rounded border bg-background px-3 py-2"
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>

        {canManage ? (
          <input
            type="file"
            accept=".csv,.xlsx"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Unggah, validasi, commit, dan rollback dataset adalah wewenang pemilik toko.
          </p>
        )}

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        {canManage && dataset ? (
          <div className="flex flex-col gap-3 rounded border p-3 text-sm">
            <p>{dataset.fileName} ({dataset.rowCount} baris)</p>
            <p>Status: {dataset.status}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void validate()}>
                Validasi
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void commit()}>
                Commit
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void rollback()}>
                Rollback
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
