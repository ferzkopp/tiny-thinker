// First-run tips: a few popups with an arrow that point at the next thing to click, spread over the
// setup, experiment and chat pages. A cookie remembers the last tip seen, so they only appear once.
import { el } from './dom.js?v=1.4';
import { resetExperimentProgress } from './experiments.js?v=1.4';

const COOKIE = 'tinythinker_tour_v2';
const WELCOME_COOKIE = 'tinythinker_welcome';
const HINTS_KEY = 'tinythinker.experiment-hints';
export const TOUR_LENGTH = 6;
const GAP = 12;

const pageUrl = new URL(location.href);
if (pageUrl.searchParams.get('resetCookies') === '1') {
  const paths = new Set(['/', location.pathname.replace(/[^/]*$/, '') || '/']);
  for (const name of [COOKIE, 'tinythinker_tour', WELCOME_COOKIE]) {
    for (const path of paths) {
      document.cookie = `${name}=; max-age=0; path=${path}; SameSite=Lax`;
    }
  }
  resetExperimentProgress();
  try { localStorage.removeItem(HINTS_KEY); } catch { /* storage unavailable */ }
  pageUrl.searchParams.delete('resetCookies');
  history.replaceState(history.state, '', pageUrl);
}

/** Returns the highest tip number already seen (0 = none, TOUR_LENGTH = finished or skipped).
 * @returns {number} Progress clamped to 0 through TOUR_LENGTH.
 */
export function tourProgress() {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)`));
  if (match) return Math.min(TOUR_LENGTH, Number(match[1]));
  const previous = document.cookie.match(/(?:^|;\s*)tinythinker_tour=(\d+)/);
  return previous ? Math.min(TOUR_LENGTH, Number(previous[1]) ? Number(previous[1]) + 1 : 0) : 0;
}

/** Saves numbered-tour progress without moving a value backwards or outside the final range.
 * @param {number} step Highest numbered tip that is complete.
 */
function saveProgress(step) {
  if (step <= tourProgress() || step > TOUR_LENGTH) return;
  const path = location.pathname.replace(/[^/]*$/, '') || '/';
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${step}; max-age=${365 * 24 * 3600}; path=${path}; SameSite=Lax${secure}`;
}

