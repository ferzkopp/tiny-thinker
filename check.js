// Device check page: probes the browser, recommends an engine and model, then forwards to the chat.
import { detectCapabilities } from './capabilities.js';
import {
  ENGINES, TIERS, tierInfo, countLocalModels,
  recommend, incompatibility, webllmVariant, describeModel, configToQuery, saveConfig, loadConfig,
} from './models.js';
import { wireLicenseLinks } from './licenses.js';
import { withExperiment } from './experiments.js';
import { el } from './dom.js';

const COUNTDOWN_SECONDS = 5;
const $ = (id) => document.getElementById(id);

/**
 * Adds one row to the checklist.
 * @param {'ok'|'warn'|'fail'} status Controls the icon and colour.
 * @param {string} label What was checked.
 * @param {string} [detail] Explanation shown under the label.
 */
function addCheck(status, label, detail) {
  const icons = { ok: '✓', warn: '!', fail: '✗' };
  const spoken = { ok: 'OK: ', warn: 'Warning: ', fail: 'Failed: ' };
  const li = el('li', { className: status },
    el('span', { className: 'icon', textContent: icons[status], ariaHidden: 'true' }),
    el('span', {}, el('span', { className: 'visually-hidden', textContent: spoken[status] }), label));
  if (detail) li.append(el('span', { className: 'detail', textContent: detail }));
  $('checks').append(li);
}

/** Shows the result of every capability probe as a checklist. */
function renderChecks(caps) {
  addCheck(caps.secureContext ? 'ok' : 'warn', 'Secure context',
    caps.secureContext ? `${caps.protocol}//` : 'Not HTTPS or localhost: WebGPU and some storage features are disabled');

  const g = caps.webgpu;
  if (g.available) {
    const gpu = [g.vendor, g.architecture].filter(Boolean).join(' ') || 'GPU detected';
    addCheck('ok', 'WebGPU', `${gpu}; half-precision (shader-f16): ${g.f16 ? 'yes' : 'no'}; max buffer ${g.maxBufferMB} MB`);
  } else {
    addCheck('warn', 'WebGPU', `${g.error || 'Unavailable'}. The CPU engine will be used instead.`);
  }

  addCheck(caps.wasm && caps.wasmSimd ? 'ok' : 'fail', 'WebAssembly SIMD',
    caps.wasm ? (caps.wasmSimd ? '' : 'WebAssembly works but SIMD is missing; please update your browser') : 'WebAssembly is not available');

  addCheck(caps.threads ? 'ok' : 'warn', 'Multithreaded WebAssembly',
    caps.threads ? 'Cross-origin isolated: CPU inference can use several threads'
      : 'Not cross-origin isolated: CPU inference runs single-threaded (server needs COOP/COEP headers)');

  const mem = caps.deviceMemoryGB === null ? 'not reported by this browser' : `${caps.deviceMemoryGB} GB${caps.deviceMemoryGB >= 8 ? '+' : ''}`;
  addCheck('ok', 'Hardware', `${caps.cores} CPU threads, memory ${mem}, ${caps.mobile ? 'mobile' : 'desktop'} device`);

  if (caps.storageFreeMB === null) {
    addCheck('warn', 'Storage', 'Could not estimate free storage');
  } else {
    addCheck(caps.storageFreeMB > 1024 ? 'ok' : 'warn', 'Storage', `${caps.storageFreeMB.toLocaleString()} MB available to this site`);
  }

  const { present, total } = countLocalModels();
  addCheck(present ? 'ok' : 'warn', 'Self-hosted model files',
    present ? `${present} of ${total} model builds served by this site; others load from Hugging Face`
      : 'None found on this server; models load from Hugging Face');
}

/** One-line summary of a setup, e.g. "wllama on CPU (WASM) with SmolLM2 135M (...)". */
function describeConfig(config) {
  const engine = ENGINES[config.engine];
  const model = describeModel(config);
  return `${engine.label} on ${engine.backend} with ${model.label} (${model.detail})`;
}

/** Builds a setup; WebLLM needs the precision variant this GPU supports, the CPU engine none. */
function setupFor(engine, tier, caps) {
  return { engine, tier, variant: engine === 'webllm' ? webllmVariant(caps) : '' };
}

/** Saves the setup and opens the chat, keeping any experiment (mode) link from this page's URL. */
function go(config) {
  saveConfig(config);
  location.href = `chat.html?${withExperiment(configToQuery(config), new URLSearchParams(location.search).get('experiment'))}`;
}

/**
 * Shows the manual engine/model picker. Options this device cannot run are disabled with the reason.
 * @param {object} caps Result of detectCapabilities().
 * @param {{engine: string, tier: string}} initial Pre-selected setup.
 */
