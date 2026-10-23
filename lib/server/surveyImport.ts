// Otázky do hry z dotazníku: u každé otázky 6 nejčastějších odpovědí.
// Body = podíl hlasů mezi těmi šesti, dohromady 100 (jako „ze 100 lidí“ v Co na to Češi) —
// psané odpovědi jsou roztříštěné, takže čisté procento ze všech by dávalo jen pár bodů.

import type { Question } from "../types";
import type { SurveyData } from "./storage";

const SLOTS = 6;
/** otázka s méně různými odpověďmi by byla nudná deska */
const MIN_ANSWERS = 3;

/** „Mobil“, „mobil!“ i „ MOBIL “ = jedna odpověď */
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildFromSurvey(questions: SurveyData["questions"], responses: SurveyData["responses"], makeId: () => string): Question[] {
  const out: Question[] = [];
  for (const q of questions) {
    const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
    for (const r of responses) {
      const raw = r.answers[q.id];
      if (typeof raw !== "string") continue;
      const text = raw.replace(/\s+/g, " ").trim();
      const key = norm(text);
      if (!key) continue;
      const g = groups.get(key) ?? { count: 0, spellings: new Map() };
      g.count++;
      g.spellings.set(text, (g.spellings.get(text) ?? 0) + 1);
      groups.set(key, g);
    }
    const top = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, SLOTS);
    if (top.length < MIN_ANSWERS) continue;
    const votes = top.reduce((n, g) => n + g.count, 0);
    out.push({
      id: makeId(),
      text: q.text,
      multiplier: 1,
      source: "chc",
      answers: top.map((g) => ({
        // nejčastější zápis
        text: capitalize([...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0][0]).slice(0, 60),
        points: Math.max(1, Math.round((g.count / votes) * 100)),
      })),
    });
  }
  return out;
}
