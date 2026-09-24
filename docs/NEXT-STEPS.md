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
| Tests | 48 passing (`npm test`), including 2 real-model accuracy checks that skip when `public/models/` is empty |
| Real-extension test (§2) | Done 2026-09-23: 21/21 automated checks pass as an unpacked extension; manual side-panel check pending |
| Client build | `npm run package` → `release/personality-matrix-0.1.0.zip` (~23 MB zipped, ~50 MB unpacked) |

### Get running on a fresh machine

```sh
npm install
npm run setup-model   # downloads the 23 MB model into public/models/ (git-ignored; build also runs it)
npm test              # or: npx vitest run tests/<file>.test.ts / npx vitest run -t "<test name>"
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
- **`npm install` downloads the `onnxruntime-node` native binary in a postinstall script.** On a restricted
  network it fails with `ECONNRESET`. `npm install --ignore-scripts` still runs the typecheck and all tests
  except the 2 real-model ones, but `npm run embed` needs the binary.
- **Content imports coerce `basis`:** anything other than `research` or `derived` becomes `custom`
  (`validateContent()` in `src/lib/content.ts`). Overrides live in `chrome.storage.local`, so they apply
  only on the machine where they were imported.
- **Branded Chrome (137+) ignores `--load-extension`.** For automated extension tests use Playwright's
  Chromium (`channel: "chromium"`, headless works) with `--load-extension`, and open
  `chrome-extension://<id>/sidepanel.html` in a tab. Playwright can't click the toolbar icon.
- **Headless Chromium has its own clipboard**, separate from the OS one. Verify copy by pasting back into a field.
- **Don't zip with PowerShell 5.1 `Compress-Archive`**: it writes backslash paths. `package.mjs` uses Windows' bsdtar.

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

**Status (2026-09-23):** automated run done with Playwright Chromium against the unzipped release: every row above
passes, plus a browser restart and fully offline suggestions (≈0.8 s cold). There were no console, CSP or worker errors.
It found and fixed two bugs:
- The release zip had a `dist\` wrapper folder and backslash paths (`package.mjs` now uses bsdtar; entries at root).
- Pressing Enter right after pasting accepted the *previous* line's suggestion (`DescribeCustomer` now classifies
  the current text on Enter if the shown suggestion is stale).

**Still manual (a few minutes in real Chrome):** `chrome://extensions` → Developer mode → Load unpacked (the
unzipped folder). Click the toolbar icon and confirm the panel opens. Open a second window and confirm its panel is
independent. Then type a line, copy a phrase and paste it elsewhere to confirm the OS clipboard.

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
3. Two people label each line independently with one of the six types, in a CSV with `text`,
   `label_a`, `label_b` columns (template: `docs/examples/labeling-template.csv`).
4. `npm run prepare-examples -- labeled.csv client-data`. The tool:
   - reports agreement (percent and Cohen's kappa; below ~0.6 means the type definitions need clarifying
     for this client) and which types were confused;
   - keeps only the lines both people agreed on;
   - drops lines with obvious personal data and flags possible names, addresses and dates to check by hand;
   - splits about 80/20 into `client-data/client-examples.json` and `client-data/client-heldout.json`.
   `client-data/` is git-ignored: **never commit client lines**.
5. Measure before and after: `npm run eval -- --examples client-data/client-examples.json --heldout client-data/client-heldout.json`.
6. Deploy without a rebuild: Settings → Guidance content → Import `client-examples.json` on each agent
   machine (or ship it in the client's content file). The lines are learned on the device.

### Targets
- Top-1 ≥ 75%, top-2 ≥ 90% on real held-out lines. If lower, add examples for the most-confused types first
  (the test prints the misses).

### Feature: per-client example sets without a rebuild — done (2026-09-24)
- Content import section `customerExamples` (`{ "analytical": ["..."], ... }`) with optional
  `customerExamplesMode`: `"add"` (default, on top of the built-in lines) or `"replace"` (then every type
  needs at least 3 lines). Up to 1,500 lines. Lines with email addresses or long numbers are rejected.
- On import, Settings embeds every line with the panel's model and stores the vectors in
  `chrome.storage.local` (`clientIndex`). If the model isn't available, nothing from the file is saved.
  `ContentContext` merges them into the index (`src/lib/clientExamples.ts`), matched by a hash of the lines.
- Tested with a stand-in embedder (unit tests). **Not yet tried with the real model** (not available where it was built).

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

## 8. Recognition roadmap (planned 2026-09-23, not started)

**How it works today:** `src/lib/similarity.ts` embeds one typed line with all-MiniLM-L6-v2 and compares it
with 72 synthetic example lines (12 per type). The score for a type is the mean of its 3 closest examples.
Each line is classified on its own, with no memory of earlier lines. This works well on clear-cut demo lines.
Real calls are messier, and the example lines were written by us, not by customers.

Work in this order. R1 and R2 need no client data and can start any time. R4 and parts of R5 depend on
the pilot (§3) and real example lines (§4).

**Analysis (2026-09-24):** [`research/recognition-analysis.md`](research/recognition-analysis.md) measures
today's matcher, maps trigger words to the research, compares approaches (including Chrome's built-in
Gemini Nano and bundled LLMs) and recommends an order of work.

