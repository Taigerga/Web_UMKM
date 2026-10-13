import { describe, expect, it } from "vitest";

import {
  defaultDashboardPath,
  navForRole,
  navigableNavItems,
  toPlatformRole,
} from "@/lib/dashboard-nav";

describe("toPlatformRole", () => {
  it("mengenali tiga peran platform", () => {
    expect(toPlatformRole("ADMIN")).toBe("ADMIN");
    expect(toPlatformRole("OWNER")).toBe("OWNER");
    expect(toPlatformRole("STAFF")).toBe("STAFF");
  });

  it("mengembalikan null untuk nilai tak dikenal", () => {
    expect(toPlatformRole(null)).toBeNull();
    expect(toPlatformRole(undefined)).toBeNull();
    expect(toPlatformRole("pemilik")).toBeNull();
    expect(toPlatformRole(7)).toBeNull();
  });
});

describe("defaultDashboardPath", () => {
  it("ADMIN diarahkan ke area admin", () => {
    expect(defaultDashboardPath("ADMIN")).toBe("/dashboard/admin");
  });

  it("OWNER dan STAFF diarahkan ke toko, termasuk peran tak dikenal", () => {
    expect(defaultDashboardPath("OWNER")).toBe("/dashboard/toko");
    expect(defaultDashboardPath("STAFF")).toBe("/dashboard/toko");
    expect(defaultDashboardPath(null)).toBe("/dashboard/toko");
  });
});

describe("navForRole", () => {
  it("OWNER dan STAFF memang tidak punya item admin", () => {
    const ownerKeys = navForRole("OWNER").map((item) => item.key);
    const staffKeys = navForRole("STAFF").map((item) => item.key);
    expect(ownerKeys).not.toContain("admin-users");
    expect(staffKeys).not.toContain("admin-users");
    expect(navForRole(null)).toEqual([]);
  });

  it("tidak ada href null yang bisa diklik, danNavigable hanya yang ber-href", () => {
    const adminItems = navForRole("ADMIN");
    const navigable = navigableNavItems("ADMIN").map((item) => item.href);
    expect(navigable.every((href) => href !== null)).toBe(true);
    expect(adminItems.some((item) => item.href === null)).toBe(true);
  });
});
