# PersonalityMatrix

An offline Chrome extension for contact-center agents. The agent picks their own communication
archetype once. During a call they tap the customer's archetype, and a side panel shows guidance for
that pairing:

- **Risk:** how this pairing tends to go wrong.
- **Relate:** the strategy to use and phrases to say.
- **Avoid:** phrases that tend to escalate the call.

The guidance draws on the Process Communication Model, Transactional Analysis and brand archetypes.
See `docs/PLAN.md` for the roadmap and `docs/research/` for the source material.

## Develop

```sh
npm install
npm run dev        # opens the side panel UI in a normal browser tab (localStorage fallback)
npm test           # data-integrity + guidance logic tests
npm run build      # type-check + build the extension into dist/
npm run package    # build + zip to release/personality-matrix-<version>.zip for clients
```

## Load in Chrome

1. `npm run build`
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose `dist/`.
3. Click the toolbar icon to open the side panel.

For a client, send the zip from `npm run package`. They unzip it and load the folder the same way.

**In the panel:** keys `1`–`6` pick the customer type, `Esc` clears, and clicking a Relate phrase copies it.

## Layout

```
public/manifest.json        MV3 manifest (copied to dist/)
sidepanel.html              Side panel entry
src/background/             Service worker (ephemeral — no in-memory state)
src/data/*.json             Archetypes, 36-node matrix, quiz, trigger phrases
src/lib/matrix.ts           resolveGuidance(): node > customer baseline > global triggers
src/lib/storage.ts          chrome.storage.local with localStorage fallback
src/sidepanel/components/   AgentSetup, CustomerQuickId, MatrixOutput
tests/                      Vitest
```

## Authoring matrix content

All 36 pairings live in `src/data/interactionMatrix.json`. Each one is tagged with `fit`
(strong / neutral / watch) and `basis` (research / derived). The method and sources are in
`docs/research/matrix-methodology.md`. If a pairing is ever removed, the panel falls back to general
guidance for that customer type, and `missingNodes()` in `src/lib/matrix.ts` lists the gaps.
