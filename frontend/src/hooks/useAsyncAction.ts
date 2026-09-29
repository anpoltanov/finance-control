import { useCallback, useRef, useState } from "react";

/**
 * Runs one async action at a time. A second call while the first promise is
 * still running is ignored, and the pending flag is always cleared.
 */
export function useAsyncAction() {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const run = useCallback(async (action: () => Promise<void>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setPending(true);
    setError("");
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : String(err));
      return false;
    } finally {
      running.current = false;
      setPending(false);
    }
  }, []);

  return { pending, error, setError, run };
}
