// CPU engine adapter around wllama (llama.cpp compiled to WebAssembly). Same interface as WebLLMEngine.
import { WLLAMA_VERSION } from '../js/models.js?v=1.4';

const BASE = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm`;
const PATHS = { default: `${BASE}/wasm/wllama.wasm` };

/** CPU/WASM model adapter backed by wllama. */
export class WllamaEngine {
  constructor() {
    this.wllama = null;
    this.abort = null;
  }


/** Loads a GGUF model and reports download progress.
   * @param {object} source Resolved local or remote GGUF source.
   * @param {(progress: {progress: number, text: string}) => void} onProgress Progress callback.
   * @param {{contextSize: number}} options Context-window option.
   * @returns {Promise<{detail: string}>} Thread-status detail.
   */
  async load(source, onProgress, { contextSize }) {
    const { Wllama, LoggerWithoutDebug } = await import(`${BASE}/index.js`);
    this.wllama = new Wllama(PATHS, { logger: LoggerWithoutDebug, allowOffline: true });
    const params = {
      n_ctx: contextSize,
      // CPU path on purpose: this engine is the fallback for devices where WebGPU is missing or unreliable.
      n_gpu_layers: 0,
      progressCallback: ({ loaded, total }) => {
        const mb = (n) => (n / (1024 * 1024)).toFixed(0);
        onProgress({ progress: total ? loaded / total : 0, text: `Downloading ${source.file}: ${mb(loaded)} / ${mb(total)} MB` });
      },
    };
    if (source.local) {
      await this.wllama.loadModelFromUrl(source.url, params);
    } else {
      await this.wllama.loadModelFromHF({ repo: source.repo, file: source.file }, params);
    }
    const threads = this.wllama.getNumThreads();
    return { detail: this.wllama.isMultithread() ? `${threads} threads` : 'single thread' };
  }

  /** Streams a CPU/WASM chat completion.
   * @param {Array<{role: string, content: string}>} messages Conversation messages.
   * @param {{maxTokens: number, temperature: number}} settings Generation settings.
   * @param {(delta: string) => void} onToken Streaming callback.
   * @returns {Promise<{text: string, finishReason: string|null}>} Final reply and stop reason.
   */
  async chat(messages, { maxTokens, temperature }, onToken) {
    this.abort = new AbortController();
    const signal = this.abort.signal;
    let text = '';
    let finishReason = null;
    try {
      const stream = await this.wllama.createChatCompletion({
        messages,
        stream: true,
        max_tokens: maxTokens,
        temperature,
        abortSignal: signal,
      });
      for await (const chunk of stream) {
        const choice = chunk.choices?.[0];
        const delta = choice?.delta?.content || '';
        if (delta) {
          text += delta;
          onToken(delta);
        }
        if (choice?.finish_reason) finishReason = choice.finish_reason;
      }
    } catch (err) {
      if (!signal.aborted) throw err;
      finishReason = 'abort';
    } finally {
      this.abort = null;
    }
    return { text, finishReason };
  }

  /** Interrupts generation currently in progress. */
  interrupt() {
    this.abort?.abort();
  }

  /** Unloads the CPU/WASM model and releases its memory. */
  async unload() {
    await this.wllama?.exit();
    this.wllama = null;
  }
}
