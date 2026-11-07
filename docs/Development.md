# Development

[Project overview and quickstart](../README.md) | [Hosting](Hosting.md) | [Evaluation](Evaluation.md)

The app has no build step and needs no Node packages to run. Run the commands below from the repository root.

## Repository layout

| Folder | Contents |
|---|---|
| `html/` | Source pages for setup, the experiment picker, chat and licenses. |
| `js/` | Shared runtime modules and page controllers. |
| `css/` | Stylesheets. |
| `images/` | App icons and other visual assets. |
| `config/` | Runtime catalog, release manifest and pinned model-download configuration. |
| `tools/` | Local preview, model preparation, release stamping and deployment staging tools. |
| `web/` | Server configuration and crawler rules. |
| `engines/`, `vendor/` | Inference adapters/workers and the vendored Logo interpreter. |
| `models/` | Prepared model weights, libraries, licenses and the generated model manifest. |
| `docs/`, `tests/` | Topic guides and regression tests. |

Use the [preview tool](Hosting.md#run-locally) for the source checkout. It maps the pages in `html/` and files in `web/` to their existing root URLs. [Deployment](Deployment.md) copies those two folders' files to the upload root while retaining the other runtime folders, so the deployed site needs no new URL-rewrite rules. README, license and Git metadata remain at the repository root; generated deployment folders are local and ignored.

## Reset welcome, tips and badges

During development, append `resetCookies=1` to setup, picker or chat URLs, such as `index.html?resetCookies=1` or `chat.html?engine=wllama&tier=tiny&resetCookies=1`.

This clears `tinythinker_welcome`, `tinythinker_tour_v2` and legacy `tinythinker_tour` cookies at site-folder and root paths, plus the `tinythinker.experiment-progress` and `tinythinker.experiment-hints` local-storage entries, before initializing hints and badges. Other cookies, settings and cached models remain. The parameter is removed from the address bar, preserving other parameters and fragments, so reloads do not reset again. It is not a student-facing control; storage restrictions can prevent badge removal.

## Implementation notes

- **Activity catalog:** [experiments.js](../js/experiments.js) defines activities and the cards' `concept` tags. Menu numbers follow catalog order, so adding or reordering activities renumbers them. Unknown IDs fall back to free chat.
- **Workflow and tips:** [check.js](../js/check.js), [picker.js](../js/picker.js) and [chat.js](../js/chat.js) drive the three steps. [tour.js](../js/tour.js) stores first-run progress in `tinythinker_tour_v2` (0-6, site-folder scoped), then shows each activity's once-only setting tip. [loading.js](../js/loading.js) builds progress, educational notes and summaries from [catalog.json](../config/catalog.json).
- **Small-model instructions:** with `weakSystemPrompt` enabled in the catalog, SmolLM2 also receives instructions before its newest question; the displayed question stays unchanged. In a limited Shakespeare comparison, in-style replies rose from 0/6 to 4/6 on tiny and from 2/6 to 6/6 on small.
- **Turtle sandbox:** [turtle.js](../js/turtle.js) adapts locally vendored jslogo to bounded SVG drawing. The primitive allowlist excludes host access and unrestricted workspace operations. See [Turtle syntax and limits](Usage.md#draw-with-turtle-artist).
- **Turtle evaluation:** deterministic tests cover syntax, procedures, arithmetic, coordinates, drawing state, extraction and resource limits. Browser checks cover repair feedback and editable rendering. Passing these checks does not establish correct requested shapes or angles.

## Run the checks

Use Python 3.8+ and a recent Node.js with built-in ES-module detection (Node 22.7+) for standard-library tests:

```powershell
python -m unittest discover -s tests -p test_download_models.py
node tools/release.mjs --check
node --test tests/experiments.test.js
python tools/download_models.py --profile classroom --check
```

Optional browser checks use Playwright and Chromium. If not already installed, install these for testing only:

```powershell
npm install --no-save --package-lock=false playwright
npx playwright install chromium
python tools/serve.py --isolate --port 8765
```

In a second terminal:

```powershell
node tests/browser-smoke.mjs
node tests/browser-smoke.mjs --real-cpu
node tests/browser-smoke.mjs --real-gpu
```

The default smoke suite substitutes a delayed fake engine and covers presets, help dialogs, late replies after reset, exports, workflow routing, tips, loading and mobile layout without model downloads. Accessibility regressions cover skip links, focus, keyboard scrolling, reduced motion, enlarged navigation text and streaming live-region state.

`--real-cpu` additionally loads local tiny CPU weights and generates a short reply, requiring CDN access. `--real-gpu` tries GPU inference and skips if no adapter is available. Screenshots go to ignored `test-results/`. Set `PREVIEW_URL` for another address or `PLAYWRIGHT_MODULE` to an existing Playwright entry module's absolute path.

For real-model comparisons, run `node tests/prompt-grid.mjs --phase=baseline`, change presets, then run `node tests/prompt-grid.mjs --phase=candidate`. The runner uses Edge, WebGPU f16 by default and the same production message builder as chat. Reports are saved under ignored `test-results/`. [Evaluation](Evaluation.md) covers held-out cases, CPU and precision options, scores and limitations.

Tests leave `__pycache__/` and `test-results/` behind. Keep useful local records; the [deployment snapshot excludes these directories](Deployment.md#included-and-excluded-files).

## Release version

[version.json](../config/version.json) is the single source of truth. Use Node.js to set a release and synchronize static references:

```powershell
node tools/release.mjs 1.3.1
node tools/release.mjs --check
```

Use the next version for a future release. Alternatively, edit the manifest and run `node tools/release.mjs` without an argument. It stamps four header labels, stylesheet URLs, local JavaScript imports and entry points, the GPU worker URL and browser-test imports. `--check` reports stale references without writing. Tests read the manifest; model names, engine versions, weights and storage keys stay unchanged.

Commit and deploy stamped app files together with the manifest. Release preparation uses Node's standard library; serving still needs no build step or server-side code. The local [release.mjs](../tools/release.mjs) tool does not need uploading. Versioned asset URLs request new releases; IIS and Apache revalidate app assets and HTML without disabling model caching. Cached HTML may still need reload or expiry; already-open tabs do not update automatically.

Follow [Deployment](Deployment.md) for the upload workflow after preparing the release, including model readiness, dry runs, output locations, exclusions and verification.

## Upgrade engine libraries

Change library versions in [catalog.json](../config/catalog.json) and [engines/webllm-worker.js](../engines/webllm-worker.js), check model IDs and `libBase` against WebLLM's `prebuiltAppConfig`, then rerun the downloader and relevant tests. Classroom assets are pinned in [model-downloads.json](../config/model-downloads.json); see [Hosting](Hosting.md#self-hosting-the-models) for fingerprint checks.