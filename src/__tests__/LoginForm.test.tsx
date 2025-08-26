import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginForm from "@/components/LoginForm";
import * as AuthMod from "@/lib/authApiWithFallback";

describe("LoginForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // clean localStorage between tests
    localStorage.clear();
    document.cookie =
      "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("shows validation errors on empty submit", async () => {
    render(<LoginForm />);

    const submit = screen.getByRole("button", { name: /zaloguj się/i });
    fireEvent.click(submit);

    // Expect helper texts for both fields
    expect(
      await screen.findAllByText(/wymagane|nieprawidłowy|hasło/i)
    ).toBeTruthy();
  });

  it("calls AuthAPI.login and triggers onSuccess on success", async () => {
    const onSuccess = vi.fn();
    const loginSpy = vi
      .spyOn(AuthMod.AuthAPI, "login")
      .mockResolvedValue({ success: true } as any);

    render(<LoginForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText(/hasło/i), {
      target: { value: "Secret!23" },
    });

    fireEvent.click(screen.getByRole("button", { name: /zaloguj się/i }));

    await waitFor(() => expect(loginSpy).toHaveBeenCalled());

    // onSuccess is called after 500ms timeout
    vi.advanceTimersByTime(600);
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });
});
