import { useEffect, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { STORE_CONFIGS } from "@accucery/types";
import { Wordmark } from "./Wordmark";
import { StoreLogo } from "./StoreBrand";
import { CompareArt, TotalArt, TrolleyArt } from "./Intro";
import { DISCLAIMER } from "./Disclaimer";
import { InstallApp } from "./InstallApp";
import { formatRand } from "../lib/format";

interface LandingProps {
  /** The main button: into the app, to make a first list. */
  onStart: () => void;
  onSignIn: () => void;
  /** "Open app" in the header: into the app, nothing more. */
  onOpenApp: () => void;
}

const STORE_NAMES = STORE_CONFIGS.map((s) => s.name);
const STORES_IN_WORDS = `${STORE_NAMES.slice(0, -1).join(", ")} and ${STORE_NAMES[STORE_NAMES.length - 1]}`;
const CARDS = [...new Set(STORE_CONFIGS.map((s) => s.loyaltyProgramme).filter((c): c is string => !!c))];
const CARDS_IN_WORDS = `${CARDS.slice(0, -1).join(", ")} and ${CARDS[CARDS.length - 1]}`;

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  { title: "Live shelf prices", body: "Search the store's real products and see today's price as you add them.", icon: <TagIcon /> },
  { title: "Your total, before the till", body: "A running total as your list grows, so the till holds no surprises.", icon: <ReceiptIcon /> },
  { title: "Card prices counted", body: `${CARDS_IN_WORDS} prices, counted in your total.`, icon: <CardIcon /> },
  { title: "Find where it's cheaper", body: "Compare your whole list at another store in one tap.", icon: <ScalesIcon /> },
  { title: "Tick it off as you shop", body: "See what's in your trolley and what's still to get.", icon: <TickIcon /> },
  { title: "Your nearest branch", body: "Share your location and prices come from the branch near you.", icon: <PinIcon /> },
];

const STEPS = [
  { title: "Pick a store", body: "Start a list for the store you shop at." },
  { title: "Add your items", body: "Search, tap, done. Prices fill in as you go." },
  { title: "Compare and go", body: "See if another store is cheaper, then shop with your list." },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Is Accucery free?",
    a: "Yes. Making lists, live prices and comparing your list with another store are free.",
  },
  { q: "Which stores does it cover?", a: `${STORES_IN_WORDS}, with more on the way.` },
  {
    q: "Do I need an account?",
    a: "Not to start: make a list straight away. Comparing your list with another store needs a free account, which also keeps your lists on all your devices.",
  },
  {
    q: "Where do the prices come from?",
    a: "From each store's own website, for your nearest branch when you share your location (Johannesburg prices otherwise). Prices in store can differ, so treat the total as a close guide.",
  },
  {
    q: "Is there an app to download?",
    a: "No app store needed. Accucery runs in your browser, and Install app at the top of this page adds it to your home screen like any other app.",
  },
  {
    q: "What do you do with my information?",
    a: (
      <>
        Only what it takes to run your lists. The <Link to="/privacy">privacy notice</Link> says exactly what's kept and why.
      </>
    ),
  },
];

// An example list for the hero's phone: Checkers prices, with a card price
// counted in, and what the same list comes to at another store.
const EXAMPLE = [
  { name: "Full cream milk 2L", price: 33.99, ticked: true },
  { name: "White bread 700g", price: 17.99, ticked: true },
  { name: "Large eggs 18", price: 64.99, card: 59.99 },
  { name: "Bananas per kg", price: 24.99 },
  { name: "Long grain rice 2kg", price: 39.99 },
];
const EXAMPLE_TOTAL = EXAMPLE.reduce((sum, i) => sum + (i.card ?? i.price), 0);
const EXAMPLE_ELSEWHERE = 168.4;

const checkers = STORE_CONFIGS.find((s) => s.slug === "checkers");
const pickNPay = STORE_CONFIGS.find((s) => s.slug === "pick-n-pay");

