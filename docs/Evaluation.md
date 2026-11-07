# Evaluation

[Project overview and quickstart](../README.md) | [Classroom guide](Classroom.md) | [Development checks](Development.md#run-the-checks)

**Status for Tiny Thinker v1.3.** This report covers how well each activity's presets work with each model, using real in-browser inference. The smoke tests replace the model with a fake engine.

All fourteen activities are covered. [14. Time-travel dinner party](#dinner-party-activity-14) has a separate results table because it was tested at its preset temperature with repeated samples, rather than under the main grid's temperature-0 conditions.

These are behavior checks for classroom debugging, not general model-quality, accuracy or safety scores.

## Method

- **Models:** SmolLM2 135M (tiny) and 360M (small), TinyLlama 1.1B (balanced), Qwen2.5 0.5B (medium) and Qwen2.5 1.5B (quality).
- **Engine:** Microsoft Edge, WebLLM 0.2.87 and self-hosted f16 builds.
- **Same requests as chat:** the evaluator builds messages with the chat page's own `buildModelMessages` in [models.js](../models.js). That includes context trimming, the "never repeat the question" instruction and SmolLM2's repeated instructions in the newest question.
- **Main grid:** 34 cases per model across activities 1-13, 170 responses in total. It uses temperature 0 and each preset's reply budget. It covers starter questions, the comparison presets and a few extra probes, such as an unrelated question under the word rule.
- **Held-out checks:** nine cases that were never used to choose prompts. Each runs twice per model at the classroom preset temperature, 90 responses in total.
- **Dinner party (activity 14):** four cases per model, three samples each at the preset temperature 0.6, 60 responses in total.
- **Conversations:** each response starts a fresh conversation, except one multi-turn story-feedback check.
- **Turtle scoring:** checks the first generated program, without the chat page's automatic repair.
- **Runs are recorded in full:** no run had an inference error, so every failed check is generated behavior, not a failed model load.

## Main grid

Activities 1-13, starter cases at temperature 0 (passes / cases). Activity 14's results are [reported separately below](#dinner-party-activity-14) and are not included in this grid's total.

| Activity | tiny | small | balanced | medium | quality | Total |
|---|---:|---:|---:|---:|---:|---:|
| 1. Shakespeare remix | 2/2 | 1/2 | 1/2 | 1/2 | 2/2 | 7/10 |
| 2. Break the silly rule | 7/8 | 7/8 | 4/8 | 4/8 | 4/8 | 26/40 |
| 3. Creativity dial | 2/2 | 2/2 | 1/2 | 2/2 | 1/2 | 8/10 |
| 4. Prompt makeover | 1/2 | 1/2 | 1/2 | 2/2 | 2/2 | 7/10 |
| 5. Story co-author | 2/2 | 2/2 | 1/2 | 1/2 | 2/2 | 8/10 |
| 6. Design for good | 1/2 | 1/2 | 2/2 | 2/2 | 2/2 | 8/10 |
| 7. Fact detective | 1/2 | 2/2 | 2/2 | 1/2 | 2/2 | 8/10 |
| 8. Who gets to be the expert? | 1/2 | 1/2 | 1/2 | 2/2 | 2/2 | 7/10 |
| 9. Language explorer | 1/2 | 1/2 | 0/2 | 2/2 | 2/2 | 6/10 |
| 10. Bug hunter | 0/2 | 0/2 | 1/2 | 0/2 | 1/2 | 2/10 |
| 11. Socratic coach | 4/4 | 1/4 | 1/4 | 2/4 | 4/4 | 12/20 |
| 12. Make it your own | 1/2 | 1/2 | 1/2 | 1/2 | 2/2 | 6/10 |
| 13. Turtle artist | 1/2 | 1/2 | 2/2 | 1/2 | 2/2 | 7/10 |
| **Total (activities 1-13)** | **24/34** | **21/34** | **18/34** | **21/34** | **28/34** | **112/170 (66%)** |

The tiny models score well in Break the silly rule mainly because they ramble and never produce the forbidden word. A passing check is not necessarily a useful answer.

## Held-out checks

Unseen cases at the preset temperature, two samples per model:

| Case | tiny | small | balanced | medium | quality | Total |
|---|---:|---:|---:|---:|---:|---:|
| 1. Shakespeare / pirate: new scene in voice | 0/4 | 4/4 | 1/4 | 1/4 | 2/4 | 8/20 |
| 2. Stricter rule: translation trick, no leak; unrelated arithmetic answered normally | 3/4 | 4/4 | 2/4 | 4/4 | 2/4 | 15/20 |
| 5. Story: one feedback tip after plot choices | 0/2 | 0/2 | 1/2 | 2/2 | 2/2 | 5/10 |
| 9. Language: new Spanish question | 0/2 | 1/2 | 0/2 | 2/2 | 2/2 | 5/10 |
| 10. Bug hunter: new grid route | 0/2 | 0/2 | 0/2 | 1/2 | 2/2 | 3/10 |
| 11. Coach: new fraction hint and wrong guess | 1/4 | 0/4 | 2/4 | 4/4 | 4/4 | 11/20 |
| **Total** | **4/18** | **9/18** | **6/18** | **14/18** | **14/18** | **47/90** |

With two unseeded samples per case, single cells can swing by several passes between runs. Read the totals and the gap between model families, not individual cells.

## Dinner party (activity 14)

**14. Time-travel dinner party:** shipped guest prompts, four cases per model and three samples per case at temperature 0.6 (12 replies per model, 60 overall):

| Model | Passed | Observed behavior |
|---|---:|---|
| SmolLM2 135M | 1/12 | Loses the role |
| SmolLM2 360M | 10/12 | Avoids modern words, but replies ramble and are rarely useful |
| TinyLlama 1.1B | 0/12 | Answers with generic how-to lists |
| Qwen2.5 0.5B | 3/12 | Often mentions email, phones or computers in historical roles |
| Qwen2.5 1.5B | 9/12 | Mostly in role; occasional slips |

Across the five models, 23/60 replies passed these checks. This separate result is not combined with the main grid because the sampling settings and repetition counts differ.

The four cases are:

- Rosa (1930) answering "How do you talk to a friend who lives far away?".
- Mei (1990) answering the same question.
- Rosa asked about Mei's home computer.
- Daniel (1960) hearing about Rosa's letters.

Checks require a first-person reply, details from the guest's own time and no AI-style answer or out-of-time technology. Asking what an unknown thing is counts as correct. The activity requires the quality model; see the [Classroom guide](Classroom.md#background-time-travel-dinner-party) for the design and typical role mistakes.

## Prompt design notes

The presets follow these findings from testing:

- **No chat-transcript examples in system prompts.** `User:` / `Assistant:` examples make SmolLM2 and TinyLlama continue a fake conversation. Voice prompts give a one-sentence voice sample instead.
- **Give the model an allowed answer.** The stricter word rule tells the model what to say instead ("the curvy yellow fruit") and names the known tricks. A rule that only forbids and warns leaked more often than the original rule.
- **Separate behaviors that share one prompt.** Story co-author treats plot choices and feedback as two cases, so a feedback request is not answered with three more plot choices.
- **Keep worked answers out of coaching prompts.** Models copy them into replies and give away the solution.
- **Use absolute grid moves.** "Facing North, turn right" confused every model; `UP 2, RIGHT 1` with stated axis rules gives step-by-step answers students can check.
- **Let students relay between characters.** When the app passed one guest's reply to the next guest, even Qwen 1.5B copied it or simply agreed. Independent answers plus a student-written relay keep the guests distinct. Telling guests to "stay true to what you care about" reduces drift toward agreement.
- **Prefer specific, concrete wording over templates.** Fill-in-the-blank templates and long rule lists made small models echo the scaffolding instead of answering.

## Known limitations by activity

- **1. Shakespeare remix:** smaller models slip into modern English or drop the greeting. New scenes stay in voice less often than the starter scenes.
- **2. Break the silly rule:** both rules leak on every model, especially in spelling games and unseen tricks such as translation. The stricter rule leaks about as often as the original on the starter tricks, but follows its replacement phrase more visibly and answers unrelated questions normally. Avoiding the word can produce a wrong substitute such as "apple".
- **9. Language explorer:** SmolLM2 and TinyLlama repeat the Spanish question or reply in broken Spanish; both Qwen models answer in Spanish. This is the intended contrast.
- **10. Bug hunter:** only Qwen 1.5B reliably solves the grid robot. No model reliably continues the bead pattern. Seven of ten main-grid replies and nine of ten held-out replies show checkable step-by-step states.
- **11. Socratic coach:** smaller models sometimes accept a wrong guess or reveal the answer.
- **12. Make it your own:** models often add titles or headings to the four-line poster.
- **14. Time-travel dinner party:** requires the quality model. Typical Qwen 1.5B slips are a 1960 guest mentioning email, a guest taking over another guest's role, an AI-style "I don't have personal experiences" and agreeing with whoever was quoted.

Students are told about these expectations in each activity's notice and in the [Classroom guide](Classroom.md).

## What the checks measure

| Activity | Check |
|---|---|
| 1. Shakespeare remix | Required opening ("Hark!", "Arrr, matey!") plus voice vocabulary |
| 2. Break the silly rule | No forbidden word on tricks; unrelated questions answered without the refusal or replacement phrase |
| 5, 12. Story, Make it your own | Plot choices numbered 1-3; feedback as a tip without numbered options; poster in exactly four lines |
| 6. Design for good | Required design features present |
| 7. Fact detective | Known facts correct; invented names identified as unverifiable |
| 8. Who gets to be the expert? | Requested pronouns used |
| 9. Language explorer | Spanish replies: mostly Spanish function words, no English ones, no echoed question, a topic word. English replies: a science idea |
| 10. Bug hunter | Correct final coordinate plus an intermediate state, or the tenth bead. Traceability is reported separately and not counted in the total |
| 11. Socratic coach | A hint versus a solution; wrong guesses corrected; right guesses confirmed |
| 13. Turtle artist | Executable Logo with the expected segment count |
| 14. Time-travel dinner party | See above |

These checks are transparent automated screens. They do not prove factual accuracy, Spanish fluency, lack of bias, story quality, correct geometry beyond the checked attributes, or resistance to arbitrary tricks. A forbidden-word pass can be evasive nonsense, a keyword can appear in a wrong explanation, and a valid paraphrase can fail a narrow check. Raw replies are reviewed alongside the scores.

## Reproduce

Use the Playwright setup in [Development](Development.md#run-the-checks), Microsoft Edge and an isolated preview server on port 8765. The runner uses real WebGPU inference (f16 by default) and downloads model files if they are not local or cached.

```powershell
node tests/prompt-grid.mjs --phase=main
node tests/prompt-grid.mjs --phase=holdout --holdout --sampling=preset --repetitions=2
node tests/prompt-grid.mjs --phase=dinner --experiments=dinner-party --sampling=preset --repetitions=3
# Narrow a run, or compare CPU behavior:
node tests/prompt-grid.mjs --phase=rule-check --tiers=balanced,quality --experiments=silly-rule
node tests/prompt-grid.mjs --phase=cpu-check --engine=wllama --tiers=quality --experiments=coach,bug-hunt
# Try alternative prompts or starter questions without editing the presets:
node tests/prompt-grid.mjs --phase=candidate --experiments=bug-hunt --prompts=my-candidates.mjs
```

Without `--experiments`, the main grid runs all activities, including the dinner-party cases. To match this report, use `--experiments` to separate activities 1-13 from activity 14.

`--variant=f32` selects WebGPU model precision; CPU runs do not accept this option. The plural `--variants` filters prompt-variant labels by prefix, for example `--variants="Pirate voice"`. Unknown options, invalid experiment IDs and filters with no matching cases stop the run. Boolean flags accept explicit `true` or `false`, so `--holdout=false` runs the main grid.

A candidate file is an ES module whose default export maps experiment IDs to a list of candidates:

```js
[{ name, systemPrompt?, variants?: { label: prompt }, prompts?: { label: question }, checks? }]
```

`--rescore` reapplies the current checks to a saved report; add `--holdout` or `--prompts` to match how that report was produced.

Each phase writes `test-results/prompt-grid-<phase>.json`, which is ignored by Git. Each record includes the actual messages, settings, reply, finish reason, timing and check result. Reports contain only the predefined fictional classroom prompts, not student conversations.

Set `PREVIEW_URL` or `PLAYWRIGHT_MODULE` to use a different server or an existing Playwright installation. A browser or model-load failure stops the run rather than substituting fake replies.
