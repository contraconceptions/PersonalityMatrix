# Customer-type recognition: analysis and recommendation

Written 2026-09-24. Covers how the panel suggests a customer type from what the agent types, what
drives each suggestion, how strong that is, and the best way to make it stronger (including local
language models). Measurements are reproducible with `npm run eval`.

## Bottom line

1. **The current matcher is the weakest of the three options measured.** In leave-one-out tests
   on the 72 example lines, "mean of the 3 nearest examples" gets 74% top-1. A class centroid gets
   86% and softmax regression gets 82% on the same vectors. The 18/18 held-out score flatters it:
   those lines were written by the same people, in the same style, as the examples.
2. **The model reads topic and mood more than it reads stance.** Distressed and Demanding are
   the closest pair (centroid cosine 0.60): both are negative and about account problems. Several
   misses are topical, for example "Which version of the firmware fixes this issue?" → Demanding and
   "I've already restarted the router… What's next?" → Distressed.
3. **The training lines don't look like real input.** All 72 are first-person, well punctuated
   and carry a single clear signal. Real input will include agent shorthand ("cust angry, 4th call"),
   speech-to-text without punctuation, negation ("I'm not upset, just…") and mixed signals. Punctuation
   is doing hidden work today: 67% of Analytical lines have a question mark, and only Expressive
   lines have exclamation marks.
4. **Some trigger words point both ways.** "Always/never" marks distress as well as anger (see
   Research). "Worried", "not sure", "again", "sorry" and "sure" each appear under two or more types.
5. **The six types mix a stable style with a momentary state**, and a few PCM mappings don't
   match the PCM literature (see "Content issues"). No model can fix a label that means two things.
6. **Recommendation:** a layered recognizer.
   - **Fast path, always on:** softmax over the embeddings plus a research-based keyword-cue layer,
     showing the words that triggered the suggestion.
   - **Whole call, not one line:** build up style evidence across the call's lines and track state
     line by line.
   - **Optional deep read:** use Chrome's built-in on-device model (Gemini Nano through the Prompt API)
     when the device supports it and the fast path is unsure.
   - **Bundled LLM:** not the default. It adds 0.4–1 GB+ and seconds of CPU per line on typical agent PCs.
   - **The biggest accuracy gain will come from real, anonymized client lines** (NEXT-STEPS §4), not from
     a bigger model.

## How it works today

`DescribeCustomer` → `embedClient` → worker (all-MiniLM-L6-v2, 384-dim, quantized) → `classify()` in
`src/lib/similarity.ts`. The score for each type is the mean cosine of its 3 closest examples in
`exampleEmbeddings.json` (12 lines per type). Confidence is `clear` if the top type leads by at least 0.04,
`close` if it leads by less, and `none` if the top score is under 0.25. Each line is classified on
its own, with no memory of earlier lines.

## Measured findings

### Classifier comparison (leave-one-out, stored vectors, `npm run eval`)

| Rule | Top-1 | Top-2 |
|---|---|---|
| Mean of top-3 neighbours (runtime today) | 74% | 89% |
| Class centroid | **86%** | 92% |
| Softmax regression (L2) | 82% | **94%** |

With 11 training lines per type, averaging (centroid) beats nearest-neighbour voting, which chases
individual lines. Softmax should overtake the centroid as data grows, and it gives probabilities
that can be calibrated. This test uses the same people's lines, so real-world numbers will be lower.
The ranking between the rules is what matters here.

### Which types get confused (centroid cosine, higher = harder to separate)

| Pair | Cosine | Why |
|---|---|---|
| Distressed ~ Demanding | 0.60 | Both negative, both about account problems; the model doesn't separate *fear* from *blame* |
| Demanding ~ Expressive | 0.53 | Both long, emotional, first-person narratives |
| Distressed ~ Expressive | 0.52 | Personal life details (family, hospital, wedding) |
| Analytical ~ Expressive | 0.17 | Easiest pair |

