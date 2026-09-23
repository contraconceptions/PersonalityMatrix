import type { AgentId } from "./types";

// chrome.storage.local when running as an extension; localStorage under `npm run dev`.
const hasChromeStorage = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

const AGENT_KEY = "agentId";

export async function loadAgentId(): Promise<AgentId | null> {
  if (hasChromeStorage) {
    const result = await chrome.storage.local.get(AGENT_KEY);
    return (result[AGENT_KEY] as AgentId | undefined) ?? null;
  }
  try {
    return (localStorage.getItem(AGENT_KEY) as AgentId | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveAgentId(id: AgentId | null): Promise<void> {
  if (hasChromeStorage) {
    if (id) await chrome.storage.local.set({ [AGENT_KEY]: id });
    else await chrome.storage.local.remove(AGENT_KEY);
    return;
  }
  try {
    if (id) localStorage.setItem(AGENT_KEY, id);
    else localStorage.removeItem(AGENT_KEY);
  } catch {
    // Storage unavailable (private window etc.) — selection just won't persist.
  }
}
