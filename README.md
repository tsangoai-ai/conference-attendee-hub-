# Conference Attendee Hub – Production Guide

## Quick Start
1. `cp .env.example .env` and fill Firebase + `VITE_APP_ID`.
2. `npm ci`
3. Local dev: `npm run dev` → open http://localhost:5173
4. Grant yourself admin once:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json
   npm run admin:make -- <APP_ID> <YOUR_AUTH_UID>
   ```
5. Deploy rules: `npm run deploy:rules`

## CI
- Add repo secrets:
  - `FIREBASE_PROJECT_ID`
  - `FIREBASE_TOKEN` (`firebase login:ci`)
- CI runs tests & build; deploys Firestore rules on `main`.

## Hosting options
- Firebase Hosting: `npm run build && firebase deploy --only hosting` (after `firebase init hosting`).
- Vercel: import repo, set the `VITE_*` env vars, build output `dist`.

## Notes
- Globals are injected from Vite env in `src/main.jsx`.
- Admin tab is role-gated via `/artifacts/{appId}/admins/{uid}` document existence.