Distressed ↔ Demanding is also the costliest mistake: the guidance is opposite (nurture first vs.
structure and boundaries).

### Words that point to more than one type (from the example and held-out lines)

| Word | Appears under | What actually separates them |
|---|---|---|
| always / never | Demanding, Expressive (and research: Distressed) | Who it's aimed at: *you/your company* → Demanding; *I/me/my* → Distressed; neutral → Expressive |
| worried / wrong | Distressed, Hesitant | Fear of what happens *to me* → Distressed; fear of *choosing* wrong → Hesitant |
| not sure / don't know | Distressed, Hesitant | "…what to do" (helpless) vs. "…which one" (undecided) |
| again | Demanding, Hesitant | "call again / third time" (grievance) vs. "explain again" (re-asking) |
| sorry | Distressed, Expressive (and politeness) | Repeated or self-blaming vs. social filler ("sorry, I'm a talker") |
| sure / okay / go ahead | Hesitant, Cooperative | Negated or hedged ("not sure", "be sure before") vs. plain agreement |
| need | Analytical, Distressed, Hesitant, Cooperative | Topic word; no signal alone |
| husband / daughter | Hesitant, Expressive | "check with my husband" (defers decision) vs. story |

### Strongest words per type in the current data (z-scored log-odds, Monroe et al. 2008)

- **Analytical:** which, each, exact, date, fee, days, numbers, "?".
- **Distressed:** I'm, can't, sorry, really, going (to), everything, please.
- **Demanding:** want, your, now, never, always, years, time, who.
- **Hesitant:** if, not, again, explain, maybe, sure, pick, change, would.
- **Expressive:** so, "!", oh, anyway, was, thing, from, where.
- **Cooperative:** ahead, go, number, here, thanks, got, sure, that's.

