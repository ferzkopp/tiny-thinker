// CPU engine adapter around wllama (llama.cpp compiled to WebAssembly). Same interface as WebLLMEngine.
import { WLLAMA_VERSION } from '../models.js?v=1.2';

const BASE = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${WLLAMA_VERSION}/esm`;
const PATHS = { default: `${BASE}/wasm/wllama.wasm` };

export class WllamaEngine {
  constructor() {
    this.wllama = null;
    this.abort = null;
  }

  /**
   * Downloads (or reads from cache) a GGUF model and prepares it for CPU inference.
   * @param {object} source From resolveSource(): a local URL, or a Hugging Face repository and file.
   * @param {(p: {progress: number, text: string}) => void} onProgress Download progress, 0 to 1.
   * @param {{contextSize: number}} options Context window in tokens.
   * @returns {Promise<{detail: string}>} Thread count, shown in the header.
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

  /**
   * Streams a reply.
   * @param {{role: string, content: string}[]} messages System prompt followed by the conversation.
   * @param {{maxTokens: number, temperature: number}} settings
   * @param {(delta: string) => void} onToken Called for each streamed piece of text.
   * @returns {Promise<{text: string, finishReason: string|null}>} finishReason is 'stop', 'length' or 'abort'.
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

  /** Stops the reply being generated; chat() then resolves with finishReason 'abort'. */
  interrupt() {
    this.abort?.abort();
  }

  /** Frees the model's memory. */
  async unload() {
    await this.wllama?.exit();
    this.wllama = null;
  }
}
