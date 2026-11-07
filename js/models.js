// Model catalog, self-hosting manifest, device-based recommendation and the saved setup (engine/tier/variant).

const CATALOG_URL = new URL('../config/catalog.json', import.meta.url);
export const MODELS_BASE = new URL('../models/', import.meta.url);

export const CATALOG = await (await fetch(CATALOG_URL, { cache: 'no-cache' })).json();

/** Loads the local model manifest and returns an empty manifest shape on failure.
 * @returns {Promise<object>} Self-hosted model manifest.
 */
async function loadManifest() {
  try {
    const res = await fetch(new URL('manifest.json', MODELS_BASE), { cache: 'no-cache' });
    if (res.ok) return await res.json();
  } catch {
    // Fall through to the empty manifest.
  }
  return { webllm: {}, gguf: {} };
}
export const MANIFEST = await loadManifest();

export const WEBLLM_VERSION = CATALOG.webllm.version;
export const WLLAMA_VERSION = CATALOG.wllama.version;
export const TIERS = Object.keys(CATALOG.tiers);
export const VARIANTS = ['f16', 'f32'];

// contextSize: tokens of conversation sent to the model; chat.js trims older messages to fit.
export const ENGINES = {
  webllm: { label: 'WebLLM', backend: 'WebGPU', contextSize: 4096 },
  wllama: { label: 'wllama', backend: 'CPU (WASM)', contextSize: 2048 },
};

/** Returns the context size allowed for an engine and model tier.
 * @param {{engine: string, tier: string, variant: string}} config Active setup.
 * @returns {number} Context window in tokens.
 */
export function modelContextSize(config) {
  const engineLimit = ENGINES[config.engine].contextSize;
  return Math.min(engineLimit, CATALOG.tiers[config.tier].contextSize ?? engineLimit);
}

/** Builds the system/user/assistant message list sent to an engine.
 * @param {{engine: string, tier: string, variant: string}} config Active setup.
 * @param {{systemPrompt: string, maxTokens: number, temperature: number}} settings Effective settings.
 * @param {Array<{role: string, content: string}>} history Conversation history.
 * @returns {Array<{role: string, content: string}>} Trimmed messages, including a repeated system prompt for weak prompt-following models.
 */
export function buildModelMessages(config, settings, history) {
  const systemPrompt = `${settings.systemPrompt}\nNever repeat the question.`;
  const estimateTokens = (text) => Math.ceil(text.length / 3) + 4;
  const budget = modelContextSize(config) - settings.maxTokens - 64;
  let used = estimateTokens(systemPrompt);
  const kept = [];
  for (let messageIndex = history.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const cost = estimateTokens(history[messageIndex].content);
    if (kept.length && used + cost > budget) break;
    used += cost;
    kept.unshift(history[messageIndex]);
  }
  while (kept.length && kept[0].role !== 'user') kept.shift();
  if (tierInfo(config.tier).familyInfo.weakSystemPrompt && kept.length) {
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = { ...last, content: `${systemPrompt}\n\n${last.content}` };
  }
  return [{ role: 'system', content: systemPrompt }, ...kept];
}

// Key name predates the Tiny Thinker name; changing it would discard setups saved in existing browsers.
const CONFIG_KEY = 'browserai.config';

/**
 * Returns the catalog entry for a tier, with its model family merged in as `familyInfo`.
 * @param {string} tier One of TIERS.
 */
export function tierInfo(tier) {
  const t = CATALOG.tiers[tier];
  return { ...t, familyInfo: CATALOG.families[t.family] };
}

/**
 * Spells out a tier's parameter count from its label, e.g. "SmolLM2 135M" -> "135 million".
 * @param {string} tier One of TIERS.
 * @returns {{words: string, count: number}} count is 0 if the label has no size.
 */
export function parameterCount(tier) {
  const label = CATALOG.tiers[tier].label;
  const [, amount, unit] = label.match(/([\d.]+)([MB])$/) || [];
  if (!amount) return { words: label, count: 0 };
  return { words: `${amount} ${unit === 'B' ? 'billion' : 'million'}`, count: Number(amount) * (unit === 'B' ? 1e9 : 1e6) };
}

/**
 * Picks the WebLLM build precision: half precision when the GPU supports shader-f16.
 * @param {object} caps Result of detectCapabilities().
 * @returns {'f16'|'f32'}
 */
export function webllmVariant(caps) {
  return caps?.webgpu?.f16 ? 'f16' : 'f32';
}

/**
 * Where the files for a setup come from: the self-hosted copy if the manifest lists it, else Hugging Face.
 * @param {{engine: string, tier: string, variant: string}} config
 * @returns {object} `local` plus the URLs or repository names the engine adapter needs.
 */
export function resolveSource(config) {
  const t = CATALOG.tiers[config.tier];
  if (config.engine === 'webllm') {
    const v = t.webllm[config.variant];
    const local = MANIFEST.webllm?.[v.id];
    return local
      ? { local: true, id: v.id, modelUrl: new URL(local.model, MODELS_BASE).href, libUrl: new URL(local.lib, MODELS_BASE).href }
      : { local: false, id: v.id };
  }
  const local = MANIFEST.gguf?.[t.gguf.file];
  return local
    ? { local: true, url: new URL(local.path, MODELS_BASE).href, file: t.gguf.file }
    : { local: false, repo: t.gguf.repo, file: t.gguf.file };
}

