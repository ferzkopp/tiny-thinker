# Using Tiny Thinker

[Project overview and quickstart](../README.md) | [Classroom guide](Classroom.md) | [Accessibility](Accessibility.md)

## Classroom experiments

The picker includes fourteen short activities, numbered so a teacher can say "open experiment 4":

1. **Shakespeare remix:** compare answers in different voices.
2. **Break the silly rule:** test a rule with harmless word games.
3. **Creativity dial:** explore randomness by changing temperature.
4. **Prompt makeover:** improve a vague request with specific details.
5. **Story co-author:** turn AI suggestions into your own story.
6. **Design for good:** brainstorm and improve a useful design.
7. **Fact detective:** check facts and spot invented claims.
8. **Who gets to be the expert?:** explore stereotypes in fictional leader descriptions.
9. **Language explorer:** compare English and Spanish across models.
10. **Bug hunter:** check logic puzzles for step-by-step mistakes.
11. **Socratic coach:** ask for hints and test the feedback.
12. **Make it your own:** give a generic AI draft your personal touch.
13. **Turtle artist:** generate, draw and edit Logo shapes.
14. **Time-travel dinner party:** host invented guests from 1930, 1960 and 1990, relay messages between them and fix role mistakes. Needs the quality model.

The [Classroom guide](Classroom.md) covers lessons, mixed-age adaptations, safeguards, activity background and research references. [Evaluation](Evaluation.md) records model behavior and scoring limitations.

## Choose an activity

The step bar guides you through **Set up -> Choose an experiment -> Chat and learn**:

1. **Set up:** checks the device and recommends an engine and model. **Change** chooses another setup.
2. **Choose an experiment:** one card per numbered experiment, with its topic, time and question. **Open free chat** skips the instructions.
3. **Chat and learn:** runs the experiment. Returning to the picker or finishing asks for confirmation if work could be lost.

While the model loads, a window shows progress, explanations of loading time and megabytes, and experiment and model summaries. Successful loads remain visible for at least four seconds, including cached models; errors appear immediately. Pointer movement, tapping, clicking, scrolling or a key other than Escape keeps it open until **Start chatting** is pressed. Automatic focus alone does not count as an interaction. Notes explain caching and the difference between stored files and working memory.

On the first setup visit, a welcome dialog introduces Tiny Thinker. **Let's go** dismisses it; a cookie remembers this for a year. Six tips then introduce the workflow and controls. **Skip tips** ends them early; a separate cookie remembers progress. After those tips, setting-focused experiments show one **Experiment tip** pointing at their main setting. Local storage remembers which experiment tips were seen. **Your datacenter** describes what the device can run, with yellow explanations of checks and recommendations.

**Choose a new experiment** opens the picker inside the loaded chat page. Its non-modal confirmation offers **Keep chatting** or **Leave experiment**, and the chat remains usable. Confirming stops any active reply and clears the conversation, draft and notes. Another experiment applies its preset and starts a fresh conversation while retaining the loaded model. Free chat also reuses that model. Changing setup or reloading initializes the engine again. Reloading or closing the tab can trigger the browser's unsaved-work warning.

