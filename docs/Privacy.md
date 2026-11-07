# Privacy and Classroom Limits

[Project overview and quickstart](../README.md) | [Classroom guide](Classroom.md) | [Accessibility](Accessibility.md)

## On-device inference and network requests

The app does not intentionally send prompts or replies to an inference service. Questions and replies are processed on-device. Static hosts and third-party asset hosts still receive normal requests, including IP addresses. Dependencies downloaded from CDNs execute in the browser; choose and review them accordingly.

Self-hosting model weights does not self-host engine libraries, remove all external requests or guarantee an offline reload. No service worker is included. See [Hosting](Hosting.md) for asset preparation and [Models](Models.md) for sources and browser troubleshooting.

## What is stored

Conversations and reflection notes live only in the current tab, not local storage. Download notes before navigating away or reloading. Browser storage remembers settings, device/model choices, badge counts and IDs of experiment tips already seen; no conversation text is stored with badges.

Two first-party cookies last for a year: `tinythinker_welcome` records welcome dismissal; `tinythinker_tour_v2` stores only the number of first-run tips seen. Neither is used for tracking. Legacy `tinythinker_tour`, if present, preserves earlier tip progress.

**Done** stops any reply, clears current work, restores default chat settings and returns to setup. It does not delete cached model files or badges. On shared devices, badges belong to the browser, not an individual student. Clearing site data removes models, saved settings and badges.

## Safeguards and shared reports

Small open models can invent facts, ignore instructions, repeat stereotypes or produce inappropriate text. Prompts are not safety filters. Use teacher supervision and school policies, especially with younger students. Keep personal information out of prompts and notes; use invented examples and independent references for fact-checking.

Optional debug reports exclude prompts, replies and notes, but include browser/device details and load errors that can identify an environment. They are downloaded locally, never uploaded automatically. Review them before sharing.

The [Classroom guide](Classroom.md) covers lessons, inclusion, supervision and shared-device cleanup. [Evaluation](Evaluation.md) describes what automated behavior checks do and do not establish.