// Model catalog, self-hosting manifest, device-based recommendation and the saved setup (engine/tier/variant).

const CATALOG_URL = new URL('./catalog.json', import.meta.url);
export const MODELS_BASE = new URL('./models/', import.meta.url);

export const CATALOG = await (await fetch(CATALOG_URL, { cache: 'no-cache' })).json();

/**
 * Loads models/manifest.json, written by download_models.py.
 * @returns {Promise<{webllm: object, gguf: object}>} Empty lists if absent, meaning "use Hugging Face".
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
 * Recommends the largest model the device should handle: WebGPU first, otherwise the CPU engine.
 * @returns {{engine: string, tier: string, variant: string}|null} null if WebAssembly SIMD is missing.
 */
export function recommend(caps) {
  if (!caps.wasm || !caps.wasmSimd) return null;
  const memGB = caps.deviceMemoryGB ?? (caps.mobile ? 4 : 8);
  const fits = (engine, tier) => !incompatibility(engine, tier, caps);

  if (fits('webllm', 'tiny')) {
    let candidates;
    if (caps.mobile || memGB < 4) candidates = ['small', 'tiny'];
    else if (memGB < 8) candidates = ['medium', 'small', 'tiny'];
    else candidates = ['quality', 'medium', 'small', 'tiny'];
    const tier = candidates.find((t) => fits('webllm', t));
    return { engine: 'webllm', tier, variant: webllmVariant(caps) };
  }

  let candidates;
  if (memGB < 2 || caps.cores < 4) candidates = ['tiny'];
  else if (memGB < 4 || !caps.threads) candidates = ['small', 'tiny'];
  else candidates = ['medium', 'small', 'tiny'];
  const tier = candidates.find((t) => fits('wllama', t)) ?? 'tiny';
  return { engine: 'wllama', tier, variant: '' };
}

/**
 * Accepts only known engines, tiers and variants (input may come from the URL or localStorage).
 * @returns {{engine: string, tier: string, variant: string}|null}
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

/**
 * Serializes a setup as URL query parameters, e.g. "engine=wllama&tier=tiny".
 * @returns {string}
 */
export function configToQuery(config) {
  const p = new URLSearchParams({ engine: config.engine, tier: config.tier });
  if (config.variant) p.set('variant', config.variant);
  return p.toString();
}

/**
 * Remembers the chosen setup for the next visit.
 */
export function saveConfig(config) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch {
    // Storage may be disabled (private mode); the query string still carries the config.
  }
}

/**
 * Reads the setup from the URL first, then from localStorage.
 * @returns {{engine: string, tier: string, variant: string}|null}
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
