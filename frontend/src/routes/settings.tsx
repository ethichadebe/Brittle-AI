import { createFileRoute, redirect } from "@tanstack/react-router";

// Settings now live on Profile (#115); kept so an old link or bookmark lands.
export const Route = createFileRoute("/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/profile", replace: true });
  },
});
