// Chat page: loads the chosen engine, streams replies, runs classroom modes and shows help popups.
import { ENGINES, describeModel, resolveSource, loadConfig, saveConfig, configToQuery, tierInfo } from './models.js';
import { wireLicenseLinks } from './licenses.js';
import { EXPERIMENTS, getExperiment, withExperiment, settingsMatch, describeChange, formatNotes, numberedTitle } from './experiments.js';
import { extractTurtleCode, runTurtle, renderTurtleSvg } from './turtle.js';
import { el } from './dom.js';

// Key name predates the Tiny Thinker name; changing it would discard settings saved in existing browsers.
const SETTINGS_KEY = 'browserai.settings';
const DEFAULT_SETTINGS = {
  systemPrompt: 'You are a friendly, concise assistant. Answer in a few short paragraphs at most.',
  maxTokens: 256,
  temperature: 0.7,
};

// Help popup texts, keyed by the data-help attribute of the ? buttons. **Name** is shown in bold.
const HELP = {
  mode: {
    title: 'Modes: pick an experiment',
    text: '**Free chat** is a normal conversation. Every other mode is a short experiment with a number, so your teacher can say "start mode 4". A mode sets the system prompt, temperature and reply length for you and shows step-by-step instructions on the left.',
    example: `Pick **${numberedTitle(getExperiment('shakespeare'))}**, click a question in step 1 and press **Send**. Switching mode starts a new conversation.`,
  },
  steps: {
    title: 'Step buttons: do the experiment',
    text: '**Blue-outlined buttons** put a question into the message box. Nothing is sent until you press **Send**, so you can edit it first. **Green-outlined buttons** change a setting and start fresh, so you can compare answers fairly.',
    example: 'Click a blue question, press **Send**, then click a green button and press **Send** again. Compare the two answers. A filled green button shows the setting that is active.',
  },
  conversation: {
    title: 'The chat: a conversation with the model',
    text: 'Your messages appear on the right, the model\'s replies on the left. Under each reply you can see how quickly it started and how long it was. The model reads the whole conversation each time, so earlier messages can change later answers.',
    example: 'Ask a question, then ask "Can you say that more simply?" The model understands because it remembers your first question. **Clear** or **Fresh run** makes it forget.',
  },
  chat: {
    title: 'Chat buttons',
    text: '**Send** asks the model (or press **Enter**; **Shift+Enter** starts a new line). **Stop** ends a reply early. **Clear** removes the whole conversation. **Fresh run** makes the model forget the conversation and puts your last question back, ready to ask again.',
    example: 'The model remembers earlier messages in the conversation, which can change its answers. Use **Fresh run** when comparing settings, so each answer starts from the same point.',
  },
  notes: {
    title: 'My notes: record what you find',
    text: 'Write what you predicted, what you noticed and how you would explain it. **Download notes** saves a text file with your notes, every question, the settings used and the replies.',
    example: 'Notes are only kept in this browser tab. They disappear when you leave or switch mode, unless you download them first.',
  },
  systemPrompt: {
    title: 'System prompt: give the model a role',
    text: 'These are instructions the model reads before your messages. They can ask it to use a certain voice, keep answers short or follow a rule. They do not train the model, guarantee safety or make it obey every time. The tiny and small models often ignore a system prompt, so Tiny Thinker quietly adds it to the start of your question as well.',
    example: `Try: "Answer like a Shakespeare storyteller." Then compare with "Answer in simple modern language." Use **Fresh run** with the same question so earlier replies do not influence the comparison. Mode **${numberedTitle(getExperiment('shakespeare'))}** has buttons for this.`,
  },
  maxTokens: {
    title: 'Max reply tokens: set a length budget',
    text: 'A token is a small piece of text. It might be a word, part of a word or punctuation. This number is the most the model may generate in one reply. It can stop sooner, or run out of room in the middle of a sentence. Tokens are not the same as words.',
    example: 'Try the same question with 64, then 160. A smaller budget usually finishes sooner. A bigger budget gives more room, but does not make the answer more accurate. This changes the next reply, not replies already written.',
  },
  temperature: {
    title: 'Temperature: turn the surprise dial',
    text: 'This controls how randomly the model chooses the next pieces of text. Lower values tend to favour more likely choices. Higher values allow more unusual choices, but can also produce muddled answers. It is not a truth or intelligence setting.',
    example: `Try a story opening at 0.2, then at 1.0. Use **Fresh run** and repeat the same question a few times at each value. The answers may still be similar. This changes the next reply, not earlier replies. Mode **${numberedTitle(getExperiment('creativity'))}** walks you through it.`,
  },
  reset: {
    title: 'Done: a fresh start for the next person',
    text: 'Press **Done** when you finish. It clears this conversation, the unsent message and your experiment notes, puts the system prompt, reply length and temperature back to their starting values and switches back to **Free chat**.',
    example: '**Download notes** first if you need them. The selected model stays loaded, so the next person can start right away.',
  },
  turtleSyntax: {
    title: 'Turtle syntax: Logo drawing commands',
    text: 'The turtle starts in the centre at **(0, 0)** facing **up** (North) with its pen down. Commands are not case-sensitive, and you can put several on one line or on separate lines.',
    facts: [
      ['FD n / BK n', 'Move forward or backward **n** steps, drawing a line if the pen is down (e.g. **FD 60**, **BK 30**).'],
      ['RT deg / LT deg', 'Turn right (clockwise) or left (counter-clockwise) by **deg** degrees. A square corner is **90**; a full turn is **360**.'],
      ['REPEAT n [ ... ]', 'Run the commands inside the brackets **n** times (up to 360). Example: **REPEAT 4 [ FD 60 RT 90 ]**.'],
      ['PU / PD', '**PU** (pen up) moves without drawing; **PD** (pen down) starts drawing again.'],
      ['COLOR name', 'Set the pen colour: **blue**, **red**, **green**, **orange**, **purple**, **pink**, **teal**, **gold**, **black**, **gray** or a hex colour like **#e11d48**.'],
      ['WIDTH n', 'Set the line thickness from **1** (thin) to **12** (thick).'],
      ['HOME / CLEAR', '**HOME** returns the turtle to (0, 0) facing up. **CLEAR** erases the stage and resets the turtle.'],
    ],
    example: 'Try editing the code box to **COLOR purple REPEAT 12 [ FD 65 BK 65 RT 30 ]** and press **Run code** (or **Ctrl+Enter**).',
  },
};

