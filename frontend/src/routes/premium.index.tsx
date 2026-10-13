import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { PremiumPlan, PremiumStatus } from "@accucery/types";
import { api, ApiError } from "../lib/api";
import { useAccountSession } from "../hooks/useAccountSession";
import { PLAN_LABEL, priceLine, shortDate, statusLine, yearlySaving } from "../lib/premium";
import { CheckIcon } from "../components/icons";

export const Route = createFileRoute("/premium/")({
  component: PremiumPage,
});

// #171: Premium, paid through Paystack. R29 a month or R249 a year, with a
// 7-day free trial (one per account and one per card).
const PERKS = [
  { title: "No ads", body: "Anywhere in the app." },
  { title: "Compare every store at once", body: "Your whole list's total at each store, cheapest first." },
  { title: "Share lists with your family", body: "Everyone at home on the same list." },
];

function PremiumPage() {
  const navigate = useNavigate();
  const { account } = useAccountSession();
  const [status, setStatus] = useState<PremiumStatus | null>(null);
  const [plan, setPlan] = useState<PremiumPlan>("monthly");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // Read once, so the trial's end date doesn't shift between renders.
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    api.premium.status().then(setStatus).catch(() => setError("Couldn't load Premium. Check your connection."));
  }, [account]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const subscribe = () =>
    run(async () => {
      const { url } = await api.premium.checkout(plan);
      // Paystack's own page takes the card; it sends the shopper back to /premium/return.
      window.location.href = url;
    });

  const cancel = () =>
    run(async () => {
      setStatus(await api.premium.cancel());
      setConfirmingCancel(false);
    });

  const changeCard = () =>
    run(async () => {
      window.location.href = (await api.premium.manageLink()).url;
    });

  const trial = Boolean(status?.trialAvailable);

  return (
    <div className="page-fade-in premium">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={() => navigate({ to: "/profile" })}>‹</button>
        <h2 className="list-title">Premium</h2>
        <div style={{ width: 32 }} />
      </header>

      {error && <p className="form-error premium-error" role="alert">{error}</p>}

      {status?.premium ? (
        <section className="premium-card" aria-label="Your Premium">
          <h3>You have Premium</h3>
          <p className="premium-status">{statusLine(status)}</p>
          <div className="premium-actions">
            <button className="btn btn-ghost" disabled={busy} onClick={changeCard}>Change card</button>
            {!status.cancelled && (
              <button className="btn btn-ghost premium-cancel" disabled={busy} onClick={() => setConfirmingCancel(true)}>
                Cancel Premium
              </button>
            )}
          </div>
        </section>
      ) : (
        <>
          <section className="premium-card">
            <h3>Accucery Premium</h3>
            <ul className="premium-perks">
              {PERKS.map((p) => (
                <li key={p.title}>
                  <CheckIcon />
                  <span>
                    <strong>{p.title}</strong>
                    <span>{p.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          {status && !status.available && <p className="premium-note">Premium isn't available yet.</p>}

          {status?.available && (
            <section className="premium-card">
              <div className="segmented premium-plans" role="radiogroup" aria-label="Plan">
                {(["monthly", "yearly"] as const).map((p) => (
                  <button
                    key={p}
                    role="radio"
                    aria-checked={plan === p}
                    className={`segmented-option${plan === p ? " segmented-option--on" : ""}`}
                    onClick={() => setPlan(p)}
                  >
                    {PLAN_LABEL[p]}
                  </button>
                ))}
              </div>
              <p className="premium-price">
                {priceLine(plan, status.prices[plan])}
                {plan === "yearly" && <span className="premium-saving">Save {yearlySaving(status.prices)}%</span>}
              </p>

              {account === null ? (
                <button className="btn btn-primary btn-block" onClick={() => navigate({ to: "/sign-in", search: { then: "/premium" } })}>
                  Sign in to get Premium
                </button>
              ) : (
                <button className="btn btn-primary btn-block" disabled={busy || account === undefined} onClick={subscribe}>
                  {busy ? "Opening Paystack…" : trial ? `Start ${status.trialDays}-day free trial` : "Subscribe"}
                </button>
              )}

              <p className="premium-fine">
                {trial ? (
                  <>
                    Free for {status.trialDays} days, then {priceLine(plan, status.prices[plan])}. Cancel any time before{" "}
                    {shortDate(new Date(openedAt + status.trialDays * 864e5).toISOString())} and you won't be charged. We
                    check your card with a small charge that's refunded straight away. One free trial per card.
                  </>
                ) : (
                  <>Renews automatically until you cancel. Cancel any time in Profile.</>
                )}{" "}
                Payments by Paystack. By continuing you agree to the <Link to="/terms">terms</Link>.
              </p>
            </section>
          )}
        </>
      )}

      {confirmingCancel && status && (
        <div className="modal-backdrop" onClick={() => setConfirmingCancel(false)}>
          <div className="modal" role="dialog" aria-label="Cancel Premium" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel Premium?</h3>
            <p className="modal-body">
              {status.trialing && status.trialEndsAt
                ? `You won't be charged. Premium stays on until your trial ends on ${shortDate(status.trialEndsAt)}.`
                : `It won't renew. You keep Premium until ${status.accessUntil ? shortDate(status.accessUntil) : "the end of what you've paid for"}.`}
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={busy} onClick={() => setConfirmingCancel(false)}>Keep it</button>
              <button className="btn btn-danger" disabled={busy} onClick={cancel}>{busy ? "Cancelling…" : "Cancel Premium"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
