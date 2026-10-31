// Browser smoke tests (Playwright) against a running preview server; see README "Development checks".
// A fake engine replaces the real ones unless --real-cpu / --real-gpu is given.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ headless: true });
const errors = [];
const fakeEngine = `
class FakeEngine {
  async load() {
    if (window.__failGpu && import.meta.url.includes('webllm')) throw new Error('test GPU unavailable');
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
  interrupt() { window.__interrupted = true; }
  async unload() {}
}
export { FakeEngine as WllamaEngine, FakeEngine as WebLLMEngine };
`;

/** Serves the fake engine instead of the real adapters, so tests control timing and replies. */
async function prepare(context) {
  await context.route('**/engines/*-engine.js', (route) => route.fulfill({ contentType: 'text/javascript', body: fakeEngine }));
}

/** Waits until the model is loaded and Send is enabled. */
async function ready(page) {
  await page.waitForFunction(() => !document.querySelector('#send').disabled);
}

/** Completes the fake reply currently streaming, then waits for the chat to be ready again. */
async function finish(page, text = 'Test reply') {
  await page.evaluate((reply) => window.__finish(reply), text);
  await ready(page);
}

/** Fails if any visible control or text sticks out of the viewport horizontally. */
async function noOverflow(page) {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('button, textarea, select, header, aside, section, h1, h2, h3, p, dd')]
      .filter((element) => element.getClientRects().length)
      .filter((element) => element.getBoundingClientRect().right > width + 1 || element.getBoundingClientRect().left < -1)
      .map((element) => element.id || element.tagName);
  });
  assert.deepEqual(overflow, [], 'controls and text fit viewport');
}

