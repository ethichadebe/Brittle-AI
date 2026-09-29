import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, ApiError } from "./api";

function fakeResponse(init: { ok: boolean; status: number; statusText?: string; body?: unknown }) {
  return {
    ok: init.ok,
    status: init.status,
    statusText: init.statusText ?? "",
    json: () => (init.body === undefined ? Promise.reject(new Error("no body")) : Promise.resolve(init.body)),
  } as Response;
}

describe("api error handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // The whole point of ApiError: a shopper signing in with the wrong
  // password should see "Invalid email or password", not "401
  // Unauthorized" — the backend's own message has to survive the trip.
  it("surfaces the backend's own error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({ ok: false, status: 401, body: { error: "Invalid email or password" } })
      )
    );

    await expect(api.account.signIn("a@b.com", "wrong")).rejects.toMatchObject({
      message: "Invalid email or password",
      status: 401,
    });
  });

  it("falls back to the status text when the body has no error field", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 500, statusText: "Internal Server Error" }))
    );

    await expect(api.account.session()).rejects.toMatchObject({
      message: "500 Internal Server Error",
    });
  });

  it("throws an instance of ApiError specifically, not a bare Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({ ok: false, status: 409, body: { error: "taken" } }))
    );

    await expect(api.account.signUp("a@b.com", "password123")).rejects.toBeInstanceOf(ApiError);
  });

  it("does not attempt to parse a body on a 204", async () => {
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 204, json }));

    await api.account.signOut();
    expect(json).not.toHaveBeenCalled();
  });
});
