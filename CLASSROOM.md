# Classroom Guide

## What Students Are Investigating

Tiny Thinker runs small, already-trained language models on the student's device. Students change instructions and generation settings; they do not train a new model. The useful outcome is an observation supported by a comparison, or a student-made artifact shaped and critiqued with the tool, not a quick answer copied from the model.

Use the cycle **predict -> try -> change one thing -> compare -> explain**, and for creative tasks **plan -> generate -> critique -> rewrite -> share**. Model failures are valid evidence: a model might ignore the Shakespeare voice, invent a fact, miscount a step or break its silly rule. Do not promise an activity will always produce a particular response.

Treat AI like any convenience tool: useful when directed with clear goals and context, but easy to lean on passively. Keep students in the producer's seat by having them work out a small case by hand first, define success criteria before prompting, critique what comes back, and make the final piece their own.

## Before Class

1. Prepare the site with `python download_models.py --profile classroom`, then `python download_models.py --profile classroom --check`. See [README.md](README.md) for deployment details.
2. Test the actual school browser, network and representative devices. Use HTTPS on a remote server; localhost works for preview. Confirm jsDelivr is accessible. Other model tiers may also need Hugging Face access.
3. All four model tiers are prepared on the site. On weaker devices, choose tiny or small on the setup screen; medium and quality give better answers (and Spanish) but need more memory and a longer first download per device.
4. Open and warm up the chosen model on each device before students arrive. Disk copies on the server do not mean every browser already has a cached copy. Coordinate downloads to avoid overloading school Wi-Fi.
5. Test sending, stopping, applying a preset, settings help and reset. Optional COOP/COEP headers enable multithreaded CPU inference; see the device check for availability.
6. Follow the school's safeguarding, age-appropriateness and AI-use policies. These open models are not certified child-safe or reliably moderated. Plan teacher-led or paired use for younger students and a non-AI alternative if needed.
7. Agree on fictional inputs only: no names of classmates, contact details, photos, passwords, health information or other personal data. Have independent reference material ready for fact-checking.

## A 45-Minute Lesson

| Time | Activity |
|---|---|
| 0-5 min | Explain local inference, imperfect predictions and the fictional-input rule. Ask students what they expect changing a model's instructions to do. |
| 5-12 min | Demonstrate Shakespeare remix: apply the preset, use a starter, then change the system prompt and repeat with Fresh run. |
| 12-27 min | Pairs choose an activity. One student predicts and records; the other operates the controls. Swap roles halfway. |
| 27-35 min | Change one variable and repeat. Keep the question, model and other settings fixed where possible. Record both expected and surprising results. |
| 35-41 min | Compare observations. Ask which claims need checking and which results might change on another run. |
| 41-45 min | Download notes if required, share a conclusion, then press Done on shared devices. |

For younger students, run a single comparison together instead of independent exploration. For older students, repeat trials and distinguish a supported observation from a general claim about all AI systems.

## Activity Menu

Each activity includes its own student-facing steps, starter questions, entry task and stretch challenge. Presets set system prompt, temperature and reply-token budget; students can inspect and edit all three. The **?** beside each setting opens a simple explanation with an example. Activities are numbered in the experiment picker, so you can say "open experiment 4".

