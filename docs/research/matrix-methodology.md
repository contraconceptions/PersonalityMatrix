# How the 36-node matrix was built

The Gemini report defines 6 agent × 6 customer archetypes (36 pairings) but only works through
6 of them as examples. The other 30 were **derived** on 2026-09-23 using the same frameworks.
Each node in `src/data/interactionMatrix.json` carries `"basis": "research"` or `"basis": "derived"`.

## Method

Each pairing was worked out by applying three lenses:

1. **Agent's known weak spot.** The report gives each agent archetype a strength and a risk,
   for example "Fixer risks rushing Distressed customers". The node's *Risk* says how that weak spot
   shows up with this customer.
2. **The customer's preferred channel (PCM).** The Process Communication Model says each personality
   base connects through one channel:
   Thinker → Requestive with thoughts; Persister → Requestive with opinions; Harmonizer →
   Nurturative with emotions; Rebel → Emotive; Promoter → Directive with actions;
   Imaginer → Directive with reflections. The node's *Relate* strategy tells the agent which channel
   to shift into.
3. **The ego-state transaction (TA).** When the agent's default ego state crosses the customer's,
   the guidance steers toward Adult↔Adult (the healthiest complementary transaction), or toward
   Nurturing Parent→Adapted Child briefly for distressed customers before moving to Adult.

Phrases draw on the report's linguistic heuristics (Empathy Bridge, Structured Resolution, Assertive
Optioning, Collaborative Questioning, Contextual Normalization). They also draw on common de-escalation
practice: listen without interrupting, restate the problem, and give empathy before facts or policy.

### Fit rating

Each node has a `fit` shown as a small tag in the panel:

- **Natural fit** (`strong`): the agent's default style already suits this customer. The risk is usually overdoing a strength.
- **Adjust style** (`neutral`): workable, but needs one deliberate adjustment.
- **Watch closely** (`watch`): the styles naturally clash, so the agent must consciously shift channel or ego state.

Fit ratings come from the report's own strength/risk statements where it gives them. Otherwise
they come from whether the ego states are complementary or crossed.

## Sources

- Gemini report and Google Doc (`research-doc.md`, `gemini-report-notes.md`)
- PCM channels: [Leman Skills – PCM Communication Channels](https://lemanskills.com/pcm-communication-channels/),
  [Magda Tabac – The magic of connection (Part 2)](https://magdatabac.com/the-magic-of-connection-starts-with-the-process-of-connecting-part-2/),
  [Cegos – What is the Process Communication Model](https://www.cegos.com.sg/insights/what-is-the-process-communication-model-and-why-should-every-leader-keep-it-in-their-sights)
- Transactional Analysis in service contexts: [Train the TA – Complementary, crossed and ulterior transactions](https://www.traintheta.com/post/understanding-complementary-crossed-and-ulterior-transactions-in-ta-the-role-of-strokes-in-commun),
  [Simply Psychology – Transactional Analysis](https://www.simplypsychology.org/transactional-analysis-eric-berne.html),
  [Sandler – Understanding Transactional Analysis](https://info.borovitz.sandler.com/blog/ta)
- De-escalation practice: [Pollack Peace Building – Call center de-escalation](https://pollackpeacebuilding.com/blog/call-center-de-escalation-techniques/),
  [GigaBPO – HEARD method](https://gigabpo.com/customer-service-de-escalation/),
  [Helpware – De-escalating angry customers](https://helpware.com/blog/how-to-deescalate-angry-customer-best-techniques)

## Caveat

The derived nodes are expert synthesis, not empirically validated pairings. For a client demo
that's appropriate. Before real deployment, have experienced team leads review the 30 derived nodes
and adjust the phrasing to match the client's brand voice.
