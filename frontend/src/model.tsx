import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DEFAULT_CONFIG, getConfig, getStatus, type AppConfig, type ModelStatus } from "./api";

export type ModelState = { phase: "loading" } | { phase: "offline" } | { phase: "ready"; status: ModelStatus };

interface Value {
  model: ModelState;
  config: AppConfig;
  refresh: () => Promise<void>;
}

const Ctx = createContext<Value>({
  model: { phase: "loading" },
  config: DEFAULT_CONFIG,
  refresh: async () => {},
});

const POLL_INTERVAL_OFFLINE_MS = 3000;
const POLL_INTERVAL_READY_MS = 15000;

/** Status and limits polling shared by the whole site. Keeps frontend and backend synchronized. */
export function ModelProvider({ children }: { children: ReactNode }) {
  const [model, setModel] = useState<ModelState>({ phase: "loading" });
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const modelRef = useRef<ModelState>(model);
  modelRef.current = model;

  const fetchStatus = useCallback(async (isMounted: () => boolean) => {
    try {
      const status = await getStatus();
      if (!isMounted()) return;
      setModel({ phase: "ready", status });
    } catch {
      if (!isMounted()) return;
      setModel({ phase: "offline" });
    }
  }, []);

  const fetchConfig = useCallback(async (isMounted: () => boolean) => {
    try {
      const c = await getConfig();
      if (!isMounted()) return;
      setConfig(c);
    } catch {
      // Keep default or existing config if request fails
    }
  }, []);

  const refresh = useCallback(async () => {
    const isMounted = () => true;
    await Promise.allSettled([fetchStatus(isMounted), fetchConfig(isMounted)]);
  }, [fetchStatus, fetchConfig]);

  useEffect(() => {
    let alive = true;
    const isMounted = () => alive;

    // Initial check
    fetchStatus(isMounted);
    fetchConfig(isMounted);

    // Polling interval depending on online/offline state
    let timerId: ReturnType<typeof setTimeout>;
    const scheduleNextPoll = () => {
      const interval = modelRef.current.phase === "ready" ? POLL_INTERVAL_READY_MS : POLL_INTERVAL_OFFLINE_MS;
      timerId = setTimeout(async () => {
        if (!alive) return;
        await fetchStatus(isMounted);
        if (modelRef.current.phase !== "ready") {
          fetchConfig(isMounted);
        }
        if (alive) scheduleNextPoll();
      }, interval);
    };

    scheduleNextPoll();

    // Re-check immediately on window focus, visibility change, or online event
    const handleRecheck = () => {
      if (document.visibilityState === "visible") {
        fetchStatus(isMounted);
      }
    };
    window.addEventListener("focus", handleRecheck);
    window.addEventListener("online", handleRecheck);
    document.addEventListener("visibilitychange", handleRecheck);

    return () => {
      alive = false;
      clearTimeout(timerId);
      window.removeEventListener("focus", handleRecheck);
      window.removeEventListener("online", handleRecheck);
      document.removeEventListener("visibilitychange", handleRecheck);
    };
  }, [fetchStatus, fetchConfig]);

  return <Ctx.Provider value={{ model, config, refresh }}>{children}</Ctx.Provider>;
}

export const useModel = () => useContext(Ctx).model;
export const useConfig = () => useContext(Ctx).config;
export const useModelRefresh = () => useContext(Ctx).refresh;
