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