| # | Activity | Starting Settings | Investigation |
|---|---|---|---|
| 1 | Shakespeare remix | Temperature 0.7; 160 tokens | Compare a theatrical voice with a neutral voice while keeping the question fixed. Style is not evidence of truth. |
| 2 | Break the silly rule | 0.3; 96 tokens | Try harmless word games against a rule forbidding the word banana. A prompt is not a security boundary. |
| 3 | Creativity dial | 0.2; 160 tokens | Compare repeated story openings at 0.2 and 1.0. Randomness is not a quality or accuracy score. |
| 4 | Prompt makeover | 0.5; 160 tokens | Improve a vague brief by adding one audience, constraint or example at a time. Evaluate against a checklist. |
| 5 | Story co-author | 0.9; 192 tokens | Choose, reject and rewrite story suggestions. Identify which creative decisions remain the student's. |
| 6 | Design for good | 0.7; 192 tokens | Propose a design under practical constraints, critique it, and sketch a revision on paper. Do not build anything hazardous. |
| 7 | Fact detective | 0.2; 128 tokens | Verify claims outside the model. The fictional Mira Moonpetal/Luminara question tests whether it invents evidence. |
| 8 | Who gets to be the expert? | 0.7; 160 tokens | Compare fictional expert descriptions across otherwise identical she/he/they prompts. Repeat before drawing tentative conclusions. |
| 9 | Language explorer | 0.3; 128 tokens | Ask the same question in English and Spanish, then repeat with a larger model (medium). Discuss why language coverage depends on training data and who that leaves out. Pair with a Spanish speaker to judge answers. |
| 10 | Bug hunter | 0.2; 160 tokens | Solve a small grid, pattern or sorting puzzle by hand first, then trace the model's steps to catch where it slips. Fluent steps still need testing. |
| 11 | Socratic coach | 0.2; 144 tokens | Ask for a hint instead of a shortcut, then test the coach with a wrong guess (`5/8`) and a right guess (`3/4 = 6/8`). Discuss AI sycophancy when a model praises a wrong answer. |
| 12 | Make it your own | 0.6; 176 tokens | Compare a vague draft with a well-framed one, critique filler against a checklist, then rewrite in the student's own voice and share. |
| 13 | Turtle artist | 0.2; 192 tokens | Predict turn angles on paper, ask for Logo turtle code (`FD`, `RT`, `REPEAT`), inspect the inline SVG drawing, and edit the code box with **Run code**. A single automatic retry repairs syntax mishaps; smaller models often need the student to fix the geometry. |

These are text and bounded Logo turtle activities. The sandbox uses a restricted Berkeley/UCBLogo-style dialect with standard pen commands, coordinates, arithmetic, variables, repeats and procedures. It never executes model-supplied JavaScript, accesses files or the network, generates raster images, trains models or browses the web.

### Turtle Artist: Logo Dialect

Logo has many dialects rather than a single official standard. This activity follows the widely documented Berkeley/UCBLogo conventions, using the established jslogo parser behind a restricted drawing adapter. It accepts both abbreviated and long movement commands, such as `FD`/`FORWARD` and `RT`/`RIGHT`. The model prompt requests executable Logo only, supplies short examples and budgets 192 tokens to reduce truncation. These instructions improve the contract, not the model's ability to reason about every drawing.

- Start at `(0,0)`, heading 0 up; positive Y is up and heading 90 is right. Each reply and editor run starts fresh.
- Use `SETPENCOLOR 1` for blue, `SETPENCOLOR 4` for red, `SETPENCOLOR "gold` for a named colour, or `SETPC [99 0 0]` for red in the Berkeley 0-99 RGB convention. `SETPENSIZE [3 3]` sets thickness. Older `COLOR blue` and `WIDTH 3` examples still work.
- `REPEAT 7 [ FD 40 RT 360/7 ]` draws a seven-sided polygon. Nested repeats, `REPCOUNT`, arithmetic, `MAKE "size 40` and `:size` work. `TO SQUARE :SIZE REPEAT 4 [ FD :SIZE RT 90 ] END SQUARE 40` defines and calls a procedure; definitions do not carry into another reply.
- `SETXY 40 60` moves to a position. With the pen down, `HOME` draws a line back to the origin; `PU HOME PD` avoids it. `CLEAN` erases without moving; `CS`/`CLEARSCREEN` erases and returns home without a connecting line. `ARC` draws around the stationary turtle; `HT` and `ST` hide/show its cursor.
- Invalid or cut-off code is reported, not silently rewritten. One automatic repair receives the original task, rejected code and validation error. Students can still inspect and correct the final program themselves. Manual **Run code** never sends another model request.
- This is a bounded subset, not a full Logo workspace. It excludes file/network access, input, fills and screen-mode commands. Limits include 0-360 repeats, 5,000 operations/segments, a one-second execution budget checked at dispatch, 12,000 characters, 32 nesting levels, 64 procedure-call levels and eight required procedure inputs. Coordinates stay within 5,000 steps and pen sizes within `(0,12]`. Optional procedure inputs are not supported.