function renderOverride(caps, initial) {
  const form = $('override');
  const engineBox = $('engine-options');
  const modelBox = $('model-options');
  const rec = recommend(caps);
  let selectedEngine = initial.engine;
  let selectedTier = initial.tier;

  /** Re-lists the model tiers for the selected engine, moving the selection to a compatible tier. */
  function renderModels() {
    modelBox.replaceChildren();
    if (incompatibility(selectedEngine, selectedTier, caps)) {
      selectedTier = TIERS.find((t) => !incompatibility(selectedEngine, t, caps)) ?? selectedTier;
    }
    for (const tier of TIERS) {
      const reason = incompatibility(selectedEngine, tier, caps);
      const isRec = rec && rec.engine === selectedEngine && rec.tier === tier;
      const input = el('input', { type: 'radio', name: 'tier', value: tier, disabled: Boolean(reason), checked: tier === selectedTier && !reason });
      input.addEventListener('change', () => { selectedTier = tier; });
      const title = `${tierInfo(tier).label} – ${tier}${isRec ? ' (recommended)' : ''}`;
      modelBox.append(el('label', { className: `option${reason ? ' disabled' : ''}` },
        input, ` ${title}`, el('small', { textContent: reason || describeModel(setupFor(selectedEngine, tier, caps)).detail })));
    }
  }

  engineBox.replaceChildren();
  for (const [key, engine] of Object.entries(ENGINES)) {
    const reason = incompatibility(key, 'tiny', caps);
    const input = el('input', { type: 'radio', name: 'engine', value: key, disabled: Boolean(reason), checked: key === selectedEngine });
    input.addEventListener('change', () => { selectedEngine = key; renderModels(); });
    const hint = key === 'webllm' ? 'Fast. Needs WebGPU.' : 'Works almost everywhere. Slower, runs on the CPU.';
    engineBox.append(el('label', { className: `option${reason ? ' disabled' : ''}` },
      input, ` ${engine.label} (${engine.backend})`, el('small', { textContent: reason || hint })));
  }
  renderModels();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (incompatibility(selectedEngine, selectedTier, caps)) return;
    go(setupFor(selectedEngine, selectedTier, caps));
  });
  form.classList.remove('hidden');
}

/**
 * Counts down, then opens the chat with the recommended setup unless the user clicks Change.
 * Any key press, click or focus change pauses it, so nobody is moved on before they have read the page.
 * @param {object} config Recommended setup.
 * @param {Function} onCancel Called when the user wants to choose manually.
 */
function startCountdown(config, onCancel) {
  let remaining = COUNTDOWN_SECONDS;
  const text = $('countdown-text');
  const update = () => { text.textContent = `Starting in ${remaining} s…`; };
  update();
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      stop();
      go(config);
    } else {
      update();
    }
  }, 1000);
  const events = ['keydown', 'pointerdown', 'focusin'];
  const stop = () => {
    clearInterval(timer);
    for (const type of events) document.removeEventListener(type, pause);
  };
  const pause = (event) => {
    // Pausing changes the text width, which would move the buttons away from a click in progress.
    if (event.target.closest?.('#countdown button')) return;
    stop();
    text.textContent = 'Paused.';
    $('countdown-status').textContent = 'Countdown paused. Choose Start now or Change.';
  };
  for (const type of events) document.addEventListener(type, pause);
  $('countdown-status').textContent = `Recommended setup: ${$('recommendation').textContent}. Starting in ${COUNTDOWN_SECONDS} seconds; press any key to pause.`;
  $('countdown').classList.remove('hidden');
  $('go-now').addEventListener('click', () => { stop(); go(config); });
  $('change').addEventListener('click', () => {
    stop();
    $('countdown').classList.add('hidden');
    onCancel();
  });
}

/** Runs the checks, then either counts down to the recommendation or shows the picker (?manual=1). */
async function main() {
  $('boot-warning').remove();
  wireLicenseLinks();
  const caps = await detectCapabilities();
  renderChecks(caps);

  const rec = recommend(caps);
  if (!rec) {
    const box = $('unsupported');
    box.textContent = 'This browser cannot run the models: WebAssembly with SIMD is required. Please use a current version of Chrome, Edge, Firefox or Safari.';
    box.classList.remove('hidden');
    return;
  }

  $('recommendation').textContent = describeConfig(rec);
  $('result').classList.remove('hidden');

  const manual = new URLSearchParams(location.search).has('manual');
  if (manual) {
    const saved = loadConfig();
    const initial = saved && !incompatibility(saved.engine, saved.tier, caps) ? saved : rec;
    renderOverride(caps, initial);
  } else {
    startCountdown(rec, () => renderOverride(caps, rec));
  }
}

main().catch((err) => {
  const box = $('unsupported');
  box.textContent = `Device check failed: ${err?.message || err}`;
  box.classList.remove('hidden');
});
