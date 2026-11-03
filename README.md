<p align="center"><img src="icon.svg" width="112" height="112" alt="Tiny Thinker icon: a small yellow robot with a thought bubble"></p>

# Tiny Thinker: Classroom LLM Playground

> [!TIP]
> **Try it live:** [Open Tiny Thinker](https://www.ferzkopp.net/tiny-thinker/) in your browser. No installation or account required.

Learn AI by playing with it. Small, open models run right in the browser, with no accounts or inference server. Questions and replies are processed on-device.

Created by Andreas Schiffler. Source: https://github.com/ferzkopp/tiny-thinker (MIT License).

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Built with AI assistance: GPT 6.1 Sol, Claude 5.5, Gemini 4 Argon](https://img.shields.io/badge/built%20with%20AI-GPT%206.1%20Sol%20%7C%20Claude%205.5%20%7C%20Gemini%204%20Argon-8a2be2)

A static HTML/JavaScript playground with no build step or application backend. A static web server is still required. Engine libraries and model assets are downloaded over the network; this is not a fully offline distribution.

## In action

![Horizontal three-panel overview of Tiny Thinker's new design: 1. Intro (device check and model recommendation), 2. Experiments (all 13 classroom activities and free chat), and 3. Chat (Turtle artist conversation with a gold five-point star, editable Logo code, instructions and settings).](docs/images/turtle-artist.png)

**Three-step workflow (`Set up` -> `Choose an experiment` -> `Chat and learn`):** check the device and pick a model, choose one of the thirteen classroom experiments, then explore in the chat — shown here with **13. Turtle artist** running Qwen2.5 1.5B in the browser through the CPU engine.

## After cloning

Requirements: Python 3.8+ for the helper scripts, a modern browser with WebAssembly SIMD, internet access for downloads, and about 5.5 GB of free disk space for the classroom model set. No Python packages are needed. WebGPU is optional; the CPU engine is the fallback.

From the cloned repository folder:

```powershell
python download_models.py --profile classroom
python download_models.py --profile classroom --check
python serve.py --isolate
```

Open http://localhost:8000. Opening HTML directly with `file://` does not work. Use `--port 8001` if the default port is busy.

The classroom profile prepares all twelve builds: SmolLM2 135M and 360M (English) and Qwen2.5 0.5B and 1.5B (multilingual), each with a CPU GGUF build and f16/f32 WebGPU builds. The download totals about **5.3 GB** (SmolLM2 about 1.36 GB, Qwen2.5 about 3.97 GB). Each student's browser downloads only the model it uses, not the entire set.

To prepare without downloading every model, you can also serve a fresh clone immediately. Missing model builds load from Hugging Face when selected.

## Classroom experiments

The experiment picker includes thirteen original, short activities, numbered so a teacher can say "open experiment 4":

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

See [CLASSROOM.md](CLASSROOM.md) for a sample lesson, mixed-age adaptations, safeguards and research references.

## Using the playground

### Choose an activity

Tiny Thinker guides you through three steps, shown as a step bar at the top of every page:

1. **Set up** (`index.html`): checks the device, explains in plain words why each check matters and recommends an engine and model. **Change** picks another one.
2. **Choose an experiment** (`experiments.html`): one card per numbered experiment, with its topic, time and question. **Open free chat** skips the instructions.
3. **Chat** (`chat.html`): runs the experiment. The step bar links back to the experiment list or the setup at any time; if there is work to lose, it asks first.

While the model loads, a compact window shows progress, short explanations of loading time and megabytes, and experiment and model summaries. The notes explain caching and the difference between stored files and working memory. Successful loads stay visible for at least four seconds, including cached models; errors appear immediately. Moving the pointer inside the window, clicking or tapping, scrolling, or pressing a key other than Escape keeps it open until **Start chatting** is pressed. Automatic keyboard focus alone does not count as an interaction.

On a first visit, six short tips explain the yellow instruction panels, then point at the next thing to click: continue from setup, pick an experiment, choose a question, press Send, and go back to try another experiment. **Skip tips** ends them early. A cookie remembers how far you got, so they do not return on later visits, and the setup page only counts down to the next step on later visits.

Inside the chat, the yellow **Choose a new experiment** action opens the picker without leaving the loaded chat page. If work could be lost, an inline, non-modal confirmation offers **Keep chatting** or **Leave experiment**. The chat stays usable; confirming stops any active reply and clears the conversation, draft and notes. Opening another experiment starts a fresh conversation with its preset, keeping the model loaded in memory. Switching to free chat also reuses the loaded model. Changing the model setup or reloading the page still initializes the engine again. Reloading or closing the tab can still trigger the browser's own warning about unsaved work.

Each experiment earns an **Explorer** badge after one completed chat reply, **Experimenter** after two, and **Investigator** after five. The current level appears immediately in the chat header and on experiment cards. Completed replies accumulate across fresh runs and return visits in this browser's local storage. Visits alone, failed or stopped replies, empty replies, and automatic repair attempts do not earn extra progress. No conversation text is stored with badge progress; clearing site data removes the badges. See the [Classroom Guide](CLASSROOM.md#experiment-badges) for the full level logic and shared-device considerations.

Share an activity using a link such as [Shakespeare remix](https://www.ferzkopp.net/tiny-thinker/index.html?experiment=shakespeare) or [Turtle artist](https://www.ferzkopp.net/tiny-thinker/index.html?experiment=turtle). The device check skips the experiment list and carries the activity through to chat; links contain no conversation text.

### Find your way around

- **Instructions (amber, left):** follow the steps. Blue-outlined buttons fill in a question; press **Send** when ready. Green-outlined buttons change a setting and start a fresh run; the active choice is filled.
- **Chat (blue):** send questions and compare replies. The header shows when the model is **Ready**. If loading fails, use **Try again** or the CPU fallback offered for GPU failures.
- **Settings (green, bottom):** adjust the system prompt, reply length and temperature. **Restore preset** returns to the activity's settings.
- **Help (?):** open an explanation beside a control. Help works with the keyboard; press Escape to close it.

### Compare runs and save notes

Change one variable at a time when comparing answers.

| Control | What it does |
|---|---|
| **Fresh run** | Clears model context and refills your draft or previous question. Keeps settings, reflection notes and earlier runs for export. |
| **Clear** | Uses an inline, non-modal confirmation before discarding the conversation, draft and export records. Reflection notes, system prompt, settings and earned badges stay. |
| **Choose a new experiment / Done** | These are the two workflow exits from chat. Both ask for confirmation when there is work to lose. Done (step 4) stops any reply, clears the session, restores default chat settings and returns to Set up; cancel preserves the current chat. |
| **My notes / Download notes** | Records your predictions and observations, then downloads them with conversation records for comparison. |

Conversations and notes live only in the current tab: download them before navigating away or reloading. Model selection and free-chat settings are remembered locally; activity presets do not overwrite saved free-chat settings. There are no student accounts or teacher dashboard.

### Draw with Turtle artist

In **13. Turtle artist**, replies include a drawing and editable Logo code. Change the code and press **Run code** to explore the result. The **?** beside **Turtle sandbox** explains the supported commands and syntax.

The dialect follows Berkeley/UCBLogo-style turtle syntax using a pinned local copy of [jslogo](https://github.com/inexorabletash/jslogo). It supports movement and turns, `SETPENCOLOR`/`SETPC` (palette numbers, quoted names and RGB lists in the 0-99 range), `SETPENSIZE`, absolute positions/headings, `HOME`, `CLEAN`, `CS`, `ARC`, cursor visibility, arithmetic, variables, nested `REPEAT` with `REPCOUNT`, and required-input `TO ... END` procedures with `IF`/`IFELSE` and `STOP`/`OUTPUT`. Legacy `COLOR blue`, `WIDTH 2` and `CLEAR` remain accepted. It is not a full Logo environment: file/network access, interactive input, fills, screen modes and arbitrary JavaScript are not exposed.

Each reply executes in a fresh drawing environment, starting at the centre facing up with a blue pen. Positive Logo Y points up; the display adapter converts that to SVG coordinates. `HOME` draws a connecting line when the pen is down; `CLEAN` erases without moving, and `CS` erases and returns home without drawing. Generated code blocks retain procedures, comments and repeated lines; incomplete or unsupported code reports an error rather than being silently trimmed. Only the first Logo code block is used, not multiple alternative examples. One repair attempt receives the task, rejected program and validation error. Manual editor runs do not call the model.

Programs are restricted to 12,000 characters, 32 levels of list/expression nesting, eight required procedure inputs, 64 levels of procedure calls, repeat counts 0-360, 5,000 dispatched operations/segments, and a one-second execution budget checked at procedure dispatch. Coordinates are bounded to 5,000 steps; pen widths must be greater than zero and at most 12. Limits report errors rather than silently changing the requested repeat or drawing size. The model preset uses a 192-token reply budget.

Small models can produce incorrect shapes or angles even when the code runs. Check the drawing yourself and use the editor to improve it.

## Device and model selection

- `index.html` checks what the device supports (WebGPU, WASM SIMD, threads, memory, storage). It recommends an engine and model, then continues to the experiment list (on later visits, automatically after 5 seconds). Click **Change** to choose a different setup.
- `experiments.html` lists the experiments and opens the chat with the one you pick.
- `chat.html` loads the chosen engine and streams replies.

| Tier | Model (Apache 2.0) | WebLLM 0.2.87 (WebGPU) | wllama 3.8.1 (CPU / WASM) |
|---|---|---|---|
| tiny | SmolLM2 135M | q0f16 / q0f32 | GGUF Q4_K_M |
| small | SmolLM2 360M | q4f16_1 / q4f32_1 | GGUF Q4_K_M |
| medium | Qwen2.5 0.5B | q4f16_1 / q4f32_1 | GGUF Q4_K_M |
| quality | Qwen2.5 1.5B | q4f16_1 / q4f32_1 | GGUF Q4_K_M |

WebLLM uses the f16 build when the GPU supports `shader-f16`, otherwise the f32 build. The model list lives in `catalog.json`. JavaScript libraries load from jsDelivr. Models are served from `models/` when self-hosted, otherwise from Hugging Face. Browsers can cache downloads but can also evict them.

All four tiers are part of the classroom profile, so whichever tier the hardware recommender picks is served from your site. On weaker devices, choose tiny or small on the setup screen for faster replies; the quality tier needs about 1.6-1.9 GB of GPU memory or a 1.1 GB CPU download per student. A direct CPU starting link is `chat.html?engine=wllama&tier=tiny&experiment=shakespeare`.

## Browser Notes

WebGPU availability depends on the browser version, operating system, hardware and drivers. A browser can support WebGPU but still report no usable adapter. When that happens, Tiny Thinker uses the CPU engine instead; replies may be slower. The CPU engine requires WebAssembly SIMD.

### Microsoft Edge

If the device check reports **No WebGPU adapter (GPU blocklisted or disabled)**, Edge could not provide a usable GPU adapter. Falling back to the CPU engine is expected; the playground still works, but replies may be slower.

1. Open `edge://settings/system` and enable **Use graphics acceleration when available**, then restart Edge.
2. Reopen Tiny Thinker to run the device check again.
3. If WebGPU is still unavailable, open `edge://gpu` and check **WebGPU** and **Problems Detected**. Updating Edge and your graphics drivers may help.

Device hardware, browser policies, driver restrictions, Remote Desktop or virtual machines can limit GPU access. On managed classroom devices, ask your administrator before changing settings. The CPU engine remains an option; there is no need to force experimental GPU flags.

### Google Chrome

1. Open `chrome://settings/system` and enable **Use graphics acceleration when available**, then relaunch Chrome.
2. Reopen Tiny Thinker to repeat the device check.
3. If no adapter is available, check **WebGPU** and **Problems Detected** at `chrome://gpu`. Update Chrome and your graphics drivers if needed, or use the CPU engine.

Other Chromium-based browsers, such as Brave and Opera, have similar graphics acceleration settings, but policies and GPU restrictions can differ.

### Safari

- Update Safari and your operating system. On iPhone and iPad, Safari updates come with iOS or iPadOS updates.
- WebGPU availability depends on your Safari and OS versions and device hardware. If Tiny Thinker cannot get an adapter, use the CPU engine; no experimental feature changes are required.
- On memory-limited devices, choose **tiny** or **small** on the setup screen. From chat, use **Done** to reset and return there. If loading fails or the tab reloads, try a smaller model and close other tabs.

### Mozilla Firefox

- Update Firefox. WebGPU availability varies by Firefox version, operating system and hardware; CPU fallback can be expected on unsupported configurations.
- Open `about:support` and review **Graphics** for acceleration and driver information. If available, check **Use hardware acceleration when available** under **Settings > General > Performance**; you may need to uncheck **Use recommended performance settings** to see it. Restart Firefox after changing it.
- Hardware acceleration alone does not guarantee WebGPU support. Use the CPU engine if the device check still finds no adapter; avoid forcing experimental preferences in `about:config`.

## Languages

Language support depends on the model, not the app:

| Tier | Model | Languages |
|---|---|---|
| tiny, small | SmolLM2 135M / 360M | Mainly English. Spanish replies are often broken or switch back to English ([model card](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct), Limitations). |
| medium, quality | Qwen2.5 0.5B / 1.5B | 29+ languages, including Spanish, French, German, Portuguese, Arabic, Chinese and Japanese ([model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)). Quality improves with size. |

For a Spanish-speaking class:

- Choose **medium** (or **quality** on strong devices) on the setup screen, or link directly: `chat.html?engine=wllama&tier=medium`.
- Both Qwen2.5 tiers are included in the classroom profile, so they are served from your site.
- The mode instructions, system prompts and starter questions are in English. An English system prompt pulls replies toward English, so add a line such as *"Responde siempre en español."* to the system prompt.
- Medium needs about 1 GB of GPU memory, or about 3 GB of RAM on the CPU engine.

The **Language explorer** mode turns this limitation into an experiment: compare English and Spanish answers, tell the model which language to use, then repeat with a larger model.

## Self-hosting the models

```powershell
python download_models.py --profile classroom                 # all twelve builds, pinned model revisions (~5.3 GB)
python download_models.py --profile classroom --check         # offline readiness check, no changes
python download_models.py                                     # all builds, latest upstream revisions
python download_models.py --tiers tiny small --variants f16   # a subset
python download_models.py --manifest-only                     # rebuild manifest after copying/deleting folders
```

Do not combine `--profile` with explicit tier/engine/variant filters. Without `--profile`, the downloader uses the latest upstream revisions instead of the pinned ones.

`model-downloads.json` records the classroom model revisions (SmolLM2 from the original attribution records, Qwen2.5 pinned on 2026-10-30), GGUF sizes and SHA-256 fingerprints of the compiled libraries. Model URLs use pinned revisions. Library downloads still use the catalog URL, but reject content that does not match the recorded fingerprint, rather than silently accepting an upstream change. Legal notices are retrieved from upstream and are not byte-for-byte locked.

Completed files are reused when their recorded revision and expected size agree. Interrupted builds can reuse files completed by this downloader; an interrupted individual file restarts rather than resuming byte ranges. `.part`, `.revision`, `.inventory.json` and `.complete` are local preparation metadata. Missing files, shard-size mismatches or library hash mismatches fail the check. It is a deployment readiness check, not a cryptographic audit of every model weight.

This creates the following layout:

```
models/
  manifest.json                         # read by the app: which builds are self-hosted
  webllm/<model-id>/resolve/main/...    # MLC weights (WebLLM needs the resolve/main/ segment)
  webllm/<model-id>/LICENSE, ATTRIBUTION.txt
  webllm/libs/*.wasm, ATTRIBUTION.txt   # compiled WebGPU model libraries
  gguf/<name>/<name>.gguf, LICENSE, ATTRIBUTION.txt
```

- Each model folder carries its own license copy, either the upstream `LICENSE` or the Apache 2.0 text. `ATTRIBUTION.txt` records the original model, the copyright holder, the exact source revision and how the files were converted. `licenses.html` lists all of this and links to the local files.
- Builds missing from `manifest.json` fall back to Hugging Face. The badge on the chat page shows which source is used.
- Weights add up to several GB. Git ignores generated model files, while model `LICENSE`, `NOTICE` and `ATTRIBUTION.txt` remain eligible for version control. The generated manifest is intentionally not committed: otherwise a fresh clone would advertise files it does not contain.
- **Git ignore rules do not stop OneDrive sync.** To prepare outside a synced workspace, use `python download_models.py --profile classroom --dest D:\tiny-thinker-models`, then check with the same `--dest` and `--check`. Copy that complete folder to the server as `models/`, next to `index.html`. Local preview looks for `./models`; `--dest` does not change the app's model URL.
- On the server, serve `.gguf`, `.bin` and `.wasm` with long cache lifetimes. Compression only helps for `.json`.

## Run locally

```powershell
python serve.py             # http://localhost:8000
python serve.py --isolate   # adds COOP/COEP -> multithreaded wllama
```

Opening the files directly (`file://`) does not work.

## Host on your web server

After preparing and checking the models, upload these paths together, preserving their relative layout:

- The root HTML, JavaScript and CSS files, `icon.svg`, `catalog.json`, `LICENSE` and `robots.txt`.
- The server config for your host: `web.config` (IIS) or `.htaccess` (Apache). Uploading both is harmless; each server ignores the other's file.
- The `engines/` directory.
- The complete generated `models/` directory, including `manifest.json`, model assets, licenses and attribution. Exclude unfinished `.part` files. The hidden preparation metadata can be kept for later validation; it is not used by browser inference.

Do not upload `.git/`, local environments, `node_modules/`, tests or test screenshots. A Git checkout or `git archive` alone does **not** contain the ignored model payloads: run the downloader before deployment or upload the prepared model folder separately. No server-side Python is required for the deployed site. The same layout works in a subdirectory, such as `/playground/`.

### Clean up before uploading

Running the downloader or the [tests](#development-checks) creates local folders that do not belong on the server: `__pycache__/` (in the root and in `tests/`), `test-results/` (browser test screenshots and notes) and, if you installed Playwright, `node_modules/`. An interrupted download can also leave `*.part` files in `models/`. All of these are git-ignored, but upload tools copy them anyway. Remove them first:

```powershell
# Windows PowerShell, from the repository folder
Remove-Item -Recurse -Force __pycache__, tests\__pycache__, test-results, node_modules -ErrorAction SilentlyContinue
Get-ChildItem models -Recurse -Filter *.part | Remove-Item
python download_models.py --profile classroom --check
```

```bash
# macOS / Linux
rm -rf __pycache__ tests/__pycache__ test-results node_modules
find models -name '*.part' -delete
python3 download_models.py --profile classroom --check
```

The final check confirms the models are still complete. Then upload only the paths listed above; the `tests/` folder itself stays local.

Requirements:

1. **HTTPS.** WebGPU and the storage APIs only work in a secure context. `localhost` also counts as secure.
2. **Correct MIME types:** `.js`/`.mjs` -> `text/javascript`, `.wasm` -> `application/wasm`, `.json` -> `application/json`. Ensure the host permits large `.gguf` and `.bin` downloads.
3. **Optional:** cross-origin isolation, for faster CPU inference. Add these two headers:

   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```

   Without them everything still works, but wllama runs single-threaded. jsDelivr, Hugging Face and raw.githubusercontent.com all send CORS headers, so they load fine under `require-corp`. After you enable the headers, open the check page and make sure "Multithreaded WebAssembly" shows ✓.

The repository includes ready-made config files for IIS and Apache that set all of the above: isolation headers, MIME types (including `.wasm` and `.gguf`) and a 30-day browser cache for model files. They apply to the folder they are in, so the site also works in a subdirectory.

The header displays the current release version. Local JavaScript entry points, imports and the GPU worker use a matching version query parameter, as does the stylesheet, so returning browsers request new asset URLs. For a new release, update that token throughout the HTML, JavaScript and browser test, update all four header labels, and update the release assertion in `tests/experiments.test.js`. Deploy the changed files together. The IIS and Apache configs require revalidation of app assets and HTML without disabling model caching. Previously cached HTML can still need a reload or cache expiry before these changes take effect; an already-open tab is not updated automatically.

### IIS: [web.config](web.config)

Upload it with the site; no changes needed. It removes and re-adds each MIME type, so it does not clash with types IIS already defines. If the site lives in a subfolder of an existing IIS application, it is merged with the parent configuration.

### Apache: [.htaccess](.htaccess)

Upload it with the site. It needs `mod_headers` and `mod_mime` (both standard) and `AllowOverride FileInfo` or `All` for the folder; otherwise Apache ignores the file. Some upload tools hide dotfiles, so check it arrived.

### nginx

nginx does not read config from the site folder. Add this to the server configuration, adjusting the path:

```nginx
location /tiny-thinker/ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cache-Control "no-cache" always;
    # A types block replaces nginx's default list here, so it must name every file type the site uses.
    types { text/html html; text/css css; text/javascript js mjs; application/json json; application/wasm wasm; application/octet-stream gguf bin; image/svg+xml svg; text/plain txt; text/markdown md; }
}
location ~* ^/tiny-thinker/models/.*\.(gguf|bin|wasm)$ {
    add_header Cross-Origin-Opener-Policy "same-origin" always;
    add_header Cross-Origin-Embedder-Policy "require-corp" always;
    add_header Cache-Control "public, max-age=2592000" always;
}
```

## Notes

- Manual setup: `index.html?manual=1`. **Done** resets the chat and returns here; setup then leads to choosing an experiment. Setting the chat URL directly also works, e.g. `chat.html?engine=wllama&tier=tiny`.
- To show the first-run tips again during development, use the `resetCookies=1` URL parameter described under Development checks below.
- If WebLLM fails to load or loses the GPU, the chat offers a one-click switch to the CPU engine.
- To free browser storage, use the browser's own site settings (clear site data for this site). Models are downloaded again on the next visit.
- To upgrade a library, change the versions in `catalog.json` and in `engines/webllm-worker.js`. Then check that the model IDs and `libBase` still match WebLLM's `prebuiltAppConfig`, and rerun `download_models.py`.

## Search engines

The pages carry a description, author, license and Open Graph tags for link previews; `index.html` also has schema.org `WebApplication` data. The experiment and chat pages are marked `noindex` because without a saved setup they only redirect to the device check. [robots.txt](robots.txt) keeps crawlers out of `models/` (gigabytes of weights) and `tests/`. Crawlers only read it at the site root, so if the site lives in a subfolder, copy its rules into the root `robots.txt` with the folder prefix.

## Acknowledgements

This project was developed with AI assistance: OpenAI GPT 6.1 Sol, Anthropic Claude 5.5 and Google Gemini 4 Argon were used for research, design, code, tests and documentation, reviewed and directed by the author. The models running in the app (SmolLM2, Qwen2.5) and the engines (WebLLM, wllama) are separate open-source projects; see [licenses.html](licenses.html).

## Privacy and classroom limits

The app does not intentionally send prompts or replies to an inference service. Conversations and reflection notes are not saved to localStorage; settings and device/model choices are. One first-party cookie, `tinythinker_tour_v2`, stores only a number (how many first-run tips were seen) for a year; it is not used for tracking. An older `tinythinker_tour` cookie, if present, is read to preserve earlier tour progress. Static hosts and third-party asset hosts can see normal requests, including IP addresses. Dependencies downloaded from CDNs execute in the browser, so choose and review those dependencies accordingly.

Self-hosting the weights does not self-host the engine libraries, remove all external requests, or guarantee an offline reload. No service worker is included. Small open models can invent facts, ignore instructions, repeat stereotypes or produce inappropriate text. Prompts are not safety filters. Use teacher supervision and your school's policies, particularly for younger students, and keep personal information out of prompts and notes.

## Development checks

For development only, append `?resetCookies=1` to the setup, experiment picker or chat URL to restart hints and clear all experiment badges, for example `index.html?resetCookies=1` or `chat.html?engine=wllama&tier=tiny&resetCookies=1`. This clears Tiny Thinker's current `tinythinker_tour_v2` and legacy `tinythinker_tour` cookies at the site-folder and root paths, plus the `tinythinker.experiment-progress` local-storage entry, before the page initializes hints and badges. Other cookies, saved settings and cached models are untouched. The parameter is removed from the address bar after use, preserving other parameters and the fragment, so reloading does not reset progress again. It is not shown as a student-facing control. Browser storage restrictions can prevent badge data from being removed.

### Implementation notes

- **Activity catalog:** [experiments.js](experiments.js) defines the modes, including the `concept` tag shown on the experiment cards. Their menu numbers follow catalog order, so adding or reordering activities renumbers them. Unknown activity IDs in links fall back to Free chat.
- **Page flow and tips:** [check.js](check.js), [picker.js](picker.js) and [chat.js](chat.js) drive the three steps. [tour.js](tour.js) shows the first-run tips and keeps their progress in the `tinythinker_tour_v2` cookie (0-6, scoped to the site folder). [loading.js](loading.js) builds the loading window's progress, educational notes, and short experiment and model summaries from [catalog.json](catalog.json).
- **Small-model instructions:** tiny and small (SmolLM2) often ignore system prompts. With `weakSystemPrompt` enabled in [catalog.json](catalog.json), the app also repeats those instructions before the newest question; the displayed question is unchanged. In a limited Shakespeare comparison, in-style replies rose from 0/6 to 4/6 on tiny and from 2/6 to 6/6 on small.
- **Turtle sandbox:** [turtle.js](turtle.js) adapts the locally vendored jslogo parser/interpreter to bounded SVG drawing. Its primitive allowlist excludes host access and unrestricted workspace operations. See [Draw with Turtle artist](#draw-with-turtle-artist) for syntax and limits.
- **Turtle evaluation:** deterministic tests cover standard syntax, procedures, arithmetic, coordinate conventions, drawing state, extraction and resource limits. Browser checks cover model repair feedback and editable rendering. Passing syntax and drawing tests does not establish that a model followed the requested shape or chose correct angles.

### Run the checks

No Node packages are required to run the app. For the standard-library tests, use Python 3.8+ and a recent Node.js with built-in ES-module detection (Node 22.7+):

```powershell
python -m unittest discover -s tests -p test_download_models.py
node --test tests/experiments.test.js
python download_models.py --profile classroom --check
```

Optional UI checks use Playwright and a Chromium install. If you do not already have Playwright, install it locally for testing only:

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
python serve.py --isolate --port 8765
```

In a second terminal:

```powershell
node tests/browser-smoke.mjs
node tests/browser-smoke.mjs --real-cpu
node tests/browser-smoke.mjs --real-gpu
```

The smoke test normally substitutes a delayed fake engine to test presets, popups, late replies after reset, exports, routing between setup, experiment list and chat, the first-run tips, the loading window and mobile layout without model downloads. `--real-cpu` additionally loads the local tiny CPU model and generates a short reply, requiring CDN access. `--real-gpu` tries the GPU build and reports a skip if no adapter is available. Screenshots go to ignored `test-results/`. Set `PREVIEW_URL` for another preview address, or `PLAYWRIGHT_MODULE` to the absolute entry-module path of an existing Playwright installation.

The tests leave `__pycache__/` and `test-results/` folders behind; see [Clean up before uploading](#clean-up-before-uploading).
