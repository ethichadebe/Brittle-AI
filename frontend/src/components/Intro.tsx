import { useRef, useState, type ReactNode } from "react";

interface Slide {
  title: string;
  body: string;
  art: ReactNode;
}

const SLIDES: Slide[] = [
  {
    title: "Know your total before the till",
    body: "Build your list at Checkers, Pick n Pay, Shoprite, Woolworths or Makro, with live shelf prices as you add.",
    art: <TotalArt />,
  },
  {
    title: "Tick it off as you shop",
    body: "See what's in your trolley and what's left, with your loyalty card prices counted in.",
    art: <TrolleyArt />,
  },
  {
    title: "Find where it's cheaper",
    body: "Compare your whole list against another store in one tap.",
    art: <CompareArt />,
  },
];

interface IntroProps {
  onGetStarted: () => void;
  onSkip: () => void;
  onSignIn: () => void;
}

// The first-visit introduction (#117): three slides, swiped or stepped
// through, shown once per device.
export function Intro({ onGetStarted, onSkip, onSignIn }: IntroProps) {
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const last = index === SLIDES.length - 1;

  // Slides snap into place as they're swiped; the dots follow.
  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  const goTo = (i: number) => {
    const el = track.current;
    el?.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };

  return (
    <div className="intro" role="dialog" aria-label="Welcome to Accucery">
      <div className="intro-top">
        <span className="intro-brand">Accucery</span>
        <button className="intro-skip" onClick={onSkip}>Skip</button>
      </div>

      <div className="intro-track" ref={track} onScroll={onScroll}>
        {SLIDES.map((s, i) => (
          <section key={s.title} className="intro-slide" aria-hidden={i !== index}>
            <div className="intro-art">{s.art}</div>
            <h1>{s.title}</h1>
            <p>{s.body}</p>
          </section>
        ))}
      </div>

      <div className="intro-dots" role="tablist" aria-label="Slides">
        {SLIDES.map((s, i) => (
          <button
            key={s.title}
            role="tab"
            aria-selected={i === index}
            aria-label={`Slide ${i + 1} of ${SLIDES.length}`}
            className={`intro-dot${i === index ? " intro-dot--on" : ""}`}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <div className="intro-actions">
        <button className="btn btn-primary btn-block" onClick={() => (last ? onGetStarted() : goTo(index + 1))}>
          {last ? "Get started" : "Next"}
        </button>
        <p className="intro-sign-in">
          Already have an account? <button className="auth-link" onClick={onSignIn}>Sign in</button>
        </p>
      </div>
    </div>
  );
}

// Accucery's own drawings, in the theme's colours, so they suit light and dark.

function TotalArt() {
  return (
    <svg width="220" height="190" viewBox="0 0 220 190" fill="none" aria-hidden="true">
      <circle cx="110" cy="95" r="86" fill="var(--primary-soft)" />
      <rect x="62" y="22" width="96" height="146" rx="12" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <path d="M78 48h40M78 66h52M78 84h34M78 102h46" stroke="var(--line-strong)" strokeWidth="5" strokeLinecap="round" />
      <path d="M134 48h8M142 66h0M126 84h16M134 102h8" stroke="var(--line-strong)" strokeWidth="5" strokeLinecap="round" />
      <path d="M74 124h72" stroke="var(--primary)" strokeWidth="2.5" strokeDasharray="4 4" />
      <rect x="74" y="134" width="72" height="22" rx="7" fill="var(--primary)" />
      <path d="M86 145h12M106 145h28" stroke="var(--on-primary)" strokeWidth="4" strokeLinecap="round" />
      <g transform="rotate(-14 172 52)">
        <path d="M150 40h34l10 12-10 12h-34z" fill="var(--primary)" />
        <circle cx="158" cy="52" r="3.5" fill="var(--on-primary)" />
        <path d="M168 52h12" stroke="var(--on-primary)" strokeWidth="3.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function TrolleyArt() {
  return (
    <svg width="220" height="190" viewBox="0 0 220 190" fill="none" aria-hidden="true">
      <circle cx="110" cy="95" r="86" fill="var(--primary-soft)" />
      <path d="M38 50h20l18 76h86l16-58H66" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="86" cy="146" r="9" fill="var(--primary)" />
      <circle cx="150" cy="146" r="9" fill="var(--primary)" />
      <rect x="84" y="78" width="26" height="34" rx="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <rect x="116" y="88" width="30" height="24" rx="5" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <circle cx="160" cy="44" r="20" fill="var(--primary)" />
      <path d="M150 44.5l7 7 13-14" stroke="var(--on-primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CompareArt() {
  return (
    <svg width="220" height="190" viewBox="0 0 220 190" fill="none" aria-hidden="true">
      <circle cx="110" cy="95" r="86" fill="var(--primary-soft)" />
      <rect x="48" y="40" width="54" height="112" rx="10" fill="var(--surface)" stroke="var(--line-strong)" strokeWidth="3" />
      <rect x="118" y="64" width="54" height="88" rx="10" fill="var(--surface)" stroke="var(--primary)" strokeWidth="3" />
      <path d="M60 64h30M60 80h22M60 96h30M60 112h18" stroke="var(--line-strong)" strokeWidth="5" strokeLinecap="round" />
      <path d="M130 86h30M130 102h22M130 118h30" stroke="var(--line-strong)" strokeWidth="5" strokeLinecap="round" />
      <rect x="56" y="128" width="38" height="14" rx="5" fill="var(--line-strong)" />
      <rect x="126" y="128" width="38" height="14" rx="5" fill="var(--primary)" />
      <path d="M134 28l12 14 12-14" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M146 18v22" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
