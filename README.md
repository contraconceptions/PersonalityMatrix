# PersonalityMatrix

An offline Chrome extension for contact-center agents. The agent picks their own communication
archetype once. During a call they tap the customer's archetype, and a side panel shows guidance for
that pairing:

- **Risk:** how this pairing tends to go wrong.
- **Relate:** the strategy to use and phrases to say.
- **Avoid:** phrases that tend to escalate the call.

The guidance draws on the Process Communication Model, Transactional Analysis and brand archetypes.
Everything runs on the agent's machine: no server, no account, no network calls, and nothing the
customer says is stored.

**Status:** Phases 0–3 are done (paused 2026-09-23). The pilot with real agents, the Settings PIN,
the recognition roadmap and voice emotion (Phase 4) are open.

| Doc | What's in it |
|---|---|
| [`docs/NEXT-STEPS.md`](docs/NEXT-STEPS.md) | **Where to resume:** state, gotchas, detailed plans for every open item |
| [`docs/PLAN.md`](docs/PLAN.md) | Decisions, guidance model and the phase checklist |
| [`docs/research/`](docs/research/) | Source research and how the 36 pairings were built |
| [`CLAUDE.md`](CLAUDE.md) | Architecture notes for coding agents |

## Develop

```sh
npm install
npm run setup-model  # one-time: downloads the 23 MB offline model into public/models/ (build also runs this)
npm run dev        # opens the side panel UI in a normal browser tab (localStorage fallback)
npm test           # 48 tests: data integrity, guidance, quiz, shortcuts, Phase 3, suggestion accuracy
npm run typecheck  # tsc --noEmit
npm run build      # type-check + build the extension into dist/ (~50 MB incl. model)
npm run embed      # re-run after editing src/data/customerExamples.json
npm run package    # build + zip to release/personality-matrix-<version>.zip for clients
```

Run one test file with `npx vitest run tests/matrix.test.ts`, or one test with `npx vitest run -t "<name>"`.
The 2 real-model accuracy tests in `tests/semantic.test.ts` are skipped until `npm run setup-model` has
downloaded the model. `npm install` also downloads the `onnxruntime-node` native binary (used by
`npm run embed` and those tests). If your network blocks it, `npm install --ignore-scripts` still
lets the other tests and the typecheck run.

## Load in Chrome

1. `npm run build`
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose `dist/`.
3. Click the toolbar icon to open the side panel.

For a client, send the zip from `npm run package`. They unzip it and load the folder the same way.
Distribution is private (client use and demos). The extension isn't published to the Chrome Web
Store. Set `version` in `public/manifest.json` before packaging a new client build; the zip name uses it.

**In the panel:** type or paste what the customer said to get a suggested type (Enter accepts it). Keys `1`–`6` pick the customer type, `Esc` clears, and clicking a Relate phrase copies it.

**Settings** (link in the header):
- **Demo:** five scripted sample calls for client presentations. You can also start it from the first-run screen ("Watch a demo"). Use `→` / `←` to step through and `Esc` to exit. Demos don't change the saved agent and aren't logged.
- **Brand voice:** word swaps (e.g. customer → patient) and company "never say" phrases.
- **Guidance content:** export the full guidance as JSON, edit it, and import it back. Imports are validated first. Reset returns to the built-in guidance.
- **Usage on this device:** which customer types come up and which phrases get copied, never what customers said. Export it as CSV for QA coaching, or clear it.

## Layout

```
public/manifest.json        MV3 manifest (copied to dist/); CSP allows WASM for the model
sidepanel.html              Side panel entry
src/background/             Service worker: opens the panel on toolbar click (ephemeral, no state)
src/data/*.json             Archetypes, 36-node matrix, trigger phrases, quiz, demo scenarios,
                            example customer lines + their precomputed embeddings
src/lib/matrix.ts           resolveGuidance(): node > customer baseline > global triggers, then brand voice
src/lib/content.ts          Import/export validation and merging supervisor overrides onto the defaults
src/lib/similarity.ts       classify(): nearest-example scoring for the suggestion box
src/lib/storage.ts          chrome.storage.local with localStorage fallback
src/lib/usage.ts            Local usage log (type ids and copied phrases only) + CSV export
src/sidepanel/              React app, the embedding Web Worker and the shared content context
src/sidepanel/components/   Onboarding + quiz, quick-pick, suggestion box, guidance, demo bar, Settings
scripts/                    fetch-model, embed, package
tests/                      Vitest (+ held-out lines for accuracy in tests/fixtures/)
```

## Privacy

- No network access at runtime. The model and its WASM runtime ship inside the extension, and the
  model worker rejects any request that isn't to the extension itself.
- What the agent types to get a suggestion stays in memory and is never stored or logged.
- Saved on the device only: the agent's archetype, supervisor content overrides and the usage log
  (customer-type picks and copied phrases). Settings → Usage can export or clear the log.

## Authoring matrix content

All 36 pairings live in `src/data/interactionMatrix.json`. Each one is tagged with `fit`
(strong / neutral / watch) and `basis` (research / derived / custom). The method and sources are in
`docs/research/matrix-methodology.md`. Set `basis` to `custom` once a pairing has been reviewed or
rewritten; an import treats a missing or unknown `basis` as `custom`.

Editing the JSON in `src/data/` changes the built-in guidance and needs a rebuild. To tailor one
client's deployment without a rebuild, export the guidance from Settings, edit it, and import it on
each agent's machine (overrides are stored per device).
If a pairing is ever removed, the panel falls back to general guidance for that customer type, and
`missingNodes()` in `src/lib/matrix.ts` lists the gaps.

## Offline suggestions (Phase 2)

What the agent types is compared with example customer lines in `src/data/customerExamples.json`
using a small on-device model (all-MiniLM-L6-v2 via Transformers.js) that runs in a Web Worker.
Nothing the agent types is sent anywhere or stored, and the worker refuses any fetch from outside
the extension itself. To improve accuracy, add more real (anonymized) example lines for each
customer type and run `npm run embed`. `tests/semantic.test.ts` measures accuracy on held-out lines
that aren't in the examples.