const $ = (id) => document.getElementById(id);

/**
 * Shows help text in an element, rendering **Name** as bold.
 * Built from text nodes, never innerHTML, so text can never inject markup.
 */
function setEmphasized(element, text) {
  element.replaceChildren(...text.split(/\*\*(.+?)\*\*/).map((part, index) =>
    (index % 2 ? el('strong', { textContent: part }) : document.createTextNode(part))));
}

const ui = {
  badge: $('setup-badge'),
  modelStatus: $('model-status'),
  loadPanel: $('load-panel'),
  loadProgress: $('load-progress'),
  loadText: $('load-text'),
  errorPanel: $('error-panel'),
  errorTitle: $('error-title'),
  errorText: $('error-text'),
  retryBtn: $('retry-btn'),
  fallbackBtn: $('fallback-btn'),
  log: $('log'),
  composer: $('composer'),
  input: $('input'),
  send: $('send'),
  stop: $('stop'),
  clear: $('clear'),
  systemPrompt: $('system-prompt'),
  maxTokens: $('max-tokens'),
  temperature: $('temperature'),
};

let config = null;          // Engine/tier/variant being used.
let engine = null;          // Loaded engine adapter, or null.
let ready = false;          // A model is loaded and can chat.
let generating = false;     // A reply is streaming.
let history = [];           // Conversation sent to the model as context.
let runVersion = 0;         // Bumped on every reset so late replies from an old conversation are ignored.
let activeActivity = null;  // Current mode, or null for Free chat.
let turns = [];             // Question, settings and reply records for the notes download.
let lastPrompt = '';        // Refilled by Fresh run.
let engineDetail = '';      // Extra engine info from load(), e.g. thread count.
let followNewest = true;    // Auto-scroll while streaming; off when the student scrolls up.
let scrollQueued = false;   // A scroll is already scheduled for the next frame.

// Step buttons that change settings, mapped to their change, so the active one can be highlighted.
const actionChanges = new WeakMap();

