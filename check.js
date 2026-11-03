// Device check page (step 1): probes the browser, recommends an engine and model, then forwards to the
// experiment picker, or straight to the chat when the link names an experiment or came from the chat.
import { detectCapabilities } from './capabilities.js';
import {
  ENGINES, TIERS, tierInfo, parameterCount, countLocalModels,
  recommend, incompatibility, webllmVariant, describeModel, configToQuery, saveConfig, loadConfig,
} from './models.js';
import { wireLicenseLinks } from './licenses.js';
import { getExperiment, withExperiment, numberedTitle } from './experiments.js';
import { startTour, tourProgress } from './tour.js';
import { el } from './dom.js';

const COUNTDOWN_SECONDS = 5;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const experiment = getExperiment(params.get('experiment'));
// Shared experiment links and "Change setup" in the chat skip the picker and return to the chat.
const toChat = Boolean(experiment) || params.get('next') === 'chat';
const nextLabel = experiment ? `Next: start ${numberedTitle(experiment)}` : toChat ? 'Back to the chat' : 'Next: choose an experiment';
let tour = null;

/**
 * Adds one row to the checklist.
 * @param {'ok'|'warn'|'fail'} status Controls the icon and colour.
 * @param {string} label What was checked.
 * @param {string} [detail] Result shown under the label.
 * @param {string} [why] Plain-language explanation of why the check matters.
 */
function addCheck(status, label, detail, why) {
  const icons = { ok: '✓', warn: '!', fail: '✗' };
  const spoken = { ok: 'OK: ', warn: 'Warning: ', fail: 'Failed: ' };
  const li = el('li', { className: status },
    el('span', { className: 'icon', textContent: icons[status], ariaHidden: 'true' }),
    el('span', {}, el('span', { className: 'visually-hidden', textContent: spoken[status] }), label));
  if (detail) li.append(el('span', { className: 'detail', textContent: detail }));
  if (why) $('check-reasons').append(el('li', {},
    el('strong', { textContent: `${label}: ` }), el('span', { textContent: why })));
  $('checks').append(li);
}

/** Shows the result of every capability probe as a checklist. */
function renderChecks(caps) {
  addCheck(caps.secureContext ? 'ok' : 'warn', 'Secure context',
    caps.secureContext ? (caps.protocol === 'https:' ? 'HTTPS connection' : 'Local address: trusted by the browser, even over HTTP')
      : 'Not HTTPS or localhost: WebGPU and some storage features are disabled',
    'HTTPS and trusted local addresses such as localhost enable powerful browser features.');

  const g = caps.webgpu;
  const whyGpu = 'The graphics chip handles many calculations at once for faster replies.';
  if (g.available) {
    const gpu = [g.vendor, g.architecture].filter(Boolean).join(' ') || 'GPU detected';
    addCheck('ok', 'WebGPU', `${gpu}; half-precision (shader-f16): ${g.f16 ? 'yes' : 'no'}; max buffer ${g.maxBufferMB} MB`, whyGpu);
  } else {
    addCheck('warn', 'WebGPU', `${g.error || 'Unavailable'}. The CPU engine will be used instead.`, whyGpu);
  }

  addCheck(caps.wasm && caps.wasmSimd ? 'ok' : 'fail', 'WebAssembly SIMD',
    caps.wasm ? (caps.wasmSimd ? '' : 'WebAssembly works but SIMD is missing; please update your browser') : 'WebAssembly is not available',
    'Runs fast code in the browser; SIMD handles several calculations per step. Both are required.');

  addCheck(caps.threads ? 'ok' : 'warn', 'Multithreaded WebAssembly',
    caps.threads ? 'Cross-origin isolated: CPU inference can use several threads'
      : 'Not cross-origin isolated: CPU inference runs single-threaded (server needs COOP/COEP headers)',
    'Several processor cores can work on a reply together.');

  const mem = caps.deviceMemoryGB === null ? 'not reported by this browser' : `${caps.deviceMemoryGB} GB${caps.deviceMemoryGB >= 8 ? '+' : ''}`;
  addCheck('ok', 'Hardware', `${caps.cores} CPU threads, memory ${mem}, ${caps.mobile ? 'mobile' : 'desktop'} device`,
    'The model must fit in memory. More memory allows bigger models.');

  const whyStorage = 'The browser can cache the model to avoid downloading it again.';
  if (caps.storageFreeMB === null) {
    addCheck('warn', 'Storage', 'Could not estimate free storage', whyStorage);
  } else {
    addCheck(caps.storageFreeMB > 1024 ? 'ok' : 'warn', 'Storage', `${caps.storageFreeMB.toLocaleString()} MB available to this site`, whyStorage);
  }

  const { present, total } = countLocalModels();
  addCheck(present ? 'ok' : 'warn', 'Self-hosted model files',
    present ? `${present} of ${total} model builds served by this site; others load from Hugging Face`
      : 'None found on this server; models load from Hugging Face',
    'Models load from this site when available, otherwise from the Hugging Face model library.');
}

