import crypto from "node:crypto";
import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { firebase } from "@/lib/server/firebase";
import {
  fold,
  SURVEY_CHOICES,
  SURVEY_CLASSES,
  SURVEY_COOKIE,
  SURVEY_LIMITS,
  SURVEY_MIN_FILL_MS,
  SURVEY_QUESTIONS,
} from "@/lib/survey";

export const dynamic = "force-dynamic";

// Firestore:
//   survey_responses/{role-trida-jmeno-prijmeni}  jedna odpověď (id = jméno → stejný člověk nejde odeslat 2×)
//   survey/questions                              znění otázek k id q01…q30
// Učitelé, učebny, předměty a třídy se berou jen ze seznamu v lib/survey.ts — nic jiného se neuloží.

const MAX_BODY = 20_000;
const WINDOW_MS = 10 * 60_000;
// celá škola jde ven často přes jednu veřejnou IP, proto velkoryse
const MAX_PER_IP = 30;
const hits = new Map<string, number[]>();
let questionsSynced = false;
const CHOICES = Object.fromEntries(Object.entries(SURVEY_CHOICES).map(([k, v]) => [k, new Set(v)]));
const CLASSES = new Set(SURVEY_CLASSES.map((c) => c.id));

const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status });

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  const limited = recent.length >= MAX_PER_IP;
  if (!limited) recent.push(now);
  hits.set(ip, recent);
  return limited;
}

const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const slug = (s: string) =>
  fold(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export async function POST(req: Request) {
  const fb = firebase();
  if (!fb) return fail(503, "Databáze není nastavená. Dej vědět organizátorům.");

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) return fail(429, "Moc odeslání z této sítě. Zkus to za pár minut.");

  const raw = await req.text();
  if (raw.length > MAX_BODY) return fail(413, "Odpovědi jsou moc dlouhé.");
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail(400, "Neplatná data.");
  }

  // past na boty: skryté pole, které člověk nevidí — tváříme se, že se uložilo
  if (clean(body.web, 200)) return Response.json({ ok: true });

  const elapsed = Date.now() - Number(body.startedAt);
  if (!Number.isFinite(elapsed) || elapsed < SURVEY_MIN_FILL_MS) {
    return fail(400, "Tohle bylo moc rychlé — projdi prosím otázky a zkus to znovu.");
  }

  const firstName = clean(body.firstName, SURVEY_LIMITS.name);
  const lastName = clean(body.lastName, SURVEY_LIMITS.name);
  const role = body.role === "zak" || body.role === "ucitel" ? body.role : null;
  const className = role === "zak" ? String(body.className ?? "") : null;
  if (!firstName || !lastName) return fail(400, "Vyplň jméno a příjmení.");
  if (!role) return fail(400, "Vyber, jestli jsi žák, nebo učitel.");
  if (className !== null && !CLASSES.has(className)) return fail(400, "Vyber třídu ze seznamu.");

  const list = Array.isArray(body.answers) ? body.answers : [];
  const answers: Record<string, string> = {};
  for (const [i, q] of SURVEY_QUESTIONS.entries()) {
    const a = clean(list[i], SURVEY_LIMITS.answer);
    if (!a) return fail(400, `Chybí odpověď na otázku ${i + 1}.`);
    if (q.kind !== "text" && !CHOICES[q.kind].has(a)) return fail(400, `U otázky ${i + 1} vyber možnost ze seznamu.`);
    answers[q.id] = a;
  }

  const classKey = className ? slug(className).replace(/-/g, "") : null;
  const key = [role, classKey, slug(firstName), slug(lastName)].filter(Boolean).join("-");
  const { db, projectId } = fb;

  try {
    await db
      .collection("survey_responses")
      .doc(key)
      .create({
        firstName,
        lastName,
        role,
        className,
        answers,
        createdAt: FieldValue.serverTimestamp(),
        deviceId: clean(body.deviceId, 64),
        // IP neukládáme, jen otisk — stačí na odhalení spamu z jednoho místa
        ipHash: crypto.createHash("sha256").update(`${projectId}:${ip}`).digest("hex").slice(0, 16),
      });
  } catch (e) {
    if ((e as { code?: number }).code === 6) {
      return fail(409, "Pod tímhle jménem už dotazník někdo odeslal. Pokud jsi to nebyl/a ty, napiš organizátorům.");
    }
    console.error("Dotazník: uložení selhalo", e);
    return fail(500, "Uložení se nepovedlo. Zkus to prosím znovu.");
  }

  if (!questionsSynced) {
    questionsSynced = true;
    db.collection("survey")
      .doc("questions")
      .set({ list: SURVEY_QUESTIONS })
      .catch(() => (questionsSynced = false));
  }

  (await cookies()).set(SURVEY_COOKIE, "1", { maxAge: 60 * 60 * 24 * 365, httpOnly: true, sameSite: "lax", path: "/" });
  return Response.json({ ok: true });
}
