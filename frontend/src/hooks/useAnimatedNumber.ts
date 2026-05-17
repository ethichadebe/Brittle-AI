import { useEffect, useRef, useState } from "react";

export function useAnimatedNumber(target: number, duration = 380) {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const from = displayedRef.current;
    if (Math.abs(from - target) < 0.001) return;

    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - (1 - t) ** 3; // ease-out cubic
      const next = from + (target - from) * ease;
      displayedRef.current = next;
      setDisplayed(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        displayedRef.current = target;
        setDisplayed(target);
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, duration]);

  return displayed;
}