/** Builds the "About this model" popup from the loaded model's catalog entry. */
function modelHelp() {
  const tier = tierInfo(config.tier);
  const family = tier.familyInfo;
  const gpu = config.engine === 'webllm';
  const build = gpu ? tier.webllm[config.variant] : tier.gguf;
  const [, amount, unit] = tier.label.match(/([\d.]+)([MB])$/) || [];
  const params = amount ? `${amount} ${unit === 'B' ? 'billion' : 'million'}` : tier.label;
  const context = ENGINES[config.engine].contextSize;
  const detail = engineDetail ? `, ${engineDetail}` : '';
  return {
    title: `About this model: ${tier.label} (${config.tier})`,
    text: 'A language model writes by predicting the next small piece of text, again and again, using patterns it learned from a huge amount of writing. It does not look anything up: everything it "knows" is stored in its numbers.',
    facts: [
      ['Name', `**${family.name}**, made by ${family.copyright}.`],
      ['Size', `**${params} parameters**: the numbers the model adjusted while it learned. More parameters can hold more knowledge, but need more memory and time.`],
      ['Languages', family.languages],
      ...(family.weakSystemPrompt ? [['System prompt', 'small models like this one often **ignore** the system prompt. Tiny Thinker quietly repeats it at the start of your question, which works better.']] : []),
      ['Runs on', gpu
        ? `your **graphics chip** (WebGPU${detail}). Graphics chips do thousands of small calculations at once, which suits language models.`
        : `your **processor** (CPU${detail}). Slower than a graphics chip, but it works on almost any device.`],
      ['Compression', /^q0/i.test(build.quant)
        ? `**${build.quant}**: not compressed. Each number keeps ${config.variant === 'f32' ? 32 : 16} bits, because this model is small enough already.`
        : `**${build.quant}**: each number is squeezed into about 4 bits instead of 16. The model downloads faster and fits in less memory, losing a little quality.`],
      ['Memory', gpu ? `about **${build.vramMB} MB** of graphics memory.` : `a **${build.sizeMB} MB** download, kept in this browser's cache.`],
      ['Attention span', `about **${context.toLocaleString()} tokens** (roughly ${Math.round(context * 0.75 / 100) * 100} words). In long chats, the oldest messages are dropped.`],
      ['Files from', resolveSource(config).local ? 'this website (self-hosted).' : '**Hugging Face**, a website where people share AI models.'],
      ['License', `**${family.licenseName}**: an open license. Anyone may use, study and share this model.`],
    ],
    example: `The biggest chatbots can have hundreds of billions of parameters and run in huge data centers. This model is much smaller, so it knows less and makes more mistakes, but it runs right here and your questions stay on this device. Try **Change setup** to compare a bigger model, for example in mode **${numberedTitle(getExperiment('languages'))}**.`,
  };
}

/** Converts to a number within [min, max]; returns fallback for non-numbers. */
function clamp(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

/** Fills the settings fields with the saved free-chat settings, or the defaults. */
function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    saved = {};
  }
  ui.systemPrompt.value = typeof saved.systemPrompt === 'string' ? saved.systemPrompt : DEFAULT_SETTINGS.systemPrompt;
  ui.maxTokens.value = clamp(saved.maxTokens, 16, 1024, DEFAULT_SETTINGS.maxTokens);
  ui.temperature.value = clamp(saved.temperature, 0, 1.5, DEFAULT_SETTINGS.temperature);
}

/** Reads the settings fields, clamped to valid ranges. An empty system prompt means the default one. */
function currentSettings() {
  return {
    systemPrompt: ui.systemPrompt.value.trim() || DEFAULT_SETTINGS.systemPrompt,
    maxTokens: Math.round(clamp(ui.maxTokens.value, 16, 1024, DEFAULT_SETTINGS.maxTokens)),
    temperature: clamp(ui.temperature.value, 0, 1.5, DEFAULT_SETTINGS.temperature),
  };
}

/** Saves the current settings as the free-chat settings. */
function persistSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(currentSettings()));
  } catch {
    // Settings simply won't persist.
  }
}

/** Enables or disables chat controls and step buttons for the current model and streaming state. */
function updateControls() {
  ui.input.disabled = !ready;
  ui.send.disabled = !ready || generating;
  ui.stop.disabled = !generating;
  ui.fallbackBtn.disabled = generating;
  $('fresh-run').disabled = !ready;
  $('download-notes').disabled = generating;
  for (const button of document.querySelectorAll('.step-action')) button.disabled = !ready;
}

/** Writes settings into the fields and reacts as if the student had typed them. */
function setSettings(settings) {
  ui.systemPrompt.value = settings.systemPrompt;
  ui.maxTokens.value = settings.maxTokens;
  ui.temperature.value = settings.temperature;
  onSettingsChanged();
}

/** Reacts to a settings change. Only free-chat settings persist, so a reload without a mode never inherits a preset. */
function onSettingsChanged() {
  if (!activeActivity) persistSettings();
  updateModeStatus();
}

/** Shows whether the mode's preset is unchanged and highlights the active setting buttons. */
function updateModeStatus() {
  if (!activeActivity) return;
  const settings = currentSettings();
  const customized = !settingsMatch(settings, activeActivity.settings);
  $('mode-status').textContent = customized ? 'Settings changed from this mode\'s preset.' : 'Using this mode\'s preset settings.';
  $('restore-preset').classList.toggle('hidden', !customized);
  for (const button of $('guide-steps').querySelectorAll('.setting-action')) {
    const change = actionChanges.get(button);
    button.setAttribute('aria-pressed', String(Object.entries(change).every(([key, value]) => settings[key] === value)));
  }
}

