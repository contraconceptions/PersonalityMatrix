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
| [`docs/research/`](docs/research/) | Source research, how the 36 pairings were built, and the recognition analysis |
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
npm run eval       # recognition yardstick: classifier comparison + held-out/challenge accuracy
npm run prepare-examples -- labeled.csv client-data   # client lines → import file + held-out set
npm run benchmark-models   # compare embedding models (downloads each; add --examples/--heldout for client data)
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
- **On-device AI (optional):** Chrome's built-in model takes a closer look at unclear lines (Chrome 138+ on capable hardware).
- **Chat capture (optional):** for chat and email teams. New customer messages on the client's chat or CRM page
  fill the box automatically. Set the site and two CSS selectors, and Chrome asks for access to that one site.
  **Check on the open tab** confirms the selectors work. **Turn off** gives the access back.
- **Usage on this device:** which customer types come up, which phrases get copied, and how often agents went
  with the suggestion (with the most frequent changes, e.g. Demanding → Distressed). Never what customers
  said. Export it as CSV for QA coaching, or clear it.

## Layout

```
public/manifest.json        MV3 manifest (copied to dist/); CSP allows WASM for the model
sidepanel.html              Side panel entry
src/background/             Service worker: opens the panel on toolbar click (ephemeral, no state)
src/content/capture.ts      Chat-capture content script (registered at runtime, one site only)
src/data/*.json             Archetypes, 36-node matrix, trigger phrases, quiz, demo scenarios,
                            example customer lines + their precomputed embeddings
src/lib/matrix.ts           resolveGuidance(): node > customer baseline > global triggers, then brand voice
src/lib/content.ts          Import/export validation and merging supervisor overrides onto the defaults
src/lib/similarity.ts       classify(): nearest-example scoring for the suggestion box
src/lib/storage.ts          chrome.storage.local with localStorage fallback
src/lib/usage.ts            Local usage log (type ids and copied phrases only) + CSV export
src/sidepanel/              React app, the embedding Web Worker and the shared content context
src/sidepanel/components/   Onboarding + quiz, quick-pick, suggestion box, guidance, demo bar, Settings
scripts/                    fetch-model, embed, eval, benchmark-models, prepare-examples, package
training/setfit/            Optional fine-tuning of the model on a client's labeled lines (Python)
tests/                      Vitest (+ held-out lines for accuracy in tests/fixtures/)
```

## Privacy

- No network access at runtime. The model and its WASM runtime ship inside the extension, and the
  model worker rejects any request that isn't to the extension itself.
- What the agent types to get a suggestion stays in memory and is never stored or logged.
- The optional on-device AI uses Chrome's built-in model on this computer. Chrome downloads the model
  from Google once; no text is sent.
- Chat capture (off by default) reads new customer messages on one configured site and passes them to the
  panel in memory. They aren't stored or sent anywhere.
- Saved on the device only: the agent's archetype, supervisor content overrides (including any imported,
  anonymized example lines) and the usage log. The log holds customer-type picks, what was suggested at the
  time, and copied phrases. Settings → Usage can export or clear it.

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

## Offline suggestions

The agent types what the customer said, or a quick note ("cust angry, 4th call"). The panel suggests a
type from two signals:

- **Meaning:** a small on-device model (all-MiniLM-L6-v2 via Transformers.js, in a Web Worker) compares
  the line with the example lines for each type in `src/data/customerExamples.json`.
- **Keywords:** research-based cue words in `src/data/cues.json` (for example "supervisor", "not sure",
  or "you always…" vs. "I always mess up"). The panel shows the words it heard. If the model can't load, keywords alone still give suggestions.

Each line the agent accepts adds to that call's evidence, so a customer's style builds up over the call.
**New call** clears it. Mood is read line by line (calm, anxious, frustrated or escalating, with
"heating up" / "calming down"). While it isn't calm, the guidance opens with a **Right now** tip and
de-escalation phrases. Optionally, Chrome's built-in on-device AI (Settings → On-device AI, off by
default, Chrome 138+ on capable hardware) takes a closer look when the suggestion is unclear.

Nothing the agent types is sent anywhere or stored. The worker refuses any fetch from outside the
extension, and the call history keeps only per-type scores, in memory.

**Using a client's real lines (no rebuild):** label anonymized lines in a CSV (template:
`docs/examples/labeling-template.csv`), run `npm run prepare-examples -- labeled.csv client-data`, then import
`client-data/client-examples.json` in Settings → Guidance content. The panel learns the lines on the device. See
`docs/NEXT-STEPS.md` §4. Cues and moods can be tuned through the same content import.
`npm run eval` and `tests/semantic.test.ts` measure accuracy. The method and research are in
`docs/research/recognition-analysis.md`.
