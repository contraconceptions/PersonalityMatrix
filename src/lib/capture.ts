// Chat auto-capture (roadmap R5): a content script on the client's chat/CRM page sends each new customer
// message to the side panel, which fills the "what the customer said" box (the agent still confirms).
// Configured per client in Settings; Chrome grants access to that one site only, at runtime.
// Messages go page → extension in memory only; they're never stored or sent anywhere else.

export const CAPTURE_KEY = "captureConfig";
export const CAPTURE_SCRIPT_ID = "pm-capture";
export const CAPTURE_MESSAGE = "pm-capture";

export interface CaptureConfig {
  enabled: boolean;
  /** Chrome match pattern for the chat site, e.g. "https://support.example.com/*". */
  match: string;
  /** CSS selector of the element that holds the conversation. */
  container: string;
  /** CSS selector matching one customer message (inside the container). */
  customerMessage: string;
}

export interface CaptureMessage {
  type: typeof CAPTURE_MESSAGE;
  text: string;
}

export const MAX_CAPTURE_CHARS = 1000;

/**
 * Accept "support.example.com", "https://support.example.com" or a full match pattern, and return a
 * match pattern Chrome accepts ("https://support.example.com/*"), or null if it isn't a usable site.
 */
export function toMatchPattern(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z*]+:\/\//i.test(s)) s = `https://${s}`;
  const m = /^(https?|\*):\/\/(\*|(?:\*\.)?[a-z0-9.-]+(?::\d+)?)(\/.*)?$/i.exec(s);
  if (!m || m[2] === "*") return null; // one site only, never all sites
  const path = !m[3] || m[3] === "/" ? "/*" : m[3];
  return `${m[1].toLowerCase()}://${m[2].toLowerCase()}${path}`;
}

/** The origin pattern to request permission for (Chrome permissions use the host, any path). */
export function originPattern(match: string): string {
  const m = /^([^:]+:\/\/[^/]+)/.exec(match);
  return `${m ? m[1] : match}/*`;
}

/** Returns a readable problem, or null if the selector is valid CSS. */
export function checkSelector(selector: string, doc: Pick<Document, "querySelector"> | null = globalThis.document ?? null): string | null {
  if (!selector.trim()) return "Enter a CSS selector.";
  if (!doc) return null; // can't check outside a page (tests)
  try {
    doc.querySelector(selector);
    return null;
  } catch {
    return `"${selector}" isn't a valid CSS selector.`;
  }
}

/** Clean up captured text: collapse whitespace, cap the length. */
export function cleanCaptured(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, MAX_CAPTURE_CHARS);
}

export function isCaptureMessage(m: unknown): m is CaptureMessage {
  return typeof m === "object" && m !== null && (m as CaptureMessage).type === CAPTURE_MESSAGE && typeof (m as CaptureMessage).text === "string";
}