Share an activity using [Shakespeare remix](https://www.ferzkopp.net/tiny-thinker/index.html?experiment=shakespeare) or [Turtle artist](https://www.ferzkopp.net/tiny-thinker/index.html?experiment=turtle). The device check carries the activity through to chat, skipping the picker. These links contain no conversation text.

The first reply can take longer while the engine warms up. A note beside the thinking dots disappears as soon as the first response character arrives, or when the attempt stops or fails before producing text. After the first completed reply, the note does not repeat for replies, fresh runs or experiment changes that reuse the model.

## Find your way around

- **Instructions (amber):** follow the steps. Blue-outlined buttons fill a question; press **Send** when ready. Green-outlined buttons change settings and start a fresh run; the active choice is filled.
- **Chat (blue):** send questions and compare replies. The header shows **Ready**. Failed loads offer **Try again** or CPU fallback for GPU failures.
- **Settings (green):** adjust the system prompt, reply length and temperature. **Restore preset** returns to the activity's settings.
- **Help (?):** open an explanation beside a control. Help works with the keyboard; Escape closes it.

See [Accessibility](Accessibility.md) for keyboard navigation, screen-reader markup, enlarged text, high-contrast mode and reduced-motion support, including verification limits.

## Compare runs and save notes

Change one variable at a time when comparing answers.

| Control | What it does |
|---|---|
| **Fresh run** | Clears model context and refills the draft or previous question. Keeps settings, reflection notes and earlier runs for export. |
| **Clear** | Asks before discarding the conversation, draft and export records. Reflection notes, settings and badges stay. |
| **Choose a new experiment / Done** | Both ask before losing work. Done stops any reply, clears the session, restores default chat settings and returns to Set up. Cancel preserves the chat. |
| **My notes / Download notes** | Records predictions and observations, then downloads them with conversation records for comparison. |

Conversations and notes live only in the current tab: download them before navigating away or reloading. Model selection and free-chat settings are remembered locally; activity presets do not overwrite saved free-chat settings. There are no student accounts or teacher dashboard. See [Privacy](Privacy.md) for storage and network details.

## Experiment badges

Each experiment earns **Explorer** after one completed reply, **Experimenter** after two, and **Investigator** after five. The badge appears in the chat header and on experiment cards. Replies accumulate across fresh runs and return visits in this browser's local storage.

Visits, failed or stopped replies, empty replies and automatic repair attempts do not earn extra progress. No conversation text is stored with counts; clearing site data removes badges. On shared devices, badges belong to the browser, not an individual student. See [Experiment badges](Classroom.md#experiment-badges) for qualifying replies and shared-device considerations.

## Draw with Turtle artist

In **13. Turtle artist**, replies include a drawing and editable Logo code. Change the code and press **Run code** to explore the result. The **?** beside **Turtle sandbox** explains supported commands and syntax.

The dialect follows Berkeley/UCBLogo-style turtle syntax using a pinned local copy of [jslogo](https://github.com/inexorabletash/jslogo). It supports movement and turns, `SETPENCOLOR`/`SETPC` (palette numbers, quoted names and RGB lists in the 0-99 range), `SETPENSIZE`, absolute positions/headings, `HOME`, `CLEAN`, `CS`, `ARC`, cursor visibility, arithmetic, variables, nested `REPEAT` with `REPCOUNT`, and required-input `TO ... END` procedures with `IF`/`IFELSE` and `STOP`/`OUTPUT`. Legacy `COLOR blue`, `WIDTH 2` and `CLEAR` remain accepted. This is not a full Logo environment: file/network access, interactive input, fills, screen modes and arbitrary JavaScript are not exposed.

Each reply executes in a fresh drawing environment, starting at the centre facing up with a blue pen. Positive Logo Y points up; the display adapter converts it to SVG coordinates. `HOME` draws a connecting line when the pen is down; `CLEAN` erases without moving; `CS` erases and returns home without drawing. Generated code retains procedures, comments and repeated lines. Incomplete or unsupported code reports an error instead of silently trimming it. Only the first Logo code block is used. One repair attempt receives the task, rejected program and validation error. Manual editor runs do not call the model.

Programs are restricted to 12,000 characters, 32 levels of list/expression nesting, eight required procedure inputs, 64 levels of procedure calls, repeat counts 0-360, 5,000 dispatched operations/segments, and a one-second execution budget checked at procedure dispatch. Coordinates are bounded to 5,000 steps; pen widths must be greater than zero and at most 12. Limits report errors instead of silently changing a drawing. The model preset uses a 192-token reply budget.

Small models can produce incorrect shapes or angles even when the code runs. Inspect the drawing and use the editor to improve it. The [Classroom guide](Classroom.md#turtle-artist-logo-dialect) has examples and public syntax references.