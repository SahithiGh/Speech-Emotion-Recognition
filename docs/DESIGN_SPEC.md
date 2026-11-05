# DESIGN_SPEC (Premium v3)

- **Tokens:** `frontend/src/tokens.css` (colours, exact palettes) and `typography.css` (fonts, type scale). Components use only `var(--color-*)` and `var(--font-*)`.
- **Bright:** background #FFFEFA, text #160709, primary #C4536E (button label uses #160709 for 4.5:1), secondary #4E5D9F (links, table rules, chart bars), accent #3F6A28 (step icons, success).
- **Dark:** background #050400, text #FAFAFA, primary #5B1626 (buttons with a lighter outline), secondary #424552 (borders, info), accent #0D3C0E (step icons, success).
- **Fonts:** Fraunces (editorial headlines, italic for emphasis), Plus Jakarta Sans (navigation and interface), IBM Plex Mono (metrics, timestamps, identifiers). Self-hosted. This set follows the newest brief and replaces the earlier Space Grotesk/DM Sans choice; both are one-file changes in `typography.css`.
- **Homepage:** full-viewport footage (never filtered, same in both themes) with the headline layered directly on it (no panel, no scrim). Headline upper-left at up to 168 px, supporting copy and the two actions lower-left, model status lower-right, a pause control for the video. Reduced motion shows the poster. The navigation is transparent over the footage and becomes solid after the hero. Text contrast is measured against the actual frames with `devtools/hero_contrast.py`.
- **Shape and motion:** 6 px corners, no pills; only spinner and bar transitions, reduced-motion respected.
- **Status without colour alone:** icons and text on every banner, badge, error and chart row; timeline segments carry text labels.
- **Rejected:** purple, emoji, decorative gradients (only the spectrogram legend uses a ramp, because it encodes data), fake metrics, generated imagery.
