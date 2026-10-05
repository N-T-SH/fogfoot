# fogfoot app

Vite + Preact + TypeScript PWA. Opens the **pick-up prototype** (camera on top, map below, litter items to pick up; see `docs/DOTS_CONCEPT.md`). Other views: `/#/spike` is Spike A, the capture viability test for low-end Android and iOS (see `IMPLEMENTATION_PLAN.md`, Phase 0); `/#/icons` is the icon set.

```bash
npm ci
npm run dev        # http://localhost:5173 (camera/GPS need HTTPS on phones, see below)
npm run build      # typecheck + production build
```

## Testing Spike A on a real phone

Camera, GPS and wake lock only work on HTTPS (or localhost), so a LAN URL won't work on a phone. Easiest free options:

1. **Cloudflare Pages preview:** connect the repo, root directory `app`, build command `npm run build`, output `dist`. Open the `*.pages.dev` URL on the phone.
2. **Tunnel** from your laptop: `npm run build && npm run preview`, then `cloudflared tunnel --url http://localhost:4173`.

On the phone: open the URL, install it (Android: browser menu → Install app; iOS: Share → Add to Home Screen), launch from the home screen, tap **Start walk**, walk about 2 km, tap **Stop**, then **Copy report** and paste the JSON into an issue. Test on a low-end Android, a mid-range Android and an iPhone (iOS 16.4+), installed and in-browser.
