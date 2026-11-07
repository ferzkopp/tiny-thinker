// Device check page (step 1): probes the browser, recommends an engine and model, then forwards to the
// experiment picker, or straight to the chat when the link names an experiment or came from the chat.
import { detectCapabilities } from './capabilities.js?v=1.3';
import {
  ENGINES, TIERS, tierInfo, parameterCount, countLocalModels,
  recommend, incompatibility, webllmVariant, describeModel, configToQuery, saveConfig, loadConfig,
} from './models.js?v=1.3';
import { wireLicenseLinks } from './licenses.js?v=1.3';
import { EXPERIMENTS, getExperiment, withExperiment, numberedTitle } from './experiments.js?v=1.3';
import { showWelcome, startTour, tourProgress } from './tour.js?v=1.3';
import { el } from './dom.js?v=1.3';

const COUNTDOWN_SECONDS = 5;
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const experiment = getExperiment(params.get('experiment'));
// Shared experiment links and "Change setup" in the chat skip the picker and return to the chat.
const toChat = Boolean(experiment) || params.get('next') === 'chat';
const nextLabel = experiment ? `Next: start ${numberedTitle(experiment)}` : toChat ? 'Back to the chat' : 'Next: choose an experiment';
let tour = null;

/** Adds one capability check to the setup results and reason sidebar.
 * @param {'ok'|'warn'|'error'} status Visual and semantic status.
 * @param {string} label Short capability name.
 * @param {string} detail Result detail.
 * @param {string} why Plain-language explanation.
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

/** Renders all capability results for the setup page.
 * @param {object} caps Detected browser/device capabilities.
 */
function renderChecks(caps) {
  addCheck(caps.secureContext ? 'ok' : 'warn', 'Trusted connection',
    caps.secureContext ? (caps.protocol === 'https:' ? 'HTTPS connection' : 'Local address: trusted by the browser, even over HTTP')
      : 'Not HTTPS or localhost: WebGPU and some storage features are disabled',
    'HTTPS or localhost unlocks advanced browser features.');

  const g = caps.webgpu;
  const whyGpu = 'Runs many calculations at once for faster replies.';
  if (g.available) {
    const gpu = [g.vendor, g.architecture].filter(Boolean).join(' ') || 'GPU detected';
    addCheck('ok', 'Graphics chip (WebGPU)', `${gpu}; compact calculations (shader-f16): ${g.f16 ? 'yes' : 'no'}; max buffer ${g.maxBufferMB} MB`, whyGpu);
  } else {
    addCheck('warn', 'Graphics chip (WebGPU)', `${g.error || 'Unavailable'}. Your processor (CPU) will run the AI instead.`, whyGpu);
  }

  addCheck(caps.wasm && caps.wasmSimd ? 'ok' : 'fail', 'Fast browser math (WebAssembly SIMD)',
    caps.wasm ? (caps.wasmSimd ? '' : 'WebAssembly works but SIMD is missing; please update your browser') : 'WebAssembly is not available',
    'Required for these models; SIMD speeds up calculations.');

  addCheck(caps.threads ? 'ok' : 'warn', 'Processor teamwork (WebAssembly threads)',
    caps.threads ? 'Several processor threads can work together on replies'
      : 'One processor thread will work on replies; this site needs isolation headers to enable teamwork',
    'Lets processor cores work on a reply together.');

  const mem = caps.deviceMemoryGB === null ? 'not reported by this browser' : `${caps.deviceMemoryGB} GB${caps.deviceMemoryGB >= 8 ? '+' : ''}`;
  addCheck('ok', 'Processor and memory', `${caps.cores} CPU threads, memory ${mem}, ${caps.mobile ? 'mobile' : 'desktop'} device`,
    'Bigger models need more working memory.');

  const whyStorage = 'Caches model files so you can reuse downloads.';
  if (caps.storageFreeMB === null) {
    addCheck('warn', 'Room for downloads', 'Could not estimate free storage', whyStorage);
  } else {
    addCheck(caps.storageFreeMB > 1024 ? 'ok' : 'warn', 'Room for downloads', `${caps.storageFreeMB.toLocaleString()} MB available to this site`, whyStorage);
  }

  const { present, total } = countLocalModels();
  addCheck(present ? 'ok' : 'warn', 'Where your AI downloads from',
    present ? `${present} of ${total} model builds served by this site; others load from Hugging Face`
      : 'None found on this server; models load from Hugging Face',
    'Model files come from this site or Hugging Face, an online library of AI models. Your questions are not sent there.');
}

