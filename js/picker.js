// Experiment picker: shows every classroom experiment as a card and opens the chat with the chosen one.
import { ENGINES, describeModel, loadConfig, saveConfig, configToQuery } from './models.js?v=1.4';
import { wireLicenseLinks } from './licenses.js?v=1.4';
import { EXPERIMENTS, EXPERIMENT_BADGES, getExperiment, withExperiment, experimentBadgeLevel } from './experiments.js?v=1.4';
import { startTour } from './tour.js?v=1.4';
import { el } from './dom.js?v=1.4';

const $ = (id) => document.getElementById(id);

/** Creates one experiment card with badge and last-used metadata.
 * @param {object} activity Experiment catalog entry.
 * @param {number} number Number shown in the picker.
 * @param {string} href Chat URL for this experiment.
 * @param {boolean} current True if this was the last-used/current experiment.
 * @returns {HTMLLIElement} Rendered list item.
 */
function card(activity, number, href, current) {
  const link = el('a', { className: 'experiment-card', href },
    el('span', { className: 'experiment-num', textContent: String(number), ariaHidden: 'true' }),
    el('span', { className: 'experiment-head' },
      el('strong', { className: 'experiment-title' }, el('span', { className: 'visually-hidden', textContent: `${number}. ` }), activity.title),
      el('span', { className: 'experiment-meta', textContent: `${activity.concept} · ${activity.minutes}` })),
    el('span', { className: 'experiment-objective', textContent: activity.objective }));
  const level = experimentBadgeLevel(activity.id);
  if (level) {
    const earned = EXPERIMENT_BADGES[level - 1];
    link.querySelector('.experiment-head').append(el('span', {
      className: `experiment-badge${level >= 2 ? ' promoted' : ''}${level === 3 ? ' investigator' : ''}`,
      title: earned.title,
    }, el('span', { className: 'badge-mark', textContent: '\u2605'.repeat(level), ariaHidden: 'true' }),
    earned.label));
  }
  if (current) {
    link.setAttribute('data-last-used', 'true');
    link.querySelector('.experiment-head').append(el('span', {
      className: 'experiment-current', textContent: 'Last used', title: 'Most recently opened experiment',
    }));
  }
  return el('li', {}, link);
}

/** Rebuilds the experiment card list for a setup and current activity.
 * @param {HTMLUListElement} list Card list element.
 * @param {{engine: string, tier: string, variant: string}} config Active setup.
 * @param {object|null} current Current experiment entry.
 */
export function renderExperimentCards(list, config, current) {
  const query = configToQuery(config);
  list.replaceChildren(...EXPERIMENTS.map((activity, index) =>
    card(activity, index + 1, `chat.html?${withExperiment(query, activity.id)}`, activity === current)));
}

/** Writes the current model summary into the bottom setup panel.
 * @param {{engine: string, tier: string, variant: string}} config Active setup.
 */
export function renderSetupSummary(config) {
  const engine = ENGINES[config.engine];
  const model = describeModel(config);
  $('setup-text').textContent = `${model.label} running on your ${config.engine === 'webllm' ? 'graphics chip' : 'processor'} (${engine.label}, ${engine.backend}). ${model.detail}.`;
}

/** Initializes the experiment picker or redirects to setup if no valid setup exists. */
function main() {
  $('boot-warning').remove();
  wireLicenseLinks();
  const config = loadConfig();
  if (!config) {
    location.replace('index.html');
    return;
  }
  saveConfig(config);
  const query = configToQuery(config);
  const current = getExperiment(new URLSearchParams(location.search).get('experiment'));
  renderSetupSummary(config);
  $('free-chat').href = `chat.html?${query}`;

  function renderCards() {
    renderExperimentCards($('experiment-list'), config, current);
  }
  renderCards();
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) renderCards();
  });

  const tour = startTour([{
    step: 3,
    target: () => document.querySelector('.experiment-card'),
    title: 'Choose an experiment',
    text: 'Each card is a short activity with instructions. New here? Start with 1. Shakespeare remix. Click a card to open it.',
  }]);
  $('experiment-list').addEventListener('click', (event) => {
    if (event.target.closest('.experiment-card')) tour.complete(3);
  });
  $('free-chat').addEventListener('click', () => tour.complete(3));
}

if (!document.body.classList.contains('chat')) main();
