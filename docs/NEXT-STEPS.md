# PersonalityMatrix — Next Steps (dev notes)

Paused on 2026-09-23 after Phase 3. This document says where things stand, what to do first
when work resumes, and the detailed plan for each remaining item. `PLAN.md` holds the phase checklist;
this is the working detail behind the unchecked boxes.

---

## 1. Resume here

### State at pause

| Area | Status |
|---|---|
| Phase 0: scaffold | Done |
| Phase 1: content & UX | Done, except the **pilot** (on hold, see §3) |
| Phase 2: offline suggestions | Done; accuracy is based on **synthetic** example lines (see §4) |
| Phase 3: demo, brand voice, import/export, usage log | Done; Settings is **not locked** (see §5) |
| Phase 4: voice emotion | Not started, needs legal review first (see §6) |
| Tests | 48 passing (`npm test`), including real-model accuracy checks |
| Client build | `npm run package` → `release/personality-matrix-0.1.0.zip` (~23 MB zipped, ~50 MB unpacked) |

### Get running on a fresh machine

```sh
npm install
npm run setup-model   # downloads the 23 MB model into public/models/ (git-ignored; build also runs it)
npm test
npm run dev           # UI in a normal tab at /sidepanel.html (uses localStorage instead of chrome.storage)
npm run package       # build + zip for clients
```

### Gotchas we hit (don't lose these)

- **transformers.js `localModelPath` must be root-relative** (`/models/`). A full `http(s)://` URL makes
  v4 skip its local-file check and silently build an empty tokenizer ("this.tokenizer is not a function").
- **transformers.js defaults ONNX Runtime's `wasmPaths` to the jsDelivr CDN.** We override it with the
  Vite-bundled asset in `embedder.worker.ts`, and the worker blocks every non-local `fetch`. If you upgrade
  transformers.js or onnxruntime-web, re-check which `.wasm` variant it loads (currently `asyncify`).
  The fetch guard will surface any regression as an error.
- **Browser automation tools can't see requests made inside a Web Worker.** Don't treat an empty
  network log as proof that nothing was fetched. The fetch guard is the real check.
- **Hidden tabs throttle timers to about 1 per second.** Timing measured in an automated or background tab is
  misleading. The demo typing effect is time-based for this reason.
- **Clipboard tests overwrite the developer's real clipboard.** Save and restore it.
- `npm run embed` must be re-run after editing `src/data/customerExamples.json`. A test fails if you forget.

---

## 2. First thing to do: test as a real extension (not yet done)

All browser testing so far ran the built files as a **web page** (`vite preview`, `http://localhost`).
The code has **never been loaded as an unpacked extension** (`chrome-extension://` origin). Risks
specific to that environment:

| Risk | What to check |
|---|---|
| CSP blocks WASM | Manifest sets `script-src 'self' 'wasm-unsafe-eval'`; confirm the model loads (suggestions appear) |
| Module Web Worker in an extension page | Worker starts; no errors in the side panel's DevTools |
| Root-relative `/models/` in the worker | Resolves to `chrome-extension://<id>/models/...` |
| `chrome.storage.local` path | Agent choice, overrides and usage log persist across panel close/reopen and browser restart |
| Side panel behavior | Toolbar icon opens the panel; panel keeps state per window |
| Clipboard | Copy works from the side panel (`clipboardWrite` permission) |
| Downloads | Export JSON/CSV save correctly from the side panel |
| File import | The file picker opens from the side panel |

**Steps:** `npm run package`, then unzip, then `chrome://extensions` → Developer mode → Load unpacked. Open the
panel, right-click → Inspect, and walk through the list above. Fix anything that fails before the pilot.
Estimate: half a day, including fixes.

---

## 3. Phase 1 pilot (on hold)

**Goal:** learn whether agents actually use it mid-call and whether the guidance feels right, before
investing more in content.

### Setup
- 3–5 agents with a mix of archetypes, over 1–2 weeks, on one team with a supportive team lead.
- Install via the zip (see §2). Each agent takes the quiz on first run.
- Before starting: agree what "success" means with the client (see metrics).

### What to measure
| Signal | Source | Note |
|---|---|---|
| Usage per shift | Settings → Usage → Export CSV | Picks per call, suggestion vs click vs key, phrases copied |
| Which pairings come up most | Usage summary | Prioritizes which of the 30 derived nodes to review first |
| Perceived usefulness | 5-question survey at end of week 1 and 2 | Include "did it slow you down?" |
| QA scores | Client QA team | Before/after for pilot agents vs a comparison group |
| AHT / CSAT | Client reporting | **Directional only.** Sample is far too small for claims |

### Feedback loop
- Mid-pilot check-in: fix wording that agents flag, via import/export (no rebuild needed).
- End of pilot: review the most-used pairings with team leads; mark reviewed nodes `basis: "custom"`.

### Do not
- Quote the research report's figures (AHT 10→5 min, CSAT 47%→92%) to clients. They are unverified.

---

## 4. Real customer example lines (improves Phase 2 accuracy)

Today's 72 example lines (12 per customer type) and 18 held-out test lines were written by us. They
are clear-cut, so the 18/18 held-out score overstates real-world accuracy.

### Collection protocol (per client)
1. Pull 20–40 opening customer lines per customer type from call notes, chat logs or QA transcripts.
2. **Anonymize before the data leaves the client:** names, account/order numbers, addresses, dates of
   birth, medical details. Replace them with placeholders like `[name]` and `[number]`.
3. Two people label each line independently with one of the six types. Keep only lines they agree on
   (track the agreement rate; below ~70% means the type definitions need clarifying for that client).
4. Split: about 80% into `customerExamples.json`, about 20% into `tests/fixtures/heldOutUtterances.json`.
5. `npm run embed`, then `npm test`. The accuracy test now measures the client's real lines.

