import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import type { OwnerActivityKind, OwnerDashboard } from "@accucery/types";
import { api, ApiError } from "../lib/api";
import { NotFound } from "../components/NotFound";
import { DayColumns } from "../components/DayColumns";
import { ago, alertLabel, bytes, count, rands, storeName } from "../lib/owner";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

// The Owner's dashboard (2026-10-16): how the whole app is doing, from what
// the database holds. Read-only, totals only, emails masked. To anyone but the
// Owner the server says this isn't here, and so does this page.
function AdminPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<OwnerDashboard | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(() => {
    api.owner
      .dashboard()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 404) setMissing(true);
        else setError("Couldn't load the dashboard. Check your connection and try again.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(fetchDashboard, [fetchDashboard]);

  const load = () => {
    setLoading(true);
    fetchDashboard();
  };

  if (missing) return <NotFound />;

  const asOf = data ? new Date(data.asOf).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }) : null;

  return (
    <div className="page-fade-in owner">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={() => navigate({ to: "/profile" })}>‹</button>
        <h2 className="list-title">Dashboard</h2>
        <div style={{ width: 32 }} />
      </header>

      <div className="owner-bar">
        <span className="owner-asof">{asOf ? `As of ${asOf}` : loading ? "Loading…" : ""}</span>
        <button className="btn btn-ghost owner-refresh" onClick={load} disabled={loading}>
          {loading && data ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      {data && <Dashboard d={data} />}
    </div>
  );
}

