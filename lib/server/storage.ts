// Ukládání stavu hry a otázek: vždy do data/*.json, a pokud je nastavený klíč, i do Firebase (Firestore).
// Lokální soubory jsou záloha — když na plese nejde internet, hra jede dál z nich.

import fs from "node:fs";
import path from "node:path";
import type { DocumentReference } from "firebase-admin/firestore";
import { firebase } from "./firebase";

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "game.json");
const QUESTIONS_FILE = path.join(DATA_DIR, "questions.json");
const COLLECTION = "show";
const LOAD_TIMEOUT_MS = 8000;

export type Stored = { state: unknown; questions: unknown };

type Loaded = { data: unknown; time: number };

export type Storage = {
  readonly label: string;
  load(): Promise<Stored>;
  saveState(state: object): void;
  saveQuestions(questions: object[]): void;
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
  const fb = firebase();

  if (!fb) {
    return {
      label: "jen lokálně (data/)",
      async load() {
        return { state: readLocal(STATE_FILE)?.data ?? null, questions: readLocal(QUESTIONS_FILE)?.data ?? null };
      },
      saveState: (s) => writeLocal(STATE_FILE, s, "stavu"),
      saveQuestions: (q) => writeLocal(QUESTIONS_FILE, q, "otázek"),
    };
  }

  const { db, projectId } = fb;
  const stateRef = db.collection(COLLECTION).doc("game");
  const questionsRef = db.collection(COLLECTION).doc("questions");
  const writeState = latestWriter(stateRef, "stavu hry");
  const writeQuestions = latestWriter(questionsRef, "otázek");

  const readRemote = async (ref: DocumentReference): Promise<Loaded | null> => {
    const snap = await ref.get();
    return snap.exists ? { data: snap.data(), time: snap.updateTime!.toMillis() } : null;
  };

  /** novější z Firebase a lokálního souboru (např. když show běžela offline) */
  const newer = (remote: Loaded | null, local: Loaded | null) =>
    (remote && local ? (remote.time >= local.time ? remote : local) : (remote ?? local))?.data ?? null;

  return {
    label: `Firebase (${projectId}) + záloha v data/`,
    async load() {
      const localState = readLocal(STATE_FILE);
      const localQuestions = readLocal(QUESTIONS_FILE);
      try {
        const [state, questions] = await withTimeout(Promise.all([readRemote(stateRef), readRemote(questionsRef)]), LOAD_TIMEOUT_MS);
        const q = questions && { ...questions, data: (questions.data as { list?: unknown }).list ?? null };
        return { state: newer(state, localState), questions: newer(q, localQuestions) };
      } catch (e) {
        console.error("Firebase: načtení selhalo, jedu z data/:", (e as Error).message);
        return { state: localState?.data ?? null, questions: localQuestions?.data ?? null };
      }
    },
    saveState(s) {
      writeLocal(STATE_FILE, s, "stavu");
      writeState(s);
    },
    saveQuestions(q) {
      writeLocal(QUESTIONS_FILE, q, "otázek");
      // Firestore nebere pole jako kořen dokumentu
      writeQuestions({ list: q });
    },
  };
}
