import type { AgentId } from "./types";

// chrome.storage.local when running as an extension; localStorage under `npm run dev`.
const hasChromeStorage = typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

export async function getJSON<T>(key: string): Promise<T | null> {
  if (hasChromeStorage) {
    const result = await chrome.storage.local.get(key);
    return (result[key] as T | undefined) ?? null;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export async function setJSON(key: string, value: unknown): Promise<void> {
  if (hasChromeStorage) {
    await chrome.storage.local.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable (private window etc.) — the value just won't persist.
  }
}

export async function removeKey(key: string): Promise<void> {
  if (hasChromeStorage) {
    await chrome.storage.local.remove(key);
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

const AGENT_KEY = "agentId";

export async function loadAgentId(): Promise<AgentId | null> {
  if (hasChromeStorage) return getJSON<AgentId>(AGENT_KEY);
  // Dev fallback stores the bare id (not JSON) for backwards compatibility.
  try {
    return (localStorage.getItem(AGENT_KEY) as AgentId | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveAgentId(id: AgentId | null): Promise<void> {
  if (hasChromeStorage) {
    if (id) await setJSON(AGENT_KEY, id);
    else await removeKey(AGENT_KEY);
    return;
  }
  try {
    if (id) localStorage.setItem(AGENT_KEY, id);
    else localStorage.removeItem(AGENT_KEY);
  } catch {
    // ignore
  }
}
