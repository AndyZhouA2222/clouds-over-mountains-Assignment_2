# Process

*Written on 28 September 2026 from my conversations with Codex and, in the final stage, Claude Code. Requests are summarised, not quoted.*

## Early exploration with Codex

I began with an interest in cumulonimbus clouds over mountains and chose the Zugspitze in Germany after discussing locations with Codex. My initial idea combined satellite imagery, valley-to-summit temperature differences and possible photography viewpoints. The scope narrowed to data exploration, focusing on 14–20 September.

Codex prepared a handover document and built the prototype. I requested real observations, corrected image proportions and clearer data presentation. When the interface remained unsatisfactory, I asked it to rethink the purpose before redesigning. I also requested an assignment audit before authorising changes.

Using the web-design-engineer skill, Codex developed the interface further. I requested an Active Theory-inspired direction and a closer connection between satellite imagery and cloud-height data.

I kept the combination of imagery and measurements because it linked my visual interest to observable changes. I rejected stretched images and unclear layouts. I also kept the 22 September cloud-height data separate from the main study week. Neither temperature differences nor these images alone establish that the clouds are cumulonimbus.

## Tools

- **Codex** redesigned and refined the interactive website, checked it against the assignment, and fixed the issues I prioritised.
- **Claude Code** refined the motion in the final stage.
- Both wrote AI-generated HTML, CSS and JavaScript. I set the direction and scope, and judged the results. I do not claim to have written or manually tested every part.
- **Design skills** guided storytelling, interaction and motion: `web-design-engineer` (with its `resn-storytelling` direction), `make-interfaces-feel-better`, `ui-ux-pro-max` and `12-principles-of-animation`. `onetake` is a skill for making motion videos; no video was made, and I used only its spring physics and motion principles.
- **Data:** DWD station temperatures, NASA GIBS daily satellite imagery and a separate DWD cloud-height dataset, all stored locally. Python reproduced the static plot and compared the 168 paired observations with the source files. `build_site.py` assembles the site.
- **Node, Git and headless Chrome** (via Playwright) were used for syntax, change and browser checks.
- **Unsplash** supplied the opening photograph, credited in the [README](README.md) as an illustration.

## How it developed

1. **Direction.** I asked for a storytelling redesign. The first result did not capture the experience I had in mind, so I narrowed the brief: immersive scroll storytelling with a few real controls, in English with a Chinese/English switch.
2. **Finding.** I asked for a review against the assignment. The page now states the result: in all 168 hours the valley was warmer than the summit, by 4.0–18.9 °C. The axis is labelled ΔT (°C), and the interactive version is linked from the README.
3. **Interaction states.** Image dates and labels now update only once the new image has loaded, with bilingual loading messages and retry controls. The blurred opening image was replaced, and station readings were placed on each satellite scene.
4. **Review versus fix.** When an audit listed problems, I confirmed that nothing had been changed yet. I then set the scope: skip mobile adaptation and fix the rest, namely input conflicts, redundant drawing, deferred data loading and shared scroll measurement.
5. **Motion.** In the final stage, motion became one system built on shared springs:
   - a satellite day scans across the previous one;
   - the chart line draws with its peaks landing in time;
   - selection markers slide to the new choice;
   - the cloud-height layer sweeps in from the south, following the order in which the FCI instrument scans.

## Kept

**Real observations with explicit limits.** Values always change straight to the recorded observation, never through invented intermediate numbers. The 22 September cloud-height data is kept separate from the 14–20 September temperature week, so the page never implies a causal link across dates.

## Rejected

**The first visual direction.** Approving a proposal did not mean the result matched my intention. Stating plainly that it did not, and naming the experience I wanted, produced a far better second version.

**A misleading transition.** In the first cloud-scan wipe, the translucent cells of the outgoing scan showed through the incoming one, briefly displaying two observation times at once. The old scan now withdraws in step with the new one. I treated this as a data-integrity problem, not only a visual one.

## Checks and limits

The static plot was reproduced from local data. In the final stage, headless Chrome confirmed:

- no console errors;
- no animation when reduced motion is requested;
- no horizontal scrolling at phone width.

Not done:

- screen-reader testing;
- frame-rate profiling;
- testing on real touch devices;
- testing in Safari or Firefox.

Mobile layout was deliberately left out of scope. The `site/` folder must be rebuilt with `uv run build_site.py` to include the latest changes.
