// License and attribution listing, shown on licenses.html and as a popup on the other pages.
import { CATALOG, MANIFEST, MODELS_BASE, TIERS, tierInfo } from './models.js?v=1.1';
import { el } from './dom.js?v=1.1';

const HF = 'https://huggingface.co/';

/** Creates a link whose text is set as plain text (never parsed as HTML). */
function link(text, href) {
  return el('a', { href, textContent: text, rel: 'noopener' });
}

/**
 * One list entry for a model build: its source repository and, when self-hosted, links to the local license files.
 * @param {string} name Build description, e.g. "GGUF Q4_K_M".
 * @param {string} sourceRepo Hugging Face repository the files came from.
 * @param {object} [local] Manifest entry if the build is self-hosted.
 */
function buildItem(name, sourceRepo, local) {
  const li = el('li', {}, `${name} – source `, link(sourceRepo, HF + sourceRepo));
  if (local) {
    li.append(' – self-hosted (',
      link('LICENSE', new URL(local.licenseFile, MODELS_BASE).href), ', ',
      link('ATTRIBUTION', new URL(local.attributionFile, MODELS_BASE).href), ')');
  } else {
    li.append(' – loaded from Hugging Face');
  }
  return li;
}

/** Appends the project credit, every model with its builds and license, and the engine libraries to a container. */
export function renderLicenses(container) {
  container.append(
    el('h3', { textContent: 'Tiny Thinker' }),
    el('p', {},
      'Created by Andreas Schiffler. Source code: ', link('github.com/ferzkopp/tiny-thinker', 'https://github.com/ferzkopp/tiny-thinker'), el('br'),
      'Copyright (c) 2026 Andreas Schiffler. Licensed under the ', link('MIT License', 'https://opensource.org/license/mit'), '.'),
    el('h3', { textContent: 'Models' }),
    el('p', { textContent: 'All models are used unmodified apart from the format conversion and quantization by the listed source repositories.' }),
  );
  for (const tier of TIERS) {
    const t = tierInfo(tier);
    const f = t.familyInfo;
    const builds = el('ul');
    for (const [variant, v] of Object.entries(t.webllm)) {
      builds.append(buildItem(`WebLLM ${v.quant} (${variant})`, `mlc-ai/${v.id}`, MANIFEST.webllm?.[v.id]));
    }
    builds.append(buildItem(`GGUF ${t.gguf.quant}`, t.gguf.repo, MANIFEST.gguf?.[t.gguf.file]));

    container.append(
      el('h4', { textContent: `${t.label} Instruct` }),
      el('p', {},
        'Original model: ', link(t.upstream, HF + t.upstream), el('br'),
        `Copyright ${f.copyright}. Licensed under the `, link(f.licenseName, f.licenseUrl), '.'),
      builds,
    );
  }

  if (!Object.keys(MANIFEST.webllm || {}).length && !Object.keys(MANIFEST.gguf || {}).length) {
    container.append(el('p', { textContent: 'No self-hosted model files found on this server; all models load from Hugging Face.' }));
  }

  container.append(
    el('h3', { textContent: 'Software' }),
    el('ul', {},
      el('li', {}, link('WebLLM', 'https://github.com/mlc-ai/web-llm'), ` ${CATALOG.webllm.version} – Apache License 2.0 (including the compiled MLC model libraries)`),
      el('li', {}, link('wllama', 'https://github.com/ngxson/wllama'), ` ${CATALOG.wllama.version} – MIT License, bundles `,
        link('llama.cpp', 'https://github.com/ggml-org/llama.cpp'), ' (MIT License)'),
      el('li', {}, link('jslogo', 'https://github.com/inexorabletash/jslogo'), ' by Joshua Bell, revision 26dfcac – Apache License 2.0 (',
        link('license', 'vendor/jslogo/LICENSE.txt'), ', ', link('attribution and local changes', 'vendor/jslogo/README.md'), ')')),
  );
}

/** Returns the licenses popup, building it on first use. */
function getDialog() {
  let dialog = document.getElementById('licenses-dialog');
  if (dialog) return dialog;
  const close = el('button', { type: 'button', className: 'dialog-close', textContent: '×', ariaLabel: 'Close' });
  const body = el('div', { className: 'dialog-body licenses' });
  dialog = el('dialog', { id: 'licenses-dialog', className: 'overlay' },
    el('div', { className: 'dialog-header' }, el('h2', { id: 'licenses-dialog-title', textContent: 'Licenses' }), close),
    body);
  dialog.setAttribute('aria-labelledby', 'licenses-dialog-title');
  renderLicenses(body);
  close.addEventListener('click', () => dialog.close());
  // A click on the backdrop targets the dialog element itself.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.append(dialog);
  return dialog;
}

/** Makes links marked data-licenses open the popup; without <dialog> support they open licenses.html. */
export function wireLicenseLinks() {
  if (typeof HTMLDialogElement !== 'function') return;
  for (const a of document.querySelectorAll('a[data-licenses]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      getDialog().showModal();
    });
  }
}

const page = document.getElementById('licenses-page');
if (page) renderLicenses(page);
