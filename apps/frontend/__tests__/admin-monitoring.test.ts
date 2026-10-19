import { describe, expect, it, vi } from "vitest";

import { adminMlModels, listAdminMlJobs } from "@/lib/dashboard-data";
import * as api from "@/lib/session-refresh";

/**
 * Klien monitoring admin: endpoint hanya untuk ADMIN dan harus benar path +
 * query-nya, karena panel ini menampilkan status ML lintas toko - query yang
 * salah bisa kosong diam-diam dan admin mengira sistem sehat padahal dia
 * tidak melihat apa pun.
 */
describe("klien monitoring admin", () => {
  it("listAdminMlJobs tanpa filter memanggil /admin/ml-jobs", async () => {
    const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue([] as never);

    await listAdminMlJobs();

    expect(spy).toHaveBeenCalledWith("/admin/ml-jobs");
  });

  it("listAdminMlJobs meneruskan filter status dan paging", async () => {
    const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue([] as never);

    await listAdminMlJobs({ status: "failed", limit: 20, offset: 40 });

    expect(spy).toHaveBeenCalledWith("/admin/ml-jobs?status=failed&limit=20&offset=40");
  });

  it("adminMlModels memanggil /admin/ml-models", async () => {
    const spy = vi.spyOn(api, "sessionRequest").mockResolvedValue({} as never);

    await adminMlModels();

    expect(spy).toHaveBeenCalledWith("/admin/ml-models");
  });
});
