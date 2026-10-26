# Landing page

Static page published to https://n-t-sh.github.io/fogfoot/ by `.github/workflows/pages.yml`.

- **Rename the app:** change `NAME` at the top of `main.js` (and the `<title>` / `og:title` in `index.html` for no-JS previews).
- **Waitlist storage:** the form posts to `app/api/waitlist.ts` on the Vercel site (private Blob store, one tiny file per address). Only our own origins are allowed by CORS.
- **Download the list:** set `WAITLIST_ADMIN_TOKEN` (24+ random characters) in Vercel, then
  `curl -H "Authorization: Bearer $TOKEN" https://fogfoot.vercel.app/api/waitlist -o waitlist.csv`. Without that variable the endpoint returns 404.
- **Remove someone:** they can do it themselves in the page footer; or delete `waitlist/<sha256 of lowercased e-mail>.json` from the store.
- Translations in `main.js` (Kannada, Hindi) are a first pass and need a native speaker's check.
