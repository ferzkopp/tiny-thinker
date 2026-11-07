// Browser smoke tests (Playwright) against a running preview server; see README "Development checks".
// A fake engine replaces the real ones unless --real-cpu / --real-gpu is given.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { chooseExperiment, finish, noOverflow, prepare, ready, skipTour } from './browser-smoke-helpers.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ headless: true });
const errors = [];
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
  assert.equal(await page.locator('#mode-select').count(), 0, 'experiment switching uses the picker, not a dropdown');
  assert.match(await page.locator('#journey-experiments').textContent(), /Choose a new experiment/);
  assert.equal(await page.locator('#journey-experiments').evaluate((link) => getComputedStyle(link).backgroundColor), 'rgb(224, 161, 0)', 'experiment action is yellow');
  assert.equal(await page.locator('#guide').isVisible(), false, 'free chat shows no instructions');
  assert.match(await page.locator('#system-prompt').inputValue(), /friendly, concise assistant/);
  assert.equal(await page.locator('a[href$="Classroom.md" i]').count(), 0, 'no teacher guide link');
  assert.equal(await page.locator('select').count(), 0, 'chat header has no selectors');
  assert.ok(await page.locator('header .brand img').evaluate((image) => image.complete && image.naturalWidth > 0), 'icon loads');
  assert.equal(await page.locator('link[rel="icon"]').getAttribute('href'), 'icon.svg');
  await page.screenshot({ path: 'test-results/free-chat.png' });
  assert.equal(await page.locator('#model-status').textContent(), 'Ready');
  assert.match(await page.locator('#setup-badge').textContent(), /SmolLM2 135M \(tiny\)/, 'header shows model name and tier');
  assert.equal(await page.locator('#log .msg').count(), 0, 'ready state lives in the header, not the chat');
  assert.equal(await page.locator('header.top').evaluate((header) => getComputedStyle(header).justifyContent), 'center');
  console.log('PASS free chat start: yellow experiment action, no selector, icon and ready in header');

  const helpButtons = page.locator('[data-help]:visible');
  assert.ok(await helpButtons.count() >= 7, 'help for model, chat and all settings');
  for (let index = 0; index < await helpButtons.count(); index += 1) {
    const button = helpButtons.nth(index);
    const box = await button.boundingBox();
    assert.ok(box.width >= 24 && box.height >= 24, 'help buttons have usable pointer targets');
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

  for (const route of ['index.html?manual=1', 'experiments.html?engine=wllama&tier=tiny', 'licenses.html']) {
    await page.goto(`${base}/${route}`);
    const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true });
    await skipLink.focus();
    assert.ok((await skipLink.boundingBox()).y >= 0, 'skip link becomes visible on focus');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#main').evaluate((element) => document.activeElement === element), true);
  }
  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny`);
  await ready(page);
  await page.getByRole('link', { name: 'Skip to the chat', exact: true }).focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#log').evaluate((element) => document.activeElement === element), true);
  await page.setViewportSize({ width: 360, height: 480 });
  await page.locator('[data-help="model"]').click();
  const helpBody = page.locator('#setting-help-dialog .dialog-body');
  assert.equal(await helpBody.getAttribute('tabindex'), '0');
  await helpBody.focus();
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.querySelector('#setting-help-dialog .dialog-body').scrollTop > 0);
  for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert.equal(await page.evaluate(() => document.querySelector('#workspace').contains(document.activeElement)), false,
      'modal keyboard focus cannot reach background controls');
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-help="model"]').evaluate((element) => document.activeElement === element), true);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`${base}/experiments.html?engine=wllama&tier=tiny`);
  await page.locator('.experiment-card').first().focus();
  assert.equal(await page.locator('.experiment-card').first().evaluate((element) => getComputedStyle(element).transform), 'none');
  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny`);
  await ready(page);
  await page.locator('#input').fill('Accessible streaming status');
  await page.locator('#send').click();
  await page.waitForFunction(() => typeof window.__finish === 'function');
  assert.equal(await page.locator('#log').getAttribute('aria-busy'), 'true');
  assert.equal(await page.locator('.thinking .dot').first().evaluate((element) => getComputedStyle(element).animationName), 'none');
  assert.equal(await page.locator('.load-icon').evaluate((element) => getComputedStyle(element).animationName), 'none');
  await finish(page);
  assert.equal(await page.locator('#log').getAttribute('aria-busy'), null);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  console.log('PASS accessibility: skip links, keyboard-scrolling help, modal focus, reduced motion and live-region busy state');

  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny`);
  await ready(page);
  await chooseExperiment(page, 'shakespeare');
  assert.equal(await page.locator('#guide').isVisible(), true, 'opening an experiment shows its instructions');
  assert.equal(await page.locator('#guide-badge').isVisible(), false, 'visiting an experiment does not earn a badge');
  await page.locator('[data-help="steps"]').click();
  assert.match(await page.locator('#setting-help-title').textContent(), /Step buttons/);
  await page.keyboard.press('Escape');
  assert.match(await page.locator('#system-prompt').inputValue(), /Shakespeare/);
  assert.equal(await page.locator('#temperature').inputValue(), '0.7');
  assert.equal(new URL(page.url()).searchParams.get('experiment'), 'shakespeare');
  const zoneColors = await page.evaluate(() => ['guide', 'workspace'].length && ['.zone-guide', '.zone-chat', '.zone-settings']
    .map((selector) => getComputedStyle(document.querySelector(selector)).borderTopColor));
  assert.equal(new Set(zoneColors).size, 3, 'instructions, chat and settings have distinct colors');

  await page.getByRole('button', { name: 'Rally the crew' }).click();
  const firstPrompt = await page.locator('#input').inputValue();
  assert.ok(firstPrompt.includes('crew'));
  assert.equal(await page.evaluate(() => window.__calls?.length || 0), 0, 'question buttons never auto-send');
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 1);
  assert.match(await page.evaluate(() => window.__calls[0].messages[0].content), /\nNever repeat the question\.$/, 'experiment system prompts discourage question echoes');
  assert.equal(await page.locator('.warmup-note:visible').count(), 1, 'first reply explains model warmup while streaming');
  assert.match(await page.locator('.warmup-note:visible').innerText(), /first reply can take longer/);
  await finish(page);
  assert.equal(await page.locator('.warmup-note:visible').count(), 0, 'completed reply automatically hides the warmup note');
  assert.equal(await page.locator('header #guide-badge').isVisible(), true, 'the first earned badge is visible in the persistent chat header');
  assert.match(await page.locator('#guide-badge').textContent(), /Explorer/);
  assert.equal(await page.locator('#guide-badge').evaluate((badge) => badge.classList.contains('promoted')), false);
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
  assert.equal(await page.locator('.warmup-note:visible').count(), 0, 'fresh runs reuse the warmed model without repeating the note');
  assert.equal(await page.evaluate(() => window.__calls[1].messages.length), 2);
  assert.match(await page.evaluate(() => window.__calls[1].messages[0].content), /modern assistant/);
  const sentQuestion = await page.evaluate(() => window.__calls[1].messages.at(-1).content);
  assert.ok(sentQuestion.startsWith('You are a concise, modern assistant') && sentQuestion.endsWith(firstPrompt), 'tiny model gets the system prompt mixed into the question');
  assert.ok(sentQuestion.includes('\nNever repeat the question.\n\n'), 'tiny-model reinforcement includes the no-repeat instruction after a preset change');
  assert.equal(await page.locator('#log .msg.user').last().textContent(), firstPrompt, 'chat shows only the question');
  await finish(page, '<script>not executable</script>');
  assert.equal(await page.locator('header #guide-badge').isVisible(), true);
  assert.match(await page.locator('#guide-badge').textContent(), /Experimenter/, 'second completed interaction promotes the badge across fresh runs');
  assert.equal(await page.locator('#guide-badge').evaluate((badge) => badge.classList.contains('promoted')), true);
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

  for (let interaction = 3; interaction <= 5; interaction += 1) {
    await page.locator('#input').fill(`Comparison ${interaction}`);
    await page.locator('#send').click();
    await page.waitForFunction((count) => window.__calls?.length === count, interaction);
    await finish(page);
    assert.match(await page.locator('#guide-badge').textContent(), interaction === 5 ? /Investigator/ : /Experimenter/);
    assert.equal(await page.locator('#guide-badge').isVisible(), true);
  }
  await page.locator('#journey-experiments').click();
  await page.locator('#leave-continue').click();
  assert.match(await page.locator('.experiment-card[href*="experiment=shakespeare"] .experiment-badge').textContent(), /Investigator/);
  await page.locator('.experiment-card[href*="experiment=shakespeare"]').click();
  assert.match(await page.locator('#guide-badge').textContent(), /Investigator/, 'returning to an experiment preserves its cumulative badge');

  await chooseExperiment(page, 'silly-rule');
  assert.equal(await page.locator('#guide-badge').isVisible(), false, 'each experiment has separate progress');
  assert.match(await page.locator('#system-prompt').inputValue(), /banana/);
  assert.equal(await page.locator('#reflection').inputValue(), '');
  await page.getByRole('button', { name: 'Fruit riddle' }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 1);
  await chooseExperiment(page, 'design');
  assert.equal(await userMessages(), 0, 'switching experiments does not carry over the previous conversation');
  assert.equal(await page.locator('#guide-badge').isVisible(), false, 'stale replies cannot earn a badge for the new mode');
  await page.getByRole('button', { name: 'Cycling team bag' }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 1);
  assert.equal(await page.evaluate(() => window.__calls[0].messages.length), 2);
  if (!await page.locator('#reflection').isVisible()) await page.locator('.notes-section summary').click();
  await page.locator('#reflection').fill('Keep this note when clearing the conversation.');
  const promptBeforeClear = await page.locator('#system-prompt').inputValue();
  await page.locator('#clear').click();
  assert.equal(await page.locator('#leave-title').textContent(), 'Clear this conversation?');
  assert.equal(await page.locator('#leave-continue').textContent(), 'Clear conversation');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#clear').evaluate((button) => document.activeElement === button), true, 'cancelling Clear restores focus');
  assert.ok(await userMessages() > 0, 'cancelling Clear preserves the conversation');
  await page.locator('#clear').click();
  await page.locator('#leave-continue').click();
  await page.evaluate(() => window.__reject());
  await ready(page);
  assert.equal(await userMessages(), 0);
  assert.equal(await page.locator('#reflection').inputValue(), 'Keep this note when clearing the conversation.');
  assert.equal(await page.locator('#system-prompt').inputValue(), promptBeforeClear, 'Clear keeps the system prompt');
  assert.equal(await page.locator('#error-panel').isVisible(), false);
  console.log('PASS late stream and late failure after mode switch or clear cannot contaminate the next run');

  await chooseExperiment(page, 'fairness');
  await page.getByRole('button', { name: 'She', exact: true }).click();
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 1);
  await finish(page);
  await page.getByRole('button', { name: 'He', exact: true }).click();
  assert.equal(await userMessages(), 0, 'comparison buttons start fresh');
  assert.match(await page.locator('#input').inputValue(), /\bHe is preparing/);
  await page.locator('#send').click();
  await page.waitForFunction(() => window.__calls?.length === 2);
  assert.equal(await page.evaluate(() => window.__calls[1].messages.length), 2);
  await finish(page);
  console.log('PASS fresh comparison buttons');

  await chooseExperiment(page, '');
  assert.equal(await page.locator('#guide').isVisible(), false);
  assert.match(await page.locator('#system-prompt').inputValue(), /friendly, concise assistant/, 'free chat does not inherit a mode prompt');
  assert.equal(new URL(page.url()).searchParams.has('experiment'), false);
  for (const id of ['shakespeare', 'silly-rule', 'creativity', 'prompt-makeover', 'story', 'design', 'facts', 'fairness', 'languages', 'bug-hunt', 'coach', 'make-it-yours', 'turtle']) {
    await chooseExperiment(page, id);
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
  assert.match(await page.evaluate(() => window.__calls[1].messages.at(-1).content), /Rejected program:[\s\S]*Sorry, I wrote prose instead of code\.[\s\S]*Validation error:/);
  const repairedLogo = 'TO SQUARE :SIDE\nREPEAT 4 [ FD :SIDE RT 360/4 ]\nEND\nSETPENCOLOR 1 SETPENSIZE [2 2] SQUARE 60';
  await finish(page, `\`\`\`logo\n${repairedLogo}\n\`\`\`\nUser: This echoed turn was not executed.`);
  assert.equal(await page.locator('.turtle-code').inputValue(), repairedLogo, 'complete procedures survive the model-to-editor boundary');
  assert.doesNotMatch(await page.locator('.msg.assistant').last().textContent(), /This echoed turn was not executed/, 'visible reply matches the extracted program');
  assert.match(await page.locator('#guide-badge').textContent(), /Explorer/);
  assert.equal(await page.locator('#guide-badge').evaluate((badge) => badge.classList.contains('promoted')), false, 'automatic repair does not count as a second student interaction');
  assert.equal(await page.locator('.turtle-sandbox svg line').count(), 6, '2 axes + 4 square sides');
  assert.match(await page.locator('.msg.assistant .meta').last().textContent(), /auto-fixed on retry 1\/1/);
  await page.locator('.turtle-code').fill('CS SETPC [99 0 0] REPEAT 5 [ FD 70 RT 144 ] HT');
  await page.locator('.turtle-run').click();
  await page.waitForFunction(() => document.querySelector('.turtle-status').textContent.startsWith('Drew 5'));
  assert.equal(await page.locator('.turtle-sandbox svg line').count(), 7, '2 axes + 5 star sides after student edit');
  assert.equal(await page.locator('.turtle-cursor').count(), 0, 'HIDETURTLE is honored');
  await page.locator('.turtle-code').fill('REPEAT 2.5 [ FD 10 ]');
  await page.locator('.turtle-run').click();
  await page.waitForFunction(() => document.querySelector('.turtle-status').classList.contains('error'));
  assert.equal(await page.evaluate(() => window.__calls.length), 2, 'invalid editor code reports an error without another model repair');
  await page.locator('.turtle-sandbox .help-btn').click();
  assert.equal(await page.locator('#setting-help-dialog').isVisible(), true);
  assert.match(await page.locator('#setting-help-title').textContent(), /Turtle syntax/);
  assert.ok(await page.locator('#setting-help-facts dt').count() >= 6, 'turtle syntax facts table shown');
  await page.keyboard.press('Escape');
  await noOverflow(page);

  await page.locator('#restore-defaults').click();
  await page.locator('#leave-confirm').waitFor({ state: 'visible' });
  await page.locator('#leave-cancel').click();
  assert.equal(await page.locator('#guide').isVisible(), true, 'cancelling Done preserves the current experiment');
  await page.locator('#restore-defaults').click();
  await page.locator('#leave-continue').click();
  await page.waitForURL('**/index.html?manual=1');
  await page.locator('#override-submit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#override-submit').textContent(), 'Next: choose an experiment', 'Done returns to the start of the setup flow');
  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny`);
  await ready(page);
  assert.equal(await page.locator('#guide').isVisible(), false);
  assert.equal(await page.locator('#temperature').inputValue(), '0.7');
  await chooseExperiment(page, 'creativity');
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

  for (const width of [320, 360]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`${base}/chat.html?engine=wllama&tier=quality&experiment=dinner-party`);
    await ready(page);
    const fontSize = await page.locator('html').evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    await page.addStyleTag({ content: `html { font-size: ${fontSize * 2}px !important; }` });
    await noOverflow(page);
    await page.locator('.journey').screenshot({ path: `test-results/navigation-mobile-enlarged-${width}.png` });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  console.log('PASS enlarged mobile text: navigation labels remain within their columns');

  await page.goto(`${base}/chat.html?engine=wllama&tier=tiny&experiment=not-real`);
  await ready(page);
  assert.equal(await page.locator('#guide').isVisible(), false);
  assert.doesNotMatch(await page.locator('#system-prompt').inputValue(), /co-author/, 'reload in free chat ignores the last mode preset');
  await page.addInitScript(() => { window.__failGpu = true; });
  await page.goto(`${base}/chat.html?engine=webllm&tier=tiny&variant=f16&experiment=facts`);
  await page.locator('#fallback-btn').waitFor({ state: 'visible' });
  await page.locator('#fallback-btn').click();
  await ready(page);
  assert.equal(new URL(page.url()).searchParams.get('experiment'), 'facts');
  assert.equal(new URL(page.url()).searchParams.get('engine'), 'wllama');
  assert.equal(await page.locator('a[href*="index.html"]:visible').count(), 0, 'active chat has no direct setup links');
  assert.match(await page.locator('#journey-experiments').getAttribute('href'), /engine=wllama.*experiment=facts/);
  console.log('PASS invalid IDs and activity preserved during GPU-to-CPU fallback');

  await page.getByRole('button', { name: 'Closest planet' }).click();
  const savedDraft = await page.locator('#input').inputValue();
  await page.locator('#journey-experiments').click();
  assert.equal(await page.locator('#leave-confirm').isVisible(), true);
  assert.equal(await page.locator('#leave-confirm').getAttribute('role'), 'region', 'leave confirmation is non-modal');
  assert.equal(await page.locator('#leave-confirm').evaluate((panel) => document.activeElement === panel), true, 'confirmation receives keyboard focus');
  assert.equal(await page.locator('#input').isEnabled(), true, 'chat remains usable while confirmation is open');
  await page.locator('#leave-cancel').click();
  assert.equal(await page.locator('#leave-confirm').isVisible(), false);
  assert.equal(await page.locator('#input').inputValue(), savedDraft, 'cancelling preserves the draft');
  assert.equal(await page.locator('#journey-experiments').evaluate((link) => document.activeElement === link), true, 'cancelling restores focus');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#leave-confirm').isVisible(), false, 'Escape dismisses the inline confirmation');
  await page.keyboard.press('Enter');
  await page.locator('#leave-continue').click();
  await page.locator('#experiment-picker').waitFor({ state: 'visible' });
  assert.match(await page.locator('#setup-text').textContent(), /running on your processor.*wllama/, 'picker summary reflects GPU-to-CPU fallback');
  await page.locator('.experiment-card').first().waitFor();
  assert.equal(await page.locator('.experiment-card').count(), 14);
  assert.match(await page.locator('.pick-intro').textContent(), /Choose a new experiment/);
  assert.doesNotMatch(await page.locator('.pick-intro').textContent(), /Teachers:|Mode/);
  assert.equal(await page.locator('.pick-intro').evaluate((intro) => getComputedStyle(intro).maxWidth), 'none', 'intro text is not capped before the grid edge');
  assert.equal(await page.locator('.pick-heading').evaluate((band) => {
    const heading = band.getBoundingClientRect();
    const grid = document.querySelector('#experiment-list').getBoundingClientRect();
    return Math.abs(heading.width - grid.width) < 1 && Math.abs(heading.left - grid.left) < 1;
  }), true, 'picker heading aligns with the full grid width');
  assert.equal(await page.locator('.pick-heading').evaluate((band) => getComputedStyle(band).backgroundColor), 'rgb(255, 255, 255)', 'picker heading uses a neutral background rather than yellow tip styling');
  const lastUsedCard = page.locator('.experiment-card[data-last-used="true"]');
  assert.match(await lastUsedCard.innerText(), /Fact detective[\s\S]*Last used/i, 'the experiment you came from is marked');
  assert.equal(await page.locator('.experiment-card[aria-current]').count(), 0, 'last used is history, not the current selection');
  assert.equal(await lastUsedCard.evaluate((card) => getComputedStyle(card).backgroundColor), 'rgb(255, 255, 255)', 'last-used card stays neutral');
  assert.equal(await lastUsedCard.locator('.experiment-current').evaluate((badge) => getComputedStyle(badge).backgroundColor), 'rgb(246, 247, 249)', 'last-used badge is neutral rather than blue');
  assert.equal(await page.locator('.experiment-card:not([data-last-used]):not(:hover):not(:focus-visible)').first().evaluate((card) => getComputedStyle(card).backgroundColor), 'rgb(255, 255, 255)', 'unselected experiments are neutral');
  assert.match(await page.locator('#setup-badge').textContent(), /SmolLM2 135M/);
  await lastUsedCard.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  assert.equal(await lastUsedCard.evaluate((card) => document.activeElement === card), true, 'last-used experiment is in the keyboard tab order');
  assert.equal(await lastUsedCard.evaluate((card) => card.matches(':focus-visible')), true, 'keyboard focus is visible');
  assert.equal(await lastUsedCard.locator('.experiment-current').evaluate((badge) => getComputedStyle(badge).backgroundColor), 'rgb(246, 247, 249)', 'history badge stays neutral when its card is focused');
  await page.keyboard.press('Enter');
  await page.waitForURL('**/chat.html?**');
  await ready(page);
  assert.match(await page.locator('#guide-title').textContent(), /Fact detective/, 'Enter opens the last-used experiment');
  await page.locator('#journey-experiments').click();
  await page.locator('#experiment-picker').waitFor({ state: 'visible' });
  await page.getByRole('link', { name: /^5\. Story co-author/ }).click();
  await page.waitForURL('**/chat.html?**');
  await ready(page);
  assert.equal(new URL(page.url()).searchParams.get('experiment'), 'story');
  assert.match(await page.locator('#guide-title').textContent(), /Story co-author/);
  await page.locator('#journey-experiments').click();
  await page.locator('#experiment-picker').waitFor({ state: 'visible' });
  await page.locator('#free-chat').click();
  await page.waitForURL('**/chat.html?**');
  await ready(page);
  assert.equal(await page.locator('#guide').isVisible(), false, 'free chat from the picker');
  await page.locator('#restore-defaults').click();
  await page.waitForURL('**/index.html?**');
  assert.equal(new URL(page.url()).searchParams.get('manual'), '1');
  assert.equal(new URL(page.url()).searchParams.has('next'), false);
  await page.locator('#override-submit').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#override-submit').textContent(), 'Next: choose an experiment', 'Done restarts setup rather than returning directly to chat');
  assert.ok(await page.locator('#check-reasons li').count() >= 6, 'every check says why it matters');
  console.log('PASS step bar: chat -> experiment picker -> chat, free chat and setup round trip');

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
  await assert.rejects(statePage.locator('#journey-experiments').click({ timeout: 1000 }), 'page behind the loader is inaccessible');
  await statePage.screenshot({ path: 'test-results/loading-overlay.png' });
  assert.equal(await statePage.locator('#load-panel small').evaluate((note) =>
    note.getClientRects().length === 1 && note.getBoundingClientRect().height < parseFloat(getComputedStyle(note).fontSize) * 2), true,
  'loader note fits on one line');
  assert.equal(await statePage.locator('#load-phases li').count(), 4, 'loader explains each loading step');
  assert.match(await statePage.locator('#load-phases li.active').textContent(), /Get the engine/);
  assert.equal(await statePage.locator('#load-lessons .lesson:visible').count(), 4, 'loader shows short loading explanations and experiment/model summaries');
  assert.equal(await statePage.locator('#load-lessons button, #load-lessons details').count(), 0, 'loading information has no game');
  assert.match(await statePage.locator('#load-lessons').textContent(), /Why does loading take time\?[\s\S]*What is a megabyte\?[\s\S]*one million bytes[\s\S]*1,000 kilobytes/);
  assert.match(await statePage.locator('#load-lessons').textContent(), /Shakespeare remix[\s\S]*135 million parameters/, 'content matches the experiment and model');
  assert.equal(await statePage.locator('#load-lessons').evaluate((body) => getComputedStyle(body).overflowY), 'auto', 'loader content scrolls');
  assert.equal(await statePage.locator('#load-panel').evaluate((dialog) => document.activeElement === dialog), true, 'initial focus stays on the loading dialog, not the information panel');
  const infoSize = await statePage.locator('#load-lessons').evaluate((body) => ({
    width: body.getBoundingClientRect().width,
    available: body.parentElement.clientWidth,
  }));
  assert.ok(Math.abs(infoSize.width / infoSize.available - 0.95) < 0.005, 'loading information is 95% of the dialog width');
  assert.equal(await statePage.locator('#load-lessons').evaluate((body) => {
    const style = getComputedStyle(body);
    return parseFloat(style.borderLeftWidth) > 0 && style.borderLeftStyle === 'solid'
      && [style.borderLeft, style.borderRight, style.borderBottom].every((border) => border === style.borderTop);
  }), true, 'loading information has matching yellow borders on all four sides');
  assert.equal(await statePage.locator('#load-lessons').evaluate((body) => getComputedStyle(body).backgroundColor),
    await statePage.locator('#guide').evaluate((guide) => getComputedStyle(guide).backgroundColor), 'loading information uses the instructions colour');
  assert.equal(await statePage.locator('#load-panel').evaluate((dialog) => getComputedStyle(dialog).backgroundColor), 'rgb(255, 255, 255)', 'loading status area is white');
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
  assert.equal(await statePage.locator('#load-phases li.done').count(), 4, 'all loading steps are complete when the model is ready');
  assert.match(await statePage.locator('#load-phases li').last().locator('strong').evaluate((heading) => getComputedStyle(heading, '::before').content), /\u2713/, 'Ready shows a checkmark instead of its step number');

  await statePage.addInitScript(() => { window.__holdLoad = false; window.__failLoad = true; });
  await statePage.reload();
  await statePage.locator('#error-panel').waitFor({ state: 'visible' });
  assert.equal(await statePage.locator('#model-status').textContent(), 'Not available');
  assert.equal(await statePage.locator('#error-title').textContent(), 'No model available');
  for (const selector of ['#input', '#send', '#fresh-run', '#guide-steps .step-action >> nth=0']) {
    assert.equal(await statePage.locator(selector).isDisabled(), true, `${selector} disabled without a model`);
  }
  await statePage.locator('#journey-experiments').click();
  await statePage.locator('#experiment-picker').waitFor({ state: 'visible' });
  await statePage.locator('.experiment-card[href*="experiment=facts"]').click();
  await statePage.waitForURL('**/chat.html?**');
  await statePage.locator('#error-panel').waitFor({ state: 'visible' });
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

  const quotaContext = await browser.newContext();
  await prepare(quotaContext);
  await quotaContext.addInitScript(() => { window.__failQuota = true; });
  const quotaPage = await quotaContext.newPage();
  quotaPage.on('pageerror', (error) => errors.push(error.message));
  await quotaPage.goto(`${base}/chat.html?engine=webllm&tier=quality&variant=f16`);
  await quotaPage.locator('#error-panel').waitFor({ state: 'visible' });
  assert.match(await quotaPage.locator('#error-text').innerText(), /storage limit[\s\S]*not necessarily[\s\S]*GPU memory/);
  assert.match(await quotaPage.locator('#error-text').innerText(), /Use Done to return to Set up/);
  assert.equal(await quotaPage.evaluate(() => window.__unloads), 1, 'failed model resources are released');
  assert.equal(await quotaPage.locator('#debug-info').evaluate((details) => details.open), false, 'debug collection is opt-in');
  assert.equal(await quotaPage.locator('#debug-report').textContent(), '', 'no report collected before opening debug info');
  await quotaPage.locator('#system-prompt').fill('PRIVATE-SYSTEM-PROMPT-SENTINEL');
  await quotaPage.locator('#debug-info summary').click();
  await quotaPage.waitForFunction(() => document.querySelector('#debug-report').textContent.startsWith('{'));
  const quotaReportText = await quotaPage.locator('#debug-report').textContent();
  const quotaReport = JSON.parse(quotaReportText);
  assert.equal(quotaReport.failure.name, 'QuotaExceededError');
  assert.equal(quotaReport.failure.setup.tier, 'quality');
  assert.ok(quotaReport.browser.userAgent);
  assert.ok(quotaReport.capabilities.webgpu);
  assert.ok(Object.hasOwn(quotaReport.storage, 'quotaBytes'));
  assert.equal(quotaReportText.includes('PRIVATE-SYSTEM-PROMPT-SENTINEL'), false, 'debug report excludes system prompts');
  for (const key of ['history', 'turns', 'notes', 'systemPrompt']) assert.equal(Object.hasOwn(quotaReport, key), false);
  const debugDownload = quotaPage.waitForEvent('download');
  await quotaPage.locator('#download-debug').click();
  assert.equal((await debugDownload).suggestedFilename(), 'tiny-thinker-debug.json');
  await quotaPage.setViewportSize({ width: 375, height: 812 });
  assert.equal(await quotaPage.locator('#debug-report').getAttribute('tabindex'), '0');
  assert.equal(await quotaPage.locator('#debug-report').getAttribute('aria-label'), 'Debug report');
  await quotaPage.locator('#debug-report').focus();
  await quotaPage.keyboard.press('PageDown');
  await quotaPage.waitForFunction(() => document.querySelector('#debug-report').scrollTop > 0);
  await noOverflow(quotaPage);
  await quotaPage.screenshot({ path: 'test-results/quota-debug-mobile.png' });
  await quotaPage.evaluate(() => { window.__failQuota = false; });
  await quotaPage.locator('#retry-btn').click();
  await ready(quotaPage);
  assert.equal(await quotaPage.locator('#error-panel').isVisible(), false, 'retry recovers from the quota simulation');
  assert.equal(await quotaPage.locator('#debug-report').textContent(), '', 'retry clears old diagnostics');
  await quotaContext.close();
  console.log('PASS quota-specific recovery, failed-engine cleanup and optional private debug download');

  const tinyllamaContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await prepare(tinyllamaContext);
  const tinyllamaPage = await tinyllamaContext.newPage();
  tinyllamaPage.on('pageerror', (error) => errors.push(error.message));
  tinyllamaPage.on('dialog', (dialog) => dialog.accept());
  await tinyllamaPage.goto(`${base}/index.html?manual=1`);
  await tinyllamaPage.locator('#override').waitFor({ state: 'visible' });
  await tinyllamaPage.locator('input[name="engine"][value="wllama"]').check();
  await tinyllamaPage.locator('input[name="tier"][value="balanced"]').check();
  assert.match(await tinyllamaPage.locator('#model-options').innerText(), /TinyLlama 1\.1B/);
  await noOverflow(tinyllamaPage);
  await tinyllamaPage.screenshot({ path: 'test-results/tinyllama-picker.png', fullPage: true });
  await tinyllamaPage.locator('#override-submit').click();
  await tinyllamaPage.waitForURL('**/experiments.html?**');
  assert.equal(new URL(tinyllamaPage.url()).searchParams.get('tier'), 'balanced');
  await tinyllamaPage.locator('#free-chat').click();
  await ready(tinyllamaPage);
  assert.equal(await tinyllamaPage.evaluate(() => window.__loadedModel.options.contextSize), 2048);
  assert.match(await tinyllamaPage.evaluate(() => window.__loadedModel.source.file), /tinyllama.*Q4_K_M/);
  for (const variant of ['f16', 'f32']) {
    await tinyllamaPage.goto(`${base}/chat.html?engine=webllm&tier=balanced&variant=${variant}`);
    await ready(tinyllamaPage);
    assert.equal(await tinyllamaPage.evaluate(() => window.__loadedModel.options.contextSize), 2048);
    assert.equal(await tinyllamaPage.evaluate(() => window.__loadedModel.source.id), `TinyLlama-1.1B-Chat-v1.0-q4${variant}_1-MLC`);
    await tinyllamaPage.locator('[data-help="model"]').click();
    assert.match(await tinyllamaPage.locator('#setting-help-facts').innerText(), /2,048 tokens/);
    await tinyllamaPage.keyboard.press('Escape');
    if (variant === 'f16') {
      for (let turn = 0; turn < 5; turn += 1) {
        const question = `Question ${turn}: ${'word '.repeat(240)}`.trim();
        await tinyllamaPage.locator('#input').fill(question);
        await tinyllamaPage.locator('#send').click();
        await tinyllamaPage.waitForFunction((count) => window.__calls?.length === count, turn + 1);
        assert.match(await tinyllamaPage.evaluate(() => window.__calls.at(-1).messages[0].content), /\nNever repeat the question\.$/, 'native system prompts also receive the no-repeat instruction');
        assert.equal(await tinyllamaPage.evaluate(() => window.__calls.at(-1).messages.at(-1).content), question, 'TinyLlama uses its native system role without repeating instructions');
        await finish(tinyllamaPage, 'Reply '.repeat(200));
      }
      const messages = await tinyllamaPage.evaluate(() => window.__calls.at(-1).messages);
      assert.ok(messages.length < 10, 'long TinyLlama conversations drop old turns');
      const tokens = messages.reduce((total, message) => total + Math.ceil(message.content.length / 3) + 4, 0);
      assert.ok(tokens + 256 + 64 <= 2048, 'history and reply budget fit TinyLlama context');
    }
  }
  await tinyllamaContext.addInitScript(() => { window.__failGpu = true; });
  await tinyllamaPage.goto(`${base}/chat.html?engine=webllm&tier=balanced&variant=f16`);
  await tinyllamaPage.locator('#fallback-btn').waitFor({ state: 'visible' });
  await tinyllamaPage.locator('#fallback-btn').click();
  await ready(tinyllamaPage);
  assert.equal(new URL(tinyllamaPage.url()).searchParams.get('engine'), 'wllama');
  assert.equal(new URL(tinyllamaPage.url()).searchParams.get('tier'), 'balanced');
  assert.equal(await tinyllamaPage.evaluate(() => window.__loadedModel.options.contextSize), 2048);
  await tinyllamaPage.setViewportSize({ width: 375, height: 812 });
  await tinyllamaPage.locator('[data-help="model"]').click();
  await noOverflow(tinyllamaPage);
  await tinyllamaPage.screenshot({ path: 'test-results/tinyllama-mobile.png', fullPage: true });
  await tinyllamaContext.close();
  console.log('PASS TinyLlama manual selection, GPU variants, native system role, 2K trimming and CPU fallback');

  const coldContext = await browser.newContext();
  await prepare(coldContext);
  const cold = await coldContext.newPage();
  await cold.goto(`${base}/chat.html?experiment=creativity`);
  await cold.waitForURL('**/index.html?experiment=creativity');
  await cold.locator('#go-now').waitFor({ state: 'visible' });
  const recommendations = await cold.evaluate(async () => {
    const { recommend, incompatibility, CATALOG } = await import('./models.js?v=1.3');
    const caps = { wasm: true, wasmSimd: true, secureContext: true, webgpu: { available: true, f16: true, maxBufferMB: 2048 }, deviceMemoryGB: 8, mobile: false, cores: 8, threads: true, storageFreeMB: 10000 };
    const mediumHeadroom = CATALOG.tiers.medium.webllm.f16.vramMB * 2 + 256;
    return {
      tiers: [recommend(caps), recommend({ ...caps, deviceMemoryGB: null }), recommend({ ...caps, storageFreeMB: null }), recommend({ ...caps, webgpu: { available: true, f16: false } }), recommend({ ...caps, mobile: true })].map((setup) => setup.tier),
      boundary: [recommend({ ...caps, storageFreeMB: mediumHeadroom }), recommend({ ...caps, storageFreeMB: mediumHeadroom - 1 })].map((setup) => setup.tier),
      noStorage: recommend({ ...caps, storageFreeMB: 100 }),
      manualQuality: incompatibility('webllm', 'quality', caps),
      cpuUnknown: recommend({ ...caps, webgpu: { available: false }, deviceMemoryGB: null }).tier,
      unknownMemory: [
        { cores: 32, storageFreeMB: 9982 },
        { deviceMemoryGB: 2 },
        { mobile: true },
        { cores: 4 },
        { webgpu: { ...caps.webgpu, maxBufferMB: 1023 } },
        { webgpu: { ...caps.webgpu, maxBufferMB: 1024 } },
        { webgpu: { available: true, f16: true } },
        { webgpu: { ...caps.webgpu, f16: false } },
        { storageFreeMB: null },
        { storageFreeMB: mediumHeadroom - 1 },
      ].map((overrides) => recommend({ ...caps, deviceMemoryGB: null, ...overrides }).tier),
    };
  });
  assert.deepEqual(recommendations.tiers, ['medium', 'medium', 'small', 'small', 'small']);
  assert.deepEqual(recommendations.unknownMemory, ['medium', 'tiny', 'tiny', 'tiny', 'tiny', 'medium', 'tiny', 'tiny', 'small', 'small'], 'capable desktops can use medium without reported RAM; weaker or uncertain devices retain smaller defaults');
  assert.deepEqual(recommendations.boundary, ['medium', 'small'], 'automatic selection reserves storage headroom');
  assert.equal(recommendations.noStorage, null, 'no recommendation when even tiny lacks headroom');
  assert.equal(recommendations.manualQuality, '', 'quality remains available for manual selection');
  assert.equal(recommendations.cpuUnknown, 'small', 'unknown desktop CPU memory defaults conservatively');
  assert.equal(await cold.locator('.datacenter-title img').evaluate((image) => image.complete && image.naturalWidth > 0), true, 'datacenter icon loads');
  assert.equal(await cold.locator('.setup-results .datacenter-intro').count(), 0, 'datacenter explanation is not duplicated in the results');
  assert.match(await cold.locator('.setup-sidebar').innerText(), /mini datacenter/);
  assert.match(await cold.locator('#check-reasons').innerText(), /Hugging Face, an online library/);
  assert.match(await cold.locator('#checks').innerText(), /Fast browser math /);
  console.log('PASS capable-desktop recommendations, smaller-device safeguards, storage headroom and datacenter copy');
  await cold.keyboard.press('Shift');
  assert.equal(await cold.locator('#countdown-text').innerText(), 'Paused.', 'a key press pauses the countdown');
  await cold.locator('#go-now').click();
  await cold.waitForURL('**/chat.html?**');
  await ready(cold);
  assert.equal(new URL(cold.url()).searchParams.get('experiment'), 'creativity');
  assert.equal(await cold.locator('#temperature').inputValue(), '0.2');
  console.log('PASS cold-start activity link through device check');

  await cold.goto(`${base}/index.html`);
  await cold.locator('#go-now').waitFor({ state: 'visible' });
  assert.equal(await cold.locator('#go-now').textContent(), 'Next: choose an experiment');
  await cold.locator('#go-now').click();
  await cold.waitForURL('**/experiments.html?**');
  await cold.locator('.experiment-card').first().waitFor();
  assert.equal(await cold.locator('.experiment-card[aria-current]').count(), 0);
  assert.equal(await cold.locator('.pick-heading').evaluate((heading) => getComputedStyle(heading, '::after').content), 'none', 'picker heading has no tip pointer');
  assert.equal(await cold.locator('.setup-summary').evaluate((model) => Boolean(document.querySelector('.free-chat-panel').compareDocumentPosition(model) & Node.DOCUMENT_POSITION_FOLLOWING)), true, 'model details and Change setup follow all activities and free chat');
  await cold.screenshot({ path: 'test-results/experiments.png', fullPage: true });
  await cold.getByRole('link', { name: /^3\. Creativity dial/ }).click();
  await cold.waitForURL('**/chat.html?**');
  await ready(cold);
  assert.equal(await cold.locator('#temperature').inputValue(), '0.2');
  await cold.setViewportSize({ width: 375, height: 812 });
  await cold.goto(`${base}/experiments.html`);
  await cold.locator('.experiment-card').first().waitFor();
  await noOverflow(cold);
  await cold.setViewportSize({ width: 1280, height: 720 });
  console.log('PASS device check -> experiment picker -> chat');

  const tourContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await prepare(tourContext, { tour: true });
  await tourContext.addInitScript(() => {
    if (!localStorage.getItem('tinythinker.dev-reset-sentinel')) {
      localStorage.setItem('tinythinker.experiment-progress', JSON.stringify({ shakespeare: 5, story: 2 }));
      localStorage.setItem('tinythinker.experiment-hints', JSON.stringify(['shakespeare@1']));
      localStorage.setItem('tinythinker.dev-reset-sentinel', 'keep');
    }
  });
  await tourContext.addCookies([
    { name: 'tinythinker_tour_v2', value: '6', url: base },
    { name: 'tinythinker_tour', value: '5', url: base },
    { name: 'tinythinker_welcome', value: '1', url: base },
    { name: 'tinythinker_dev_unrelated', value: 'keep', url: base },
  ]);
  const first = await tourContext.newPage();
  first.on('pageerror', (error) => errors.push(error.message));
  first.on('dialog', (dialog) => dialog.accept());
  await first.addInitScript(() => { window.__holdLoad = true; });
  const tip = first.locator('.tour');
  await first.goto(`${base}/index.html?resetCookies=1`);
  const welcomeDialog = first.locator('#first-welcome');
  await welcomeDialog.waitFor({ state: 'visible' });
  assert.equal(await first.locator('.tour:not(.hidden)').count(), 0, 'welcome appears before any tip');
  assert.equal(await welcomeDialog.locator('button').count(), 1, 'welcome has one action');
  assert.equal(await first.locator('#welcome-go').evaluate((button) => button === document.activeElement), true, 'welcome action receives keyboard focus');
  assert.equal(await welcomeDialog.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0), true, 'welcome character loads');
  await first.screenshot({ path: 'test-results/first-welcome.png' });
  await first.setViewportSize({ width: 375, height: 812 });
  await noOverflow(first);
  await first.locator('#welcome-go').scrollIntoViewIfNeeded();
  await first.screenshot({ path: 'test-results/first-welcome-mobile.png' });
  await first.setViewportSize({ width: 1280, height: 800 });
  assert.equal(new URL(first.url()).searchParams.has('resetCookies'), false, 'cookie reset is consumed once');
  assert.equal(await first.evaluate(() => localStorage.getItem('tinythinker.experiment-progress')), null, 'development reset also clears badges');
  assert.equal(await first.evaluate(() => localStorage.getItem('tinythinker.experiment-hints')), null, 'development reset also clears experiment tips');
  assert.equal(await first.evaluate(() => localStorage.getItem('tinythinker.dev-reset-sentinel')), 'keep', 'other saved data survives the reset');
  const resetCookies = await tourContext.cookies();
  assert.equal(resetCookies.some((cookie) => ['tinythinker_tour_v2', 'tinythinker_tour', 'tinythinker_welcome'].includes(cookie.name)), false, 'welcome and tour cookies are cleared');
  assert.equal(resetCookies.find((cookie) => cookie.name === 'tinythinker_dev_unrelated')?.value, 'keep', 'unrelated cookies are preserved');
  await first.locator('#welcome-go').click();
  await tip.waitFor({ state: 'visible' });
  assert.equal((await tourContext.cookies()).find((cookie) => cookie.name === 'tinythinker_welcome')?.value, '1', 'dismissal remembers the welcome');
  assert.match(await first.locator('.journey li').last().innerText(), /Chat and learn/);
  assert.match(await first.locator('.welcome').innerText(), /learn to question AI/);
  assert.notEqual(await first.locator('.journey [aria-current="step"]').evaluate((step) => getComputedStyle(step).backgroundColor), await first.locator('#go-now').evaluate((button) => getComputedStyle(button).backgroundColor), 'navigation does not reuse action blue');
  assert.equal(await first.locator('.tagline').evaluate((badge) => getComputedStyle(badge).color), 'rgb(54, 86, 127)', 'tagline uses the shared blue header palette');
  assert.match(await first.locator('header.top').evaluate((header) => getComputedStyle(header).backgroundImage), /repeating-linear-gradient/, 'header has subtle diagonal stripes');
  assert.match(await tip.innerText(), /Tip 1 of 6[\s\S]*Your path: 1, 2, 3/i);
  const introTip = await tip.boundingBox();
  const journey = await first.locator('.journey').boundingBox();
  assert.ok(introTip.y >= journey.y + journey.height, 'flow tip sits below the step bar without overlap');
  assert.equal(await first.locator('.journey').evaluate((panel) => panel.classList.contains('tour-target')), true, 'intro tip points to the step bar');
  assert.match(await tip.innerText(), /yellow instruction panels/);
  await first.screenshot({ path: 'test-results/tour-1-instructions.png' });
  await first.setViewportSize({ width: 375, height: 812 });
  await first.waitForFunction(() => {
    const rect = document.querySelector('.tour').getBoundingClientRect();
    return rect.left >= 0 && rect.right <= innerWidth;
  });
  await noOverflow(first);
  assert.equal(await first.locator('.journey li').evaluateAll((steps) => {
    const rects = steps.map((step) => step.getBoundingClientRect());
    return Math.max(...rects.map((rect) => rect.top)) - Math.min(...rects.map((rect) => rect.top)) < 1
      && Math.max(...rects.map((rect) => rect.width)) - Math.min(...rects.map((rect) => rect.width)) < 1;
  }), true, 'phone navigation keeps all three steps in equal columns on one row');
  const phoneWelcome = await first.locator('.welcome').boundingBox();
  const phoneExplanations = await first.locator('.setup-sidebar .setup-checks').boundingBox();
  assert.ok(phoneWelcome.y + phoneWelcome.height <= phoneExplanations.y, 'phone layout introduces the app before the detailed explanations');
  await first.screenshot({ path: 'test-results/tour-1-instructions-mobile.png' });
  await first.setViewportSize({ width: 1280, height: 800 });
  await first.locator('.tour-next').click();
  await first.waitForFunction(() => document.querySelector('.tour-count').textContent === 'Tip 2 of 6');
  assert.match(await tip.innerText(), /Tip 2 of 6[\s\S]*Your device is ready/i);
  const setupContent = await first.locator('.setup-results').boundingBox();
  const explanations = await first.locator('.setup-sidebar .setup-checks').boundingBox();
  assert.ok(Math.abs(explanations.y - setupContent.y) < 1, 'explanations align horizontally with the device results');
  const recommendedBox = await first.locator('#result').boundingBox();
  const recommendedHelp = await first.locator('#recommendation-help .panel').boundingBox();
  assert.equal(await tip.evaluate((box) => getComputedStyle(box).position), 'fixed', 'setup tip floats without occupying a content row');
  assert.equal(await first.locator('#result').evaluate((box) => getComputedStyle(box).gridRowStart), '3', 'recommendation retains its normal grid row while the tip is open');
  assert.ok(Math.abs(recommendedHelp.y - recommendedBox.y) < 1 && Math.abs(recommendedHelp.height - recommendedBox.height) < 1, 'recommendation explanation and setup align with equal heights');
  assert.ok(recommendedHelp.x + recommendedHelp.width < recommendedBox.x, 'recommendation explanation stays beside the setup');
  assert.equal(await first.locator('.setup-sidebar #check-reasons li').count(), 7, 'sidebar explains all seven checks');
  assert.equal(await first.locator('.setup-content #checks li').count(), 7, 'main column contains actual device results');
  assert.equal(await first.locator('#checks .why').count(), 0, 'explanations do not lengthen the results');
  assert.equal(await first.locator('#recommendation-help #recommendation-explain').count(), 1, 'recommended setup explanation lives in the yellow sidebar');
  assert.equal(await first.locator('#result #recommendation-explain').count(), 0, 'recommendation does not duplicate the sidebar explanation');
  assert.match(await first.locator('#checks li').first().innerText(), /Local address: trusted by the browser/);
  assert.equal(await first.locator('#check-reasons').evaluate((list) => getComputedStyle(list).fontSize), '12px', 'sidebar explanations use compact text');
  await first.waitForFunction(() => {
    const arrow = document.querySelector('.tour-arrow').getBoundingClientRect();
    const button = document.querySelector('#go-now').getBoundingClientRect();
    const box = document.querySelector('.tour').getBoundingClientRect();
    return Math.abs((arrow.left + arrow.right) / 2 - (button.left + button.right) / 2) < 2 && arrow.bottom > box.bottom;
  });
  assert.deepEqual(await tip.evaluate((box) => {
    const style = getComputedStyle(box);
    return [style.backgroundColor, style.borderLeftColor];
  }), ['rgb(255, 248, 231)', 'rgb(224, 161, 0)'], 'first tip uses yellow instruction colours');
  assert.equal(await first.locator('#go-now').evaluate((button) => button.classList.contains('tour-target')), true, 'tip points at the Next button');
  await first.waitForTimeout(1500);
  assert.equal(await first.locator('#countdown-text').textContent(), '', 'no countdown on the first visit');
  assert.match(first.url(), /index\.html$/);
  await first.screenshot({ path: 'test-results/tour-1-setup.png' });
  await first.locator('#change').click();
  await first.locator('#override').waitFor({ state: 'visible' });
  assert.equal(await first.locator('#result').isVisible(), false, 'Change hides the recommended setup');
  assert.equal(await first.locator('#recommendation-help').isVisible(), false, 'Change hides the recommendation explanation');
  assert.equal(await first.locator('#override-help .panel').isVisible(), true, 'Change shows the sidebar explanation');
  assert.equal(await first.locator('#override .panel-intro').count(), 0, 'picker does not duplicate its sidebar explanation');
  await first.waitForFunction(() => {
    const arrow = document.querySelector('.tour-arrow').getBoundingClientRect();
    const button = document.querySelector('#override-submit').getBoundingClientRect();
    return Math.abs((arrow.left + arrow.right) / 2 - (button.left + button.right) / 2) < 2;
  });
  const picker = await first.locator('#override').boundingBox();
  const pickerHelp = await first.locator('#override-help .panel').boundingBox();
  assert.ok(Math.abs(pickerHelp.y - picker.y) < 1 && pickerHelp.x + pickerHelp.width < picker.x, 'manual explanation aligns beside the picker');
  assert.equal(await tip.evaluate((box) => getComputedStyle(box).position), 'fixed', 'tip continues floating after switching to manual setup');
  await first.goto(`${base}/index.html?manual=1`);
  await first.locator('#override').waitFor({ state: 'visible' });
  assert.equal(await welcomeDialog.isVisible(), false, 'welcome does not return after dismissal');
  assert.equal(await first.locator('#result').isVisible(), false, 'direct manual setup also hides the recommendation');
  assert.equal(await first.locator('#override-help .panel').isVisible(), true, 'direct manual setup shows the sidebar explanation');
  await first.goto(`${base}/index.html`);
  await tip.waitFor({ state: 'visible' });
  await first.setViewportSize({ width: 375, height: 812 });
  await first.waitForFunction(() => {
    const box = document.querySelector('.tour').getBoundingClientRect();
    return box.left >= 0 && box.right <= innerWidth;
  });
  assert.equal(await tip.evaluate((box) => getComputedStyle(box).position), 'fixed', 'mobile tip floats over the page instead of splitting its content');
  await first.waitForFunction(() => {
    const button = document.querySelector('#go-now').getBoundingClientRect();
    return button.top >= 0 && button.bottom <= innerHeight;
  });
  await noOverflow(first);
  await first.screenshot({ path: 'test-results/tour-1-setup-mobile.png' });
  await first.setViewportSize({ width: 1280, height: 800 });
  const recommendationBeforeDismissal = await first.locator('#result').evaluate((box) => ({ top: box.offsetTop, height: box.offsetHeight }));
  await first.locator('.tour-next').click();
  assert.deepEqual(await first.locator('#result').evaluate((box) => ({ top: box.offsetTop, height: box.offsetHeight })), recommendationBeforeDismissal, 'dismissing the tip does not move or resize the recommendation');
  assert.equal(await tip.isVisible(), false, 'Got it dismisses the setup sidebar');
  assert.equal(await first.locator('main').evaluate((main) => main.classList.contains('setup-tour-active')), false, 'dismissal restores the normal setup layout');
  await first.locator('#go-now').click();
  await first.waitForURL('**/experiments.html?**');
  await tip.waitFor({ state: 'visible' });
  assert.match(await tip.innerText(), /Tip 3 of 6[\s\S]*Choose an experiment/i);
  assert.equal(await first.locator('.tour:visible').count(), 1, 'picker has one floating tour tip');
  assert.notEqual(await first.locator('.pick-heading').evaluate((heading) => getComputedStyle(heading).backgroundColor), await tip.evaluate((box) => getComputedStyle(box).backgroundColor), 'permanent heading does not duplicate the yellow tip styling');
  assert.equal(await tip.evaluate((box) => getComputedStyle(box).backgroundColor), 'rgb(255, 248, 231)', 'experiment tip uses yellow instruction styling');
  assert.equal(await tip.locator('.tour-next').evaluate((button) => getComputedStyle(button).backgroundColor), 'rgb(224, 161, 0)', 'tip acknowledgement matches its yellow panel');
  assert.equal(await first.locator('.experiment-card.tour-target').evaluate((card) => getComputedStyle(card).backgroundColor), 'rgb(240, 245, 255)', 'tour-highlighted experiment is blue');
  assert.equal(await first.locator('.experiment-card:not(.tour-target):not(:hover):not(:focus-visible)').first().evaluate((card) => getComputedStyle(card).backgroundColor), 'rgb(255, 255, 255)', 'other experiment cards remain neutral');
  await first.screenshot({ path: 'test-results/tour-2-experiments.png' });
  await first.locator('.experiment-card').first().click();
  await first.waitForURL('**/chat.html?**');
  await first.waitForFunction(() => document.querySelector('#load-panel').open);
  await first.mouse.move(0, 0);
  await first.locator('#load-lessons').hover();
  await first.screenshot({ path: 'test-results/loading-information.png' });
  await first.evaluate(() => window.__releaseLoad());
  await first.locator('#load-done').waitFor({ state: 'visible' });
  assert.equal(await first.locator('#load-panel').evaluate((dialog) => dialog.open), true, 'moving the pointer into the information keeps the loader open');
  assert.equal(await first.locator('#load-title').textContent(), 'Your model is ready!');
  await first.locator('#load-done').click();
  assert.equal(await first.locator('#load-panel').evaluate((dialog) => dialog.open), false);
  await tip.waitFor({ state: 'visible' });
  assert.match(await tip.innerText(), /Tip 4 of 6[\s\S]*Pick a question/i);
  await first.screenshot({ path: 'test-results/tour-3-question.png' });
  await first.getByRole('button', { name: 'Pirate voice' }).click();
  assert.match(await tip.innerText(), /Tip 5 of 6[\s\S]*Send it/i, 'setting buttons complete the question step');
  await first.getByRole('button', { name: 'Rally the crew' }).click();
  assert.match(await tip.innerText(), /Tip 5 of 6[\s\S]*Send it/i);
  await first.locator('#send').click();
  await first.waitForFunction(() => window.__calls?.length === 1);
  assert.equal(await tip.isVisible(), false, 'tip hides while the reply streams');
  await finish(first);
  await tip.waitFor({ state: 'visible' });
  assert.match(await tip.innerText(), /Tip 6 of 6[\s\S]*Try another experiment/i);
  assert.equal(await first.locator('#journey-experiments').evaluate((link) => link.classList.contains('tour-target')), true);
  await first.screenshot({ path: 'test-results/tour-5-back.png' });
  await tip.getByRole('button', { name: 'Done' }).click();
  assert.equal((await tourContext.cookies()).find((cookie) => cookie.name === 'tinythinker_tour_v2')?.value, '6');
  await tip.waitFor({ state: 'visible' });
  assert.match(await tip.innerText(), /Experiment tip[\s\S]*The voice lives here/i, 'after the first-run tips, the experiment tip points at its key setting');
  assert.equal(await first.locator('#system-prompt').evaluate((field) => field.classList.contains('tour-target')), true, 'Shakespeare tip highlights the system prompt');
  assert.equal(await tip.locator('.tour-skip').isVisible(), false, 'experiment tips have no Skip tips action');
  await first.screenshot({ path: 'test-results/tour-6-experiment.png' });
  await tip.getByRole('button', { name: 'Got it' }).click();
  assert.equal(await tip.isVisible(), false);
  assert.deepEqual(await first.evaluate(() => JSON.parse(localStorage.getItem('tinythinker.experiment-hints'))), ['shakespeare@1']);
  const migrated = await first.evaluate(async () => {
    localStorage.setItem('tinythinker.experiment-hints', JSON.stringify(['shakespeare']));
    const { hintSeen } = await import('./tour.js?v=1.3');
    return {
      seen: hintSeen('shakespeare@1'),
      keys: JSON.parse(localStorage.getItem('tinythinker.experiment-hints')),
    };
  });
  assert.equal(migrated.seen, true);
  assert.deepEqual(migrated.keys, ['shakespeare@1'], 'legacy hint keys migrate to a versioned key');
  assert.equal((await tourContext.cookies()).find((cookie) => cookie.name === 'tinythinker_tour_v2')?.value, '6', 'experiment tips do not change tour progress');
  await first.locator('#clear').click();
  await first.locator('#leave-continue').click();
  await first.locator('#journey-experiments').click();
  await first.locator('.experiment-card[href*="experiment=creativity"]').click();
  await tip.waitFor({ state: 'visible' });
  assert.match(await tip.innerText(), /Experiment tip[\s\S]*Turn this dial/i, 'switching experiments shows the new experiment tip');
  assert.equal(await first.locator('#temperature').evaluate((field) => field.classList.contains('tour-target')), true);
  await tip.getByRole('button', { name: 'Got it' }).click();
  await first.locator('#journey-experiments').click();
  await first.locator('.experiment-card[href*="experiment=shakespeare"]').click();
  await first.waitForURL('**experiment=shakespeare**');
  assert.equal(await tip.isVisible(), false, 'an experiment tip is shown only once');
  await first.goto(`${base}/index.html`);
  await first.locator('#countdown-text').filter({ hasText: 'Continuing in' }).waitFor();
  assert.equal(await first.locator('.tour:not(.hidden)').count(), 0, 'tips do not come back on the next visit');
  await first.locator('#change').click();
  await tourContext.close();

  const skipContext = await browser.newContext();
  await prepare(skipContext, { tour: true });
  const skipper = await skipContext.newPage();
  await skipper.goto(`${base}/index.html`);
  await skipper.locator('#welcome-go').click();
  await skipper.locator('.tour-skip').click();
  assert.equal((await skipContext.cookies()).find((cookie) => cookie.name === 'tinythinker_tour_v2')?.value, '6', 'Skip tips ends the tour');
  await skipContext.clearCookies({ name: 'tinythinker_tour_v2' });
  await skipContext.addCookies([{ name: 'tinythinker_tour', value: '5', url: base }]);
  await skipper.goto(`${base}/index.html?manual=1`);
  await skipper.locator('#override').waitFor({ state: 'visible' });
  assert.equal(await skipper.locator('.tour:not(.hidden)').count(), 0, 'completed older tours do not restart after adding a tip');
  assert.equal(await skipper.evaluate(async () => (await import('./tour.js?v=1.3')).tourProgress()), 6, 'older completed progress maps to the new final step');
  await skipContext.clearCookies({ name: 'tinythinker_tour_v2' });
  await skipContext.clearCookies({ name: 'tinythinker_tour' });
  await skipContext.addCookies([{ name: 'tinythinker_tour_v2', value: '0', url: base }, { name: 'tinythinker_welcome', value: '1', url: base }]);
  await skipper.evaluate(() => localStorage.setItem('browserai.config', JSON.stringify({ engine: 'wllama', tier: 'tiny', variant: '' })));
  await skipper.evaluate(() => localStorage.removeItem('tinythinker.experiment-hints'));
  await skipper.goto(`${base}/chat.html?engine=wllama&tier=tiny&experiment=shakespeare`);
  await ready(skipper);
  const skipTip = skipper.locator('.tour');
  await skipTip.waitFor({ state: 'visible' });
  assert.match(await skipTip.innerText(), /Tip 4 of 6[\s\S]*Pick a question/i);
  await skipTip.locator('.tour-skip').click();
  await skipTip.waitFor({ state: 'visible' });
  assert.match(await skipTip.innerText(), /Experiment tip[\s\S]*The voice lives here/i, 'skipping the chat tour still offers the experiment hint');
  await skipTip.getByRole('button', { name: 'Got it' }).click();
  assert.deepEqual(await skipper.evaluate(() => JSON.parse(localStorage.getItem('tinythinker.experiment-hints'))), ['shakespeare@1']);
  await skipContext.close();
  console.log('PASS first-run tips across setup, picker and chat; interactive loader; cookie stops repeats');
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
    await skipTour(realContext);
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