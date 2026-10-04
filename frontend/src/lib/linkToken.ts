import { useEffect, useState } from "react";

// #148, #149: the token in a confirm or reset link. Kept in state, and the
// address bar is cleaned so it isn't left in history, on screen, or in a
// screenshot.
export function useLinkToken(fromUrl: string | undefined): string {
  const [token] = useState(() => fromUrl ?? "");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("token")) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
    }
  }, []);
  return token;
}

export const tokenSearch = (search: Record<string, unknown>): { token?: string } =>
  typeof search.token === "string" ? { token: search.token } : {};