/** Puts the current mode in the address bar and the Change setup link, so reloading and setup changes keep it. */
function syncModeUrl() {
  const query = withExperiment(location.search, activeActivity?.id);
  window.history.replaceState(null, '', `chat.html${query ? `?${query}` : ''}`);
  $('change-setup').href = `index.html?${withExperiment('manual=1', activeActivity?.id)}`;
}

/** True if a reset would lose something: messages, run records, a draft, a reply in progress or (optionally) notes. */
function hasWork(includeNotes) {
  return Boolean(history.length || turns.length || ui.input.value.trim() || generating || (includeNotes && $('reflection').value.trim()));
}

/**
 * Empties the conversation and the message box, stopping any reply in progress.
 * @param {{keepTurns?: boolean}} [options] keepTurns keeps run records for the notes download (Fresh run).
 */
function resetConversation({ keepTurns = false } = {}) {
  runVersion += 1;
  for (const turn of turns) {
    if (turn.status === 'generating') turn.status = 'discarded after reset';
  }
  if (generating) engine?.interrupt();
  history = [];
  if (!keepTurns) turns = [];
  ui.log.replaceChildren();
  ui.input.value = '';
  if (ready) hideError();
  updateControls();
}

/** Full reset for a new mode or the next student: conversation, run records, last question and notes. */
function startOver() {
  resetConversation();
  lastPrompt = '';
  $('reflection').value = '';
}

/**
 * Clears the model's context but keeps run records for the notes; refills the message box.
 * @param {string} [prompt] Text to put in the message box; defaults to the draft or the last question.
 */
function freshRun(prompt) {
  const draft = ui.input.value.trim();
  resetConversation({ keepTurns: true });
  ui.input.value = prompt ?? (draft || lastPrompt);
  ui.input.focus();
}

/**
 * Runs a step button: a question button fills the message box (optionally after a fresh run);
 * a setting button changes the settings and starts a fresh run so answers can be compared.
 */
function runAction(action) {
  if (action.settings) {
    freshRun();
    setSettings({ ...currentSettings(), ...action.settings });
    addMessage('system-note', `Changed ${describeChange(action.settings)}. Fresh start: press Send to compare.`);
  } else if (action.fresh) {
    freshRun(action.prompt);
  } else {
    ui.input.value = action.prompt;
    ui.input.focus();
  }
}

/** Creates the button for one step action, styled blue (question) or green (setting change). */
function actionButton(action) {
  const button = el('button', { type: 'button', textContent: action.label });
  if (action.settings) {
    button.className = 'step-action setting-action';
    button.title = `Change ${describeChange(action.settings)} and start fresh`;
    actionChanges.set(button, action.settings);
  } else {
    button.className = 'step-action prompt-action';
    button.title = `Put this in the message box: ${action.prompt}`;
  }
  button.addEventListener('click', () => runAction(action));
  return button;
}

/** Shows the instructions panel for the current mode, or hides it in Free chat. */
function renderGuide() {
  const mode = activeActivity;
  $('guide').classList.toggle('hidden', !mode);
  $('workspace').classList.toggle('with-guide', Boolean(mode));
  $('mode-select').value = mode?.id || '';
  document.title = mode ? `${numberedTitle(mode)} – Tiny Thinker` : 'Tiny Thinker';
  if (!mode) return;
  $('guide-title').textContent = numberedTitle(mode);
  $('guide-time').textContent = mode.minutes;
  $('guide-objective').textContent = mode.objective;
  $('guide-steps').replaceChildren(...mode.steps.map((step) => el('li', {},
    el('p', { textContent: step.text }),
    ...(step.actions ? [el('div', { className: 'step-actions' }, ...step.actions.map(actionButton))] : []))));
  $('guide-notice').textContent = mode.notice;
  $('guide-entry').textContent = mode.entry;
  $('guide-stretch').textContent = mode.stretch;
  updateModeStatus();
  updateControls();
}

/**
 * Switches mode (from the Mode menu): asks before discarding work, then applies the mode's preset,
 * or the saved free-chat settings for Free chat.
 * @param {string} id Mode ID, or '' for Free chat.
 */
function selectMode(id) {
  const next = getExperiment(id);
  if (next === activeActivity) return;
  if (hasWork(true) && !confirm('Switch mode? The conversation, message draft and notes will be cleared.')) {
    $('mode-select').value = activeActivity?.id || '';
    return;
  }
  startOver();
  activeActivity = next;
  if (next) setSettings(next.settings);
  else loadSettings();
  renderGuide();
  syncModeUrl();
  addMessage('system-note', next ? `${next.title}: follow the steps on the left.` : 'Free chat: ask anything.');
}