Many of these are function words (your, if, so, I'm). That fits the research below: *how* people
say things carries more of the signal than topic words.

## What the research says about each type's language

| Type | Linguistic evidence | Sources / strength |
|---|---|---|
| **Analytical** (PCM Thinker, "Thoughts") | Wh-questions about specifics (which, how much, when exactly), precision words (exact, breakdown, calculated), numbers, time periods, documents | PCM perception of Thoughts: facts, data, who/what/when/how (Kahler). Well established in PCM practice; not LIWC-validated |
| **Distressed** (Adapted Child; nearest PCM: Harmonizer in distress) | Fear and anxiety words, helplessness ("don't know what to do"), self-blame, repeated apology, high-stakes life impact (rent, kids, hospital), first-person singular, **absolutist words aimed at self** ("nothing ever works for me") | Absolutist words are a marker specific to anxiety and depression, tracking severity better than negative-emotion words (Al-Mosaiwi & Johnstone 2018, *Clin Psych Sci* 6(4)). First-person singular and depression: small effect, r = 0.13 (Edwards & Holtzman 2017 meta-analysis) |
| **Demanding** (Critical Parent; PCM Persister, "Opinions") | Blame aimed at "you/your company" plus absolutes, escalation demands (supervisor, complaint, cancel, review), judgment words (unacceptable, ridiculous), imperatives with urgency, **values and entitlement** ("matter of principle", "loyal for 15 years", "I know my rights"), rejecting empathy ("I don't want your apology") | PCM Persister: opinions, values, "I believe", "should" (Kahler). Escalation vocabulary is contact-center practice. Same absolutist words as distress, so direction is the key |
| **Hesitant** (Adapted Child; nearest PCM: Imaginer / Harmonizer) | Tentative words (maybe, I guess, not sure), putting off the decision (think about it, check with, call back), re-asking (again, one more time), fear of the wrong choice (what if, am I stuck), asking the agent to choose ("which would you pick"), fillers (um, hmm) | LIWC "tentative" category (Pennebaker). PCM Imaginer: "just tell me what to do", responds to clear direction |
| **Expressive** (Free Child; PCM **Rebel** "Reactions", plus Harmonizer warmth) | Reactions (wow, oh my gosh, haha, love), storytelling markers (so first…, anyway, long story, let me tell you), rapport questions (where are you based?), social and family nouns, exclamations | PCM Rebel perceives through reactions: likes and dislikes, "Wow!", "I love / I hate" (Kahler). LIWC social and positive-emotion categories |
| **Cooperative** (Adult) | Agreement and readiness (sure, go ahead, got it, sounds good), volunteering information (order number, "I have it here"), steps already tried, "what's next / what do you need", thanks | Politeness strategies (Danescu-Niculescu-Mizil et al. 2013). Adult ego state (TA) |

**Caveats that apply to every row:** the studies above are about written forum text, therapy and
PCM practice, not contact-center calls. Effect sizes for single words are small. That's why
words should *nudge* a model score and explain it, not decide on their own.

## Content issues found (for the content owner)

- **Expressive is tagged PCM `Promoter`**, but its lines, identifiers and channel ("Emotive") are
  Rebel (reactions, humor), with Harmonizer warmth. In PCM, Promoter is action and bottom line ("Do it",
  "make it happen"), which describes lines like "Fix it now. I'm not waiting another week." (a Demanding
  example). Suggest re-tagging Expressive as Rebel and reviewing the channel guidance.
- **Demanding mixes three things:** Persister (values, loyalty, rights), Promoter in distress (impatient
  bottom line) and plain anger. That's fine as one call type, but the example lines should cover all three.
- **Distressed and Hesitant share the Adapted Child ego state.** Their difference is helplessness vs.
  indecision, and the examples must make that contrast sharply.
- **Style vs. state:** Analytical, Expressive and (partly) Demanding are stable styles; Distressed, Hesitant
  and Cooperative are mostly momentary states. One line can show state reasonably well but style
  only weakly, which is why the roadmap's style-over-the-call idea (NEXT-STEPS §8, R2) matters.

## Approaches compared

| Approach | Accuracy potential | Latency, typical agent PC (estimate) | Size (approx.) | Needs | Explains itself |
|---|---|---|---|---|---|
| Today: top-3 neighbours on MiniLM | Low–medium | ~10 ms | 23 MB (shipped) | Examples | Nearest example only |
| Centroid / softmax on the same embeddings | Medium (+8–12 pts leave-one-out) | ~10 ms | +3 KB weights | Examples | Weakly |
| Keyword-cue layer (research lexicon, negation, direction) | Medium alone; complements embeddings | <1 ms | ~5 KB | A curated list clients can edit | **Yes**: shows the words |
| Better small embedding model (bge / e5 / gte-small) | Medium; unproven here | ~15 ms | ~30–35 MB | Benchmark on real lines | No |
| Fine-tuned small encoder (SetFit on MiniLM / DeBERTa-small) | **High** with real data | ~10–30 ms | 23–70 MB | 10–20+ *real* labeled lines per type | No |
| Zero-shot NLI (e.g. DeBERTa-v3-xsmall MNLI) | Medium; sensitive to how labels are worded | ~6 passes × 20–40 ms | ~70–140 MB | Type descriptions only | No |
| **Chrome built-in Gemini Nano (Prompt API)** | High on nuance: negation, agent notes, mixed signals | ~0.5–2 s | **0 MB** in the package | Chrome 138+ (extensions); GPU > 4 GB VRAM **or** 16 GB RAM + 4 cores; 22 GB free disk; one-time model download by Chrome; allowed by enterprise policy | **Yes**: quotes evidence (JSON output via `responseConstraint`) |
| Bundled local LLM (Qwen2.5 / Llama-3.2 0.5–1.5B via WebLLM or wllama) | High on nuance | 1–5 s on CPU; faster with WebGPU | 0.4–1 GB+ | WebGPU or a strong CPU | Yes |

Notes:
- Chrome's Prompt API runs on the device and sends no data to Google. Only the model download
  needs a network, once. Contact-center PCs and VDI thin clients often fall short of the hardware
  bar, so it can only ever be an **optional** layer with the fast path as fallback. Check
  `LanguageModel.availability()` at start-up. Client IT can disable it by policy.
- LLM output varies with prompt wording and model updates. Treat it as one more scorer measured on
  the same eval sets, and don't trust it by default.
- A strong LLM is most valuable **offline, at build time**: generating realistic training variety
  (agent shorthand, speech-to-text style, negation, mixed signals) and pre-labeling anonymized client
  transcripts for humans to confirm.

## Recommended architecture

```
typed line ─► fast path (always, <30 ms)
              ├─ MiniLM embedding ─► softmax (or centroid) scores
              └─ keyword cues (direction- and negation-aware) ─► score nudges + "why" words
              ▼ fuse and calibrate (weights fitted on the eval sets)
            per-call memory: style = recency-weighted sum of line scores; state = latest line
              ▼
            suggestion + confidence + trigger words
              │ confidence close/none, or agent clicks "Why?"/"Ask"
              ▼
            deep read (optional, Chrome AI available): Gemini Nano, JSON {type, runnerUp, evidence[], state}
```

## Plan (each step has a measurable gate)

Steps 1–5 were implemented on 2026-09-24. The status of each is at the end of its entry.

1. **Done:** `npm run eval` (leave-one-out comparison, plus held-out and challenge
   scoring with a confusion table when the model is present) and `tests/fixtures/challengeUtterances.json`
   (36 lines: 6 per type, each tagged with the trap it tests, including agent notes, no punctuation,
   negation, misleading keywords). The challenge set is written by us, so it's a stress test, not a real-world estimate.
2. **Switch the decision rule** to centroid or softmax. Gate: held-out ≥ today, challenge set better,
   every demo line still `clear`.
   *Done:* class centroid, computed at runtime from the index (no extra artifact), with softmax
   probabilities (temperature 0.04, fitted by leave-one-out). "Clear" means p ≥ 0.7: in leave-one-out,
   every suggestion at or above that was right (60/60). Leave-one-out top-1: 74% → 86% (embedding
   only). Real-model gates passed on 2026-09-24 (see "Real-model results").
3. **Keyword-cue layer + "why" highlights** (roadmap R3). Gate: challenge accuracy up, with no held-out regression.
   *Done:* `src/data/cues.json` (38 families across the six types). Absolutes are read by direction.
   Matches right after a negation are ignored. Agreement inside a question ("if I go ahead") doesn't count.
   Agent shorthand ("cust angry", "caller crying") has its own families. Cues add weight × 1 to the
   logit, so they nudge the embedding instead of overriding it. The panel shows the matched words
   ("Heard: supervisor, 4th call"). Clients can replace the cues through the content import (`cues` section, validated).
   If the model can't load, the panel still suggests from cues alone and says "keywords only".
   Leave-one-out with cues: 90% top-1, 99% top-2. This is optimistic, because the cues were written with
   these lines in view.
4. **Per-call accumulation** (roadmap R2). Gate: multi-line fixture calls reach the right type by line 2–3.
   *Done:* `src/lib/callMemory.ts`. Each accepted line's per-type log-probabilities (never text) are kept
   in memory. Earlier lines vote with weight 0.6^k. The agent's accepted type overrides the line's own
   lean. History clears with "New call" or after 15 minutes idle. `tests/fixtures/callTranscripts.json`
   (6 calls): keywords alone reach the right type on 5/6 calls by line 2 and 6/6 by line 3; the model
   run is in `npm run eval`. The per-line *state* signal (escalation meter) from R2 isn't built yet.
5. **Optional Gemini Nano deep read.** Gate: measured on the challenge set and real lines against the
   fast path; enable only if it clearly wins on close/none cases.
   *Done, off by default:* `src/lib/nano.ts` plus Settings → On-device AI. It runs only when the fast path
   isn't clear, on a fresh session clone per line, with a JSON-schema response (type, runner-up,
   confidence, evidence). Evidence quotes that don't appear in the text are dropped. The panel labels its pick
   "AI" and shows "AI heard …". It's never used in demos. Not yet measured against real Chrome AI:
   that needs a supported device.