function Dashboard({ d }: { d: OwnerDashboard }) {
  const now = new Date(d.asOf).getTime();
  return (
    <>
      <section className="owner-section" aria-labelledby="owner-health">
        <h3 id="owner-health" className="settings-section-title">Alerts</h3>
        {d.alerts.length === 0 ? (
          <p className="owner-ok">
            <span aria-hidden="true">✓</span> No alerts open
          </p>
        ) : (
          <ul className="owner-alerts">
            {d.alerts.map((a) => (
              <li key={a.key} className={`owner-alert owner-alert--${a.level >= 2 ? "critical" : "warning"}`}>
                <span aria-hidden="true">{a.level >= 2 ? "🚨" : "⚠️"}</span>
                <span>
                  <strong>{a.level >= 2 ? "Serious: " : "Warning: "}</strong>
                  {alertLabel(a.key)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="owner-section" aria-labelledby="owner-shoppers">
        <h3 id="owner-shoppers" className="settings-section-title">Shoppers</h3>
        <div className="owner-tiles">
          <Tile label="Accounts" value={d.shoppers.accounts} hero />
          <Tile label="New today" value={d.shoppers.newToday} />
          <Tile label="New in 7 days" value={d.shoppers.newThisWeek} />
          <Tile label="New this month" value={d.shoppers.newThisMonth} />
          <Tile label="Waiting to confirm email" value={d.shoppers.pendingSignups} />
          <Tile label="Devices signed in" value={d.shoppers.signedInDevices} />
          <Tile label="Devices without an account" value={d.shoppers.devicesWithoutAccount} />
        </div>
        <DayColumns title="New accounts a day" days={d.daily.map((x) => ({ day: x.day, value: x.accounts }))} noun={["account", "accounts"]} />
      </section>

      <section className="owner-section" aria-labelledby="owner-lists">
        <h3 id="owner-lists" className="settings-section-title">Lists</h3>
        <div className="owner-tiles">
          <Tile label="Lists" value={d.lists.lists} hero />
          <Tile label="Items on them" value={d.lists.items} />
          <Tile label="New in 7 days" value={d.lists.newThisWeek} />
        </div>
        <DayColumns title="New lists a day" days={d.daily.map((x) => ({ day: x.day, value: x.lists }))} noun={["list", "lists"]} />
      </section>

      <section className="owner-section" aria-labelledby="owner-premium">
        <h3 id="owner-premium" className="settings-section-title">Premium</h3>
        <div className="owner-tiles">
          <Tile label="Paying" value={d.premium.active} hero />
          <Tile label="On a free trial" value={d.premium.trialing} />
          <Tile label="Cancelled, still running" value={d.premium.cancelledRunning} />
          <Tile label="Ended" value={d.premium.ended} />
          <Tile label="Checkouts in 30 days" value={d.premium.checkoutsStarted30d} sub={`${count(d.premium.checkoutsFinished30d)} finished`} />
          <Tile label="Payments this month" value={d.premium.paymentsThisMonth} sub={`about ${rands(d.premium.estimatedIncomeCentsThisMonth)}`} />
        </div>
      </section>

      <section className="owner-section" aria-labelledby="owner-credits">
        <h3 id="owner-credits" className="settings-section-title">ScraperAPI credits</h3>
        <div className="owner-tiles">
          <Tile label="Used this month" value={d.credits.thisMonth} hero />
          <Tile label="Today" value={d.credits.days.at(-1)?.total ?? 0} sub={`guide: ${d.credits.dailyGuide} a day`} />
        </div>
        <DayColumns
          title="Credits a day"
          days={d.credits.days.map((x) => ({ day: x.day, value: x.total }))}
          noun={["credit", "credits"]}
          guide={{ value: d.credits.dailyGuide, label: `guide, ${d.credits.dailyGuide} a day` }}
        />
      </section>

      <section className="owner-section" aria-labelledby="owner-stores">
        <h3 id="owner-stores" className="settings-section-title">Stores</h3>
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th scope="col">Store</th>
                <th scope="col">Lists</th>
                <th scope="col">Searches kept</th>
                <th scope="col">Prices kept</th>
                <th scope="col">Last read</th>
              </tr>
            </thead>
            <tbody>
              {d.stores.map((s) => (
                <tr key={s.store}>
                  <th scope="row">{storeName(s.store)}</th>
                  <td>{count(s.lists)}</td>
                  <td>{count(s.searches)}</td>
                  <td>{count(s.prices)}</td>
                  <td>{s.lastRead ? ago(s.lastRead, now) : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="owner-section" aria-labelledby="owner-db">
        <h3 id="owner-db" className="settings-section-title">Database</h3>
        <div className="owner-tiles">
          <Tile label="Size on disk" text={bytes(d.databaseBytes)} hero />
        </div>
        <div className="owner-table-wrap">
          <table className="owner-table">
            <thead>
              <tr>
                <th scope="col">Table</th>
                <th scope="col">Rows (about)</th>
                <th scope="col">Size</th>
              </tr>
            </thead>
            <tbody>
              {d.tables.map((t) => (
                <tr key={t.table}>
                  <th scope="row">{t.table}</th>
                  <td>{count(t.rows)}</td>
                  <td>{bytes(t.bytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="owner-section" aria-labelledby="owner-activity">
        <h3 id="owner-activity" className="settings-section-title">Latest activity</h3>
        {d.activity.length === 0 ? (
          <p className="owner-muted">Nothing yet.</p>
        ) : (
          <ol className="owner-activity">
            {d.activity.map((a, i) => (
              <li key={`${a.at}-${i}`}>
                <span className="owner-activity-icon" aria-hidden="true">{ICONS[a.kind]}</span>
                <span className="owner-activity-text">{a.text}</span>
                <time className="owner-activity-time" dateTime={a.at}>{ago(a.at, now)}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

const ICONS: Record<OwnerActivityKind, string> = {
  account: "👤",
  signup: "✉️",
  list: "📝",
  checkout: "🛒",
  premium: "⭐",
  renewal: "🔁",
};

function Tile({ label, value, text, sub, hero }: { label: string; value?: number; text?: string; sub?: string; hero?: boolean }) {
  return (
    <div className={`owner-tile${hero ? " owner-tile--hero" : ""}`}>
      <span className="owner-tile-label">{label}</span>
      <span className="owner-tile-value">{text ?? count(value ?? 0)}</span>
      {sub && <span className="owner-tile-sub">{sub}</span>}
    </div>
  );
}
