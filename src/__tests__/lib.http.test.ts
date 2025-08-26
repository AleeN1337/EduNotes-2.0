import { describe, it, expect } from "vitest";
import { unwrap, normalizeId } from "../lib/http";

describe("http helpers", () => {
  it("unwrap returns data.data when present", () => {
    const resp = { data: { data: { ok: true } } };
    expect(unwrap(resp)).toEqual({ ok: true });
  });

  it("unwrap returns raw data when no wrapper", () => {
    const resp = { data: 42 } as any;
    expect(unwrap(resp)).toEqual(42);
  });

  it("normalizeId picks first available candidate and returns string", () => {
    expect(normalizeId({ note_id: 7 })).toBe("7");
    expect(normalizeId({ id: 1, note_id: 2 })).toBe("1");
    expect(normalizeId({})).toBe("");
  });
});