### R1. Measure first (small, about 1 day) — done
**Done:** `npm run eval` (leave-one-out classifier comparison; held-out + challenge scoring with a
confusion table when the model is present) and `tests/fixtures/challengeUtterances.json`.
First result: the runtime top-3 rule gets 74% top-1 leave-one-out vs 86% for a class centroid.
**Correction logging, done:** every pick records the suggestion that was showing (`suggested`,
`confidence`, `by`: model / keywords / ai), with no text. Settings → Usage shows how often agents went with
it, split by confidence, plus the most frequent changes. The CSV has `suggested`, `suggestion_confidence`,
`suggested_by` and `agreed` columns. Caveat: agreement isn't accuracy, since agents may accept without checking.
Use it to spot patterns, like a type pair that's often overridden.
Nothing below can be shown to be an improvement without a yardstick.
- **Evaluation harness:** extend `tests/semantic.test.ts` (or a `npm run eval` script) to print per-type
  precision/recall, a confusion matrix ("Hesitant → Distressed 30%") and a confidence calibration check
  (does "clear" actually mean right most of the time?). Grow the held-out set as real lines arrive.
- **Correction logging, no text:** when an agent picks a different type than the one suggested, log only
  `{ suggested, chosen, confidence }` to the usage log. Never log the typed text, and never log embedding vectors
  (embeddings can partially leak the original text). Add a "suggestion accuracy" line and a confusion
  table to Settings → Usage and the CSV export. A pilot then shows exactly where recognition is weak.
- Tests: logging shape (no text fields), summary math, CSV columns.

**Status (2026-09-24):** built:
- the decision rule (centroid + calibrated softmax);
- keyword cues with "why" words;
- per-call accumulation (style);
- the per-line mood signal (state: anxious / frustrated / escalating, with a trend and "Right now" guidance);
- per-client example import plus `npm run prepare-examples`;
- the optional Gemini Nano read.

See the plan in `research/recognition-analysis.md`. Real-model results (2026-09-24): `npm test` passes in full.
Held-out 100% top-1. Challenge 86% top-1 / 94% top-2, with `clear` right 31/32. All 6 multi-line calls are
right by line 3. Details are in "Real-model results" in the analysis doc.

### R2. Separate style from state (medium, about 2–3 days; biggest conceptual gain)
The six types currently mix two ideas the research treats separately. **Style** is the stable Process
Communication Model personality base, which holds for the whole call. **State** is the momentary
Transactional Analysis emotional state, which shifts line by line.
- **Style builds up over the call:** keep the lines entered this call (in memory only, cleared with
  Esc, Clear or a new call). Combine their per-type scores with recency weighting (e.g. exponential decay)
  so style evidence builds across the call instead of flipping on every line. Add a "New call" action to reset.
- **State per line:** a second, lighter signal for the latest line: calm / frustrated / escalating / anxious.
  Start with an escalation-intensity score from the embedding plus lexical cues (see R3). A small on-device
  sentiment model is an option if it earns its size (benchmark first).
- **UI (keep it uncluttered):** one small escalation meter next to the suggestion, plus a trend hint when
  state changes ("Demanding → calming down"), which tells the agent their approach is working.
- **Guidance:** state adjusts guidance within the chosen pairing. For example, when escalating, surface the
  de-escalation phrases (empathy bridge, assertive optioning) first, even if the base style is Analytical.
  Needs a small content addition: state-specific phrase sets in the content file (importable like the rest).
- Tests: accumulation math, reset behavior, state thresholds on fixture lines.

### R3. Smarter decision step, plus "why" (medium, about 2 days)
- **Trained classifier:** train a small classifier (e.g. multinomial logistic regression, 6 × 384 weights)
  on the example embeddings at build time in `scripts/embed.mjs` and ship the weights as JSON (a few KB).
  Compare it with the current nearest-neighbor approach using R1's harness and keep whichever wins. Expected: better
  calibrated confidence and cleaner separation of overlapping types (Hesitant vs Distressed).
