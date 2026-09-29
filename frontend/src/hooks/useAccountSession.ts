import { useCallback, useEffect, useState } from "react";
import { api, type AccountPublic } from "../lib/api";

// `undefined` while the initial check is in flight, `null` once we know for
// certain nobody is signed in. Settings and the Account page both need this,
// so it lives here rather than being fetched twice with two chances to
// disagree about whether the shopper is signed in.
export function useAccountSession() {
  const [account, setAccount] = useState<AccountPublic | null | undefined>(undefined);

  const refresh = useCallback(() => {
    api.account
      .session()
      .then((r) => setAccount(r.account))
      .catch(() => setAccount(null));
  }, []);

  useEffect(refresh, [refresh]);

  return { account, refresh, setAccount };
}
