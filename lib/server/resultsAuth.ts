// Přístup na /vysledky: heslo je jen v proměnné RESULTS_PASSWORD (Render › Environment, lokálně .env.local).
// Po přihlášení dostane prohlížeč httpOnly cookie s podpisem odvozeným z hesla — změna hesla všechny odhlásí.

import crypto from "node:crypto";
import { cookies } from "next/headers";

export const RESULTS_COOKIE = "chc_vysledky";
export const RESULTS_MIN_PASSWORD = 10;

export function resultsPassword() {
  const pw = process.env.RESULTS_PASSWORD?.trim() ?? "";
  return pw.length >= RESULTS_MIN_PASSWORD ? pw : null;
}

const sha = (s: string) => crypto.createHash("sha256").update(s).digest();

export const resultsToken = (pw: string) => crypto.createHmac("sha256", pw).update("chc-vysledky-v1").digest("hex");

export function checkPassword(input: string) {
  const pw = resultsPassword();
  return !!pw && crypto.timingSafeEqual(sha(input), sha(pw));
}

export async function isResultsAuthed() {
  const pw = resultsPassword();
  const v = (await cookies()).get(RESULTS_COOKIE)?.value;
  return !!pw && !!v && crypto.timingSafeEqual(sha(v), sha(resultsToken(pw)));
}
