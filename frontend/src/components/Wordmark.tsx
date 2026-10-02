// "Accucery" with the logo standing in for its "A": the home screen's title.
// The opening animation (index.html) draws the same mark and lands it here,
// so the two must keep the same shapes and the shared .wordmark-a sizing.
export function Wordmark() {
  return (
    <h1 className="home-wordmark" aria-label="Accucery">
      <svg className="wordmark-a" viewBox="124 86 264 340" aria-hidden="true">
        <path
          className="wordmark-a-stroke"
          d="M150 400L256 112l106 288"
          stroke="currentColor"
          strokeWidth="52"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          className="wordmark-tick"
          d="M196 300l38 36 86-86"
          strokeWidth="40"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span aria-hidden="true">ccucery</span>
    </h1>
  );
}
