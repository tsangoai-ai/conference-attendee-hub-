// Usage: node scripts/make-admin.mjs <APP_ID> <UID>
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import admin from "firebase-admin";
const [,, appId, uid] = process.argv;
if (!appId || !uid) { console.error("Usage: node scripts/make-admin.mjs <APP_ID> <UID>"); process.exit(1); }
const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccount.json";
if (!fs.existsSync(keyPath)) { console.error(`Missing service account key at ${path.resolve(keyPath)}`); process.exit(1); }
admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
await db.doc(`artifacts/${appId}/admins/${uid}`).set(
  { createdAt: admin.firestore.FieldValue.serverTimestamp() },
  { merge: true }
);
console.log(`✅ Granted admin for appId=${appId} uid=${uid}`);
