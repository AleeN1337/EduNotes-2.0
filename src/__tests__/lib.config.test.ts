import { describe, it, expect, vi } from "vitest";

async function importConfigWithEnv(env: Record<string, string | undefined>) {
  const original = { ...process.env };
  try {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) {
        delete (process.env as any)[k];
      } else {
        (process.env as any)[k] = v;
      }
    }

    vi.resetModules();

    const mod: typeof import("../lib/config") = await import("../lib/config");
    return mod;
  } finally {
    process.env = original;
  }
}

describe("config helpers", () => {
  it("buildImageProxyUrl encodes target URL", async () => {
    const { buildImageProxyUrl } = await import("../lib/config");
    const target = "http://example.com/a b?x=1&y=2";
    const url = buildImageProxyUrl(target);
    expect(url).toContain("/api/image-proxy?url=");
    expect(url).toContain(encodeURIComponent(target));
  });

  it("MEDIA_BASE defaults to http://localhost:8000 when env not set", async () => {
    const { MEDIA_BASE } = await importConfigWithEnv({
      NEXT_PUBLIC_MEDIA_BASE: undefined,
    });
    expect(MEDIA_BASE).toBe("http://localhost:8000");
  });

  it("MEDIA_BASE uses NEXT_PUBLIC_MEDIA_BASE without trailing slash", async () => {
    const { MEDIA_BASE } = await importConfigWithEnv({
      NEXT_PUBLIC_MEDIA_BASE: "http://api.local/",
    });
    expect(MEDIA_BASE).toBe("http://api.local");
  });
});