/** One-line summary of a setup, e.g. "wllama on CPU (WASM) with SmolLM2 135M (...)". */
function describeConfig(config) {
  const engine = ENGINES[config.engine];
  const model = describeModel(config);
  return `${engine.label} on ${engine.backend} with ${model.label} (${model.detail})`;
}

/** Plain-language version of the recommendation: what the engine and model are. */
function explainConfig(config) {
  const gpu = config.engine === 'webllm';
  return `${ENGINES[config.engine].label} is the engine, the program that runs the AI. It will use your ${gpu ? 'graphics chip' : 'processor'}. `
    + `${tierInfo(config.tier).label} is the model, the AI itself. It has ${parameterCount(config.tier).words} numbers, called parameters, that it learned from text. `
    + 'It is the biggest model that should run well on this device.';
}

/** Builds a setup; WebLLM needs the precision variant this GPU supports, the CPU engine none. */
function setupFor(engine, tier, caps) {
  return { engine, tier, variant: engine === 'webllm' ? webllmVariant(caps) : '' };
}

/** Saves the setup and moves on: to the experiment picker, or back to the chat (keeping any experiment). */
function go(config) {
  tour?.complete(2);
  saveConfig(config);
  location.href = toChat
    ? `chat.html?${withExperiment(configToQuery(config), experiment?.id)}`
    : `experiments.html?${configToQuery(config)}`;
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
  $('result').classList.add('hidden');
  $('override-help').classList.remove('hidden');
  $('countdown-status').textContent = 'Choose engine and model.';
  form.classList.remove('hidden');
}

/**
 * Shows Next and Change for the recommended setup. On later visits it also counts down and moves on by itself;
 * any key press, click or focus change pauses it, so nobody is moved on before they have read the page.
 * On the first visit there is no countdown: the first-run tip explains the page instead.
 * @param {object} config Recommended setup.
 * @param {Function} onCancel Called when the user wants to choose manually.
 * @param {boolean} auto Whether to count down.
 */
function startCountdown(config, onCancel, auto) {
  let remaining = COUNTDOWN_SECONDS;
  const text = $('countdown-text');
  const update = () => { text.textContent = `Continuing in ${remaining} s…`; };
  const timer = auto ? setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      stop();
      go(config);
    } else {
      update();
    }
  }, 1000) : 0;
  const events = ['keydown', 'pointerdown', 'focusin'];
  const stop = () => {
    clearInterval(timer);
    for (const type of events) document.removeEventListener(type, pause);
  };
  const pause = (event) => {
    if (event.target.closest?.('#countdown button')) return;
    stop();
    text.textContent = 'Paused.';
    $('countdown-status').textContent = `Countdown paused. Choose ${nextLabel} or Change.`;
  };
  if (auto) {
    update();
    for (const type of events) document.addEventListener(type, pause);
    $('countdown-status').textContent = `Recommended setup: ${$('recommendation').textContent}. Continuing in ${COUNTDOWN_SECONDS} seconds; press any key to pause.`;
  } else {
    $('countdown-status').textContent = `Recommended setup: ${$('recommendation').textContent}. Choose ${nextLabel} or Change.`;
  }
  $('countdown').classList.remove('hidden');
  $('go-now').addEventListener('click', () => { stop(); go(config); });
  $('change').addEventListener('click', () => {
    stop();
    $('countdown').classList.add('hidden');
    onCancel();
  });
}

/** Runs the checks, then either offers the recommendation or shows the picker (?manual=1). */
async function main() {
  $('boot-warning').remove();
  wireLicenseLinks();
  $('go-now').textContent = nextLabel;
  $('override-submit').textContent = nextLabel;
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
  $('recommendation-explain').textContent = explainConfig(rec);
  $('result').classList.remove('hidden');

  const firstVisit = tourProgress() < 2;
  const manual = params.has('manual');
  if (manual) {
    const saved = loadConfig();
    const initial = saved && !incompatibility(saved.engine, saved.tier, caps) ? saved : rec;
    renderOverride(caps, initial);
  } else {
    startCountdown(rec, () => renderOverride(caps, rec), !firstVisit);
  }
  tour = startTour([{
    step: 1,
    side: 'intro',
    target: () => document.querySelector('.setup-sidebar .setup-checks'),
    title: 'Your instruction panels',
    text: 'The yellow panels explain what you are looking at and help you choose what to do. Here, they explain each device check. In chat, they guide your experiment.',
  }, {
    step: 2,
    side: 'sidebar',
    target: () => ($('override').classList.contains('hidden') ? $('go-now') : $('override-submit')),
    title: 'Your device is ready',
    text: 'We checked this device and picked an AI model that should run well on it. Press the blue button to continue. Change lets you pick a different model.',
  }]);
}

main().catch((err) => {
  const box = $('unsupported');
  box.textContent = `Device check failed: ${err?.message || err}`;
  box.classList.remove('hidden');
});