6. **Real data** (NEXT-STEPS §4) → SetFit fine-tune (roadmap R4). Expected to be the largest single gain.
   *Tooling done:* `npm run prepare-examples` (agreement, personal-data checks, split) and a
   `customerExamples` import section, learned on the device with no rebuild. `npm run eval -- --examples … --heldout …`
   compares before and after. Waiting on client data.
7. **Per-line mood** (roadmap R2 "state"). *Done:* `src/lib/mood.ts` + `src/data/moods.json`. Each line reads
   as calm, anxious, frustrated or escalating (escalation outranks frustration; ALL-CAPS counts as shouting),
   with a trend against the previous accepted line ("▲ heating up", "▼ calming down"). While the mood
   isn't calm, the guidance opens with a "Right now" block: a tip and copyable de-escalation phrases,
   importable per client. Style keeps building across the call while mood follows the latest line. On the
   fixture lines, every Expressive and Cooperative line reads calm, and 13 of 21 Distressed lines read anxious.
8. **Correction logging** (R1). *Done:* each pick logs the suggestion showing at the time (type ids and
   confidence only); Settings → Usage shows agreement by confidence and the most frequent overrides.
9. **Model benchmark and fine-tuning** (R4). *Tooling done:* `npm run benchmark-models` (fits the temperature
   per model) and `training/setfit/train.py` (SetFit → quantized ONNX as `local/<name>`); the model is chosen in
   `src/data/model.json`. Needs real client lines and a machine that can download models.
