// Odpovědi z dotazníku s cache v paměti. Na Vercelu (serverless) nejde držet živý listener,
// proto se při každém dotazu dotahují jen dokumenty novější než poslední známý — Firestore pak
// účtuje jen nové odpovědi. Jednou za pár minut (a na studené instanci) se načte všechno znovu.

import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { firebase } from "./firebase";

export type SurveyRow = {
  id: string;
  firstName: string;
  lastName: string;
  role: "zak" | "ucitel";
  className: string | null;
  createdAt: number | null;
  answers: Record<string, string>;
};

const FULL_REFRESH_MS = 5 * 60_000;

let rows = new Map<string, SurveyRow>();
let lastFull = 0;
let inflight: Promise<void> | null = null;

const toRow = (id: string, d: DocumentData): SurveyRow => ({
  id,
  firstName: d.firstName ?? "",
  lastName: d.lastName ?? "",
  role: d.role === "ucitel" ? "ucitel" : "zak",
  className: d.className ?? null,
  createdAt: (d.createdAt as Timestamp | undefined)?.toMillis() ?? null,
  answers: d.answers ?? {},
});

/** null = Firebase není nastavený */
export async function surveyRows(): Promise<SurveyRow[] | null> {
  const fb = firebase();
  if (!fb) return null;
  inflight ??= (async () => {
    const col = fb.db.collection("survey_responses");
    if (Date.now() - lastFull > FULL_REFRESH_MS) {
      // celé načtení — zachytí i smazané odpovědi
      const snap = await col.get();
      rows = new Map(snap.docs.map((d) => [d.id, toRow(d.id, d.data())]));
      lastFull = Date.now();
    } else {
      const newest = Math.max(0, ...[...rows.values()].map((r) => r.createdAt ?? 0));
      const snap = await col.where("createdAt", ">", Timestamp.fromMillis(newest)).get();
      for (const d of snap.docs) rows.set(d.id, toRow(d.id, d.data()));
    }
  })().finally(() => (inflight = null));
  await inflight;
  return [...rows.values()].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
