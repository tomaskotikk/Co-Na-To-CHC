// Sdílené připojení k Firebase (Firestore) pro hru i dotazník.

import fs from "node:fs";
import path from "node:path";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

const KEY_FILE = path.join(process.cwd(), "firebase-key.json");

/** Klíč service accountu: proměnná FIREBASE_SERVICE_ACCOUNT (celý JSON), nebo soubor firebase-key.json. */
function serviceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Firebase: klíč není platný JSON.");
    return null;
  }
}

let cached: { db: Firestore; projectId: string } | null | undefined;

/** Firestore, nebo null, když není nastavený klíč. */
export function firebase() {
  if (cached !== undefined) return cached;
  const key = serviceAccount();
  if (!key) return (cached = null);
  // server i API routy Next.js běží v jednom procesu — aplikaci inicializovat jen jednou
  const app = getApps().length ? getApp() : initializeApp({ credential: cert(key) });
  return (cached = { db: getFirestore(app), projectId: key.project_id });
}