/** Saves the student's notes, settings and run records as a text file on this device. */
function downloadNotes() {
  if (generating) return;
  const text = formatNotes({ activity: activeActivity, model: ui.badge.textContent,
    settings: currentSettings(), turns, reflection: $('reflection').value });
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = el('a', { href: url, download: `tiny-thinker-${activeActivity?.id || 'free-chat'}-notes.txt` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fills the Mode menu, applies a mode from the URL and wires the mode-related buttons. */
function wireModes() {
  $('mode-select').append(...EXPERIMENTS.map((item) => new Option(numberedTitle(item), item.id)));
  activeActivity = getExperiment(new URLSearchParams(location.search).get('experiment'));
  if (activeActivity) setSettings(activeActivity.settings);
  renderGuide();
  syncModeUrl();
  $('mode-select').addEventListener('change', (event) => selectMode(event.target.value));
  $('restore-preset').addEventListener('click', () => setSettings(activeActivity.settings));
  $('download-notes').addEventListener('click', downloadNotes);
  $('fresh-run').addEventListener('click', () => freshRun());
  $('restore-defaults').addEventListener('click', () => {
    if (hasWork(true) && !confirm('Done? The conversation, message draft and notes will be cleared for the next person.')) return;
    startOver();
    activeActivity = null;
    setSettings(DEFAULT_SETTINGS);
    renderGuide();
    syncModeUrl();
  });
  window.addEventListener('beforeunload', (event) => {
    if (hasWork(true)) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
}

/** Scrolls the conversation to the newest message, at most once per frame, unless the student scrolled up. */
function scrollToNewest(force = false) {
  if (force) followNewest = true;
  if (!followNewest || scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    ui.log.scrollTop = ui.log.scrollHeight;
  });
}

/**
 * Adds a message bubble. All model and user text goes through text nodes, never innerHTML.
 * @param {'user'|'assistant'|'system-note'} role Bubble style.
 * @param {string} [text] Initial text.
 * @returns {{append(delta: string): void, setThinking(on: boolean): void, setMeta(text: string): void}}
 *   Handle for streaming text into the bubble and showing the thinking dots and the info line.
 */
function addMessage(role, text = '') {
  const body = document.createTextNode(text);
  const sandbox = el('div', { className: 'turtle-sandbox hidden' });
  const meta = el('span', { className: 'meta hidden' });
  const thinking = el('span', { className: 'thinking hidden' }, ...[0, 1, 2].map(() => el('span', { className: 'dot' })));
  thinking.setAttribute('role', 'status');
  thinking.setAttribute('aria-label', 'Thinking');
  ui.log.append(el('div', { className: `msg ${role}` }, thinking, body, sandbox, meta));
  scrollToNewest(true);
  return {
    append(delta) {
      thinking.classList.add('hidden');
      body.appendData(delta);
      scrollToNewest();
    },
    setText(newText) {
      thinking.classList.add('hidden');
      body.data = newText;
      scrollToNewest();
    },
    setThinking(on) {
      thinking.classList.toggle('hidden', !on);
    },
    setMeta(textValue) {
      meta.textContent = textValue;
      meta.classList.toggle('hidden', !textValue);
    },
    mountTurtle(initialCode, onCodeEdit) {
      renderTurtleWidget(sandbox, initialCode, onCodeEdit);
      scrollToNewest(true);
    },
  };
}

/**
 * Mounts an interactive Logo turtle stage and editable code runner inside an assistant message bubble.
 * @param {HTMLElement} container The `.turtle-sandbox` element inside the bubble.
 * @param {string} initialCode Extracted turtle commands from the model reply.
 * @param {(code: string) => void} [onCodeEdit] Updates the turn record when the student edits and runs code.
 */
function renderTurtleWidget(container, initialCode, onCodeEdit) {
  const stage = el('div', { className: 'turtle-stage' });
  const status = el('div', { className: 'turtle-status', role: 'status' });
  const editor = el('textarea', {
    className: 'turtle-code',
    rows: 3,
    maxLength: 1000,
    value: initialCode || 'COLOR blue REPEAT 4 [ FD 60 RT 90 ]',
    ariaLabel: 'Turtle code',
    spellcheck: false,
  });
  const runBtn = el('button', { type: 'button', className: 'turtle-run', textContent: 'Run code' });
  const syntaxHelpBtn = el('button', {
    type: 'button',
    className: 'help-btn',
    textContent: '?',
    title: 'Turtle syntax help',
    ariaLabel: 'Turtle syntax help',
  });
  syntaxHelpBtn.setAttribute('aria-haspopup', 'dialog');
  syntaxHelpBtn.addEventListener('click', () => openHelp('turtleSyntax'));
  const helpHint = el('small', {
    className: 'turtle-hint',
    textContent: 'Commands: FD n, BK n, RT deg, LT deg, PU, PD, COLOR name, WIDTH n, HOME, CLEAR, REPEAT n [ ... ]',
  });

  const execute = (codeText, fromUser = false) => {
    const res = runTurtle(codeText);
    stage.replaceChildren(renderTurtleSvg(res));
    if (res.errors.length) {
      status.textContent = res.errors[0];
      status.className = 'turtle-status error';
    } else {
      const gap = Math.hypot(res.turtle.x, res.turtle.y);
      const turnHint = res.segments.length >= 3 && gap > 8
        ? ` The shape stayed open — try a bigger turn angle (like RT 144 or RT 168.75) or add BK after FD!`
        : ' Edit the numbers and press Run code!';
      status.textContent = `Drew ${res.segments.length} line${res.segments.length === 1 ? '' : 's'} (${res.steps} step${res.steps === 1 ? '' : 's'}).${turnHint}`;
      status.className = 'turtle-status ok';
    }
    if (fromUser && onCodeEdit) onCodeEdit(codeText);
  };

  runBtn.addEventListener('click', () => execute(editor.value, true));
  editor.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      execute(editor.value, true);
    }
  });

  execute(initialCode, false);
  container.replaceChildren(
    stage,
    el('div', { className: 'turtle-controls' },
      el('div', { className: 'turtle-editor-head' },
        el('span', { className: 'turtle-title' },
          el('strong', { textContent: 'Turtle sandbox' }),
          syntaxHelpBtn,
        ),
        runBtn,
      ),
      editor,
      status,
      helpHint,
    ),
  );
  container.classList.remove('hidden');
}

/**
 * Shows the error panel above the chat.
 * @param {string} title Short heading.
 * @param {string} message Explanation and what to do next.
 * @param {{fallback?: boolean, retry?: boolean}} [options] Show the CPU-engine and/or Try again buttons.
 */
function showError(title, message, { fallback = false, retry = false } = {}) {
  ui.errorTitle.textContent = title;
  ui.errorText.textContent = message;
  ui.fallbackBtn.classList.toggle('hidden', !fallback);
  ui.retryBtn.classList.toggle('hidden', !retry);
  ui.errorPanel.classList.remove('hidden');
}

/** Hides the error panel. */
function hideError() {
  ui.errorPanel.classList.add('hidden');
}

/**
 * Updates the model status in the header; 'unavailable' also greys out the chat.
 * @param {'loading'|'ready'|'unavailable'} state
 */
function setModelStatus(state) {
  const labels = { loading: 'Loading…', ready: 'Ready', unavailable: 'Not available' };
  ui.modelStatus.textContent = labels[state];
  ui.modelStatus.className = `model-status ${state}`;
  $('workspace').classList.toggle('no-model', state === 'unavailable');
}

/** Opens or closes the loading overlay, which blocks the page while the model loads. */
function showLoader(on) {
  if (on && !ui.loadPanel.open) ui.loadPanel.showModal();
  if (!on && ui.loadPanel.open) ui.loadPanel.close();
}

/**
 * Shows engine, model, size tier and file source in the header.
 * @param {string} [extra] Engine detail from load(), e.g. "8 threads".
 */
function setBadge(extra) {
  engineDetail = extra || '';
  const e = ENGINES[config.engine];
  const m = describeModel(config);
  ui.badge.textContent = `${e.label} · ${e.backend}${extra ? ` (${extra})` : ''} · ${m.label}${config.variant ? ` ${config.variant}` : ''} (${config.tier}) · ${m.where}`;
}

/** Rough token count (no tokenizer on the main thread); overestimates so trimming errs on the safe side. */
function estimateTokens(text) {
  return Math.ceil(text.length / 3) + 4;
}

/**
 * Builds the messages for the model: system prompt plus as much recent conversation as fits the context window.
 * @param {{systemPrompt: string, maxTokens: number}} settings
 * @returns {{role: string, content: string}[]}
 */
function buildMessages(settings) {
  const budget = ENGINES[config.engine].contextSize - settings.maxTokens - 64;
  let used = estimateTokens(settings.systemPrompt);
  const kept = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].content);
    if (kept.length && used + cost > budget) break;
    used += cost;
    kept.unshift(history[i]);
  }
  while (kept.length && kept[0].role !== 'user') kept.shift();
  // Small models largely ignore the system role, so the instructions are repeated with the newest question.
  if (tierInfo(config.tier).familyInfo.weakSystemPrompt && kept.length) {
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = { ...last, content: `${settings.systemPrompt}\n\n${last.content}` };
  }
  return [{ role: 'system', content: settings.systemPrompt }, ...kept];
}

