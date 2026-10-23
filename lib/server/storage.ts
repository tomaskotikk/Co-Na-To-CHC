// Ukládání stavu hry a otázek: vždy do data/*.json, a pokud je nastavený klíč, i do Firebase (Firestore).
// Lokální soubory jsou záloha — když na plese nejde internet, hra jede dál z nich.

import fs from "node:fs";
import path from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentReference } from "firebase-admin/firestore";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "game.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const KEY_FILE = path.join(process.cwd(), "firebase-key.json");
const COLLECTION = "show";
const LOAD_TIMEOUT_MS = 8000;

export type Stored = { state: unknown; questions: unknown };

/** data z dotazníku (repo CHC-Dotaznik ukládá do stejného Firebase projektu) */
export type SurveyData = {
  questions: { id: string; text: string }[];
  responses: { answers: Record<string, string | null> }[];
};

type Loaded = { data: unknown; time: number };

export type Storage = {
  readonly label: string;
  load(): Promise<Stored>;
  saveState(state: object): void;
  /** při vypínání serveru: zapsat hned a počkat (jinak by se ztratila poslední akce) */
  flushState(state: object): Promise<void>;
  saveQuestions(questions: object[]): void;
  /** jen s Firebase */
  readSurvey?(): Promise<SurveyData>;
};

function readLocal(file: string): Loaded | null {
  try {
    return { data: JSON.parse(fs.readFileSync(file, "utf8")), time: fs.statSync(file).mtimeMs };
  } catch {
    return null;
  }
}

function writeLocal(file: string, data: unknown, what: string) {
  fs.writeFile(file, JSON.stringify(data, null, 2), (e) => e && console.error(`Uložení ${what} selhalo`, e));
}

/** Klíč service accountu: proměnná FIREBASE_SERVICE_ACCOUNT (celý JSON), nebo soubor firebase-key.json. */
function serviceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() || (fs.existsSync(KEY_FILE) ? fs.readFileSync(KEY_FILE, "utf8") : "");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    console.error("Firebase: klíč není platný JSON — ukládám jen do data/.");
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms))]);
}

/** Zapisuje vždy jen nejnovější hodnotu, jeden zápis naráz (pořadí se nepřehodí, offline se nehromadí fronta). */
function latestWriter(ref: DocumentReference, what: string) {
  let next: object | null = null;
  let busy = false;
  let failing = false;
  const pump = async () => {
    if (busy || !next) return;
    busy = true;
    const data = next;
    next = null;
    try {
      await ref.set(data);
      if (failing) console.log(`Firebase: ${what} se zase ukládá.`);
      failing = false;
    } catch (e) {
      if (!failing) console.error(`Firebase: uložení ${what} selhalo (záloha v data/ je v pořádku):`, (e as Error).message);
      failing = true;
    }
    busy = false;
    void pump();
  };
  return (data: object) => {
    // kopie hned teď — hra stav dál mění; JSON zároveň zahodí undefined, které Firestore nebere
    next = JSON.parse(JSON.stringify(data));
    void pump();
  };
}

export function createStorage(): Storage {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const key = serviceAccount();

  if (!key) {
    return {
      label: "jen lokálně (data/)",
      async load() {
        return { state: readLocal(STATE_FILE)?.data ?? null, questions: readLocal(QUESTIONS_FILE)?.data ?? null };
      },
      saveState: (s) => writeLocal(STATE_FILE, s, "stavu"),
      saveQuestions: (q) => writeLocal(QUESTIONS_FILE, q, "otázek"),
      async flushState(s) {
        fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
      },
    };
  }

  const db = getFirestore(initializeApp({ credential: cert(key) }));
  const stateRef = db.collection(COLLECTION).doc("game");
  const questionsRef = db.collection(COLLECTION).doc("questions");
  const writeState = latestWriter(stateRef, "stavu hry");
  const writeQuestions = latestWriter(questionsRef, "otázek");

  const readRemote = async (ref: DocumentReference): Promise<Loaded | null> => {
    const snap = await ref.get();
    return snap.exists ? { data: snap.data(), time: snap.updateTime!.toMillis() } : null;
  };

  /** stav: novější podle času uloženého v datech (savedAt) — datum souboru lže (cache buildu na Renderu, kopírování)
   *  lokální bere jen tehdy, když show běžela offline a lokální záznam je opravdu novější */
  const newerState = (remote: Loaded | null, local: Loaded | null) => {
    const at = (l: Loaded | null) => Number((l?.data as { savedAt?: unknown } | undefined)?.savedAt) || 0;
    if (remote && local) return (at(local) > at(remote) ? local : remote).data;
    return (remote ?? local)?.data ?? null;
  };

  return {
    label: `Firebase (${key.project_id}) + záloha v data/`,
    async load() {
      const localState = readLocal(STATE_FILE);
      const localQuestions = readLocal(QUESTIONS_FILE);
      try {
        const [state, questions] = await withTimeout(Promise.all([readRemote(stateRef), readRemote(questionsRef)]), LOAD_TIMEOUT_MS);
        const q = questions && { ...questions, data: (questions.data as { list?: unknown }).list ?? null };
        // otázky: Firebase je hlavní zdroj, lokální soubor jen když tam nic není
        return { state: newerState(state, localState), questions: q?.data ?? localQuestions?.data ?? null };
      } catch (e) {
        console.error("Firebase: načtení selhalo, jedu z data/:", (e as Error).message);
        return { state: localState?.data ?? null, questions: localQuestions?.data ?? null };
      }
    },
    saveState(s) {
      const data = { ...s, savedAt: Date.now() };
      writeLocal(STATE_FILE, data, "stavu");
      writeState(data);
    },
    async flushState(s) {
      const data = { ...s, savedAt: Date.now() };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
      await withTimeout(stateRef.set(JSON.parse(JSON.stringify(data))), 3000).catch(() => {});
    },
    saveQuestions(q) {
      writeLocal(QUESTIONS_FILE, q, "otázek");
      // Firestore nebere pole jako kořen dokumentu
      writeQuestions({ list: q });
    },
    async readSurvey() {
      const [qs, rs] = await withTimeout(
        Promise.all([db.collection("survey").doc("questions").get(), db.collection("survey_responses").get()]),
        LOAD_TIMEOUT_MS,
      );
      return {
        questions: (qs.data()?.list ?? []) as SurveyData["questions"],
        responses: rs.docs.map((d) => ({ answers: (d.data().answers ?? {}) as Record<string, string | null> })),
      };
    },
  };
}
