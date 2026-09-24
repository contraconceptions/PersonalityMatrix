# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

An offline Chrome MV3 side-panel extension (React 18 + TypeScript + Vite) for contact-center agents.
The agent picks their own archetype once (6 agent types). During a call they identify the customer's
archetype (6 customer types), and the panel shows Risk / Relate / Avoid guidance for that pairing.
Everything runs on-device. Nothing the agent types is stored or sent anywhere.

`docs/NEXT-STEPS.md` is the working state doc (what's done, gotchas, detailed plans for open items).
Read it before starting non-trivial work. `docs/PLAN.md` holds the phase checklist.

## Commands

```sh
npm install
npm run setup-model   # downloads all-MiniLM-L6-v2 (~23 MB) into public/models/ (git-ignored); build runs it too
npm run dev           # side panel UI in a normal tab at /sidepanel.html (storage falls back to localStorage)
npm test              # vitest run
npx vitest run tests/matrix.test.ts        # single file
npx vitest run -t "all 36 pairs"           # single test by name
npm run typecheck     # tsc --noEmit
npm run build         # fetch model + typecheck + vite build → dist/ (load unpacked in chrome://extensions)
npm run embed         # REQUIRED after editing src/data/customerExamples.json (a test fails otherwise)
npm run eval          # recognition yardstick (see docs/research/recognition-analysis.md)
npm run eval -- --examples client-data/client-examples.json --heldout client-data/client-heldout.json
npm run prepare-examples -- labeled.csv client-data   # client CSV → import file + held-out set (client-data/ is git-ignored)
npm run package       # build + zip → release/personality-matrix-<version from public/manifest.json>.zip
```

The real-model accuracy tests in `tests/semantic.test.ts` are skipped automatically if `public/models/`
hasn't been populated, so run `npm run setup-model` first to get the full suite. `npm install` runs an
`onnxruntime-node` postinstall that downloads a native binary. If the network blocks it, use
`npm install --ignore-scripts`. Typecheck and the other tests still work, but `npm run embed` doesn't.

## Architecture

**Two Vite entry points** (`vite.config.ts`): `sidepanel.html` (the React app) and
`src/background/index.ts` (emitted as `background.js`). The service worker only opens the panel on
toolbar click. It is ephemeral, so never keep state in its module scope. `public/manifest.json` is
copied verbatim. Its CSP allows `'wasm-unsafe-eval'` for ONNX Runtime.

**Guidance resolution** (`src/lib/matrix.ts`): `resolveGuidance(agentId, customerId, content)` merges
the authored matrix node (from `interactionMatrix.json`, 36 nodes) over the customer baseline over
global trigger phrases. It then applies the brand voice (`brandVoice.ts`). It always returns usable
guidance even when a node is missing. `missingNodes()` lists the gaps. Transaction type
(complementary/crossed) is derived from the Transactional Analysis ego states.

**Content overrides** (`src/lib/content.ts` + `src/sidepanel/ContentContext.tsx`): supervisors can
export, edit and import the guidance as JSON. `validateContent()` checks imports.
`mergeContent()` layers the overrides onto `defaultContent`: customers and nodes merge by key,
while triggers and brandVoice replace. The effective `Content` comes from `useContent()` and is threaded
through as the `content` argument, so pass it rather than relying on the `defaultContent` default in UI code.
Agent profiles are not overridable.

**Recognition (suggested customer type):** `DescribeCustomer` → `src/lib/embedClient.ts` (one lazily
started module Web Worker, promise-based `embed()`) → `src/sidepanel/embedder.worker.ts` (transformers.js,
quantized all-MiniLM-L6-v2, WASM) → `classify(vector | null, index, { text, cues })` in
`src/lib/similarity.ts`. `classify()` uses a softmax over cosine similarity to each type's centroid,
computed from `exampleEmbeddings.json` at runtime (temperature 0.04), plus the keyword-cue scores from
`src/lib/cues.ts` / `src/data/cues.json`. Confidence: `clear` at p ≥ 0.7, `none` below 0.4 or with no
signal. `vector === null` means keyword-only mode (the model is loading or failed).
`src/lib/callMemory.ts` combines accepted lines across a call (0.6^k decay, only log-probs kept).
`src/lib/nano.ts` is the optional Gemini Nano (Chrome Prompt API) read, used only when the fast path
isn't clear and the Settings switch (`aiAssist`) is on. The constants are fitted by leave-one-out
(`npm run eval`); `docs/research/recognition-analysis.md` explains them. `MODEL_ID` in `similarity.ts`
must match `scripts/embed.mjs`. Cues are part of `Content` and can be replaced through the content import.
`src/lib/mood.ts` + `src/data/moods.json` give a per-line mood (calm/anxious/frustrated/escalating + trend),
separate from the accumulated style. It drives the "Right now" block in `MatrixOutput`.
Client example lines (`customerExamples` import section, `src/lib/clientExamples.ts`) are embedded in the
browser at import time and stored as `clientIndex`. `ContentContext` exposes the merged `exampleIndex`, which
UI code must use instead of importing `exampleEmbeddings.json` directly.

**Storage** (`src/lib/storage.ts`): `chrome.storage.local` in the extension, `localStorage` under
`npm run dev`. Always go through `getJSON`/`setJSON`/`removeKey`.

**Other lib modules:** `demo.ts` (scripted demo scenarios from `demoScenarios.json`; they never
touch the saved agent and aren't logged), `usage.ts` (usage log: type ids, sources and copied
phrases only), `quiz.ts` (agent self-assessment), `shortcuts.ts` (keys 1–6 and Esc; ignored in inputs).

## Constraints and gotchas

- **Privacy invariant:** never log or persist customer text or embedding vectors. Call memory holds only
  per-type log-probabilities, in memory. The usage log holds
  only type ids, selection source, confidence and copied agent-side phrases. The worker overrides
  `self.fetch` to block every non-same-origin request. Keep that guard.
- **Everything must ship inside the extension** (MV3 forbids remote code, and the panel must work offline):
  - `env.localModelPath` must be root-relative (`/models/`). A full URL makes transformers.js v4
    silently build an empty tokenizer.
  - transformers.js defaults ONNX `wasmPaths` to a CDN. The worker overrides it with the Vite-bundled
    `ort-wasm-simd-threaded.asyncify.wasm`. Re-check this if you upgrade transformers.js or onnxruntime-web.
  - `numThreads = 1`, because extension pages aren't cross-origin isolated.
- Browser automation can't see Web Worker network requests. The fetch guard is the real check.
- For automated extension tests use Playwright's Chromium with `--load-extension` and open
  `chrome-extension://<id>/sidepanel.html`. Branded Chrome 137+ ignores `--load-extension`.
- `scripts/package.mjs` zips with entries at the zip root (bsdtar on Windows, `zip` elsewhere). Never
  use PowerShell `Compress-Archive`.
- Content edits: each matrix node has `fit` (strong/neutral/watch) and `basis` (research/derived, and
  `custom` once reviewed). Methodology is in `docs/research/matrix-methodology.md`. The tests enforce
  data integrity (all 36 pairs, valid ids, non-empty phrases) and that every demo line classifies clearly.
- Don't quote the research report's AHT/CSAT figures as fact. They are unverified.
- Never commit real client lines. `client-data/` is git-ignored for this reason.
