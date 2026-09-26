# Redesign brief: Zugspitze cloud field story

## Direction

- **Mode:** Redesign / Overhaul.
- **Design anchor:** Resn's story-through-scroll recipe, interpreted as an Alpine observation diary rather than an agency-site imitation.
- **Audience:** Assignment reviewers and readers exploring mountain clouds and paired station temperatures.
- **Five dials:** Visual variance 8; motion 6; information density 7; asset dependence 7; existing identity fidelity 6.
- **Narrative beats:** Ask the field question; move through the 14–20 September VIIRS week and temperature record; isolate the 22 September CTH reference scan; close on interpretation limits and provenance.

## Visual system

- **Palette:** Deep field black `#050a0a`, ice `#a6ffe5`, snow `#f2f5ef`, and the existing warm `#dda657`. The imagery supplies the rest of the color range.
- **Typography:** Bodoni / Didot / Times display stack for English, local Chinese serif stack for Chinese, system sans for body copy, and monospace for dates and data.
- **Composition:** An 8px spacing base with intentional scene-level asymmetry. Full image extents stay visible so map coverage remains comparable.
- **Surfaces:** Sharp image and chart frames; no stack of generic cards. Scene contrast comes from the imagery and restrained overlays.
- **Motion:** Native sticky scenes follow the nearest day as the reader scrolls. Loaded satellite images fade in over 260 ms; frequent value changes are immediate. Play/pause icons crossfade over 300 ms. Reduced motion disables nonessential animation.

## Contracts to preserve

- Keep the project local and static, with its current asset paths and downloads.
- Preserve all source data, observation dates, units, and station identities.
- Keep the 14–20 September VIIRS comparison separate from the 22 September CTH reference.
- Preserve the caveats: no synchronous overlay, no cloud-type classification, and no causal claim from temperature difference.
- Retain the hourly controls, CTH frame controls, chart labels, keyboard operation, focus visibility, and source information.

## Implemented direction

The user chose an immersive scroll story with a few real controls after reviewing the initial direction. `index.html` is now the production story: satellite opening, seven scrolling daily scenes, a light temperature chapter, a separate dark cloud-height chapter, and a closing interpretation. English is the first-visit default; the persistent EN / 中文 switch translates content, controls, chart labels, and accessibility descriptions without resetting the chosen observations.

`storytelling-v0.html` remains an earlier direction draft. It is not the production entry point. The active stylesheet is `story.css`; older styles are retained but no longer loaded.

## Delivery boundary

The implementation uses the committed datasets and assets. The static site is assembled with `build_site.py`. Browser visual and interaction acceptance has not been performed in this environment.
