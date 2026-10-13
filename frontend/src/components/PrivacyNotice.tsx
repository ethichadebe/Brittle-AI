import { PRIVACY_EMAIL, RESPONSIBLE_PERSON } from "../lib/privacy";
import { Disclaimer } from "./Disclaimer";

// #150: the privacy notice POPIA asks for, in plain words. Every statement
// here is what the code does; backend/src/privacyNotice.test.ts checks the
// ones that can drift (how long cookies last, that coordinates aren't kept),
// and PrivacyNotice.test.ts that it tells the truth about ads either way.
//
// adsOn: Google AdSense is set up (src/adsConfig.ts). Until it is, the
// notice says what it always said; from the day it is, it says so.
export function PrivacyNotice({ adsOn }: { adsOn: boolean }) {
  const mail = <a href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</a>;

  return (
    <article className="privacy-body">
      <p className="privacy-updated">Last updated {adsOn ? "13 October 2026" : "3 October 2026"}</p>

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
      {adsOn ? (
        <p>
          Two of our own, both needed for the app to work: one keeps you signed in (for 30 days), and one tells this device's lists
          apart from everyone else's (for 400 days). Google sets its own too: Google Analytics to count visits, and Google AdSense
          for the ads (see below).
        </p>
      ) : (
        <p>
          Two of our own, both needed for the app to work: one keeps you signed in (for 30 days), and one tells this device's lists
          apart from everyone else's (for 400 days). Google Analytics sets its own too, to count visits (see below). No advertising
          cookies.
        </p>
      )}

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
          <strong>Resend</strong>, in the United States, which sends the app's emails. It sees your email address and what we
          send you.
        </li>
        <li>
          <strong>Google Analytics</strong>, run by Google in the United States, which counts how the app is used: which screens
          are opened, and a few actions such as creating a list or comparing prices, with the store's name. It also sees your
          device, browser and rough area. It never gets your email, your lists, what you search for or your exact location, and
          it isn't used for advertising. Google keeps it for 2 months. Your browser's tracking protection or an ad blocker
          turns it off, and the app works the same.
        </li>
        {adsOn && (
          <li>
            <strong>Google AdSense</strong>, run by Google in the United States, which shows the ads in the app, each marked "Ad".
            The ads are personalised: Google may use its cookies and what it knows of your browsing on other sites to choose
            ones that might interest you. We don't give it your email, your lists or what you search for. It sees the page you're
            on, your device, browser and rough area. You can turn personalised ads off at{" "}
            <a href="https://myadcenter.google.com" target="_blank" rel="noreferrer">myadcenter.google.com</a>, and your
            browser's tracking protection or an ad blocker hides them; the app works the same.
          </li>
        )}
        <li>
          <strong>Paystack</strong>, a payment company owned by Stripe, which takes Premium payments if you subscribe. Your card details
          go to Paystack, never to us. We keep your plan, when it renews or ends, and Paystack's references for your
          subscription. To give each card one free trial, we keep Paystack's fingerprint of the card used for a trial (never its
          number), even after you delete your account.
        </li>
        <li>
          <strong>The stores' websites</strong> see the same: searches, and your position once to find a branch.
        </li>
      </ul>
      <p>
        Like most websites, the server logs visitors' IP addresses for security and fault-finding, and clears those logs
        regularly.{" "}
        {adsOn
          ? "Nothing is sold, and your email, lists and searches are never used for advertising."
          : "Nothing is sold, or used for advertising."}
      </p>

      <h3>How long we keep it</h3>
      <p>
        Until you delete it. Deleting your account cancels any Premium subscription, then removes your account, your lists and
        your substitute picks straight away. The only thing kept is the fingerprint of a card that had a free trial, with nothing
        to say whose it was. A list made without an account stays until you delete it.
      </p>
      <p>
        If you sign up but never confirm your email, the sign-up is deleted within a day of its link expiring. Password reset
        links expire after an hour and are then deleted too.
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
  );
}
