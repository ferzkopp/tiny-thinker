// First-run tips: a few popups with an arrow that point at the next thing to click, spread over the
// setup, experiment and chat pages. A cookie remembers the last tip seen, so they only appear once.
import { el } from './dom.js?v=1.1';
import { resetExperimentProgress } from './experiments.js?v=1.1';

const COOKIE = 'tinythinker_tour_v2';
export const TOUR_LENGTH = 6;
const GAP = 12;

const pageUrl = new URL(location.href);
if (pageUrl.searchParams.get('resetCookies') === '1') {
  const paths = new Set(['/', location.pathname.replace(/[^/]*$/, '') || '/']);
  for (const name of [COOKIE, 'tinythinker_tour']) {
    for (const path of paths) {
      document.cookie = `${name}=; max-age=0; path=${path}; SameSite=Lax`;
    }
  }
  resetExperimentProgress();
  pageUrl.searchParams.delete('resetCookies');
  history.replaceState(history.state, '', pageUrl);
}

/** Highest tip number already seen (0 = none, TOUR_LENGTH = finished or skipped). */
export function tourProgress() {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=(\\d+)`));
  if (match) return Math.min(TOUR_LENGTH, Number(match[1]));
  const previous = document.cookie.match(/(?:^|;\s*)tinythinker_tour=(\d+)/);
  return previous ? Math.min(TOUR_LENGTH, Number(previous[1]) ? Number(previous[1]) + 1 : 0) : 0;
}

/** Stores tour progress for a year, scoped to this site's folder. Never moves backwards. */
function saveProgress(step) {
  if (step <= tourProgress()) return;
  const path = location.pathname.replace(/[^/]*$/, '') || '/';
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${step}; max-age=${365 * 24 * 3600}; path=${path}; SameSite=Lax${secure}`;
}

/**
 * Shows this page's tips one after another, skipping tips already seen.
 * @param {{step: number, target: () => Element|null, title: string|Function, text: string|Function, side?: 'right'|'sidebar'|'intro'}[]} steps
 *   `step` is the tip's number in the whole tour; `target` returns the element the arrow points at.
 *   Title and text may be functions, evaluated when the tip appears. `side: 'right'` puts the tip beside
 *   its target when there is room; otherwise tips go below (or above) it. 'sidebar' uses the setup page's left column.
 * @returns {{complete(step: number): void, hide(): void}} complete() moves on when the student did what a tip asked;
 *   hide() tucks the current tip away until the next complete().
 */
export function startTour(steps) {
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

  function unmark() {
    target?.classList.remove('tour-target');
    target = null;
  }

  let watching = false;
  let observer = null;

  function schedulePlace() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      place();
    });
  }

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

  /** Keeps the box next to its target while the page scrolls or reflows; hides it while the target is hidden. */
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
    if (current.side === 'intro') {
      box.dataset.side = 'above';
      arrow.style.top = '';
      arrow.style.left = `${Math.max(14, Math.min(box.offsetWidth - 14, rect.left + rect.width / 2 - box.getBoundingClientRect().left))}px`;
      return;
    }
    if (current.side === 'sidebar') {
      const host = document.querySelector(document.querySelector('#override').classList.contains('hidden') ? '.setup-sidebar' : '.setup-picker-sidebar');
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
      arrow.style.left = `${Math.min(Math.max(14, rect.left + rect.width / 2 - left), width - 14)}px`;
    }
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.dataset.side = side;
  }

  function show() {
    current = queue.shift() || null;
    if (!current) {
      stop();
      return;
    }
    count.textContent = `Tip ${current.step} of ${TOUR_LENGTH}`;
    title.textContent = typeof current.title === 'function' ? current.title() : current.title;
    text.textContent = typeof current.text === 'function' ? current.text() : current.text;
    next.textContent = current.step === TOUR_LENGTH ? 'Done' : 'Got it';
    const sidebar = current.side === 'sidebar' || current.side === 'intro';
    box.classList.toggle('tour-sidebar', sidebar);
    box.classList.toggle('tour-intro', current.side === 'intro');
    box.style.marginTop = '';
    const setup = document.querySelector('.setup-page');
    if (sidebar && setup) {
      if (current.side === 'intro') setup.prepend(box);
      else setup.querySelector('.setup-sidebar').append(box);
      setup.classList.add('setup-tour-active');
    }
    box.classList.remove('hidden');
    if (!sidebar) current.target()?.scrollIntoView?.({ block: 'center' });
    watchLayout(true);
    place();
  }

  function stop() {
    watchLayout(false);
    unmark();
    current = null;
    box.classList.add('hidden');
    document.querySelector('.setup-page')?.classList.remove('setup-tour-active');
  }

  /** Marks tips up to `step` as seen and shows the next one on this page, if any. */
  function complete(step) {
    saveProgress(step);
    queue = queue.filter((item) => item.step > step);
    if (current && current.step > step) {
      box.classList.remove('hidden');
      return;
    }
    stop();
    show();
  }

  next.addEventListener('click', () => complete(current.step));
  skip.addEventListener('click', () => {
    saveProgress(TOUR_LENGTH);
    queue = [];
    stop();
  });

  show();
  return {
    complete,
    hide() {
      box.classList.add('hidden');
      document.querySelector('.setup-page')?.classList.remove('setup-tour-active');
      unmark();
    },
  };
}
