import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ConferenceAttendeeHub.jsx";

// Inject globals from Vite env
window.__firebase_config = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID
};
window.__app_id = import.meta.env.VITE_APP_ID;
window.__initial_auth_token = new URL(location.href).searchParams.get("token") || null;

// Optional Sentry init (only if DSN provided)
const DSN = import.meta.env.VITE_SENTRY_DSN;
if (DSN) {
  import("@sentry/browser").then((Sentry) => {
    Sentry.init({ dsn: DSN, tracesSampleRate: 0.1 });
  });
}

const el = document.getElementById("root");
createRoot(el).render(<App />);