- **Lexical cues** combined with the model score:
  absolutes ("always", "never", "every time"), escalation demands ("supervisor", "manager", "cancel", "complaint"),
  hedges ("not sure", "maybe", "I don't know which"), anxiety words ("scared", "worried", "panicking"),
  number- or policy-heavy questions (Analytical), story markers and long tangents (Expressive), agreement or
  readiness (Cooperative). Keep the cue lists in a data file so clients can tune them via import.
- **"Why" highlights:** show the 1–3 words that drove the suggestion in the tooltip or under the suggestion
  ("never", "supervisor" → Demanding). This builds agent trust and teaches the cues.
- Tests: cue detection, combined scoring, harness comparison recorded in the commit message.

### R4. Better model, once real data exists (medium to large, 2–5 days) — tooling done, needs real data
**Done:** `src/data/model.json` is the single model config (id, dtype, prefix, temperature).
`npm run benchmark-models` downloads each candidate and reports size, speed, the fitted temperature and
accuracy (leave-one-out plus the held-out, challenge and client held-out sets). It includes bge-small, gte-small
and e5-small (with its "query: " prefix). `training/setfit/train.py` fine-tunes on labeled lines and exports
quantized ONNX to `public/models/local/<name>/`, which the benchmark and `model.json` accept as `local/<name>`.
**Not run here** (Hugging Face was blocked where this was built). The benchmark was checked with stand-in
embeddings, and the training script was checked for syntax and against the SetFit/Optimum docs only.
- **Benchmark small embedding models** of similar size (bge-small-en-v1.5, e5-small-v2, gte-small; roughly
  30–35 MB quantized, to be confirmed) with R1's harness on **real** held-out lines. Swap only if it clearly wins.
  Re-check the ONNX Runtime and transformers.js gotchas in §1 when changing models.
- **Train on the client's data (SetFit):** once there are about 10–20+ labeled real lines per type, fine-tune a
  small sentence-transformer with SetFit (offline, Python), export it to ONNX and ship it the same way as today.
  This is usually the largest accuracy jump, but it isn't worth doing on synthetic data.
- Keep a per-client model or example set optional. The default build stays generic.

### R5. Remove the typing (larger, per client; biggest usability gain) — chat done, phone gated
**Chat / email, done:** Settings → Chat capture (site + conversation selector + customer-message selector).
It works like this:
- Chrome grants access to that one site at runtime.
- A dynamically registered content script (`src/content/capture.ts`) sends each new customer message to the
  panel. History already on the page is skipped.
- The captured line fills the box, marked "from chat", and the agent still confirms.
- It never overwrites what the agent is typing: those messages count toward the call in the background.
- **Turn off** unregisters the script and gives the site access back.

Tested with a fake chat page and a stubbed `chrome` API, and the built extension loads cleanly. Not tested
end to end in real Chrome, because the automated browser can't click the permission prompt: do that once by hand.
**Phone:** not built. It's under the Phase 4 legal gate (§6).
- **Chat / email teams:** a content script reads new customer messages from the client's CRM or chat page and
  feeds them to the pipeline automatically (the agent still confirms the suggestion). Needs per-client DOM
  selectors, host permissions scoped to that site only, and a clear on/off control. Estimate: 2–4 days per
  platform.
- **Phone teams:** on-device speech-to-text (e.g. a small Whisper model via transformers.js) turns the
  customer's audio into lines for the same pipeline. It falls under **the same legal gate as Phase 4 (§6)**
  and shares its audio-capture work, so plan the two together.

### Privacy rules for all of the above
- Customer text and audio stay in memory on the device and are never stored or sent. The worker's fetch guard stays.
- Logs contain only type ids, sources, confidence and copied (agent-side) phrases.
- Any collection of real lines for training follows the §4 anonymization protocol, done by or with the client.

---

## Suggested order when resuming

1. Finish the manual side-panel check (§2); the automated extension test is done.
2. Settings PIN (§5, option A), if the pilot client wants it.
3. Done 2026-09-24: real-model `npm test` and `npm run eval` (results in `research/recognition-analysis.md`).
   Re-run `npm run eval` after cue changes to check for regressions.
4. Try chat capture by hand once in real Chrome (Settings → Chat capture → Turn on → accept the prompt).
   R1–R3, the optional Gemini Nano read and R5 chat capture are built.
5. Collect and anonymize real example lines (§4 protocol, `npm run prepare-examples`) during pilot setup,
   then import them.
6. Pilot (§3).
7. Recognition R4 on real data; SME review of the most-used derived pairings (from pilot data).
8. R5 per client; Phase 4 only after legal sign-off.
