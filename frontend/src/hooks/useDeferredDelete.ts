import { useEffect, useRef, useState } from "react";

// How long "… · UNDO" stays up before the delete really happens.
export const UNDO_MS = 5000;

interface Pending<T> {
  item: T;
  index: number;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Delete with UNDO (#110, #112): the caller takes the thing off the screen at
 * once and hands it here with where it was. The server is only asked to
 * delete it when the undo window passes, when a second delete starts (one
 * undo at a time), or when the screen goes away. If the server refuses, the
 * thing comes back rather than silently vanishing from this screen only.
 */
export function useDeferredDelete<T>(
  commit: (item: T) => Promise<unknown>,
  restore: (item: T, index: number) => void
) {
  const pending = useRef<Pending<T> | null>(null);
  const [undoable, setUndoable] = useState<T | null>(null);
  // The latest callbacks, for a timer or unmount that outlives the render
  // that scheduled it.
  const latest = useRef({ commit, restore });
  useEffect(() => {
    latest.current = { commit, restore };
  });

  const settle = (p: Pending<T>) => {
    clearTimeout(p.timer);
    if (pending.current === p) {
      pending.current = null;
      setUndoable(null);
    }
    latest.current.commit(p.item).catch((e) => {
      console.error(e);
      latest.current.restore(p.item, p.index);
    });
  };

  // Leaving the screen ends the undo window: the delete happens now.
  useEffect(
    () => () => {
      if (pending.current) settle(pending.current);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only; settle reads refs, not render state
    []
  );

  const remove = (item: T, index: number) => {
    if (pending.current) settle(pending.current);
    const p: Pending<T> = { item, index, timer: setTimeout(() => settle(p), UNDO_MS) };
    pending.current = p;
    setUndoable(item);
  };

  const undo = () => {
    const p = pending.current;
    if (!p) return;
    clearTimeout(p.timer);
    pending.current = null;
    setUndoable(null);
    latest.current.restore(p.item, p.index);
  };

  return { undoable, remove, undo };
}
