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
npm run eval          # recognition yardstick (see docs/research/recognition-analysis.md); Node 22.18+
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

**Offline suggestions (Phase 2):** `DescribeCustomer` → `src/lib/embedClient.ts` (one lazily started
module Web Worker, promise-based `embed()`) → `src/sidepanel/embedder.worker.ts` (transformers.js,
quantized all-MiniLM-L6-v2, WASM) → `classify()` in `src/lib/similarity.ts`. `classify()` compares
the vector against the precomputed `src/data/exampleEmbeddings.json`: the mean of the top-3 per type,
with a `clear`/`close`/`none` confidence. The thresholds are tuned against
`tests/fixtures/heldOutUtterances.json`. `MODEL_ID` in `similarity.ts` must match `scripts/embed.mjs`.

**Storage** (`src/lib/storage.ts`): `chrome.storage.local` in the extension, `localStorage` under
`npm run dev`. Always go through `getJSON`/`setJSON`/`removeKey`.

**Other lib modules:** `demo.ts` (scripted demo scenarios from `demoScenarios.json`; they never
touch the saved agent and aren't logged), `usage.ts` (usage log: type ids, sources and copied
phrases only), `quiz.ts` (agent self-assessment), `shortcuts.ts` (keys 1–6 and Esc; ignored in inputs).

## Constraints and gotchas

- **Privacy invariant:** never log or persist customer text or embedding vectors. The usage log holds
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
