import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./store";

type AssistantModel = {
  model: string;
  displayName: string;
  defaultReasoningEffort: string;
  supportedReasoningEfforts: { reasoningEffort: string }[];
};
type AssistantStatus = {
  connected?: boolean;
  available?: boolean;
  busy?: boolean;
  error?: string;
  schedules?: boolean;
  transcription?: boolean;
  login_pending?: boolean;
  models?: AssistantModel[];
};

export function useAssistantStatus(userId: string | undefined) {
  const [status, setStatus] = useState<AssistantStatus>({});
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useEffect(() => {
    const current = ++generation.current;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 4000;
    setStatus({});
    async function check() {
      if (!userId || current !== generation.current) return;
      let next: AssistantStatus;
      try {
        next = await api("/api/ai/status");
      } catch {
        next = { error: "Could not check the connection." };
      }
      if (current !== generation.current) return;
      // The companion returns connected:false when a turn holds its runtime.
      // Only an available, idle runtime can answer the account question.
      if (next.busy || !next.available)
        next = { ...next, connected: undefined };
      setStatus(next);
      if (next.busy && navigator.onLine) {
        timer = setTimeout(check, delay);
        delay = Math.min(delay * 2, 30000);
      }
    }
    void check();
    window.addEventListener("online", retry);
    return () => {
      ++generation.current;
      clearTimeout(timer);
      window.removeEventListener("online", retry);
    };
  }, [userId, attempt, retry]);

  function confirmed(next: AssistantStatus) {
    ++generation.current;
    setStatus((previous) => ({
      ...previous,
      busy: false,
      error: undefined,
      ...next,
    }));
  }
  return { status, retry, confirmed };
}
