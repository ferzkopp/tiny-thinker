// Experiment picker: shows every classroom experiment as a card and opens the chat with the chosen one.
import { ENGINES, describeModel, loadConfig, saveConfig, configToQuery } from './models.js';
import { wireLicenseLinks } from './licenses.js';
import { EXPERIMENTS, EXPERIMENT_BADGES, getExperiment, withExperiment, experimentBadgeLevel } from './experiments.js';
import { startTour } from './tour.js';
import { el } from './dom.js';

const $ = (id) => document.getElementById(id);

/** One card linking to the chat with this experiment; the current one (when coming back from the chat) is marked. */
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

export function renderExperimentCards(list, config, current) {
  const query = configToQuery(config);
  list.replaceChildren(...EXPERIMENTS.map((activity, index) =>
    card(activity, index + 1, `chat.html?${withExperiment(query, activity.id)}`, activity === current)));
}

/** Lists the experiments for the saved setup, or sends the student to the device check if there is none. */
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
  const engine = ENGINES[config.engine];
  const model = describeModel(config);
  $('setup-text').textContent = `${model.label} running on your ${config.engine === 'webllm' ? 'graphics chip' : 'processor'} (${engine.label}, ${engine.backend}). ${model.detail}.`;
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