### Targets
- Top-1 ≥ 75%, top-2 ≥ 90% on real held-out lines. If lower, add examples for the most-confused types first
  (the test prints the misses).

### Feature: per-client example sets without a rebuild (design)
- Add an optional `customerExamples` section to the content import file
  (`{ "analytical": ["..."], ... }`).
- On import, embed the lines **in the browser** with the already-loaded worker, then store the
  vectors in `chrome.storage.local` (about 3 KB per line; 500 lines ≈ 1.5 MB, fine with the
  `unlimitedStorage` permission if needed).
- `DescribeCustomer` uses the imported index when present, otherwise the built-in one.
- Tests: validation of the section; merge behavior; an embedding-dimension check.
- Estimate: 1 day.

---

## 5. Settings lock (optional PIN)

Right now anyone on the machine can change guidance, brand voice, or clear the usage log. That's fine for
demos, but not for a client that wants supervisor-only editing.

### Option A: local PIN (simple, recommended first)
- Settings → "Lock settings" → set a 4–8 digit PIN.
- Store `{ salt, hash }`, with the hash from SHA-256 via `crypto.subtle` over salt + PIN, in `chrome.storage.local`. Never store the PIN.
- While locked: Demo stays available; Brand voice, Guidance content, and Clear log require the PIN.
  Export CSV can stay open, or be locked if the client prefers.
- Unlock lasts until the panel closes. After 5 wrong attempts, add a 30-second cooldown.
- Recovery: remove and re-install the extension (this clears local data). Document it for supervisors.
- Be honest in the docs: this deters agents but isn't strong security, because anyone with DevTools can clear storage.
- Estimate: half a day, including tests.

### Option B: enterprise-managed policy (for larger clients)
- Chrome `chrome.storage.managed` lets IT push settings via policy (Google Admin / Windows GPO).
- Push the content overrides and a `settingsLocked: true` flag centrally. Agents can't change them at all.
- Needs a `storage.managed_schema` in the manifest and a pinned extension ID (managed installs).
- Estimate: 1–2 days, plus coordination with the client's IT.

---

## 6. Phase 4: voice emotion suggestions (exploratory, gated)

**Idea:** listen to the customer's voice and *suggest* a customer type (e.g. high arousal + negative
valence → Demanding or Distressed). It would never auto-select, and the agent always confirms.

### Gate 0: legal and consent (before any code)
- Call-recording and wiretap laws differ by jurisdiction. Some US states, including California, require
  **all-party consent** to record. Even without saving audio, real-time analysis may count as interception.
  Get the client's counsel to sign off.
- Check the client's existing call disclosure ("this call may be monitored…") covers automated analysis.
- For healthcare clients: treat audio as potential PHI (HIPAA). Our design keeps audio in memory,
  on-device, and never stored or sent, but that needs to be written into the client agreement.

### Technical plan (if Gate 0 passes)
1. **Audio source:** depends on the client's phone system.
   - Browser softphone: capture that tab with `chrome.tabCapture` and process it in an **offscreen document**
     (MV3 service workers can't hold media streams).
   - Desk phone / separate app: the extension can't reach that audio. Out of scope unless the client routes audio through the browser.
   - Need to separate the customer's audio from the agent's (for example, the receive channel only).
2. **Model:** evaluate small speech-emotion models (wav2vec2 / HuBERT-style fine-tunes) exported to
   ONNX, running through the same ONNX Runtime WASM setup as Phase 2. Criteria: size under ~100 MB, under 300 ms
   per 3-second window on a typical agent PC, and outputs arousal/valence (or discrete emotions we can map).
3. **Mapping:** arousal/valence → a suggestion shown next to the text suggestion, with "(from voice)" and
   the same "Enter to use" pattern. Only suggest after about 5 seconds of customer speech, and only with a clear margin.
4. **Controls:** off by default; an admin switch in Settings (behind the PIN from §5); a visible
   "Listening" indicator whenever it runs; stops automatically when the call tab closes.
5. **Evaluation:** a labeled set of about 100 anonymized call snippets per client, collected with consent.
   Measure agreement with the human labels before turning it on for anyone.

- Estimate: spike 3–5 days (feasibility plus model choice); full feature 2–3 weeks after Gate 0.

---

## 7. Smaller follow-ups (backlog)

| Item | Why | Size |
|---|---|---|
| **SME review of the 30 derived pairings** | Only 6 of the 36 come directly from research. Prioritize with pilot usage data | Content work |
| Real icon and branding | Current icon is a placeholder blue square | Small |
| Tailor the quiz per client | Scenario questions in `src/data/quiz.json` are generic; adapt them to the client's call types | Small |
| Tailor demo scenarios per client | `src/data/demoScenarios.json`; the tests re-check every demo line classifies clearly | Small |
| Global hotkeys | `chrome.commands` allows only 4, so maybe "open panel" plus the 3 most common types | Small |
| Include demo scenarios, quiz, examples in content import | One file to fully customize a client deployment | Medium |
| Version the extension per client | Set `version` in `public/manifest.json` before each `npm run package` | Tiny |
| Shrink the package | Try the non-JSEP / plain WASM ONNX Runtime build if transformers.js allows (≈ −13 MB) | Small spike |
| Accessibility pass | Keyboard-only walk-through, screen-reader labels, contrast check | Small |

---

## Suggested order when resuming

1. Real-extension test (§2): it may surface environment issues.
2. Settings PIN (§5, option A), if the pilot client wants it.
3. Collect and anonymize real example lines (§4 protocol) during pilot setup.
4. Pilot (§3).
5. SME review of the most-used derived pairings (from pilot data).
6. Phase 4 only after legal sign-off.
