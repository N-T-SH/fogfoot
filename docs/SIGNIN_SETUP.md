# Turning on Google sign-in

Sign-in is built but off until you add two settings in Vercel. Until then the app works as before and anyone can share coverage.

1. **Google Cloud Console** (free): create a project, then *APIs & Services → OAuth consent screen* (External, add the app name and a support e-mail), then *Credentials → Create credentials → OAuth client ID → Web application*.
   - Authorised JavaScript origins: `https://fogfoot.vercel.app` (add the preview URL too if you want to test there).
   - No redirect URI is needed (the button returns a token to the page).
   - Copy the **Client ID** (it ends in `.apps.googleusercontent.com`). It is public by design.
2. **Vercel → fogfoot → Settings → Environment Variables** (Production, and Preview if testing there):
   - `GOOGLE_CLIENT_ID` = the client ID
   - `SESSION_SECRET` = a random string of at least 32 characters (`openssl rand -base64 48`). Treat it like a password.
3. Redeploy (push any commit, or *Redeploy* in Vercel).

When both are set, sharing coverage needs: signed in, a chosen name, and the current notice accepted. Each person can share up to 3,000 dots a day.

## What is stored (all in the private Blob store)
- `users/<hashed id>.json`: handle, day created, consent version and day, today's shared-dot count. No e-mail, name or Google id.
- `handles/<handle>.json`: handle to hashed id, so names are unique.
- `reports/*.json`: problem reports (what, optional note, hashed id of the reporter).
- Coverage stays anonymous: no user id is written next to any dot.

Rotating `SESSION_SECRET` signs everyone out **and** changes every hashed id, so people would get new accounts. Do not rotate it casually.