try {
  await mkdir('test-results', { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
  await prepare(context);
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  const userMessages = () => page.locator('#log .msg.user, #log .msg.assistant').count();

  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny`);
  await ready(page);
  assert.equal(await page.locator('#mode-select').inputValue(), '');
  assert.equal(await page.locator('#mode-select option').nth(4).innerText(), '4. Prompt makeover', 'modes are numbered');
  assert.equal(await page.locator('#guide').isVisible(), false, 'free chat shows no instructions');
  assert.match(await page.locator('#system-prompt').inputValue(), /friendly, concise assistant/);
  assert.equal(await page.locator('a[href="CLASSROOM.md"]').count(), 0, 'no teacher guide link');
  assert.equal(await page.locator('select').count(), 1, 'mode is the only selector');
  assert.ok(await page.locator('header .brand img').evaluate((image) => image.complete && image.naturalWidth > 0), 'icon loads');
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'), 'icon.svg');
  await page.screenshot({ path: 'test-results/free-chat.png' });
  assert.equal(await page.locator('#model-status').textContent(), 'Ready');
  assert.match(await page.locator('#setup-badge').textContent(), /SmolLM2 135M \(tiny\)/, 'header shows model name and tier');
  assert.equal(await page.locator('#log .msg').count(), 0, 'ready state lives in the header, not the chat');
  assert.equal(await page.locator('header.top').evaluate((header) => getComputedStyle(header).justifyContent), 'center');
  console.log('PASS free chat start: single mode selector, no instructions, icon, no teacher link, ready in header');

  const helpButtons = page.locator('[data-help]:visible');
  assert.ok(await helpButtons.count() >= 8, 'help for mode, model, chat and all settings');
  for (let index = 0; index < await helpButtons.count(); index += 1) {
    const button = helpButtons.nth(index);
    const box = await button.boundingBox();
    assert.ok(box.width <= 16 && box.height <= 16, 'help buttons are small');
    await button.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#setting-help-dialog').isVisible(), true);
    assert.ok((await page.locator('#setting-help-text').textContent()).length > 80);
    assert.ok((await page.locator('#setting-help-example').textContent()).length > 80);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#setting-help-dialog').isVisible(), false);
    assert.equal(await button.evaluate((element) => document.activeElement === element), true);
  }
  await helpButtons.nth(2).click();
  await page.locator('#close-setting-help').click();
  assert.equal(await page.locator('#setting-help-dialog').isVisible(), false);
  await page.locator('[data-help="chat"]').click();
  const boldWords = await page.locator('#setting-help-text strong').allTextContents();
  for (const word of ['Send', 'Stop', 'Clear', 'Fresh run']) assert.ok(boldWords.includes(word), `${word} is bold`);
  assert.doesNotMatch(await page.locator('#setting-help-dialog').textContent(), /\*\*/);
  await page.screenshot({ path: 'test-results/chat-help.png' });
  await page.keyboard.press('Escape');
  await page.locator('[data-help="model"]').click();
  assert.match(await page.locator('#setting-help-title').textContent(), /SmolLM2 135M \(tiny\)/);
  const facts = await page.locator('#setting-help-facts').textContent();
  for (const fact of ['135 million parameters', 'Mainly English', 'processor', 'Q4_K_M', '2,048 tokens', 'self-hosted', 'Apache License 2.0']) {
    assert.ok(facts.includes(fact), `model facts mention ${fact}`);
  }
  assert.doesNotMatch(facts, /\*\*|undefined/);
  await page.screenshot({ path: 'test-results/model-help.png' });
  await page.keyboard.press('Escape');
  await page.locator('[data-help="chat"]').click();
  assert.equal(await page.locator('#setting-help-facts').isVisible(), false, 'facts only appear for the model');
  await page.keyboard.press('Escape');
  console.log('PASS all settings popups, keyboard activation, Escape, close button and focus return');

  await page.locator('#mode-select').selectOption('shakespeare');
  assert.equal(await page.locator('#guide').isVisible(), true, 'selecting a mode shows instructions immediately');
  await page.locator('[data-help="steps"]').click();
  assert.match(await page.locator('#setting-help-title').textContent(), /Step buttons/);
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#system-prompt').inputValue(), /Shakespeare/);
  assert.equal(await page.locator('#temperature').inputValue(), '0.7');
  assert.equal(new URL(page.url()).searchParams.get('experiment'), 'shakespeare');
  const zoneColors = await page.evaluate(() => ['guide', 'workspace'].length && ['.zone-guide', '.zone-chat', '.zone-settings']
    .map((selector) => getComputedStyle(document.querySelector(selector)).borderTopColor));
  assert.equal(new Set(zoneColors).size, 3, 'instructions, chat and settings have distinct colors');

  await page.getByRole('button', { name: 'Why is the sky blue?' }).click();
  const firstPrompt = await page.locator('#input').inputValue();
  assert.ok(firstPrompt.includes('sky'));
  assert.equal(await page.evaluate(() => window.__calls?.length || 0), 0, 'question buttons never auto-send');
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 1);
  await finish(page);
  await page.locator('.notes-section summary').click();
  await page.locator('#reflection').fill('I predicted a new voice. I noticed different words.');
  await page.getByRole('button', { name: 'Modern voice' }).click();
  assert.match(await page.locator('#system-prompt').inputValue(), /modern assistant/);
  assert.equal(await userMessages(), 0, 'setting buttons start a fresh run');
  assert.equal(await page.locator('#input').inputValue(), firstPrompt, 'the last question is ready to resend');
  assert.equal(await page.getByRole('button', { name: 'Modern voice' }).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('#mode-status').textContent(), /changed/);
  assert.equal(await page.locator('#restore-preset').isVisible(), true);
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 2);
  assert.equal(await page.evaluate(() => window.__calls[1].messages.length), 2);
  assert.match(await page.evaluate(() => window.__calls[1].messages[0].content), /modern assistant/);
  const sentQuestion = await page.evaluate(() => window.__calls[1].messages.at(-1).content);
  assert.ok(sentQuestion.startsWith('You are a concise, modern assistant') && sentQuestion.endsWith(firstPrompt), 'tiny model gets the system prompt mixed into the question');
  assert.equal(await page.locator('#log .msg.user').last().textContent(), firstPrompt, 'chat shows only the question');
  await finish(page, '<script>not executable</script>');
  assert.equal(await page.locator('#log script').count(), 0);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download-notes').click();
  const download = await downloadEvent;
  await download.saveAs('test-results/experiment-notes.txt');
  assert.match(download.suggestedFilename(), /shakespeare/);
  const exportedNotes = await readFile('test-results/experiment-notes.txt', 'utf8');
  assert.ok(exportedNotes.includes('You are William Shakespeare') && exportedNotes.includes('modern assistant'));
  assert.ok(exportedNotes.includes('I predicted'));
  await page.locator('#restore-preset').click();
  assert.match(await page.locator('#system-prompt').inputValue(), /Shakespeare/);
  assert.equal(await page.locator('#restore-preset').isVisible(), false);
  console.log('PASS instant mode presets, question buttons, setting buttons with fresh runs, notes export');

  await page.locator('#mode-select').selectOption('silly-rule');
  assert.match(await page.locator('#system-prompt').inputValue(), /banana/);
  assert.equal(await page.locator('#reflection').inputValue(), '');
  await page.getByRole('button', { name: 'Fruit riddle' }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 3);
  await page.locator('#mode-select').selectOption('design');
  assert.equal(await page.evaluate(() => window.__interrupted), true);
  await finish(page, 'STALE REPLY');
  assert.equal(await userMessages(), 0, 'late reply does not leak into the next mode');
  await page.getByRole('button', { name: 'Cycling team bag' }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 4);
  assert.equal(await page.evaluate(() => window.__calls[3].messages.length), 2);
  await page.locator('#clear').click();
  await page.evaluate(() => window.__reject());
  await ready(page);
  assert.equal(await userMessages(), 0);
  assert.equal(await page.locator('#error-panel').isVisible(), false);
  console.log('PASS late stream and late failure after mode switch or clear cannot contaminate the next run');

  await page.locator('#mode-select').selectOption('fairness');
  await page.getByRole('button', { name: 'She', exact: true }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 5);
  await finish(page);
  await page.getByRole('button', { name: 'He', exact: true }).click();
  assert.equal(await userMessages(), 0, 'comparison buttons start fresh');
  assert.match(await page.locator('#input').inputValue(), /\bHe is preparing/);
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 6);
  assert.equal(await page.evaluate(() => window.__calls[5].messages.length), 2);
  await finish(page);
  console.log('PASS fresh comparison buttons');

  await page.locator('#mode-select').selectOption('');
  assert.equal(await page.locator('#guide').isVisible(), false);
  assert.match(await page.locator('#system-prompt').inputValue(), /friendly, concise assistant/, 'free chat does not inherit a mode prompt');
  assert.equal(new URL(page.url()).searchParams.has('experiment'), false);
  for (const id of ['shakespeare', 'silly-rule', 'creativity', 'prompt-makeover', 'story', 'design', 'facts', 'fairness', 'languages', 'bug-hunt', 'coach', 'make-it-yours', 'turtle']) {
    await page.locator('#mode-select').selectOption(id);
    assert.match(await page.locator('#mode-status').textContent(), /preset/);
    assert.equal(new URL(page.url()).searchParams.get('experiment'), id);
    assert.ok(await page.locator('#guide-steps .step-action').count() >= 2);
  }
  // In mode 13 (turtle), verify the single-retry harness on invalid output and live student code editing.
  await page.evaluate(() => { window.__calls = []; });
  await page.getByRole('button', { name: 'Blue square' }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 1);
  // First reply has no valid turtle commands -> triggers single automatic retry.
  await page.evaluate(() => window.__finish('Sorry, I wrote prose instead of code.'));
  await page.waitForFunction(() => window.__calls?.length === 2);
  await finish(page, 'COLOR blue REPEAT 4 [ FD 60 RT 90 ]');
  assert.equal(await page.locator('.turtle-sandbox svg line').count(), 6, '2 axes + 4 square sides');
  assert.match(await page.locator('.msg.assistant .meta').last().textContent(), /auto-fixed on retry 1\/1/);
  await page.locator('.turtle-code').fill('COLOR red REPEAT 5 [ FD 70 RT 144 ]');
  await page.locator('.turtle-run').click();
  assert.equal(await page.locator('.turtle-sandbox svg line').count(), 7, '2 axes + 5 star sides after student edit');
  await page.locator('.turtle-sandbox .help-btn').click();
  assert.equal(await page.locator('#setting-help-dialog').isVisible(), true);
  assert.match(await page.locator('#setting-help-title').textContent(), /Turtle syntax/);
  assert.ok(await page.locator('#setting-help-facts dt').count() >= 6, 'turtle syntax facts table shown');
  await page.keyboard.press('Escape');
  await noOverflow(page);

  await page.locator('#restore-defaults').click();
  assert.equal(await page.locator('#mode-select').inputValue(), '');
  assert.equal(await page.locator('#temperature').inputValue(), '0.7');
  await page.locator('#mode-select').selectOption('creativity');
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/classroom-desktop.png' });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await noOverflow(page);
  await page.screenshot({ path: 'test-results/classroom-dark.png' });
  console.log('PASS all modes, return to free chat, default reset and desktop layout');

  await page.emulateMedia({ colorScheme: 'light' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny&experiment=story`);
  await ready(page);
  assert.equal(await page.locator('#guide').isVisible(), true);
  await noOverflow(page);
  await page.locator('[data-help="temperature"]').click();
  await noOverflow(page);
  assert.equal(await page.locator('#setting-help-dialog').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.top >= 0 && bounds.bottom <= innerHeight;
  }), true);
  await page.screenshot({ path: 'test-results/settings-help-mobile.png' });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/classroom-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Hidden door' }).click();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__calls?.length === 1);
  await finish(page);
  console.log('PASS mobile instructions, help popup, responsive controls and keyboard submit');

  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny&experiment=not-real`);
  await ready(page);
  assert.equal(await page.locator('#mode-select').inputValue(), '');
  assert.doesNotMatch(await page.locator('#system-prompt').inputValue(), /co-author/, 'reload in free chat ignores the last mode preset');
  await page.addInitScript(() => { window.__failGpu = true; });
  await page.goto(`${base}/chat.html?engine=webllm&tier=tiny&variant=f16&experiment=facts`);
  await page.locator('#fallback-btn').waitFor({ state: 'visible' });
  await page.locator('#fallback-btn').click();
  await ready(page);
  assert.equal(new URL(page.url()).searchParams.get('experiment'), 'facts');
  assert.equal(new URL(page.url()).searchParams.get('engine'), 'wllama');
  assert.match(await page.locator('#change-setup').getAttribute('href'), /experiment=facts/);
  console.log('PASS invalid IDs and activity preserved during GPU-to-CPU fallback');

  const stateContext = await browser.newContext();
  await prepare(stateContext);
  const statePage = await stateContext.newPage();
  statePage.on('pageerror', (error) => errors.push(error.message));
  await statePage.addInitScript(() => { window.__holdLoad = true; });
  await statePage.goto(`${base}/chat.html?engine=wllama&tier=tiny&experiment=shakespeare`);
  await statePage.waitForFunction(() => document.querySelector('#load-panel').open);
  assert.equal(await statePage.locator('#model-status').textContent(), 'Loading…');
  assert.equal(await statePage.evaluate(() => document.querySelector('#workspace').matches(':modal') || document.querySelector('#load-panel').matches(':modal')), true, 'loader is a modal overlay');
  await statePage.keyboard.press('Escape');
  assert.equal(await statePage.evaluate(() => document.querySelector('#load-panel').open), true, 'Escape cannot dismiss the loader');
  await assert.rejects(statePage.locator('#mode-select').click({ timeout: 1000 }), 'page behind the loader is inaccessible');
  await statePage.screenshot({ path: 'test-results/loading-overlay.png' });
  assert.equal(await statePage.locator('#load-panel small').evaluate((note) =>
    note.getClientRects().length === 1 && note.getBoundingClientRect().height < parseFloat(getComputedStyle(note).fontSize) * 2), true,
  'loader note fits on one line');
  const iconPage = await stateContext.newPage();
  await iconPage.setViewportSize({ width: 192, height: 192 });
  await iconPage.goto(`${base}/icon.svg`);
  const blinkAnimations = await iconPage.evaluate(() => {
    const animations = document.getAnimations();
    // 0.8% of the 11 s cycle is the eyes' first closed frame.
    for (const animation of animations) { animation.pause(); animation.currentTime = 88; }
    return animations.length;
  });
  assert.ok(blinkAnimations >= 3, 'icon has blink and twinkle animations');
  await iconPage.screenshot({ path: 'test-results/icon-blink.png' });
  await iconPage.close();
  await statePage.evaluate(() => window.__releaseLoad());
  await ready(statePage);
  assert.equal(await statePage.evaluate(() => document.querySelector('#load-panel').open), false);
  assert.equal(await statePage.locator('#model-status').textContent(), 'Ready');

  await statePage.addInitScript(() => { window.__holdLoad = false; window.__failLoad = true; });
  await statePage.reload();
  await statePage.locator('#error-panel').waitFor({ state: 'visible' });
  assert.equal(await statePage.locator('#model-status').textContent(), 'Not available');
  assert.equal(await statePage.locator('#error-title').textContent(), 'No model available');
  for (const selector of ['#input', '#send', '#fresh-run', '#guide-steps .step-action >> nth=0']) {
    assert.equal(await statePage.locator(selector).isDisabled(), true, `${selector} disabled without a model`);
  }
  await statePage.locator('#mode-select').selectOption('facts');
  assert.equal(await statePage.locator('#guide-steps .step-action').first().isDisabled(), true);
  assert.equal(await statePage.locator('#error-panel').isVisible(), true, 'mode change keeps the no-model message');
  await statePage.screenshot({ path: 'test-results/no-model.png' });
  await statePage.evaluate(() => { window.__failLoad = false; });
  await statePage.locator('#retry-btn').click();
  await ready(statePage);
  assert.equal(await statePage.locator('#error-panel').isVisible(), false);
  assert.equal(await statePage.locator('#guide-steps .step-action').first().isDisabled(), false);
  await stateContext.close();
  console.log('PASS blocking loading overlay, header status, no-model disabled state and retry');

  const coldContext = await browser.newContext();
  await prepare(coldContext);
  const cold = await coldContext.newPage();
  await cold.goto(`${base}/chat.html?experiment=creativity`);
  await cold.waitForURL('**/index.html?experiment=creativity');
  await cold.locator('#go-now').waitFor({ state: 'visible' });
  await cold.keyboard.press('Shift');
  assert.equal(await cold.locator('#countdown-text').innerText(), 'Paused.', 'a key press pauses the countdown');
  await cold.locator('#go-now').click();
  await cold.waitForURL('**/chat.html?**');
  await ready(cold);
  assert.equal(new URL(cold.url()).searchParams.get('experiment'), 'creativity');
  assert.equal(await cold.locator('#temperature').inputValue(), '0.2');
  console.log('PASS cold-start activity link through device check');
  await cold.goto(`${base}/licenses.html`);
  await cold.locator('#licenses-page h3').first().waitFor();
  assert.match(await cold.locator('#licenses-page').innerText(), /Tiny Thinker\s+Created by Andreas Schiffler/);
  assert.equal(await cold.locator('#licenses-page a[href="https://github.com/ferzkopp/tiny-thinker"]').count(), 1);
  await cold.screenshot({ path: 'test-results/licenses.png' });
  console.log('PASS licenses page credits the author and links the GitHub repository');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  await coldContext.close();
  await context.close();

  const realEngines = [
    ...(process.argv.includes('--real-cpu') ? ['wllama'] : []),
    ...(process.argv.includes('--real-gpu') ? ['webllm'] : []),
  ];
  for (const realEngine of realEngines) {
    const realContext = await browser.newContext();
    const real = await realContext.newPage();
    const external = new Set();
    const uploads = [];
    real.on('request', (request) => {
      if (!request.url().startsWith(base) && request.url().startsWith('http')) external.add(new URL(request.url()).hostname);
      if (request.postData()) uploads.push(request.url());
    });
    let variant = '';
    if (realEngine === 'webllm') {
      await real.goto(`${base}/index.html?manual=1`);
      const gpu = await real.evaluate(async () => {
        const adapter = await navigator.gpu?.requestAdapter();
        return { available: Boolean(adapter), f16: Boolean(adapter?.features.has('shader-f16')) };
      });
      if (!gpu.available) {
        console.log('SKIP real WebGPU inference: browser has no usable GPU adapter');
        await realContext.close();
        continue;
      }
      variant = `&variant=${gpu.f16 ? 'f16' : 'f32'}`;
    }
    await real.goto(`${base}/chat.html?engine=${realEngine}&tier=tiny${variant}&experiment=shakespeare`);
    await real.waitForFunction(() => !document.querySelector('#send').disabled || !document.querySelector('#error-panel').classList.contains('hidden'), null, { timeout: 180000 });
    assert.equal(await real.locator('#error-panel').isVisible(), false, await real.locator('#error-text').textContent());
    await real.locator('#max-tokens').fill('32');
    await real.locator('#input').fill('Say hello in one sentence.');
    await real.locator('#send').click();
    await real.waitForFunction(() => !document.querySelector('#send').disabled, null, { timeout: 180000 });
    assert.ok((await real.locator('#log .assistant').textContent()).trim().length);
    assert.deepEqual(uploads, [], 'inference does not upload request bodies');
    console.log(`PASS real ${realEngine} inference; external asset hosts: ${[...external].join(', ')}`);
    await realContext.close();
  }
} finally {
  await browser.close();
}