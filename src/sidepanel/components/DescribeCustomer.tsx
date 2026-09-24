import { useEffect, useRef, useState } from "react";
import { combine, commit, commitChoice, current, emptyCall, type CallMemory } from "../../lib/callMemory";
import { cleanCaptured, isCaptureMessage } from "../../lib/capture";
import { embed, onStatus, warmUp, type ModelStatus } from "../../lib/embedClient";
import { getCustomer } from "../../lib/matrix";
import { CALM, detectMood, moodTrend, type Mood, type MoodTrend } from "../../lib/mood";
import { aiClassify, type AiResult } from "../../lib/nano";
import { classify, type Classification } from "../../lib/similarity";
import type { CustomerId } from "../../lib/types";
import type { SuggestionAtPick } from "../../lib/usage";
import { useContent } from "../ContentContext";
import { useAiAssist } from "../useAiAssist";

const MIN_CHARS = 12;
const DEBOUNCE_MS = 350;
/** Wait a little longer before asking the on-device AI, so it isn't started on every keystroke. */
const AI_DELAY_MS = 500;

interface Props {
  /** The suggestion currently shown (outlined in the quick-pick grid, and logged with the agent's pick). */
  onSuggest: (s: SuggestionAtPick | null) => void;
  onAccept: (id: CustomerId) => void;
  /** "New call" clears the call's history; the parent clears the selected customer type. */
  onNewCall?: () => void;
  /** Demo mode: type this text into the box, as if the agent were typing it live. */
  presetText?: string;
  /** Allow the optional on-device AI read (off in demos, which should be repeatable). */
  allowAi?: boolean;
  /** Accept customer messages from chat auto-capture (off in demos). */
  allowCapture?: boolean;
  /** The customer's mood on the latest line, and how it's moving. */
  onMood?: (mood: Mood, trend: MoodTrend | null) => void;
}

const TREND_LABEL: Record<MoodTrend, string> = { rising: "▲ heating up", easing: "▼ calming down", steady: "" };

interface Shown {
  /** This line combined with the call's earlier lines: what the agent sees. */
  result: ReturnType<typeof combine>;
  /** This line alone: what gets added to the call's history when accepted. */
  line: Classification;
  forText: string;
}

interface AiState {
  forText: string;
  pending: boolean;
  result: AiResult | null;
}