/** Builds a short setup summary for the recommendation panel.
 * @param {{engine: string, tier: string, variant: string}} config Selected setup.
 * @returns {string} Student-facing setup description.
 */
function describeConfig(config) {
  const engine = ENGINES[config.engine];
  const model = describeModel(config);
  return `${engine.label} on ${engine.backend} with ${model.label} (${model.detail})`;
}

/** Builds a plain-language explanation for a recommended setup.
 * @param {{engine: string, tier: string, variant: string}} config Recommended setup.
 * @returns {string} Explanation text.
 */
function explainConfig(config) {
  const gpu = config.engine === 'webllm';
  return `${ENGINES[config.engine].label} is the engine, the program that runs the AI. It will use your ${gpu ? 'graphics chip' : 'processor'}. `
    + `${tierInfo(config.tier).label} is the model, the AI itself. It has ${parameterCount(config.tier).words} numbers, called parameters, that it learned from text. `
    + 'This is a cautious starting choice, not a guarantee: browsers do not report all available memory or cache limits. Change lets you try another model.';
}

/** Builds a setup object and validates whether it fits the device.
 * @param {string} engine Engine ID.
 * @param {string} tier Model tier.
 * @param {object} caps Detected capabilities.
 * @returns {{config: object|null, incompatibility: string}} Setup and validation result.
 */
function setupFor(engine, tier, caps) {
  return { engine, tier, variant: engine === 'webllm' ? webllmVariant(caps) : '' };
}

/** Saves a setup and continues to the experiment or chat route.
 * @param {{engine: string, tier: string, variant: string}} config Setup to save.
 */
function go(config) {
  tour?.complete(2);
  saveConfig(config);
  location.href = toChat
    ? `chat.html?${withExperiment(configToQuery(config), experiment?.id)}`
    : `experiments.html?${configToQuery(config)}`;
}

/** Replaces the recommendation panel with manual engine/model controls.
 * @param {object} caps Detected capabilities.
 * @param {{engine: string, tier: string, variant: string}} initial Currently selected setup.
 */
function renderOverride(caps, initial) {
  const form = $('override');
  const engineBox = $('engine-options');
  const modelBox = $('model-options');
  const rec = recommend(caps);
  let selectedEngine = initial.engine;
  let selectedTier = initial.tier;

  /** Refreshes model choices after the engine or capabilities change. */
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
  $('recommendation-help').classList.add('hidden');
  $('override-help').classList.remove('hidden');
  $('countdown-status').textContent = 'Choose engine and model.';
  form.classList.remove('hidden');
}

/** Starts the setup countdown or leaves it paused for manual selection.
 * @param {{engine: string, tier: string, variant: string}} config Auto-continue setup.
 * @param {() => void} onCancel Runs if the student opens manual setup.
 * @param {boolean} auto True to count down, false to require a button press.
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

/** Runs capability checks, welcome/tour setup and the setup-page entry flow. */
async function main() {
  $('boot-warning').remove();
  wireLicenseLinks();
  $('go-now').textContent = nextLabel;
  $('override-submit').textContent = nextLabel;
  $('welcome-experiment-count').textContent = String(EXPERIMENTS.length);
  const welcome = showWelcome($('first-welcome'), $('welcome-go'));
  const caps = await detectCapabilities();
  renderChecks(caps);
  await welcome;

  const rec = recommend(caps);
  if (!rec) {
    const box = $('unsupported');
    box.textContent = caps.wasm && caps.wasmSimd
      ? 'There is not enough reported browser storage for a model with room to spare. Free some browser storage, then reload, or try another device. Clearing site data removes cached models, saved settings and badges; models will need to download again.'
      : 'This browser cannot run the models: WebAssembly with SIMD is required. Please use a current version of Chrome, Edge, Firefox or Safari.';
    box.classList.remove('hidden');
    return;
  }

  $('recommendation').textContent = describeConfig(rec);
  $('recommendation-explain').textContent = explainConfig(rec);
  $('result').classList.remove('hidden');
  $('recommendation-help').classList.remove('hidden');

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
    target: () => document.querySelector('.journey'),
    title: 'Your path: 1, 2, 3',
    text: 'First, set up this device. Next, choose an experiment. Then chat and learn by trying questions and comparing replies. The yellow instruction panels explain what you are looking at here and guide your experiment in chat.',
  }, {
    step: 2,
    side: 'above',
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
