"use client";

import * as React from "react";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { useSession } from "@/components/dashboard/session-provider";
import { listAccessibleStores } from "@/lib/dashboard-data";
import type { StoreSummary } from "@/lib/dashboard-data";
import { API_BASE_URL, API_PREFIX } from "@/lib/api-client";

type Dataset = {
  id: string;
  status: string;
  rowCount: number;
  fileName: string;
};

export function DataPanel() {
  const session = useSession();
  const [stores, setStores] = React.useState<StoreSummary[]>([]);
  const [storeId, setStoreId] = React.useState<string | null>(null);
  const [dataset, setDataset] = React.useState<Dataset | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

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

  async function request(path: string, method: string, body?: BodyInit | null) {
    const res = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      credentials: "include",
      body: body ?? null,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? "Permintaan gagal");
    return json.data;
  }

  async function upload(file: File) {
    if (!storeId) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await request(`/stores/${storeId}/datasets`, "POST", form);
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
      const data = await request(`/stores/${storeId}/datasets/${dataset.id}/validate`, "POST");
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
      const data = await request(`/stores/${storeId}/datasets/${dataset.id}/commit`, "POST");
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
      const data = await request(`/stores/${storeId}/datasets/${dataset.id}/rollback`, "POST");
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

        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={busy}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        {dataset ? (
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