/** Loads the engine and model for `config` behind the loading overlay; on failure, shows the no-model state. */
async function startEngine() {
  ready = false;
  engine = null;
  setModelStatus('loading');
  updateControls();
  hideError();
  setBadge();
  ui.loadProgress.value = 0;
  ui.loadText.textContent = 'Loading engine library…';
  showLoader(true);

  try {
    if (config.engine === 'webllm') {
      const { WebLLMEngine } = await import('./engines/webllm-engine.js');
      engine = new WebLLMEngine();
    } else {
      const { WllamaEngine } = await import('./engines/wllama-engine.js');
      engine = new WllamaEngine();
    }
    const info = await engine.load(resolveSource(config), ({ progress, text }) => {
      ui.loadProgress.value = Math.min(1, Math.max(0, progress || 0));
      ui.loadText.textContent = text;
    }, { contextSize: ENGINES[config.engine].contextSize });

    setBadge(info?.detail);
    showLoader(false);
    ready = true;
    setModelStatus('ready');
    updateControls();
    ui.input.focus();
  } catch (err) {
    console.error(err);
    showLoader(false);
    engine = null;
    setModelStatus('unavailable');
    updateControls();
    const gpu = config.engine === 'webllm';
    showError('No model available',
      `The model could not be loaded: ${err?.message || err}. Chatting is turned off until a model loads. `
      + (gpu ? 'Try the CPU engine, try again, or use Change setup to pick another model.' : 'Check the network connection and try again, or use Change setup to pick a smaller model.'),
      { fallback: gpu, retry: true });
  }
}

