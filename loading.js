import { ENGINES, tierInfo, parameterCount } from './models.js?v=1.3';
import { numberedTitle } from './experiments.js?v=1.3';
import { el } from './dom.js?v=1.3';

const PHASES = [
  { title: 'Get the engine' },
  { title: 'Download the model' },
  { title: 'Load into memory' },
  { title: 'Ready' },
];

/** Creates a loading-dialog information section.
 * @param {string} title Section heading.
 * @param {...(Node|string)} children Section content.
 * @returns {HTMLElement} Section element.
 */
function section(title, ...children) {
  return el('section', { className: 'lesson' }, el('h3', { textContent: title }), ...children);
}

/**
 * Fills the loading dialog with learning content for this setup and returns a function that follows progress.
 * @param {{phases: HTMLElement, lessons: HTMLElement}} targets The phase list and the scrollable lesson area.
 * @param {{engine: string, tier: string, variant: string}} config The setup being loaded.
 * @param {object|null} activity The chosen experiment, or null for Free chat.
 * @returns {{update(text: string, progress: number): void, finish(): void}}
 */
export function renderLoadingLessons({ phases, lessons }, config, activity) {
  const tier = tierInfo(config.tier);
  const gpu = config.engine === 'webllm';
  const params = parameterCount(config.tier);
  const chip = gpu ? 'graphics chip (GPU)' : 'processor (CPU)';

  const explanations = [
    `${ENGINES[config.engine].label} uses your ${chip}.`,
    'Reuse cached files; download anything missing.',
    'Prepare the model for replies.',
    'Your model is ready.',
  ];
  const items = PHASES.map((phase, index) => el('li', {},
    el('strong', { textContent: phase.title }), el('span', { textContent: explanations[index] })));
  phases.replaceChildren(...items);
  let phase = -1;
  const setPhase = (next) => {
    if (next <= phase) return;
    phase = next;
    items.forEach((item, index) => {
      item.className = index < phase ? 'done' : index === phase ? 'active' : '';
      if (index === phase) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
  };
  setPhase(0);

  const prepare = activity
    ? section('Your experiment',
      el('p', {}, el('strong', { textContent: numberedTitle(activity) }), ` (${activity.minutes}): ${activity.objective}`),
    )
    : section('Get ready to chat',
      el('p', { textContent: 'Think of a question whose answer you can check.' }));

  lessons.replaceChildren(el('div', { className: 'lesson-columns' },
    section('Why does loading take time?', el('p', {
      textContent: 'The browser downloads model files, then prepares them in memory. Bigger models and slower connections or devices take longer. Cached files avoid repeat downloads, but still need preparation.',
    })),
    section('What is a megabyte?', el('p', {
      textContent: 'A megabyte (MB) is about one million bytes, or 1,000 kilobytes (KB). Download size measures stored files; memory is the workspace the model needs to run.',
    })),
    prepare,
    section('Your model', el('p', {}, el('strong', { textContent: tier.label }), `: ${params.words} parameters. Runs on this device.`)),
  ));

  return {
    update(text, progress) {
      if (/shader|from cache|finish/i.test(text)) setPhase(2);
      else if (/fetch|download/i.test(text)) setPhase(progress >= 1 ? 2 : 1);
    },
    finish() {
      setPhase(3);
      items[3].classList.add('done');
    },
  };
}
