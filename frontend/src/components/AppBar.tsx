import { useEffect } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAccountSession } from "../hooks/useAccountSession";
import { initials } from "../lib/format";
import { PersonIcon, PlusIcon } from "./icons";
import { Wordmark } from "./Wordmark";

// The top bar on a tablet or PC (2026-10-14), across the whole screen like a
// website's. On a phone each screen keeps its own header instead.
export function AppBar() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { account, refresh } = useAccountSession();
  // Signing in or out happens on other screens; check again after each move.
  useEffect(refresh, [pathname, refresh]);

  const onLists = pathname === "/" || (pathname.startsWith("/lists/") && pathname !== "/lists/new");

  return (
    <header className="app-bar">
      <div className="app-bar-inner">
        <Link to="/" className="app-bar-brand" aria-label="Accucery, my lists">
          <Wordmark as="span" />
        </Link>
        <nav className="app-bar-nav" aria-label="Main">
          <Link to="/" className={`app-bar-link${onLists ? " app-bar-link--on" : ""}`}>
            My lists
          </Link>
          <button className="btn btn-primary app-bar-new" onClick={() => navigate({ to: "/lists/new" })}>
            <PlusIcon />
            New list
          </button>
          {account === null ? (
            <Link to="/sign-in" search={{ then: "/" }} className="app-bar-link">
              Sign in
            </Link>
          ) : (
            <button
              className="avatar"
              aria-label={account ? `Profile (${account.email})` : "Profile"}
              onClick={() => navigate({ to: "/profile" })}
            >
              {account ? initials(account.email) : <PersonIcon />}
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
