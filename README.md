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
```

## Load in Chrome

1. `npm run build`
2. Go to `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, choose `dist/`.
3. Click the toolbar icon to open the side panel.

## Layout

```
public/manifest.json        MV3 manifest (copied to dist/)
sidepanel.html              Side panel entry
src/background/             Service worker (ephemeral — no in-memory state)
src/data/*.json             Archetypes, 36-node matrix (partially authored), trigger phrases
src/lib/matrix.ts           resolveGuidance(): node > customer baseline > global triggers
src/lib/storage.ts          chrome.storage.local with localStorage fallback
src/sidepanel/components/   AgentSetup, CustomerQuickId, MatrixOutput
tests/                      Vitest
```

## Authoring matrix content

Add entries to `src/data/interactionMatrix.json`. All 36 pairings are authored (see `docs/research/matrix-methodology.md`). A pairing with no entry would fall back to
general guidance for that customer type. The UI marks these with a "General guidance" badge.
`missingNodes()` in `src/lib/matrix.ts` lists the pairings that still need entries.
