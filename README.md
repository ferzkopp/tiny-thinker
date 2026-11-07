<p align="center"><img src="images/icon.svg" width="112" height="112" alt="Tiny Thinker icon: a small yellow robot with a thought bubble"></p>

# Tiny Thinker: Classroom LLM Playground

> [!TIP]
> **Try it live:** [Open Tiny Thinker](https://www.ferzkopp.net/tiny-thinker/) in your browser. No installation or account required.

Learn AI by playing with it. Small, open models run right in the browser, with no accounts or inference server. Questions and replies are processed on-device.

Created by Andreas Schiffler. Source: https://github.com/ferzkopp/tiny-thinker (MIT License).

![License: MIT](https://img.shields.io/badge/license-MIT-blue) ![Built with AI assistance: GPT 6.1 Sol, Claude 5.5, Gemini 4 Argon, MAI-Code-2-Flash](https://img.shields.io/badge/built%20with%20AI-GPT%206.1%20Sol%20%7C%20Claude%205.5%20%7C%20Gemini%204%20Argon%20%7C%20MAI-Code-2-Flash-8a2be2)

A static HTML/JavaScript playground with no build step or application backend. A static web server is still required. Engine libraries and model assets are downloaded over the network; this is not a fully offline distribution.

## In action

![Horizontal three-panel overview of Tiny Thinker v1.3: 1. Set up (device checks, explanations and model recommendation), 2. Choose an experiment (all 14 classroom activities and free chat), and 3. Chat and learn (Turtle artist conversation with a gold five-point star, editable Logo code, instructions and settings).](docs/images/turtle-artist.png)

**Three-step workflow (`Set up` -> `Choose an experiment` -> `Chat and learn`):** check the device and pick a model, choose one of the fourteen classroom experiments, then explore in the chat — shown here with **13. Turtle artist** running Qwen2.5 1.5B in the browser through the CPU engine.

## Quickstart

Requirements: Python 3.8+, a modern browser with WebAssembly SIMD, and internet access for libraries and uncached models. No Python packages, Node.js installation or build step are needed to run the app. WebGPU is optional; CPU inference is the fallback.

From the cloned repository folder:

```powershell
python tools/serve.py --isolate
```

Open http://localhost:8000, choose a setup, pick an experiment and start chatting. Use `--port 8001` if the default port is busy. The preview tool maps the organized source folders to the app's public URLs; opening HTML directly with `file://` does not work.

Missing model builds load from Hugging Face when selected. To prepare all models for classroom use before starting the server:

```powershell
python tools/download_models.py --profile classroom
python tools/download_models.py --profile classroom --check
```

Allow about 8 GB of free disk space for the roughly 7.3 GB classroom set. Each browser downloads only its selected model. See [Hosting](docs/Hosting.md) for smaller downloads, remote deployment and server configuration.

## Documentation

| Guide | Topics |
|---|---|
| [Using Tiny Thinker](docs/Usage.md) | All fourteen activities, controls, comparisons, notes, badges and Turtle artist. |
| [Classroom guide](docs/Classroom.md) | Lesson planning, mixed ages, inclusion, safeguards and activity background. |
| [Models and browsers](docs/Models.md) | Model choices, language support, hardware requirements and troubleshooting. |
| [Hosting](docs/Hosting.md) | Model preparation, local preview, caching and server configuration. |
| [Deployment](docs/Deployment.md) | Create a clean local upload folder, preview its contents, upload and verify the release. |
| [Accessibility](docs/Accessibility.md) | Keyboard and screen-reader support, enlarged text, high contrast, reduced motion and verification limits. |
| [Privacy](docs/Privacy.md) | On-device inference, network requests, browser storage and classroom limits. |
| [Development](docs/Development.md) | Implementation, test commands, development resets, releases and library updates. |
| [Evaluation](docs/Evaluation.md) | Real-model results, scoring, held-out checks and reproduction. |

Use fictional inputs and teacher supervision. Small models can produce wrong or inappropriate answers; prompts are not safety filters. Conversations and notes stay in the current tab unless downloaded. Model and library asset requests still use the network.

## License and acknowledgements

Tiny Thinker is [MIT licensed](LICENSE), created by Andreas Schiffler. AI assistance from OpenAI GPT 6.1 Sol, Anthropic Claude 5.5, Google Gemini 4 Argon and MAI-Code-2-Flash supported research, design, code, tests and documentation, reviewed and directed by the author.

The app's models (SmolLM2, TinyLlama, Qwen2.5), engines (WebLLM, wllama) and local Logo interpreter are separate open-source projects. See [model and software licenses](html/licenses.html).