// Free-text box: the agent types or pastes what the customer said (or a quick note about them) and gets
// a suggested type. Everything runs on this device; the text is never stored or sent anywhere.
export default function DescribeCustomer({
  onSuggest,
  onAccept,
  onNewCall,
  onMood,
  presetText,
  allowAi = true,
  allowCapture = true,
}: Props) {
  const { content, exampleIndex } = useContent();
  const ai = useAiAssist();
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ModelStatus>("idle");
  const [shown, setShown] = useState<Shown | null>(null);
  const [memory, setMemory] = useState<CallMemory>(emptyCall);
  const [aiState, setAiState] = useState<AiState | null>(null);
  /** Moods of the lines accepted this call, newest first (in memory only). */
  const [moodLog, setMoodLog] = useState<Mood[]>([]);
  const latest = useRef(0);
  // Read inside async callbacks, which must see the current values.
  const statusRef = useRef(status);
  statusRef.current = status;
  const memoryRef = useRef(memory);
  memoryRef.current = memory;
  const contentRef = useRef(content);
  contentRef.current = content;
  const indexRef = useRef(exampleIndex);
  indexRef.current = exampleIndex;
  const textRef = useRef(text);
  textRef.current = text;
  const shownRef = useRef<Shown | null>(null);
  /** The text last put in the box by chat capture (so a newer message may replace it). */
  const capturedRef = useRef<string | null>(null);
  /** Chat messages that arrived while the agent was typing; they still count toward the call. */
  const [capturedInBackground, setCapturedInBackground] = useState(0);

  useEffect(() => {
    warmUp();
    return onStatus(setStatus);
  }, []);

  useEffect(() => {
    if (presetText === undefined) return;
    setText("");
    // Progress by elapsed time, not tick count, so it finishes on time even if timers are throttled.
    const start = performance.now();
    const TYPE_MS = 1500;
    const id = setInterval(() => {
      const n = Math.ceil(((performance.now() - start) / TYPE_MS) * presetText.length);
      setText(presetText.slice(0, n));
      if (n >= presetText.length) clearInterval(id);
    }, 28);
    return () => clearInterval(id);
  }, [presetText]);

  const keywordOnly = (trimmed: string) => classify(null, indexRef.current, { text: trimmed, cues: contentRef.current.cues });

  /** Embedding + keyword cues; keyword cues alone if the model can't load. */
  async function classifyText(trimmed: string): Promise<Classification> {
    const vector = statusRef.current === "error" ? null : await embed(trimmed);
    return classify(vector, indexRef.current, { text: trimmed, cues: contentRef.current.cues });
  }

  function show(line: Classification, forText: string) {
    const next = { result: combine(line, memoryRef.current), line, forText };
    shownRef.current = next;
    setShown(next);
  }

  /** Add a line to the call's evidence without selecting a type (captured lines the agent didn't act on). */
  function addToCall(line: Classification, forText: string) {
    setMemory((m) => commit(m, line));
    setMoodLog((log) => [detectMood(forText, contentRef.current.moods), ...log].slice(0, 20));
  }

  // Chat auto-capture: new customer messages from the configured chat page (this window only).
  useEffect(() => {
    if (!allowCapture || typeof chrome === "undefined" || !chrome.runtime?.onMessage) return;
    let myWindow: number | undefined;
    chrome.windows?.getCurrent().then((w) => (myWindow = w.id)).catch(() => {});
    const listener = (msg: unknown, sender: chrome.runtime.MessageSender) => {
      if (!isCaptureMessage(msg)) return;
      if (myWindow !== undefined && sender.tab && sender.tab.windowId !== myWindow) return;
      const captured = cleanCaptured(msg.text);
      if (!captured) return;
      const typed = textRef.current.trim();
      if (typed && typed !== capturedRef.current) {
        // The agent is typing: don't overwrite. The message still counts toward the call.
        void classifyText(captured).then((line) => addToCall(line, captured));
        setCapturedInBackground((n) => n + 1);
        return;
      }
      // Replacing an earlier captured line the agent didn't act on: keep its evidence.
      const prev = shownRef.current;
      if (typed && prev?.forText === typed) addToCall(prev.line, typed);
      capturedRef.current = captured;
      setText(captured);
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [allowCapture]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS) {
      latest.current++;
      setShown(null);
      return;
    }
    const ticket = ++latest.current;
    // Until the model is ready, keywords give an instant first suggestion.
    if (statusRef.current !== "ready") show(keywordOnly(trimmed), trimmed);
    if (statusRef.current === "error") return;
    const t = setTimeout(async () => {
      const r = await classifyText(trimmed);
      if (ticket === latest.current) show(r, trimmed); // otherwise superseded by newer input
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // Only re-run on text changes.
  }, [text]);

  // Optional deep read: only when the fast path isn't clear, and only on its final (non-interim) result.
  const interim = Boolean(shown?.line.keywordOnly && status !== "error");
  const needsAi = Boolean(allowAi && ai.ready && shown && !interim && shown.result.confidence !== "clear");
  useEffect(() => {
    if (!needsAi || !shown) return;
    const forText = shown.forText;
    const ctl = new AbortController();
    setAiState({ forText, pending: true, result: null });
    const t = setTimeout(async () => {
      const result = await aiClassify(forText, contentRef.current.customerProfiles, ctl.signal);
      if (!ctl.signal.aborted) setAiState({ forText, pending: false, result });
    }, AI_DELAY_MS);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [needsAi, shown?.forText]);

  const trimmed = text.trim();
  const long = trimmed.length >= MIN_CHARS;

  // What to show: the AI's read when it answered for this text and the fast path wasn't clear.
  const fast = shown && shown.result.confidence !== "none" ? shown.result : null;
  const aiNow = aiState && shown && aiState.forText === shown.forText ? aiState : null;
  const aiPick = aiNow?.result && shown?.result.confidence !== "clear" ? aiNow.result : null;
  const primary: CustomerId | null = aiPick?.customerId ?? fast?.ranked[0].customerId ?? null;
  const alt: CustomerId | null = aiPick
    ? aiPick.runnerUp ?? (fast && fast.ranked[0].customerId !== aiPick.customerId ? fast.ranked[0].customerId : null)
    : fast?.confidence === "close"
      ? fast.ranked[1].customerId
      : null;
  const why = aiPick
    ? aiPick.evidence
    : [...new Set((shown?.result.cues ?? []).filter((h) => h.customerId === primary).map((h) => h.match))].slice(0, 3);
  const callLines = current(memory).lines.length;

  // Mood: the line being typed, or else the last accepted line. The trend compares it with the line before.
  const typedMood = long ? detectMood(trimmed, content.moods) : null;
  const mood = typedMood ?? moodLog[0] ?? CALM;
  const previousHeat = (typedMood ? moodLog[0] : moodLog[1])?.heat ?? null;
  const trend = mood === CALM && !moodLog.length ? null : moodTrend(previousHeat, mood.heat);
  const moodName = mood.id === "calm" ? "Calm" : content.moods.find((m) => m.id === mood.id)?.name ?? mood.id;
  const showMood = mood.id !== "calm" || trend === "easing";

  useEffect(() => onMood?.(mood, trend), [mood.id, mood.heat, trend]);

  const by: SuggestionAtPick["by"] = aiPick ? "ai" : shown?.line.keywordOnly ? "keywords" : "model";
  const confidence = shown?.result.confidence ?? "none";
  useEffect(() => onSuggest(primary ? { suggested: primary, confidence, by } : null), [primary, confidence, by]);

  const name = (id: CustomerId) => getCustomer(id, content)?.name.replace(/^The /, "");
  const hint = (id: CustomerId) => {
    const example = shown?.result.ranked.find((r) => r.customerId === id)?.example;
    return example ? `Similar to: “${example}”` : undefined;
  };

  const accept = (id: CustomerId, line: Classification | null = shown?.line ?? null) => {
    capturedRef.current = null;
    if (line) setMemory((m) => commitChoice(m, line, id));
    if (long) setMoodLog((log) => [detectMood(trimmed, contentRef.current.moods), ...log].slice(0, 20));
    onAccept(id);
    setText("");
    setAiState(null);
  };

  // Enter before the debounced suggestion has caught up: classify the current text now, then accept.
  const acceptCurrent = async (trimmed: string) => {
    const ticket = ++latest.current; // also cancels the pending debounced run
    const r = await classifyText(trimmed);
    if (ticket !== latest.current) return; // text changed meanwhile
    const combined = combine(r, memoryRef.current);
    if (combined.confidence === "none") show(r, trimmed);
    else accept(combined.ranked[0].customerId, r);
  };

  const newCall = () => {
    setMemory(emptyCall());
    setMoodLog([]);
    setCapturedInBackground(0);
    capturedRef.current = null;
    setText("");
    setAiState(null);
    onNewCall?.();
  };

  return (
    <section className="describe" aria-label="Describe the customer">
      <textarea
        rows={2}
        value={text}
        placeholder="Type or paste what the customer said, or a quick note about them…"
        aria-describedby="describe-status"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && primary && shown?.forText === trimmed) {
            e.preventDefault();
            accept(primary);
          } else if (e.key === "Enter" && !e.shiftKey && long) {
            e.preventDefault();
            void acceptCurrent(trimmed);
          } else if (e.key === "Escape") {
            setText("");
          }
        }}
      />
      <p id="describe-status" className={`describe-status is-${status}${primary ? " has-suggestion" : ""}`} aria-live="polite">
        {primary ? (
          <>
            Sounds{" "}
            <button className="suggest" onClick={() => accept(primary)} title={hint(primary)}>
              {name(primary)}
              {aiPick && <span className="ai-badge">AI</span>}
            </button>
            {alt && (
              <>
                {" "}or{" "}
                <button className="suggest alt" onClick={() => accept(alt)} title={hint(alt)}>
                  {name(alt)}
                </button>
              </>
            )}
            <span className="muted enter-hint">
              <kbd>Enter</kbd> to use
            </span>
          </>
        ) : aiNow?.pending ? (
          "Checking with on-device AI…"
        ) : long && status === "loading" ? (
          "Preparing on-device model…"
        ) : long && status === "error" ? (
          "No clear keywords yet. Keep typing, or pick the customer type below."
        ) : (
          <span className="muted">Stays on this device.</span>
        )}
      </p>
      {(why.length > 0 || callLines > 0 || showMood || capturedInBackground > 0 || (long && capturedRef.current === trimmed) || (primary && aiNow?.pending) || (primary && shown?.line.keywordOnly && !aiPick)) && (
        <p className="describe-meta">
          {showMood && (
            <span className={`mood-chip mood-${mood.id}`} title={mood.hits.map((h) => h.match).join(", ") || undefined}>
              Mood: {moodName}
              {trend && trend !== "steady" && <span className="trend"> {TREND_LABEL[trend]}</span>}
            </span>
          )}
          {why.length > 0 && (
            <span className="why">
              {aiPick ? "AI heard" : "Heard"}{" "}
              {why.map((w) => (
                <mark key={w}>{w}</mark>
              ))}
            </span>
          )}
          {long && capturedRef.current === trimmed && <span className="from-chat">from chat</span>}
          {capturedInBackground > 0 && (
            <span>
              {capturedInBackground} chat {capturedInBackground === 1 ? "message" : "messages"} added while you typed
            </span>
          )}
          {primary && shown?.line.keywordOnly && !aiPick && <span>keywords only</span>}
          {primary && aiNow?.pending && <span>checking with AI…</span>}
          {callLines > 0 && (
            <span>
              {callLines} earlier {callLines === 1 ? "line" : "lines"} this call ·{" "}
              <button className="link" onClick={newCall}>
                New call
              </button>
            </span>
          )}
        </p>
      )}
    </section>
  );
}