// The first thing a newcomer meets in a browser (2026-10-14): what Accucery
// is, and a way in. The app proper is one tap away.
export function Landing({ onStart, onSignIn, onOpenApp }: LandingProps) {
  // The app's own frame (its phone width, or the top bar on a PC) steps
  // aside: this page uses the whole screen and has its own header.
  useEffect(() => {
    document.documentElement.classList.add("on-landing");
    return () => document.documentElement.classList.remove("on-landing");
  }, []);

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-wrap landing-nav-inner">
          <Wordmark as="span" className="landing-brand" />
          <nav className="landing-links" aria-label="On this page">
            <button onClick={() => scrollTo("features")}>Features</button>
            <button onClick={() => scrollTo("how")}>How it works</button>
            <button onClick={() => scrollTo("faq")}>FAQ</button>
          </nav>
          <button className="btn btn-primary btn-pill landing-open" onClick={onOpenApp}>
            Open app
          </button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-wrap landing-hero-inner">
            <div className="landing-hero-copy">
              <p className="landing-eyebrow">Free · For South African shoppers</p>
              <h1>The shopping list that knows the prices</h1>
              <p className="landing-lead">
                Build your list with live prices from {STORES_IN_WORDS}. Know your total before the till, and see where
                the same shop costs less.
              </p>
              <div className="landing-cta">
                <button className="btn btn-primary btn-pill landing-cta-main" onClick={onStart}>
                  Start my list
                </button>
                <InstallApp />
                <p className="landing-cta-note">Free. No sign-up to start.</p>
              </div>
              <p className="landing-sign-in">
                Already have an account?{" "}
                <button className="auth-link" onClick={onSignIn}>
                  Sign in
                </button>
              </p>
            </div>
            <PhoneMock />
          </div>
        </section>

        <section className="landing-stores" aria-label="Stores">
          <div className="landing-wrap">
            <p>Live prices from</p>
            <ul>
              {STORE_CONFIGS.map((s) => (
                <li key={s.slug}>
                  <StoreLogo store={s} size="md" />
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="features" className="landing-section">
          <div className="landing-wrap">
            <h2 className="landing-h2">Six reasons to shop the Accucery way</h2>
            <ul className="landing-features">
              {FEATURES.map((f) => (
                <li key={f.title} className="landing-feature">
                  <span className="landing-feature-icon" aria-hidden="true">
                    {f.icon}
                  </span>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Showcase
          art={<TotalArt />}
          title="Spend less on every shop"
          points={[
            ["Know the total first", "Your list adds itself up, so you can trim it before you leave home."],
            ["Stick to the list", "Shopping from a list is the easiest way to skip the impulse buys."],
            ["Specials included", "Promotions and card prices are in the price you see."],
          ]}
        />
        <Showcase
          art={<CompareArt />}
          title="See where it's cheaper"
          points={[
            ["Your whole list, compared", "One tap prices the same list at another store."],
            ["Like for like", "Each item is matched with the nearest thing on the other store's shelf."],
            ["You decide", "Pick a different match when one doesn't suit, and it's remembered next time."],
          ]}
          flip
        />
        <Showcase
          art={<TrolleyArt />}
          title="Get through the store faster"
          points={[
            ["Tick as you go", "Ticked items move to your trolley, so what's left to get stays on top."],
            ["Swipe to remove", "Changed your mind? Swipe it off the list."],
            ["On every device", "Sign in and your lists are there on any phone or computer."],
          ]}
        />

        <section id="how" className="landing-section landing-how">
          <div className="landing-wrap">
            <h2 className="landing-h2">How it works</h2>
            <ol className="landing-steps">
              {STEPS.map((s, i) => (
                <li key={s.title}>
                  <span className="landing-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="faq" className="landing-section">
          <div className="landing-wrap landing-faq-wrap">
            <h2 className="landing-h2">Questions</h2>
            <div className="landing-faq">
              {FAQ.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-final">
          <div className="landing-wrap">
            <h2>Your next shop, sorted</h2>
            <p>Make your first list in under a minute.</p>
            <button className="btn btn-pill landing-final-btn" onClick={onStart}>
              Start my list
            </button>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap">
          <div className="landing-footer-top">
            <Wordmark as="span" className="landing-brand" />
            <nav aria-label="More">
              <button className="landing-footer-link" onClick={onOpenApp}>
                Open app
              </button>
              <Link className="landing-footer-link" to="/privacy">
                Privacy
              </Link>
              <Link className="landing-footer-link" to="/terms">
                Terms
              </Link>
            </nav>
          </div>
          <p className="landing-footer-note">{DISCLAIMER}</p>
          <p className="landing-footer-note">Made in South Africa.</p>
        </div>
      </footer>
    </div>
  );
}

function Showcase({ art, title, points, flip }: { art: ReactNode; title: string; points: [string, string][]; flip?: boolean }) {
  return (
    <section className={`landing-section landing-showcase${flip ? " landing-showcase--flip" : ""}`}>
      <div className="landing-wrap landing-showcase-inner">
        <div className="landing-showcase-art">{art}</div>
        <div>
          <h2 className="landing-h2">{title}</h2>
          <ul className="landing-points">
            {points.map(([head, body]) => (
              <li key={head}>
                <TickIcon />
                <span>
                  <strong>{head}</strong>
                  <span>{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// A list as the app shows it, drawn in the page: crisp at any size, and in
// the theme's own colours.
function PhoneMock() {
  return (
    <figure className="landing-phone" aria-label="An example list in Accucery: five items at Checkers, with the total and a cheaper total at Pick n Pay">
      <div className="landing-phone-screen" aria-hidden="true">
        <div className="landing-phone-head">
          <strong>Weekly shop</strong>
          {checkers && <StoreLogo store={checkers} />}
        </div>
        <ul className="landing-phone-items">
          {EXAMPLE.map((item) => (
            <li key={item.name} className={item.ticked ? "landing-phone-item--ticked" : undefined}>
              <span className="landing-phone-check">{item.ticked && <TickIcon />}</span>
              <span className="landing-phone-name">{item.name}</span>
              <span className="landing-phone-price">
                {item.card ? (
                  <>
                    <s>{formatRand(item.price)}</s>
                    <b>{formatRand(item.card)}</b>
                  </>
                ) : (
                  formatRand(item.price)
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="landing-phone-total">
          <span>Total</span>
          <strong>{formatRand(EXAMPLE_TOTAL)}</strong>
        </div>
      </div>
      <div className="landing-phone-badge" aria-hidden="true">
        {pickNPay && <StoreLogo store={pickNPay} />}
        <span>
          <strong>{formatRand(EXAMPLE_ELSEWHERE)}</strong>
          <small>{formatRand(EXAMPLE_TOTAL - EXAMPLE_ELSEWHERE)} cheaper</small>
        </span>
      </div>
    </figure>
  );
}

// Line icons for the feature cards, drawn in currentColor.

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function TagIcon() {
  return (
    <Icon>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="8" cy="8" r="1.5" />
    </Icon>
  );
}

function ReceiptIcon() {
  return (
    <Icon>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Icon>
  );
}

function CardIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M7 15h4" />
    </Icon>
  );
}

function ScalesIcon() {
  return (
    <Icon>
      <path d="M12 3v18M7 21h10M5 7h14" />
      <path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />
    </Icon>
  );
}

function TickIcon() {
  return (
    <Icon>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </Icon>
  );
}

function PinIcon() {
  return (
    <Icon>
      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
      <circle cx="12" cy="9" r="2.5" />
    </Icon>
  );
}
