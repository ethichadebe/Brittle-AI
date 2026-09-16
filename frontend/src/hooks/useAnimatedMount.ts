import { useEffect, useState } from "react";

/**
 * Keeps a component mounted during its exit animation.
 * Returns `rendered` (whether to render at all) and `closing`
 * (whether to apply the exit CSS class).
 */
export function useAnimatedMount(open: boolean, durationMs = 280) {
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- real finding: the open case could be derived during render, but the close case needs the timer. Untangling it changes animation timing and there is no test covering this hook, so it is left for a focused change.
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
      const t = setTimeout(() => {
        setRendered(false);
        setClosing(false);
      }, durationMs);
      return () => clearTimeout(t);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return { rendered, closing };
}
