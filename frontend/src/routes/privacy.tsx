import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PRIVACY_EMAIL, RESPONSIBLE_PERSON } from "../lib/privacy";
import { Disclaimer } from "../components/Disclaimer";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
});

// #150: the privacy notice POPIA asks for, in plain words. Every statement
// here is what the code does; backend/src/privacyNotice.test.ts checks the
// ones that can drift (how long cookies last, that coordinates aren't kept).
function PrivacyPage() {
  const navigate = useNavigate();
  const back = () => (window.history.length > 1 ? window.history.back() : void navigate({ to: "/" }));
  const mail = <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;

  return (
    <div className="page-fade-in privacy">
      <header className="list-header">
        <button className="btn-back" aria-label="Back" onClick={back}>‹</button>
        <h2 className="list-title">Privacy</h2>
        <div style={{ width: 32 }} />
      </header>

      <article className="privacy-body">
        <p className="privacy-updated">Last updated 3 October 2026</p>

        <h3>Who is responsible</h3>
        <p>
          Accucery is run by {RESPONSIBLE_PERSON}. For any question, request or complaint about your information, email {mail}.
        </p>

        <h3>What we keep, and why</h3>
        <ul>
          <li>
            <strong>Your email and password</strong>, to sign you in. The password is stored scrambled (hashed), so nobody can read
            it, us included.
          </li>
          <li>
            <strong>Your lists</strong> and what's on them, because that's the app. With an account they're kept with your account.
            Without one, they're kept against a random code in a cookie on this device.
          </li>
          <li>
            <strong>The branch a list is priced at</strong>, such as "Checkers FX Sandhurst", if you asked for local prices.
          </li>
          <li>
            <strong>Substitutes you pick or remove</strong> when comparing stores, so the next comparison remembers them. Other
            shoppers may see a substitute suggested as popular: that's a count of picks, with no names.
          </li>
          <li>
            <strong>What people search for</strong> is kept with the prices found, so the next search is faster. It isn't linked to
            who searched.
          </li>
          <li>Your settings (appearance, loyalty cards, using your location) stay on your device, not with us.</li>
        </ul>

        <h3>Your location</h3>
        <p>
          Only used when you ask for a list's nearest branch. Your position is sent once to the store's own website to find that
          branch, then forgotten. We never store it: only the branch's name is kept.
        </p>

        <h3>Cookies</h3>
        <p>
          Two, both needed for the app to work: one keeps you signed in (for 30 days), and one tells this device's lists apart from
          everyone else's (for 400 days). No advertising cookies, no tracking, no analytics.
        </p>

        <h3>Who else handles it</h3>
        <ul>
          <li>
            <strong>Our hosting company</strong>, which rents us the server the app and its database run on.
          </li>
          <li>
            <strong>ScraperAPI</strong>, in the United States, which fetches some stores' web pages for us. It sees what is searched
            for and, when you ask for local prices, your position. It isn't told who you are.
          </li>
          <li>
            <strong>The stores' websites</strong> see the same: searches, and your position once to find a branch.
          </li>
        </ul>
        <p>
          Like most websites, the server logs visitors' IP addresses for security and fault-finding, and clears those logs
          regularly. Nothing is sold, or used for advertising.
        </p>

        <h3>How long we keep it</h3>
        <p>
          Until you delete it. Deleting your account removes your account, your lists and your substitute picks straight away. A
          list made without an account stays until you delete it.
        </p>

        <h3>Your rights</h3>
        <p>
          Under the Protection of Personal Information Act (POPIA) you can ask what we hold about you, have it corrected, or have it
          deleted. You can delete your account yourself, under Profile. For anything else, email {mail}. If you're not happy with
          our answer, you can complain to the Information Regulator at{" "}
          <a href="https://inforegulator.org.za" target="_blank" rel="noreferrer">inforegulator.org.za</a>.
        </p>

        <h3>About the prices</h3>
        <Disclaimer />
      </article>
    </div>
  );
}
