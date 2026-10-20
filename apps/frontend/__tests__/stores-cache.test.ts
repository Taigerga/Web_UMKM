import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessionRequest } = vi.hoisted(() => ({ sessionRequest: vi.fn() }));

vi.mock("@/lib/session-refresh", () => ({ sessionRequest }));

import {
  acceptInvitation,
  createStore,
  invalidateAccessibleStores,
  listAccessibleStores,
} from "@/lib/dashboard-data";

const STORES = [{ id: "s1", name: "Toko Demo", role: "OWNER" }];

describe("cache daftar toko yang bisa diakses", () => {
  beforeEach(() => {
    sessionRequest.mockReset();
    invalidateAccessibleStores();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pemanggilan yang bertumpuk berbagi satu request (single flight)", async () => {
    sessionRequest.mockReturnValue(Promise.resolve(STORES) as never);

    const [a, b, c] = await Promise.all([
      listAccessibleStores(),
      listAccessibleStores(),
      listAccessibleStores(),
    ]);

    expect(sessionRequest).toHaveBeenCalledTimes(1);
    expect(a).toEqual(STORES);
    expect(b).toEqual(STORES);
    expect(c).toEqual(STORES);
  });

  it("panggilan berikutnya dalam TTL memakai cache, bukan request baru", async () => {
    sessionRequest.mockResolvedValue(STORES as never);

    await listAccessibleStores();
    await listAccessibleStores();

    expect(sessionRequest).toHaveBeenCalledTimes(1);
  });

  it("setelah TTL lewat, request ke backend diulang", async () => {
    sessionRequest.mockResolvedValue(STORES as never);

    await listAccessibleStores();
    vi.advanceTimersByTime(16_000);
    await listAccessibleStores();

    expect(sessionRequest).toHaveBeenCalledTimes(2);
  });

  it("request yang gagal tidak di-cache - pemanggil berikutnya mencoba lagi", async () => {
    sessionRequest
      .mockRejectedValueOnce(new Error("boom") as never)
      .mockResolvedValueOnce(STORES as never);

    await expect(listAccessibleStores()).rejects.toThrow("boom");
    await expect(listAccessibleStores()).resolves.toEqual(STORES);

    expect(sessionRequest).toHaveBeenCalledTimes(2);
  });

  it("createStore membatalkan cache supaya daftar memuat toko baru", async () => {
    sessionRequest.mockResolvedValue(STORES as never);
    await listAccessibleStores();

    await createStore({ name: "Toko Baru", city: "Bandung" });

    const fresh = [{ ...STORES[0], name: "Toko Baru" }];
    sessionRequest.mockResolvedValue(fresh as never);
    await expect(listAccessibleStores()).resolves.toEqual(fresh);

    // POST /stores tetap dikirim satu kali; pembacaan daftar diulang.
    expect(sessionRequest).toHaveBeenNthCalledWith(2, "/stores", {
      method: "POST",
      body: { name: "Toko Baru", city: "Bandung" },
    });
  });

  it("acceptInvitation juga membatalkan cache (keanggotaan berubah)", async () => {
    sessionRequest.mockResolvedValue(STORES as never);
    await listAccessibleStores();

    sessionRequest.mockResolvedValueOnce({ storeName: "Toko Lain" } as never);
    await acceptInvitation("tok");

    // Setelah invalidate, pembacaan berikutnya kembali ke backend.
    sessionRequest.mockResolvedValue([{ ...STORES[0], id: "s2" }] as never);
    await expect(listAccessibleStores()).resolves.toEqual([{ ...STORES[0], id: "s2" }]);
    expect(sessionRequest).toHaveBeenCalledTimes(3);
  });
});
