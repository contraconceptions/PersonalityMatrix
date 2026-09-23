# Research notes — Gemini report

Source: https://share.gemini.google/MY4i0UnDQyNH
("Foundations of Behavioral Dynamics and Systems Architecture for Offline Agent-Assist Applications")
Condensed on 2026-09-23. The companion Google Doc is saved verbatim in `research-doc.md`.

## Frameworks

- **Process Communication Model (PCM)** — enduring base personality: Thinker, Persister,
  Harmonizer, Rebel, Promoter, Imaginer.
- **Transactional Analysis (TA)** — real-time ego state: Nurturing Parent, Critical Parent,
  Adult, Free Child, Adapted Child. *Complementary* transactions flow; *crossed* transactions
  escalate. Core heuristic: recognise the cross and move the dialogue to Adult↔Adult.
- **Jungian brand archetypes** (12) — flavour the agent archetype names (Sage, Caregiver, Everyman…).

## Customer archetypes (6)

| id | Name | Grounding | Presents as |
|---|---|---|---|
| analytical | The Analytical | PCM Thinker / TA Adult | Specific questions on policy, timelines, details; no small talk |
| distressed | The Distressed | TA Adapted Child | Overwhelmed, passive, anxious, seeks confirmation |
| demanding | The Demanding | TA Critical Parent / PCM Persister | Rigid, absolutes ("always", "never"), demands escalation |
| hesitant | The Hesitant | — | Slow decisions, re-asks same options, risk averse |
| expressive | The Expressive | PCM Promoter / TA Free Child | Talkative, tangential stories, values rapport |
| cooperative | The Cooperative | Adult | Clear needs, prompt decisions, collaborative |

## Agent archetypes (6)

| id | Name | Strength | Risk |
|---|---|---|---|
| sage | The Sage (Expert) | Complex technical problems | Cold/robotic to emotional customers |
| caregiver | The Caregiver (Harmonizer) | De-escalating Distressed | Over-apologises, loses authority vs Demanding |
| everyman | The Everyman (Peer) | Rapport with Expressive/Cooperative | Lacks authority for Demanding/Analytical |
| fixer | The Fixer (Commander) | Analytical & Hesitant | Rushes Distressed customers |
| innovator | The Innovator (Rebel) | Unprecedented issues | Frustrates policy-minded Analytical |
| diplomat | The Diplomat (Mediator) | Adapts to nearly anyone | Burnout from constant deep acting |

## Worked matrix nodes (6 of 36)

Sage×Distressed, Caregiver×Demanding, Fixer×Hesitant, Everyman×Analytical,
Innovator×Demanding, Diplomat×Expressive — encoded in `src/data/interactionMatrix.json`.

## Linguistic heuristics

**Triggers to avoid:** "Calm down" · "That's our policy" / "I can't do that" ·
"That's not my responsibility" / "I don't know" · "Please hold" (no context) ·
"You're mistaken" / "You misheard me" · "I apologize for any inconvenience".

**Replacements:** Empathy Bridge · Structured Resolution ("Here's what we know / done / next") ·
Assertive Optioning ("While I can't X, what I can do is Y") · Collaborative Questioning
("Are you able to…?") · Contextual Normalization ("Other customers have felt the same…").

## Architecture guidance

- Chrome Manifest V3; ephemeral service worker ⇒ all state in `chrome.storage.local` / IndexedDB.
- No remotely hosted code — everything bundled.
- Phase 2 intelligence: Transformers.js + quantized `all-MiniLM-L6-v2` (~23 MB, 384-dim),
  pre-computed phrase embeddings, local cosine similarity.
- Phase 3 (future): WASM speech-emotion recognition (arousal/valence/dominance) to auto-suggest
  the customer archetype.

## Caveats to verify before any marketing use

The report cites figures (AHT 10→5 min, CSAT 47%→92%, an LLM benchmark table) without
traceable sources. Treat them as claims to verify, not facts to ship in product copy.
