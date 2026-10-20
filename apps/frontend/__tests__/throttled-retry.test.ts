import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const { ensureFreshAccessToken, refreshSession } = vi.hoisted(() => ({
  ensureFreshAccessToken: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return { ...actual, apiRequest };
});

vi.mock("@/lib/auth-client", () => ({ refresh: refreshSession }));
vi.mock("@/lib/auth-session", () => ({
  clearAccessToken: vi.fn(),
  readAccessToken: vi.fn(() => "tok"),
}));

// Hook kecil supaya waitBeforeThrottledRetry tidak membuat test menunggu sungguhan.
vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void) => {
  callback();
  return 0 as unknown as ReturnType<typeof setTimeout>;
}) as never);

import { sessionRequest } from "@/lib/session-refresh";
import { ApiError } from "@/lib/api-client";

const throttled = new ApiError({
  status: 429,
  code: "THROTTLED",
  message: "Terlalu banyak permintaan",
  retryAfterSeconds: 1,
});

beforeEach(() => {
  apiRequest.mockReset();
  ensureFreshAccessToken.mockReset().mockResolvedValue(undefined);
  refreshSession.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sessionRequest saat 429", () => {
  it("GET menunggu Retry-After lalu memutar SEKALI dan berhasil", async () => {
    apiRequest
      .mockRejectedValueOnce(throttled)
      .mockResolvedValueOnce(["jadi"] as never);

    await expect(sessionRequest("/stores")).resolves.toEqual(["jadi"]);

    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("kalau request kedua masih 429, error dilempar (tidak memutar terus)", async () => {
    apiRequest.mockRejectedValue(throttled);

    await expect(sessionRequest("/stores")).rejects.toMatchObject({ status: 429 });

    expect(apiRequest).toHaveBeenCalledTimes(2);
  });

  it("mutasi (POST) TIDAK pernah diputar otomatis saat 429", async () => {
    apiRequest.mockRejectedValue(throttled);

    await expect(
      sessionRequest("/stores", { method: "POST", body: { name: "x" } }),
    ).rejects.toMatchObject({ status: 429 });

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });

  it("galat lain tetap dilempar tanpa menunggu", async () => {
    const boom = new ApiError({ status: 0, code: "HTTP_ERROR", message: "boom" });
    apiRequest.mockRejectedValue(boom);

    await expect(sessionRequest("/stores")).rejects.toMatchObject({ code: "HTTP_ERROR" });

    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
