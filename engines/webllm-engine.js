// GPU engine adapter around WebLLM (WebGPU). Same interface as WllamaEngine: load, chat, interrupt, unload.
import { WEBLLM_VERSION } from '../models.js';

const WEBLLM_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`;

export class WebLLMEngine {
  constructor() {
    this.engine = null;
    this.worker = null;
  }

  /**
   * Downloads (or reads from cache) and initializes a model in a Web Worker, so the page stays responsive.
   * @param {object} source From resolveSource(): the model ID and, when self-hosted, the local URLs.
   * @param {(p: {progress: number, text: string}) => void} onProgress Loading progress, 0 to 1.
   * @returns {Promise<{detail: string}>} Extra detail for the header; empty because the backend is already shown.
   */
  async load(source, onProgress) {
    const webllm = await import(WEBLLM_URL);
    const prebuilt = webllm.prebuiltAppConfig.model_list.find((m) => m.model_id === source.id);
    if (!prebuilt) {
      throw new Error(`Model ${source.id} is not in WebLLM ${WEBLLM_VERSION}'s prebuilt list`);
    }
    // Keep the prebuilt overrides (context size, required features); only swap the download locations.
    const record = source.local ? { ...prebuilt, model: source.modelUrl, model_lib: source.libUrl } : prebuilt;
    this.worker = new Worker(new URL('./webllm-worker.js', import.meta.url), { type: 'module' });
    this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, source.id, {
      appConfig: { ...webllm.prebuiltAppConfig, model_list: [record] },
      // WebLLM reports e.g. "Loading model from cache[3/12]: ..." without a space before the bracket.
      initProgressCallback: (report) => onProgress({ progress: report.progress, text: report.text.replace(/(\S)\[/g, '$1 [') }),
    });
    return { detail: '' };
  }

  /**
   * Streams a reply.
   * @param {{role: string, content: string}[]} messages System prompt followed by the conversation.
   * @param {{maxTokens: number, temperature: number}} settings
   * @param {(delta: string) => void} onToken Called for each streamed piece of text.
   * @returns {Promise<{text: string, finishReason: string|null}>} finishReason is 'stop', 'length' or 'abort'.
   */
  async chat(messages, { maxTokens, temperature }, onToken) {
    const chunks = await this.engine.chat.completions.create({
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature,
    });
    let text = '';
    let finishReason = null;
    for await (const chunk of chunks) {
      const choice = chunk.choices[0];
      const delta = choice?.delta?.content || '';
      if (delta) {
        text += delta;
        onToken(delta);
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    }
    return { text, finishReason };
  }

  /** Stops the reply being generated; chat() then resolves with the text so far. */
  interrupt() {
    this.engine?.interruptGenerate();
  }

  /** Frees GPU memory and stops the worker (used before switching to the CPU engine). */
  async unload() {
    try {
      await this.engine?.unload();
    } finally {
      this.worker?.terminate();
      this.engine = null;
      this.worker = null;
    }
  }
}
