import { useEffect, useState } from "react";
import { aiAvailability, resetAi, type AiStatus } from "../lib/nano";
import { getJSON, setJSON } from "../lib/storage";

const KEY = "aiAssist";

/** The optional on-device AI setting (off by default) and Chrome's availability for it. */
export function useAiAssist() {
  const [enabled, setEnabledState] = useState(false);
  const [status, setStatus] = useState<AiStatus | "checking">("checking");

  useEffect(() => {
    getJSON<boolean>(KEY).then((v) => setEnabledState(v === true));
    aiAvailability().then(setStatus);
  }, []);

  const setEnabled = async (on: boolean) => {
    setEnabledState(on);
    if (!on) resetAi();
    await setJSON(KEY, on);
  };

  return {
    enabled,
    status,
    /** On, and the model is on this device and ready. */
    ready: enabled && status === "available",
    setEnabled,
    setStatus,
    refresh: () => aiAvailability().then(setStatus),
  };
}
