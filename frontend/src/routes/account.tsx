import { createFileRoute, redirect } from "@tanstack/react-router";

// The account screen is now Profile (#115); kept so an old link or bookmark lands.
export const Route = createFileRoute("/account")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", replace: true });
  },
});