/** Reads hint keys, migrating the old unversioned format to `<experiment>@1`. */
function seenHints() {
  try {
    const list = JSON.parse(localStorage.getItem(HINTS_KEY) || '[]');
    if (!Array.isArray(list)) return [];
    const normalized = [...new Set(list
      .filter((key) => typeof key === 'string')
      .map((key) => key.includes('@') ? key : `${key}@1`))];
    if (JSON.stringify(normalized) !== JSON.stringify(list)) {
      localStorage.setItem(HINTS_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return [];
  }
}

/** Checks whether a versioned once-only hint has already been acknowledged.
 * @param {string} key Versioned hint key.
 * @returns {boolean} True if the hint was already seen.
 */
export function hintSeen(key) {
  return seenHints().includes(key);
}

/** Adds one versioned hint key to local storage.
 * @param {string} key Versioned experiment hint key, for example `shakespeare@1`.
 */
function markHintSeen(key) {
  try {
    localStorage.setItem(HINTS_KEY, JSON.stringify([...new Set([...seenHints(), key])]));
  } catch { /* storage unavailable: the tip shows again next time */ }
}

/** Opens the first-visit welcome dialog and remembers that it was dismissed.
 * @param {HTMLDialogElement} dialog Welcome dialog element to open.
 * @param {HTMLButtonElement} button Dismiss button inside the dialog.
 * @returns {Promise<void>} Resolves after the dialog closes.
 */
export async function showWelcome(dialog, button) {
  if (document.cookie.split(';').some((cookie) => cookie.trim() === `${WELCOME_COOKIE}=1`)) return;
  const previousFocus = document.activeElement;
  await new Promise((resolve) => {
    const dismiss = () => dialog.close();
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      dismiss();
    }, { once: true });
    button.addEventListener('click', dismiss, { once: true });
    dialog.addEventListener('close', () => {
      const path = location.pathname.replace(/[^/]*$/, '') || '/';
      const secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${WELCOME_COOKIE}=1; max-age=${365 * 24 * 3600}; path=${path}; SameSite=Lax${secure}`;
      previousFocus?.focus();
      resolve();
    }, { once: true });
    dialog.showModal();
  });
}

/**
 * Shows this page's tips one after another, skipping tips already seen.
 * @param {{step: number, target: () => Element|null, title: string|Function, text: string|Function, side?: 'right'|'above'|'sidebar'|'intro'|'flow', once?: string}[]} steps
 *   `step` is the tip's number in the whole tour; `target` returns the element the arrow points at.
 *   Title and text may be functions, evaluated when the tip appears. `side: 'right'` puts the tip beside
 *   its target when there is room; otherwise tips go below (or above) it. 'sidebar' uses the setup page's left column.
 *   A tip with `once` is an extra experiment tip after the numbered ones: it is remembered under that key, not in the cookie.
 * @param {{onFinish?: (tour: object) => void}} [options] `onFinish` runs whenever no tip is left, e.g. to add an experiment tip.
 * @returns {{complete(step: number): void, hide(): void, add(tip: object): void, refreshOnce(): void}}
 *   complete() moves on when the student did what a tip asked; hide() tucks the current tip away until the next
 *   complete(); add() queues a tip; refreshOnce() drops queued once-only tips and asks onFinish for current ones.
 */
export function startTour(steps, { onFinish } = {}) {
  let queue = steps.filter((item) => item.step > tourProgress());
  let current = null;
  let target = null;
  let frame = 0;

  const count = el('p', { className: 'tour-count' });
  const title = el('h2', { className: 'tour-title', id: 'tour-title' });
  const text = el('p', { className: 'tour-text', id: 'tour-text' });
  const skip = el('button', { type: 'button', className: 'link-button tour-skip', textContent: 'Skip tips' });
  const next = el('button', { type: 'button', className: 'primary tour-next' });
  const arrow = el('span', { className: 'tour-arrow' });
  const box = el('div', { className: 'tour hidden' }, arrow, count, title, text, el('div', { className: 'tour-actions' }, skip, next));
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'false');
  box.setAttribute('aria-live', 'polite');
  box.setAttribute('aria-labelledby', 'tour-title');
  box.setAttribute('aria-describedby', 'tour-text');
  document.body.append(box);

  /** Removes the highlighted-tour outline from the previous target. */
  function unmark() {
    target?.classList.remove('tour-target');
    target = null;
  }

  let watching = false;
  let observer = null;

/** Schedules a tooltip reposition after scrolling or resizing.
   * @param {Event|undefined} event Resize or scroll event, if triggered by a browser event.
   */
  function schedulePlace(event) {
    if (event?.type === 'resize' && !box.classList.contains('tour-sidebar')) {
      current?.target()?.scrollIntoView?.({ block: 'center' });
    }
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  }

/** Starts or stops layout listeners and MutationObserver repositioning.
   * @param {boolean} on True to watch for changes, false to remove listeners.
   */
  function watchLayout(on) {
    if (on === watching) return;
    watching = on;
    if (on) {
      window.addEventListener('resize', schedulePlace, { passive: true });
      document.addEventListener('scroll', schedulePlace, { capture: true, passive: true });
      observer = new MutationObserver(schedulePlace);
      observer.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['class', 'hidden', 'open'] });
    } else {
      window.removeEventListener('resize', schedulePlace);
      document.removeEventListener('scroll', schedulePlace, true);
      observer?.disconnect();
      observer = null;
      cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  /** Positions the tour tooltip beside or above/below its current target. */
  function place() {
    if (!current || box.classList.contains('hidden')) return;
    const found = current.target();
    if (found !== target) {
      unmark();
      target = found;
      target?.classList.add('tour-target');
    }
    const rect = target?.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      box.style.visibility = 'hidden';
      return;
    }
    box.style.visibility = '';
    if (current.side === 'flow') {
      box.dataset.side = 'above';
      arrow.style.top = '';
      arrow.style.left = `${Math.max(14, Math.min(box.offsetWidth - 14, rect.left + rect.width / 2 - box.getBoundingClientRect().left - box.clientLeft))}px`;
      return;
    }
    if (current.side === 'intro') {
      box.dataset.side = 'above';
      arrow.style.top = '';
      arrow.style.left = `${Math.max(14, Math.min(box.offsetWidth - 14, rect.left + rect.width / 2 - box.getBoundingClientRect().left))}px`;
      return;
    }
    if (current.side === 'sidebar') {
      const host = document.querySelector(document.querySelector('#override').classList.contains('hidden') ? '.setup-recommendation-sidebar' : '.setup-picker-sidebar');
      if (box.parentElement !== host) host.append(box);
      const sidebar = box.parentElement;
      const beside = getComputedStyle(document.querySelector('.setup-page')).gridTemplateColumns.split(' ').length > 1;
      const preceding = box.previousElementSibling;
      const start = preceding ? preceding.getBoundingClientRect().bottom + parseFloat(getComputedStyle(preceding).marginBottom) : sidebar.getBoundingClientRect().top;
      box.style.marginTop = beside ? `${Math.max(0, rect.top + rect.height / 2 - start - box.offsetHeight / 2)}px` : '';
      box.dataset.side = 'left';
      arrow.style.left = '';
      arrow.style.top = `${Math.max(14, Math.min(box.offsetHeight - 14, rect.top + rect.height / 2 - box.getBoundingClientRect().top - box.clientTop))}px`;
      return;
    }
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const viewWidth = document.documentElement.clientWidth;
    let side = innerHeight - rect.bottom >= height + GAP || rect.top < height + GAP ? 'below' : 'above';
    if (current.side === 'above' && rect.top >= height + GAP) side = 'above';
    if (current.side === 'right' && viewWidth - rect.right >= width + GAP + 8) side = 'right';
    let left;
    let top;
    if (side === 'right') {
      left = rect.right + GAP;
      top = Math.max(8, Math.min(rect.top + rect.height / 2 - 28, innerHeight - height - 8));
      arrow.style.left = '';
      arrow.style.top = `${Math.min(Math.max(14, rect.top + rect.height / 2 - top), height - 14)}px`;
    } else {
      left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), viewWidth - width - 8);
      top = Math.max(8, Math.min(side === 'below' ? rect.bottom + GAP : rect.top - height - GAP, innerHeight - height - 8));
      arrow.style.top = '';
      arrow.style.left = `${Math.min(Math.max(14, rect.left + rect.width / 2 - left - box.clientLeft), width - 14)}px`;
    }
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.dataset.side = side;
  }

/** Shows the next queued tip and prepares its target highlight and placement. */
  function show() {
    current = queue.shift() || null;
    if (!current) {
      stop();
      onFinish?.(api);
      return;
    }
    count.textContent = current.once ? 'Experiment tip' : `Tip ${current.step} of ${TOUR_LENGTH}`;
    title.textContent = typeof current.title === 'function' ? current.title() : current.title;
    text.textContent = typeof current.text === 'function' ? current.text() : current.text;
    next.textContent = current.step === TOUR_LENGTH ? 'Done' : 'Got it';
    skip.classList.toggle('hidden', Boolean(current.once));
    const sidebar = current.side === 'sidebar' || current.side === 'intro' || current.side === 'flow';
    box.classList.toggle('tour-sidebar', sidebar);
    box.classList.toggle('tour-intro', current.side === 'intro');
    box.classList.toggle('tour-flow', current.side === 'flow');
    box.style.marginTop = '';
    box.style.left = '';
    box.style.top = '';
    const setup = document.querySelector('.setup-page');
    if (sidebar && setup) {
      if (current.side === 'flow') setup.querySelector('.setup-content').insertBefore(box, document.querySelector('#result'));
      else if (current.side === 'intro') setup.prepend(box);
      else setup.querySelector('.setup-recommendation-sidebar').prepend(box);
      setup.classList.add('setup-tour-active');
    }
    box.classList.remove('hidden');
    if (!sidebar) current.target()?.scrollIntoView?.({ block: 'center' });
    watchLayout(true);
    place();
  }

/** Hides and detaches the current tip while cleaning layout watchers and target styles. */
  function stop() {
    watchLayout(false);
    unmark();
    current = null;
    box.classList.add('hidden');
    document.querySelector('.setup-page')?.classList.remove('setup-tour-active');
  }


/** Completes a numbered or once-only tip and advances to the next queued tip.
   * @param {number} step Step number or experiment-tip offset being completed.
   */
  function complete(step) {
    if (current?.once && current.step === step) markHintSeen(current.once);
    else saveProgress(step);
    queue = queue.filter((item) => item.step > step);
    if (current && current.step > step) {
      box.classList.remove('hidden');
      return;
    }
    stop();
    show();
  }

  next.addEventListener('click', () => complete(current.step));
  skip.addEventListener('click', () => complete(TOUR_LENGTH));

  const api = {
    complete,
    hide() {
      box.classList.add('hidden');
      document.querySelector('.setup-page')?.classList.remove('setup-tour-active');
      unmark();
    },
    add(tip) {
      if (tip.once && (hintSeen(tip.once) || current?.once === tip.once || queue.some((item) => item.once === tip.once))) return;
      queue.push(tip);
      if (!current) show();
    },
    refreshOnce() {
      queue = queue.filter((item) => !item.once);
      if (!current || current.once) {
        stop();
        show();
      }
    },
  };
  show();
  return api;
}