/** Replaces a failing GPU engine with the CPU engine for the same model size. */
async function switchToCpu() {
  if (generating) return;
  ready = false;
  updateControls();
  hideError();
  const old = engine;
  engine = null;
  try {
    await old?.unload();
  } catch (err) {
    console.warn('Unloading WebLLM failed', err);
  }
  config = { engine: 'wllama', tier: config.tier, variant: '' };
  saveConfig(config);
  resetConversation();
  window.history.replaceState(null, '', `chat.html?${withExperiment(configToQuery(config), activeActivity?.id)}`);
  addMessage('system-note', 'Switched to the CPU engine. Previous conversation context was cleared.');
  await startEngine();
}

/** Sends the message box to the model and streams the reply. Ignores replies from a conversation that was reset. */
async function send() {
  const text = ui.input.value.trim();
  if (!text || !ready || generating) return;

  ui.input.value = '';
  hideError();
  // Screen readers would otherwise announce every streamed fragment; they read the finished turn instead.
  ui.log.setAttribute('aria-busy', 'true');
  history.push({ role: 'user', content: text });
  addMessage('user', text);
  const reply = addMessage('assistant');
  reply.setThinking(true);

  const settings = currentSettings();
  const version = runVersion;
  const turn = { prompt: text, settings, reply: '', status: 'generating' };
  turns.push(turn);
  lastPrompt = text;
  generating = true;
  updateControls();
  const started = performance.now();
  let firstTokenAt = 0;
  let chunks = 0;

  try {
    const result = await engine.chat(buildMessages(settings), settings, (delta) => {
      if (version !== runVersion) return;
      if (!firstTokenAt) firstTokenAt = performance.now();
      chunks += 1;
      reply.append(delta);
    });
    if (version !== runVersion) return;
    turn.reply = result.text || '';
    turn.status = result.finishReason || 'complete';
    const notes = [];
    if (firstTokenAt) {
      // Speed excludes prompt processing so it reflects pure generation.
      const genSeconds = (performance.now() - firstTokenAt) / 1000;
      notes.push(`first token ${((firstTokenAt - started) / 1000).toFixed(2)} s`, `${chunks} stream chunks`);
      if (chunks > 1) notes.push(`${((chunks - 1) / Math.max(genSeconds, 0.001)).toFixed(1)} chunks/s`);
    }
    if (result.finishReason === 'length') notes.push('cut off at max tokens');
    if (result.finishReason === 'abort') notes.push('stopped');

    // In turtle mode, check the generated commands and run a single automatic repair retry if invalid or empty.
    if (activeActivity?.sandbox === 'turtle' && result.finishReason !== 'abort') {
      let turtleCode = extractTurtleCode(result.text);
      let turtleRun = runTurtle(turtleCode);
      if (turtleRun.errors.length || !turtleRun.segments.length) {
        const issue = turtleRun.errors[0] || 'No drawable turtle lines were produced.';
        turn.firstAttempt = { reply: result.text || '', error: issue };
        reply.setMeta(`Fixing turtle code (retry 1/1): ${issue}`);
        reply.setThinking(true);
        const repairPrompt = `${text}\n(${issue} Output ONLY one line of Logo turtle commands, for example: COLOR blue REPEAT 4 [ FD 60 RT 90 ])`;
        const repairMessages = [
          { role: 'system', content: settings.systemPrompt },
          { role: 'user', content: tierInfo(config.tier).familyInfo.weakSystemPrompt ? `${settings.systemPrompt}\n\n${repairPrompt}` : repairPrompt },
        ];
        let retriedText = '';
        const retryRes = await engine.chat(repairMessages, settings, (delta) => {
          if (version !== runVersion) return;
          if (!retriedText) reply.setText('');
          retriedText += delta;
          chunks += 1;
          reply.append(delta);
        });
        if (version !== runVersion) return;
        if (retryRes.text?.trim()) {
          result.text = retryRes.text;
          turn.reply = retryRes.text;
          turn.retried = true;
          turtleCode = extractTurtleCode(retryRes.text);
          turtleRun = runTurtle(turtleCode);
          notes.push(turtleRun.errors.length === 0 && turtleRun.segments.length > 0 ? 'auto-fixed on retry 1/1' : 'retry 1/1 still needs an edit');
        }
      }
      reply.mountTurtle(turtleCode || result.text, (editedCode) => {
        turn.studentEditedCode = editedCode;
      });
    }

    reply.setThinking(false);
    if (result.text) {
      history.push({ role: 'assistant', content: result.text });
    } else {
      history.pop();
      notes.push('no reply');
    }
    reply.setMeta(notes.join(' · '));
  } catch (err) {
    if (version !== runVersion) return;
    turn.status = 'error';
    console.error(err);
    history.pop();
    reply.setThinking(false);
    reply.setMeta('error');
    showError('Something went wrong', `The reply failed: ${err?.message || err}`, { fallback: config.engine === 'webllm' });
  } finally {
    generating = false;
    ui.log.removeAttribute('aria-busy');
    updateControls();
    if (version === runVersion) ui.input.focus();
  }
}

