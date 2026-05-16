import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { HealthResponse } from "@accucery/types";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const [health, setHealth] = useState<string>("checking…");

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json() as Promise<HealthResponse>)
      .then((data) => setHealth(data.status))
      .catch(() => setHealth("unreachable"));
  }, []);

  return (
    <div style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>Accucery</h1>
      <p>Backend: <strong>{health}</strong></p>
    </div>
  );
}
