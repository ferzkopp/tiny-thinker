# Accessibility

[Project overview and quickstart](../README.md) | [Using the playground](Usage.md)

Tiny Thinker includes accessibility support for keyboard and assistive-technology use:

- **Keyboard navigation:** skip links reach the main content or conversation; controls have visible focus outlines. Help dialogs support Escape, return focus to their opener, and have keyboard-scrollable content. Inline confirmations restore focus when cancelled.
- **Screen-reader markup:** named landmarks, ordered headings, labelled inputs, and accessible names for icon buttons. Loading progress, errors, badges and Turtle execution results use status or alert semantics. The conversation is a live region marked busy while a reply streams to reduce token-by-token announcements.
- **Readable, adaptable controls:** contrasting text in light and dark themes, browser high-contrast mode support, help targets at least 24 by 24 CSS pixels, and responsive navigation that wraps with enlarged text on narrow screens.
- **Reduced motion:** the system preference disables decorative loading and thinking animations, tip pulses and experiment-card movement.
- **Pausable navigation:** setup does not auto-advance on the first visit; on later visits, a key press or focus interaction pauses the countdown. Manual setup remains available.

## Verification and limits

Playwright regression tests check keyboard access, focus, responsive text and live-region state. The UI has also been audited with axe-core for automated accessibility violations across pages and interactive states. These checks are not a WCAG conformance certification or a substitute for testing with screen readers on classroom devices.

Turtle drawings remain visual: editable Logo code and text execution feedback are available, but there is no automatic description of the resulting shape.