/**
 * Short human-readable description of a setup, for the device check and the chat header.
 * @returns {{label: string, detail: string, where: string}}
 */
export function describeModel(config) {
  const t = CATALOG.tiers[config.tier];
  const where = resolveSource(config).local ? 'self-hosted' : 'from Hugging Face';
  if (config.engine === 'webllm') {
    const v = t.webllm[config.variant];
    return { label: t.label, detail: `${v.quant}, ~${v.vramMB} MB GPU memory, ${where}`, where };
  }
  return { label: t.label, detail: `${t.gguf.quant}, ~${t.gguf.sizeMB} MB download, ${where}`, where };
}

/**
 * Counts self-hosted builds against all builds in the catalog (two WebLLM variants plus one GGUF per tier).
 * @returns {{present: number, total: number}}
 */
export function countLocalModels() {
  const total = TIERS.length * (VARIANTS.length + 1);
  const present = Object.keys(MANIFEST.webllm || {}).length + Object.keys(MANIFEST.gguf || {}).length;
  return { present, total };
}

/**
 * Explains why an engine/tier cannot run on this device.
 * @returns {string} A human-readable reason, or '' if it can run.
 */
export function incompatibility(engine, tier, caps) {
  if (!caps.wasm || !caps.wasmSimd) return 'WebAssembly SIMD is not supported';
  if (engine === 'webllm') {
    if (!caps.secureContext) return 'WebGPU requires HTTPS or localhost';
    if (!caps.webgpu.available) return caps.webgpu.error || 'WebGPU is not available';
  }
  const t = CATALOG.tiers[tier];
  const sizeMB = engine === 'webllm' ? t.webllm[webllmVariant(caps)].vramMB : t.gguf.sizeMB;
  if (caps.storageFreeMB !== null && caps.storageFreeMB < sizeMB) return `Not enough browser storage (${caps.storageFreeMB} MB free)`;
  return '';
}

/**
 * Recommends a starting model: WebGPU first, otherwise the CPU engine.
 * @returns {{engine: string, tier: string, variant: string}|null} null if no setup fits the checks.
 */
export function recommend(caps) {
  if (!caps.wasm || !caps.wasmSimd) return null;
  const memGB = caps.deviceMemoryGB ?? 2;
  const fits = (engine, tier) => {
    if (incompatibility(engine, tier, caps)) return false;
    const model = CATALOG.tiers[tier];
    const sizeMB = engine === 'webllm' ? model.webllm[webllmVariant(caps)].vramMB : model.gguf.sizeMB;
    return caps.storageFreeMB === null || caps.storageFreeMB >= sizeMB * 2 + 256;
  };

  if (fits('webllm', 'tiny')) {
    const gpuMemGB = caps.deviceMemoryGB ?? (
      !caps.mobile && caps.cores >= 8 && caps.webgpu.f16 && caps.webgpu.maxBufferMB >= 1024 ? 8 : 2
    );
    let candidates;
    if (gpuMemGB < 4) candidates = ['tiny'];
    else if (caps.mobile || gpuMemGB < 8 || !caps.webgpu.f16 || caps.storageFreeMB === null) candidates = ['small', 'tiny'];
    else candidates = ['medium', 'small', 'tiny'];
    const tier = candidates.find((t) => fits('webllm', t));
    return { engine: 'webllm', tier, variant: webllmVariant(caps) };
  }

  let candidates;
  if (memGB < 2 || caps.cores < 4) candidates = ['tiny'];
  else if (memGB < 8 || !caps.threads || caps.mobile || caps.storageFreeMB === null) candidates = ['small', 'tiny'];
  else candidates = ['medium', 'small', 'tiny'];
  const tier = candidates.find((t) => fits('wllama', t));
  return tier ? { engine: 'wllama', tier, variant: '' } : null;
}

/** Validates and normalizes raw setup data from URL or browser storage.
 * @param {object|null} raw Candidate setup.
 * @returns {{engine: string, tier: string, variant: string}|null} Valid setup or null.
 */
export function validateConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { engine, tier, variant } = raw;
  if (!Object.hasOwn(ENGINES, engine) || !TIERS.includes(tier)) return null;
  if (engine === 'webllm') {
    if (!VARIANTS.includes(variant)) return null;
    return { engine, tier, variant };
  }
  return { engine, tier, variant: '' };
}

/** Serializes a setup as URL query parameters.
 * @param {{engine: string, tier: string, variant: string}} config Active setup.
 * @returns {string} Query string without a leading `?`.
 */
export function configToQuery(config) {
  const p = new URLSearchParams({ engine: config.engine, tier: config.tier });
  if (config.variant) p.set('variant', config.variant);
  return p.toString();
}

/** Saves the selected setup for the next visit.
 * @param {{engine: string, tier: string, variant: string}} config Setup to store.
 */
export function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage may be disabled (private mode); the query string still carries the config.
  }
}

/** Reads the setup from the URL first, then browser storage.
 * @returns {{engine: string, tier: string, variant: string}|null} Valid setup or null.
 */
export function loadConfig() {
  const params = new URLSearchParams(location.search);
  const fromQuery = validateConfig(Object.fromEntries(params));
  if (fromQuery) return fromQuery;
  try {
    return validateConfig(JSON.parse(localStorage.getItem(CONFIG_KEY)));
  } catch {
    return null;
  }
}
