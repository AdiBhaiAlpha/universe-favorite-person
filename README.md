# The Universe Has A Favorite Person

A tiny astronomical experiment about one particular person. An interactive observatory: enter a name, watch the starfield re-arrange into a deterministic constellation, then read two quiet lines and one final sentence.

## Concept

Cinematic, minimal, handcrafted deep-space experience. No stock galaxies, no neon AI gradients, no frameworks. Canvas + CSS + vanilla JS.

## Technology

- Static site, no backend
- HTML5 Canvas starfield (DPR-aware, `requestAnimationFrame`)
- Vanilla JS state machine (landing → status → travel → constellation → science → final)
- Deterministic constellation from name seed (FNV-1a + mulberry32), so the same name always yields the same pattern
- Vite for dev/build only (no runtime dependencies)

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

Output goes to `dist/`.

## Deployment

- GitHub: this repo
- Vercel: `vc --prod` (static + Vite preset). See production URL below.

## URLs

- GitHub repository: https://github.com/AdiBhaiAlpha/universe-favorite-person
- Production: https://the-universe-has-a-fav-person.vercel.app
- Example observation: https://the-universe-has-a-fav-person.vercel.app/?name=Sayantika

## Notes

- `?name=Sayantika` pre-fills the observation.
- Finale: after the full animation (status → constellation → science → final line), a "Continue →" button opens a sealed confession letter as the last beat. Closing it returns to the final screen; restart stays available as a subtle link.
- Respects `prefers-reduced-motion` (static placement, no travel animation).
- Restart via "Observe another person" — no page reload, timers/frames cleaned.
