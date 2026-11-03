# jslogo

Logo parser and interpreter by Joshua Bell, distributed under Apache-2.0.

- Source: https://github.com/inexorabletash/jslogo
- Pinned revision: `26dfcac41daa4477182ce7c1a00acbd913ab5fd5`
- Files: upstream `logo.js` and `LICENSE.md`, plus the Apache license text in `LICENSE.txt`.

Local changes: add a named ES module export for `LogoInterpreter`, and expose
the existing parser as `instance.parse` for syntax diagnostics. No upstream
parsing or evaluation rules are changed.
Tiny Thinker exposes only an allowlisted, resource-bounded graphics subset.
It permits procedure and variable definitions, but does not expose host file,
interactive input, network or browser capabilities.