import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PremiumOutcome, PremiumStatus } from "@accucery/types";
import { api, ApiError } from "../lib/api";
import { outcomeMessage } from "../lib/premium";

// #171: where Paystack sends the shopper back, with ?reference=... (and
// ?trxref=, the same value). The server checks the payment with Paystack
// itself; nothing here is taken on the browser's word.
export const Route = createFileRoute("/premium/return")({
  component: PremiumReturn,
  validateSearch: (search: Record<string, unknown>) => ({
    reference: typeof search.reference === "string" ? search.reference : typeof search.trxref === "string" ? search.trxref : "",
  }),
});

const TRIES = 5;
const WAIT_MS = 2000;

function PremiumReturn() {
  const navigate = useNavigate();
  const { reference } = Route.useSearch();
  const [result, setResult] = useState<{ outcome: PremiumOutcome; status: PremiumStatus | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) return;
    let stopped = false;
    (async () => {
      // Paystack can take a moment to say a payment went through.
      for (let i = 0; i < TRIES && !stopped; i++) {
        try {
          const r = await api.premium.confirm(reference);
          if (stopped) return;
          setResult(r);
          if (r.outcome !== "pending") return;
        } catch (e) {
          if (!stopped) setError(e instanceof ApiError ? e.message : "Couldn't check your payment. Check your connection.");
          return;
        }
        await new Promise((r) => setTimeout(r, WAIT_MS));
      }
    })();
    return () => {
      stopped = true;
    };
  }, [reference]);

  const message = result ? outcomeMessage(result.outcome, result.status) : null;

  return (
    <div className="page-fade-in premium">
      <header className="list-header">
        <div style={{ width: 32 }} />
        <h2 className="list-title">Premium</h2>
        <div style={{ width: 32 }} />
      </header>
      <section className="premium-card" role="status">
        {!reference || error ? (
          <>
            <h3>Couldn't check that payment</h3>
            <p>{error ?? "No payment to check."}</p>
          </>
        ) : message ? (
          <>
            <h3>{message.title}</h3>
            <p>{message.body}</p>
          </>
        ) : (
          <>
            <span className="spinner" aria-hidden="true" />
            <h3>Checking your payment…</h3>
          </>
        )}
        <button className="btn btn-primary btn-block" onClick={() => navigate({ to: message?.ok ? "/" : "/premium" })}>
          {message?.ok ? "Back to my lists" : "Back to Premium"}
        </button>
      </section>
    </div>
  );
}
