import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuthAPI } from "@/lib/authApiWithFallback";

// Minimal user fixture present in MOCK_USERS for fallback path
const knownEmail = "test@example.com";

describe("AuthAPI.login fallback", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        // Simulate backend error so fallback path is used
        return new Response(JSON.stringify({ success: false }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }) as any
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    document.cookie =
      "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("stores token and user in localStorage when using mock fallback", async () => {
    const res = await AuthAPI.login({ email: knownEmail, password: "x" });
    expect(res.success).toBe(true);
    expect(localStorage.getItem("auth_token")).toBeTruthy();
    expect(localStorage.getItem("user")).toBeTruthy();
  });
});
