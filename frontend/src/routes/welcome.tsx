import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Landing } from "../components/Landing";
import { markIntroSeen } from "../lib/onboarding";

export const Route = createFileRoute("/welcome")({
  component: Welcome,
});

const storage = () => window.localStorage;

// The landing page at its own address (2026-10-14), for anyone, whether or
// not they already use Accucery: to share, and to see it again. Newcomers
// also meet it at "/".
function Welcome() {
  const navigate = useNavigate();
  const into = (to: "/" | "/lists/new" | "/sign-in") => {
    markIntroSeen(storage);
    void navigate(to === "/sign-in" ? { to, search: { then: "/" } } : { to });
  };
  return <Landing onStart={() => into("/lists/new")} onOpenApp={() => into("/")} onSignIn={() => into("/sign-in")} />;
}