10. **Chat auto-capture** (R5). *Done, off by default:* Settings → Chat capture; one site, runtime permission,
   history skipped, the agent confirms. Phone speech-to-text is not built (legal gate).

## Real-model results (2026-09-24)

Run on a machine with the model (`npm test`, `npm run eval`), with the runtime pipeline (centroid + cues).
`npm test` passes in full, including both real-model checks: held-out top-1 at least 80% and every demo
line `clear`.

| Set | Top-1 | Top-2 | Notes |
|---|---|---|---|
| Held-out (18) | 100% | 100% | `clear` right 17/17, `close` right 1/1 |
| Challenge (36) | 86% | 94% | `clear` right 31/32; all 4 `close` lines were wrong at top-1, and 3 of them had the right type second |
| Calls (6, model + keywords) | 4/6 after line 1 | — | 5/6 after line 2, 6/6 after line 3 |

- **Confidence is well calibrated:** agents can trust `clear` (48/49 right across both sets). `close` means
  check the second option, which the panel shows.
- **The one confident miss:** "I'm not upset, I just want to understand how you got to that number" came out as
  Distressed. The model reacts to "upset" despite the negation. Fixed afterwards with a "calm fact-finding"
  cue for Analytical.
- **The `close` misses** involve a question about kids' coverage (Distressed read as Analytical), "hate it" in
  a hesitant line, a family mention in a hesitant line, and "still blinking" in a cooperative line. They're
  left as they are: the panel offers the right alternative second, and tuning the cues to these specific
  lines would spoil the challenge set as a test.
- **Calls:** in the Distressed call, "cut off Friday and I just lost my job" read as Demanding until line 3.
  Fixed afterwards: job and income loss now count as high stakes.
- **Caveat:** the previous matcher was never scored on the challenge set with the real model, so there's no
  before-and-after for it. The challenge set is ours, and the two follow-up cues were written after seeing
  its results, so re-run `npm run eval` to confirm there's no regression, and treat it as a stress test.
  Real client lines (NEXT-STEPS §4) remain the real measure.

**Still unverified:** chat capture in real Chrome (the permission prompt), real Gemini Nano, importing client
example lines with the real model, and the model benchmark and SetFit fine-tuning (both need real data).
