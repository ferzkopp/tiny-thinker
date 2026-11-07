// GPU engine adapter around WebLLM (WebGPU). Same interface as WllamaEngine: load, chat, interrupt, unload.
import { WEBLLM_VERSION } from '../models.js?v=1.3';

const WEBLLM_URL = `https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${WEBLLM_VERSION}/+esm`;

/** WebGPU model adapter backed by WebLLM and a dedicated worker. */
export class WebLLMEngine {
  constructor() {
    this.engine = null;
    this.worker = null;
  }


/** Loads a WebLLM model and reports download/initialization progress.
   * @param {object} source Resolved local or remote model source.
   * @param {(progress: {progress: number, text: string}) => void} onProgress Progress callback.
   * @returns {Promise<{detail: string}>} Extra status detail.
   */
  async load(source, onProgress) {
    const webllm = await import(WEBLLM_URL);
    const prebuilt = webllm.prebuiltAppConfig.model_list.find((m) => m.model_id === source.id);
    if (!prebuilt) {
      throw new Error(`Model ${source.id} is not in WebLLM ${WEBLLM_VERSION}'s prebuilt list`);
    }
    // Keep the prebuilt overrides (context size, required features); only swap the download locations.
    const record = source.local ? { ...prebuilt, model: source.modelUrl, model_lib: source.libUrl } : prebuilt;
    this.worker = new Worker(new URL('./webllm-worker.js?v=1.3', import.meta.url), { type: 'module' });
    this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, source.id, {
      appConfig: { ...webllm.prebuiltAppConfig, model_list: [record] },
      // WebLLM reports e.g. "Loading model from cache[3/12]: ..." without a space before the bracket.
      initProgressCallback: (report) => onProgress({ progress: report.progress, text: report.text.replace(/(\S)\[/g, '$1 [') }),
    });
    return { detail: '' };
  }

  /** Streams a WebLLM chat completion.
   * @param {Array<{role: string, content: string}>} messages Conversation messages.
   * @param {{maxTokens: number, temperature: number}} settings Generation settings.
   * @param {(delta: string) => void} onToken Streaming callback.
   * @returns {Promise<{text: string, finishReason: string|null}>} Final reply and stop reason.
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

  /** Interrupts generation currently in progress. */
  interrupt() {
    this.engine?.interruptGenerate();
  }

  /** Unloads the model and terminates the worker. */
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
