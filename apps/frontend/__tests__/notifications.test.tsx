import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from "@/lib/dashboard-data";
import * as api from "@/lib/session-refresh";
import { NotificationBell } from "@/components/dashboard/notification-bell";

/**
 * Test pusat notifikasi in-app:
 *
 * 1. Klien (`dashboard-data`) memanggil endpoint notifikasi backend dengan
 *    method dan query yang benar.
 * 2. `NotificationBell` menampilkan badge HANYA saat angka belum dibaca > 0 -
 *    "masih memuat" dan "0" sama-sama tanpa badge, supaya sidebar tidak
 *    berisik dan tidak pernah menampilkan angka fiktif saat gagal memuat.
 */

afterEach(() => cleanup());

describe("klien notifikasi", () => {
  it("listNotifications meneruskan filter status dan paging sebagai query", async () => {
    const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue([] as never);

    await listNotifications({ status: "unread", limit: 20, offset: 40 });

    expect(spy).toHaveBeenCalledWith("/notifications?status=unread&limit=20&offset=40");
  });

  it("unreadNotificationCount membaca field count dari /notifications/unread-count", async () => {
    const spy = vi
      .spyOn(api, "sessionRequest")
      .mockResolvedValue({ count: 7 } as never);

    const count = await unreadNotificationCount();

    expect(spy).toHaveBeenCalledWith("/notifications/unread-count");
    expect(count).toBe(7);
  });

  it("markNotificationRead memakai PATCH /notifications/:id/read", async () => {
    const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue({} as never);

    await markNotificationRead("n1");

    expect(spy).toHaveBeenCalledWith("/notifications/n1/read", { method: "PATCH" });
  });

  it("markAllNotificationsRead memakai POST /notifications/read-all", async () => {
    const spy = vi
      .spyOn(api, "sessionRequest")
      .mockResolvedValue({ updated: 2 } as never);

    await markAllNotificationsRead();

    expect(spy).toHaveBeenCalledWith("/notifications/read-all", { method: "POST" });
  });
});

describe("NotificationBell", () => {
  it("badge tampil saat ada notifikasi belum dibaca", async () => {
    vi.spyOn(api, "sessionRequest").mockResolvedValue({ count: 3 } as never);

    render(<NotificationBell />);

    await waitFor(() => {
      expect(screen.getByLabelText("3 notifikasi belum dibaca")).not.toBeNull();
    });
  });

  it("badge tidak tampil saat semuanya sudah dibaca", async () => {
    const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue({ count: 0 } as never);

    render(<NotificationBell />);

    await waitFor(() => {
      expect(spy).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText(/notifikasi belum dibaca/)).toBeNull();
  });
});
