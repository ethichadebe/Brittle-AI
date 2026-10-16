import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { AppBar } from "../components/AppBar";
import { useWide } from "../hooks/useWide";
import { NotFound } from "../components/NotFound";

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: NotFound,
});

// On a tablet or PC (2026-10-14) the app gets a top bar, and each screen a
// width that suits it: the lists and a list use the screen, forms and
// settings a readable column. On a phone neither applies.
function Root() {
  const wide = useWide();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const roomy = pathname === "/" || pathname === "/admin" || (pathname.startsWith("/lists/") && pathname !== "/lists/new");
  return (
    <>
      {wide && <AppBar />}
      <div className={`app-main${roomy ? "" : " app-main--narrow"}`}>
        <Outlet />
      </div>
    </>
  );
}