/** Shows a help popup; the model popup is built from the loaded model. */
function openHelp(key) {
  const help = key === 'model' ? modelHelp() : HELP[key];
  $('setting-help-title').textContent = help.title;
  setEmphasized($('setting-help-text'), help.text);
  $('setting-help-facts').replaceChildren(...(help.facts || []).flatMap(([term, value]) => {
    const description = el('dd');
    setEmphasized(description, value);
    return [el('dt', { textContent: term }), description];
  }));
  $('setting-help-facts').classList.toggle('hidden', !help.facts);
  setEmphasized($('setting-help-example'), help.example);
  $('setting-help-dialog').showModal();
}

/** Wires the help popups, the message box, the chat buttons and the settings fields. */
function wireEvents() {
  const helpDialog = $('setting-help-dialog');
  for (const button of document.querySelectorAll('[data-help]')) {
    button.addEventListener('click', () => openHelp(button.dataset.help));
  }
  $('close-setting-help').addEventListener('click', () => helpDialog.close());
  helpDialog.addEventListener('click', (event) => {
    if (event.target === helpDialog) helpDialog.close();
  });
  ui.composer.addEventListener('submit', (e) => {
    e.preventDefault();
    send();
  });
  ui.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  ui.stop.addEventListener('click', () => engine?.interrupt());
  ui.clear.addEventListener('click', () => {
    if (hasWork(false) && !confirm('Clear this conversation? Your notes will stay.')) return;
    resetConversation();
    lastPrompt = '';
  });
  ui.fallbackBtn.addEventListener('click', switchToCpu);
  ui.retryBtn.addEventListener('click', startEngine);
  // The loader blocks the page until the model is ready; Escape must not dismiss it.
  ui.loadPanel.addEventListener('cancel', (event) => event.preventDefault());
  for (const input of [ui.systemPrompt, ui.maxTokens, ui.temperature]) {
    input.addEventListener('input', onSettingsChanged);
  }
  ui.log.addEventListener('scroll', () => {
    followNewest = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 80;
  }, { passive: true });
}

/** Entry point: without a saved setup, go to the device check first; otherwise load the model. */
async function main() {
  $('boot-warning').remove();
  wireLicenseLinks();
  config = loadConfig();
  if (!config) {
    const query = withExperiment('', new URLSearchParams(location.search).get('experiment'));
    location.replace(`index.html${query ? `?${query}` : ''}`);
    return;
  }
  saveConfig(config);
  loadSettings();
  wireModes();
  wireEvents();
  await startEngine();
}

main();
