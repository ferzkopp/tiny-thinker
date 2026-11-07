/**
 * Creates an element, assigns DOM properties (e.g. textContent, className) and appends children.
 * Text is always assigned as properties or text nodes, never parsed as HTML.
 * @param {string} tag Element name.
 * @param {object} [props] Properties assigned with Object.assign.
 * @param {...(Node|string)} children Nodes or strings to append.
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.assign(node, props);
  node.append(...children);
  return node;
}
