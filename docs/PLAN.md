# PersonalityMatrix — Build Plan

An offline, local-first Chrome (MV3) side-panel extension for contact-center agents.
The agent sets their own archetype once; during a call they tap the customer's archetype and
instantly get **Risk / Relate / Avoid** guidance from a 6×6 (36-node) interaction matrix.

Research: `docs/research/`.

## Decisions (defaults — revisit any of them)

| Area | Choice | Why |
|---|---|---|
| Platform | Chrome MV3 extension, **Side Panel** UI | Sits beside the CRM without covering it; persists across tabs |
| Stack | Vite + React 18 + TypeScript | Research suggests React components; typed data catches matrix gaps |
| Data | Static JSON bundled in the extension | Offline, zero latency, MV3 forbids remote code |
| State | `chrome.storage.local` (falls back to `localStorage` in `npm run dev`) | Survives service-worker shutdown |
| Tests | Vitest | Validates matrix integrity + lookup logic |
| Privacy | No network calls, no customer PII stored | Only agentId + UI prefs are persisted |

## Guidance model

Guidance for a pair (agent, customer) is layered so every one of the 36 nodes shows something useful
even before all nodes are hand-written:

1. **Customer baseline** (`customerProfiles.json`) — relate strategy, phrases to use/avoid for that customer type.
2. **Matrix node override** (`interactionMatrix.json`) — agent-specific risk, strategy, and phrases.
3. **Global trigger list** (`phrases.json`) — always-avoid phrases with a replacement for each.

`resolveGuidance()` merges these (node > baseline > global) and de-duplicates phrases. All 36 nodes
are authored now; the fallback only matters if a node is removed.

## Phases

### Phase 0 — Scaffold ✅ (this commit)
- Project structure, manifest, build, side panel shell, service worker
- Data files: 6 agents, 6 customers, 6 authored matrix nodes, global triggers
- Components: `AgentSetup`, `CustomerQuickId`, `MatrixOutput`
- Tests for data integrity and guidance resolution

### Phase 1 — MVP content & UX
- [x] Author all 36 matrix nodes (30 derived — review with client SMEs)
- [x] Agent self-assessment quiz: 10 scenario questions, normalized scoring, result + runner-up (`src/data/quiz.json`)
- [ ] Customer quick-ID aids: show identifier cues / example utterances on each button
- [ ] Keyboard shortcuts (1–6 to pick customer, `Esc` to reset) via `chrome.commands`
- [ ] "Copy phrase" button on each Relate phrase
- [ ] Ego-state visual: agent state → customer state, flag crossed vs complementary transaction
- [ ] Load unpacked in Chrome and pilot with a few agents

### Phase 2 — Local semantic search
- [ ] Free-text box: agent types what the customer said → suggest archetype + nearest phrases
- [ ] Transformers.js + quantized `all-MiniLM-L6-v2`, bundled (no remote model fetch)
- [ ] Build-time script that pre-computes embeddings for all phrases/cues → JSON/IndexedDB
- [ ] Run inference in an offscreen document / worker so the panel stays responsive

### Phase 3 — Admin & analytics (local)
- [ ] Demo mode: scripted sample calls that walk through a few pairings for client presentations
- [ ] Import/export custom matrix JSON (supervisors tune content per org/brand)
- [ ] Local-only usage log (which pairs come up, which phrases copied) → CSV export for QA coaching
- [ ] Supervisor-set brand voice overrides

### Phase 4 — Exploratory
- [ ] WASM speech-emotion recognition (arousal/valence) to *suggest* the customer archetype
- [ ] Needs mic/tab-audio consent, legal review (call recording laws) — gate behind policy

## Product decisions (2026-09-23)
1. **Distribution:** private client use and demos only. No Chrome Web Store, so the store-policy and review work is out of scope. Share it as a zipped `dist/` loaded unpacked, or through enterprise policy.
2. **Agent archetype:** agents can change it freely (the "Change" link in the header).
3. **Matrix content:** all 36 nodes are authored. 6 come from the research and 30 are derived (see `docs/research/matrix-methodology.md`). Have client team leads review them before real use.
4. **Branding:** simple, light, professional and clutter-free. Light theme only, soft tinted guidance blocks, one accent color, and secondary info tucked behind a disclosure.
