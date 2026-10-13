import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PRIVACY_EMAIL, RESPONSIBLE_PERSON } from "../lib/privacy";
import { Disclaimer } from "../components/Disclaimer";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
});

// #171: the terms Premium is sold on, in plain words. Every statement here is
// what the code does (backend/src/payments/premium.ts): the price, the 7-day
// trial and its card check, one trial per card, cancelling keeps what's paid
// for.
function TermsPage() {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? window.history.back() : void navigate({ to: "/" }));
  const mail = <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;

  return (
    <div className="page-fade-in privacy">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={back}>‹</button>
        <h2 className="list-title">Terms</h2>
        <div style={{ width: 32 }} />
      </header>

      <article className="privacy-body">
        <p className="privacy-updated">Last updated 13 October 2026</p>

        <h3>Who you're dealing with</h3>
        <p>
          Accucery is run by {RESPONSIBLE_PERSON}, in South Africa. For anything about these terms or a payment, email {mail}.
        </p>

        <h3>The app</h3>
        <p>
          Accucery is free to use. Prices come from the stores' own websites and can change or differ in store, so totals are
          estimates. Check prices before you buy.
        </p>

        <h3>Premium</h3>
        <ul>
          <li>
            <strong>Price:</strong> R29 a month or R249 a year, VAT included where it applies. Paid by card through Paystack;
            your card details go to Paystack, never to us.
          </li>
          <li>
            <strong>Renewal:</strong> Premium renews automatically each month or year, on your card, until you cancel.
          </li>
          <li>
            <strong>Free trial:</strong> 7 days, one per person and one per card. To start it we check your card with a small
            charge (R10) and refund it straight away. Your first payment is taken when the trial ends, unless you cancel before
            then.
          </li>
          <li>
            <strong>Cancelling:</strong> any time, in Profile → Premium. Nothing more is charged. You keep Premium until the end
            of the time you've paid for, or of your trial.
          </li>
          <li>
            <strong>Refunds:</strong> if you're charged by mistake, or something you paid for doesn't work, email us and we'll put
            it right. Part-used months or years aren't otherwise refunded, except where the law says they must be.
          </li>
          <li>
            <strong>Price changes:</strong> we'll email you at least 30 days before a new price applies to your subscription, and
            you can cancel before it does.
          </li>
          <li>
            <strong>Deleting your account</strong> cancels Premium first.
          </li>
        </ul>

        <h3>Fair use</h3>
        <p>
          Don't use the app to scrape prices in bulk or to get around its limits. We may limit or close an account that does.
        </p>

        <h3>Your information</h3>
        <p>
          See the <Link to="/privacy">privacy notice</Link>.
        </p>

        <h3>The law</h3>
        <p>
          These terms are under South African law. Nothing in them takes away your rights under the Consumer Protection Act or
          the Electronic Communications and Transactions Act.
        </p>

        <h3>About the prices</h3>
        <Disclaimer />
      </article>
    </div>
  );
}