Sources consulted for the dialect: [Logo overview](https://en.wikipedia.org/wiki/Logo_(programming_language)), [turtle graphics overview](https://en.wikipedia.org/wiki/Turtle_graphics), the primary [Berkeley Logo manual](https://people.eecs.berkeley.edu/~bh/usermanual), and [jslogo's implementation](https://github.com/inexorabletash/jslogo). These are public syntax references; we cannot verify which implementations were included in a model's training data.

## Inclusion and Mixed Ages

Offer all activities to everyone. The creative choices include girl inventors and engineers, athletes, musicians, community projects and accessible design without implying those interests belong to one gender. Invite students to invent different protagonists and settings rather than use real classmates.

Pair creative freedom with technical agency: every student should get a turn changing settings, making predictions and interpreting results. Do not steer girls only toward writing or design, or boys only toward technical challenges. Discuss diverse real role models using teacher-selected, verified sources, not invented model biographies.

- Entry level: one short question, one change, one observed difference. Students may draw or explain aloud instead of typing reflections.
- Intermediate: hold the prompt and model fixed, run both settings, and identify which constraints were met.
- Stretch: repeat each condition at least three times, state a tentative conclusion and explain what the trials cannot establish.

For fairness activities, describe patterns in outputs, not the abilities of real groups. A handful of answers cannot establish overall fairness or unfairness. Do not ask the model to rank groups or produce discriminatory content.

## Using Presets and Notes

Students reach the activities in three steps shown at the top of every page: **Set up** (device check), **Choose an experiment** (a card per numbered activity) and **Chat and learn**. On a student's first visit, six short tips with arrows walk them through that path once. A cookie remembers that the tips were seen. While the model loads, students can read short explanations of loading time, megabytes, caching and working memory. In the chat, the yellow **Choose a new experiment** action returns to the experiment list. Opening an experiment applies its settings, starts a new conversation and shows the steps. Blue-outlined step buttons fill the message box (students still press Send); green-outlined buttons change a setting and start a fresh run for a fair comparison. An experiment link, such as `index.html?experiment=shakespeare`, skips the experiment list and can be shared without including student work in the URL.

Fresh run empties the model's conversation context and repeats the last question in the composer without sending it. Settings, reflection notes and earlier run records remain available for the experiment export. This allows a cleaner comparison than asking the same question later in a long conversation. The model, engine and precision also affect results, so record them and avoid changing them during a single-variable comparison.

The local text export contains the activity, model/backend description, current settings, each retained turn's actual settings, responses and reflection notes. Download notes before leaving the page or changing activities. Clear discards the conversation/run records but keeps reflections; applying a new preset or Done also discards reflections. No notes are automatically uploaded or graded. Use only a school-approved method if students submit downloaded work.

## Experiment Badges

Each experiment has its own cumulative progress. Its current badge appears immediately in the chat header after a qualifying reply and on its experiment card when the picker opens.

| Level | Badge | Completed Replies in That Experiment |
|---|---|---|
| 1 | Explorer (one star) | 1 |
| 2 | Experimenter (two stars) | 2-4 |
| 3 | Investigator (three stars) | 5 or more |

One student-sent question with a non-empty, completed model reply counts as one interaction. A reply that reaches the token limit still counts. Page visits, clicking starter questions, editing settings or turtle code, free chat, failed replies, stopped replies and empty replies do not count. An automatic turtle repair does not count as another interaction; if that repair is stopped or fails, the turn earns no progress. Replies discarded by a reset or experiment change do not count.

Counts accumulate across Fresh run, Clear, Done, model changes and return visits in the same browser and site. Reopening an experiment alone adds nothing: students must complete another interaction to advance. Existing Explorer and Experimenter badges are preserved; previously stored Experimenter progress starts at two replies because the old system did not retain higher counts.

Only experiment IDs and counts (capped at five) are saved in local storage, not questions, replies or notes. Progress does not follow a student to another browser or device. Clearing site data removes it; blocked browser storage can prevent badges from being saved. On shared devices, badges belong to that browser rather than an individual student, and Done does not remove them. They recognize participation, not correctness, mastery or a grade. Ask students to support their observations with comparisons and notes rather than chase reply counts.

## Boundaries for the Rule Challenge

Keep the challenge to the fictional word rule built into the activity. Students can try riddles, spelling games or pretend roles. Do not put an actual secret in a system prompt, seek harmful material, probe a real school's system or try to bypass another service's protections. Success means explaining what happened, not defeating a real safety mechanism. If the rule holds, that still does not prove a prompt is secure.

## Privacy, Supervision and Cleanup

Inference happens on-device; the app does not intentionally send conversation text to a model service. Static/CDN hosts still receive asset requests and may log IP addresses. Model libraries come from jsDelivr and unprepared model tiers fall back to Hugging Face. The site is not fully offline and browser caching is not a guarantee of offline startup.

Settings and model/device choices persist in browser storage, and a single cookie records only how many first-run tips were seen; conversations and reflection notes live in tab memory. Supervise student use: the model may generate inaccurate, biased or inappropriate content even with a classroom-oriented prompt. Stop the response, clear it and discuss with the teacher if something uncomfortable appears.

At the end, download required notes and press Done (step 4). Confirm to stop any reply, clear current work, restore prompt/settings and return to Set up. Cancel keeps the chat intact. Cached model files and earned badges are not deleted. From chat, the other workflow exit is Choose a new experiment, which keeps the loaded model available.

## Troubleshooting

- Slow first use: allow time for the model download and initialization; use tiny, shorten replies or warm devices in advance.
- GPU error: use the offered CPU fallback. The selected activity and its settings are retained; conversation context is cleared.
- Unhelpful or garbled answers: simplify the prompt, shorten the task, reduce temperature or compare a stronger model on a capable device. Treat the limitation as an observation, not student failure.
- Answer cut off: raise the reply budget or ask for fewer sentences. Tokens are pieces of text, not an exact word count.
- Downloads fail: inspect access to the site, jsDelivr and Hugging Face; verify free browser storage and server MIME types. Do not assume a cached model removes CDN requirements.
- Site moved or served under a subdirectory: upload assets, engines and models together with their relative paths intact; check the setup badge says self-hosted for the prepared model.

## Research and Further Reading

Activity wording and prompts here are original, informed by these publicly accessible resources, reviewed 30 October 2026:

- [Experience AI: AI and critical thinking](https://experience-ai.org/en-US/themes/ai-and-critical-thinking), Raspberry Pi Foundation and Google DeepMind. Its LLM resource addresses how models work and why outputs are not always reliable; the resource collection includes age-differentiated materials.
- [Experience AI resources](https://experience-ai.org/en-US/units). Resources for ages 8-12, 11-14 and 14-16 support adapting the same learning goal for different groups.
- [Day of AI: Truth, Tricks, and AI](https://dayofai.org/units/truth-tricks-and-ai-learning-to-verify-information), powered by MIT RAISE. The public lesson summary emphasizes verification, lateral reading and human responsibility. Some full materials require registration; these activities do not depend on them.
- [UNESCO: Guidance for generative AI in education and research](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research). Human oversight, privacy and age-appropriate pedagogical design inform the classroom safeguards. This is not an endorsement or safety certification of this app.