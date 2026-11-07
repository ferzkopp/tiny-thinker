# Models and Browsers

[Project overview and quickstart](../README.md) | [Preparing and hosting models](Hosting.md) | [Evaluation](Evaluation.md)

## Device and model selection

Setup checks WebGPU, WASM SIMD, threads, memory and storage, then recommends an engine and model. **Change** chooses a different setup. The picker lists activities, and chat loads the chosen engine and streams replies.

Automatic setup favors a reliable first load rather than the largest model. It never selects **quality** automatically; **Change** still offers it. When RAM is unreported, a desktop with at least 8 CPU threads, f16 WebGPU and a buffer limit of at least 1 GB can start with **medium** (Qwen2.5 0.5B). Other devices with unreported memory retain the 2 GB fallback. These GPU signals are a capability heuristic, not measured available RAM or GPU memory.

Unknown storage and f32 GPUs use smaller starting models. Automatic choices require twice the catalog size estimate plus 256 MB of reported free browser storage. GPU memory figures are a conservative storage-budget proxy, not measured download sizes. Browser estimates do not reveal all cache limits or available GPU memory, so loading can still fail.

| Tier | Model (Apache 2.0) | WebLLM 0.2.87 (WebGPU) | wllama 3.8.1 (CPU / WASM) |
|---|---|---|---|
| tiny | SmolLM2 135M | q0f16 / q0f32 | GGUF Q4_K_M |
| small | SmolLM2 360M | q4f16_1 / q4f32_1 | GGUF Q4_K_M |
| balanced | TinyLlama 1.1B Chat v1.0 | q4f16_1 / q4f32_1 | GGUF Q4_K_M |
| medium | Qwen2.5 0.5B | q4f16_1 / q4f32_1 | GGUF Q4_K_M |
| quality | Qwen2.5 1.5B | q4f16_1 / q4f32_1 | GGUF Q4_K_M |

WebLLM uses f16 when the GPU supports `shader-f16`, otherwise f32. The list lives in [catalog.json](../config/catalog.json). Libraries load from jsDelivr. Models load from `models/` when self-hosted, otherwise Hugging Face. Browsers can cache downloads but can also evict them.

The classroom download profile prepares all fifteen builds, totaling about **7.3 GB**: SmolLM2 about 1.36 GB, TinyLlama about 1.93 GB and Qwen2.5 about 3.97 GB. Each browser downloads only the model it uses. On weaker devices, choose tiny or small. Quality needs about 1.6-1.9 GB of GPU memory or a 1.1 GB CPU download per device. A direct CPU link is `chat.html?engine=wllama&tier=tiny&experiment=shakespeare`.

**Balanced** offers [TinyLlama 1.1B Chat v1.0](https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0) as a manually selected alternative family. GPU estimates are about **697 MB** for f16 and **840 MB** for f32; the CPU GGUF download is about **638 MiB** (669 MB). Both engines use a **2,048-token context**. More parameters do not guarantee better answers than Qwen2.5; its CPU download is larger than medium's. Select it directly with `chat.html?engine=webllm&tier=balanced&variant=f16` or `chat.html?engine=wllama&tier=balanced`.

## Languages

Language support depends on the model, not the app:

| Tier | Model | Languages |
|---|---|---|
| tiny, small | SmolLM2 135M / 360M | Mainly English. Spanish replies are often broken or switch to English ([model card](https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct), Limitations). |
| balanced | TinyLlama 1.1B Chat v1.0 | Mainly English ([model card](https://huggingface.co/TinyLlama/TinyLlama-1.1B-Chat-v1.0)). Use Qwen2.5 for multilingual classroom work. |
| medium, quality | Qwen2.5 0.5B / 1.5B | 29+ languages, including Spanish, French, German, Portuguese, Arabic, Chinese and Japanese ([model card](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct)). Quality improves with size. |

For a Spanish-speaking class:

- Choose **medium**, or **quality** on strong devices. A direct link is `chat.html?engine=wllama&tier=medium`.
- Both Qwen2.5 tiers are included in the classroom profile.
- Instructions, presets and starter questions are in English. Add *"Responde siempre en castellano."* to the system prompt to request Spanish replies.
- Medium needs about 1 GB of GPU memory or about 3 GB of RAM on the CPU engine.

**Language explorer** turns the limitation into an experiment: compare English and Spanish, request another language, then repeat with a larger model.

## Browser notes

WebGPU depends on browser version, operating system, hardware and drivers. A supported browser can still report no usable adapter. Tiny Thinker then uses the CPU engine; replies may be slower. CPU inference requires WebAssembly SIMD.

### Microsoft Edge

If setup reports **No WebGPU adapter (GPU blocklisted or disabled)**, CPU fallback is expected.

1. Open `edge://settings/system`, enable **Use graphics acceleration when available**, then restart Edge.
2. Reopen Tiny Thinker to repeat the device check.
3. If unavailable, inspect **WebGPU** and **Problems Detected** in `edge://gpu`. Updating Edge and graphics drivers may help.

Hardware, browser policies, driver restrictions, Remote Desktop and virtual machines can limit GPU access. On managed classroom devices, ask the administrator before changing settings. There is no need to force experimental GPU flags.

### Google Chrome

1. Open `chrome://settings/system`, enable **Use graphics acceleration when available**, then relaunch Chrome.
2. Reopen Tiny Thinker to repeat the device check.
3. If no adapter is available, inspect **WebGPU** and **Problems Detected** in `chrome://gpu`. Update Chrome and graphics drivers or use CPU inference.

Other Chromium-based browsers, such as Brave and Opera, have similar settings, but policies and GPU restrictions differ.

### Safari

- Update Safari and the operating system. On iPhone and iPad, Safari updates come with iOS or iPadOS.
- If the browser cannot get an adapter, use CPU inference; no experimental changes are required.
- On memory-limited devices, choose tiny or small. From chat, **Done** returns to setup. If loading fails or the tab reloads, try a smaller model and close other tabs.

### Mozilla Firefox

- Update Firefox. WebGPU availability varies by version, OS and hardware; CPU fallback can be expected.
- Inspect **Graphics** in `about:support`. If available, enable **Use hardware acceleration when available** under **Settings > General > Performance**; this may require unchecking **Use recommended performance settings**. Restart Firefox.
- Acceleration does not guarantee WebGPU support. Use CPU inference rather than forcing experimental preferences in `about:config`.

## Troubleshooting and storage

- Manual setup: `index.html?manual=1`. **Done** resets chat and returns there. Direct chat setup also works, such as `chat.html?engine=wllama&tier=tiny`.
- WebLLM load failures or GPU loss offer a one-click CPU fallback.
- **Debug info (optional)** collects browser/OS user agent, capabilities, storage quota and usage, engine versions, selected model and load error. **Download debug info** saves local JSON. It contains no system prompt, questions, replies or notes, and nothing is uploaded automatically. Review it before sharing: device details and errors can identify the environment.
- `QuotaExceededError` usually means a cache/storage limit, not necessarily exhausted GPU memory. Choose a smaller model or review site storage, private-browsing restrictions and managed-device policies. Both engines use browser storage; changing engines does not guarantee a quota fix.
- Clear site data through browser settings to free storage. This removes cached models, saved settings and badges; models download again on the next visit.

See [Privacy](Privacy.md) for what is stored and which network requests are made, and [Development](Development.md) for reset and library-maintenance tools.