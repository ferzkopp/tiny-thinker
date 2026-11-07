import assert from 'node:assert/strict';
import { EXPERIMENTS } from '../js/experiments.js';

const defaultBase = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';

/** Delayed fake engine used to test chat behavior without downloading or running model weights. */
export const fakeEngineSource = `
class FakeEngine {
  async load(source, onProgress, options) {
    window.__loads = (window.__loads || 0) + 1;
    window.__loadedModel = { source, options };
    if (window.__failGpu && import.meta.url.includes('webllm')) throw new Error('test GPU unavailable');
    if (window.__failQuota) throw new DOMException('Quota exceeded', 'QuotaExceededError');
    if (window.__failLoad) throw new Error('test model missing');
    if (window.__holdLoad) await new Promise((resolve) => { window.__releaseLoad = resolve; });
    return { detail: 'test engine' };
  }
  chat(messages, settings, onToken) {
    window.__calls ||= [];
    window.__calls.push({ messages, settings });
    return new Promise((resolve, reject) => {
      window.__finish = (text = 'Test reply') => { onToken(text); resolve({ text, finishReason: 'stop' }); };
      window.__reject = () => reject(new Error('late test failure'));
      onToken('Working...');
    });
  }
  interrupt() { window.__interrupted = true; window.__reject?.(); }
  async unload() { window.__unloads = (window.__unloads || 0) + 1; }
}
export { FakeEngine as WllamaEngine, FakeEngine as WebLLMEngine };
`;

/** Marks the first-run and experiment tips as finished for feature-focused tests. */
export async function skipTour(context, base = defaultBase) {
  await context.addCookies([
    { name: 'tinythinker_tour_v2', value: '6', url: base },
    { name: 'tinythinker_welcome', value: '1', url: base },
  ]);
  await context.addInitScript((hints) => {
    if (!localStorage.getItem('tinythinker.experiment-hints')) {
      localStorage.setItem('tinythinker.experiment-hints', JSON.stringify(hints));
    }
  }, EXPERIMENTS.filter((activity) => activity.hint).map((activity) => `${activity.id}@${activity.hint.version || 1}`));
}

/** Routes model engines to the fake engine and optionally leaves the tour active. */
export async function prepare(context, base = defaultBase, options = {}) {
  if (typeof base !== 'string') {
    options = base;
    base = defaultBase;
  }
  const { tour = false } = options;
  await context.route(/\/engines\/[^/?]+-engine\.js(?:\?.*)?$/, (route) => route.fulfill({
    contentType: 'text/javascript', body: fakeEngineSource,
  }));
  if (!tour) await skipTour(context, base);
}

/** Waits until Send is enabled. */
export async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('#send').disabled);
}

/** Completes the current streamed reply and waits until Send is enabled again. */
export async function finish(page, text = 'Test reply') {
  await page.evaluate((reply) => window.__finish(reply), text);
  await ready(page);
}

/** Chooses an experiment or free chat while preserving the loaded engine. */
export async function chooseExperiment(page, id) {
  const before = await page.evaluate(() => ({ loads: window.__loads, document: performance.timeOrigin }));
  await page.locator('#journey-experiments').click();
  if (await page.locator('#leave-confirm').isVisible()) await page.locator('#leave-continue').click();
  await page.locator('#experiment-picker').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#change-setup').isVisible(), true, 'embedded picker offers Change setup');
  assert.equal(await page.locator('#change-setup').getAttribute('href'), 'index.html?manual=1', 'Change setup opens manual setup');
  assert.match(await page.locator('#setup-text').textContent(), /running on your/);
  assert.equal(await page.locator('.setup-summary').evaluate((model) => Boolean(document.querySelector('.free-chat-panel').compareDocumentPosition(model) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'embedded model details follow activities and free chat');
  assert.equal(await page.getByRole('button', { name: 'Keep chatting', exact: true }).count(), 0, 'picker has no obsolete return action');
  if (id) await page.locator(`.experiment-card[href*="experiment=${id}"]`).click();
  else await page.locator('#free-chat').click();
  await page.waitForURL('**/chat.html?**');
  await ready(page);
  assert.equal(await page.locator('#experiment-picker').isVisible(), false, 'selection closes the picker');
  assert.deepEqual(await page.evaluate(() => ({ loads: window.__loads, document: performance.timeOrigin })), before,
    'switching experiments retains the document and loaded engine');
  assert.equal(await page.locator('#load-panel').evaluate((dialog) => dialog.open), false, 'switching does not reopen the loader');
  await page.evaluate(() => { window.__calls = []; });
}

/** Fails if visible controls or text stick out of the viewport horizontally. */
export async function noOverflow(page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('button, textarea, select, header, aside, section, h1, h2, h3, p, dd')]
      .filter((element) => element.getClientRects().length)
      .filter((element) => element.getBoundingClientRect().right > width + 1 || element.getBoundingClientRect().left < -1)
      .map((element) => element.id || element.tagName);
  });
  assert.deepEqual(overflow, [], 'controls and text fit viewport');
  const navigationOverflow = await page.locator('.journey li:visible').evaluateAll((items) => items.flatMap((item) => {
    const bounds = item.getBoundingClientRect();
    const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT);
    const problems = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.textContent.trim() || node.parentElement.closest('.journey-num, .help-btn')) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects()) {
        if (rect.left < bounds.left - 1 || rect.right > bounds.right + 1) problems.push(node.textContent.trim());
      }
      for (const match of node.textContent.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        if (range.getClientRects().length > 1) problems.push(`${match[0]} (split word)`);
      }
    }
    return problems;
  }));
  assert.deepEqual(navigationOverflow, [], 'navigation labels fit their columns and words stay readable');
}
