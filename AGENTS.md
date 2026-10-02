# Project rules

## DOM and CSS naming

- Use feature-specific, neutral names for CSS classes, IDs, `data-*` attributes and DOM hooks.
- Avoid names commonly targeted by content blockers, including `ad`, `ads`, `advert`, `banner`, `sponsor`, `affiliate`, `tracking`, `promo` and generic `social` selectors.
- User-facing labels may use the normal product vocabulary; this restriction concerns implementation identifiers exposed in the DOM.
- When adding a new persistent UI block, verify that it remains present with a mainstream content blocker enabled.
