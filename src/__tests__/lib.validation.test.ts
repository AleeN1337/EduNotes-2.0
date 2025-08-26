import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  createOrganizationSchema,
} from "../lib/validationSchemas";

describe("validation schemas", () => {
  it("loginSchema requires valid email and non-empty password", () => {
    const r1 = loginSchema.safeParse({ email: "bad", password: "" });
    expect(r1.success).toBe(false);
    const r2 = loginSchema.safeParse({ email: "a@b.com", password: "secret" });
    expect(r2.success).toBe(true);
  });

  it("registerSchema enforces password rules and matching confirm", () => {
    const bad = registerSchema.safeParse({
      email: "a@b.com",
      username: "ab",
      firstName: "A",
      lastName: "B",
      password: "short",
      confirmPassword: "mismatch",
    } as any);
    expect(bad.success).toBe(false);

    const ok = registerSchema.safeParse({
      email: "a@b.com",
      username: "user_123",
      firstName: "Jan",
      lastName: "Kowalski",
      password: "Abcdef1g",
      confirmPassword: "Abcdef1g",
    });
    expect(ok.success).toBe(true);
  });

  it("createOrganizationSchema validates name length and charset", () => {
    expect(createOrganizationSchema.safeParse({ name: "" }).success).toBe(
      false
    );
    expect(createOrganizationSchema.safeParse({ name: "X" }).success).toBe(
      false
    );
    expect(
      createOrganizationSchema.safeParse({ name: "Moja Organizacja_1" }).success
    ).toBe(true);
  });
});
