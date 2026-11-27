// Otázky do hry z dotazníku: u každé otázky 6 nejčastějších odpovědí.
// Psané odpovědi se nejdřív sloučí podle pravidel ze survey/groups (stejná jako na webu s výsledky),
// takže „spánek“ a „spát“ je jedna karta. Body = podíl hlasů mezi těmi šesti, dohromady 100
// (jako „ze 100 lidí“ v Co na to Češi).

import type { Question } from "../types";
import { groupAnswers, toPoints } from "../surveyGroups";
import type { SurveyData } from "./storage";

const SLOTS = 6;
/** otázka s méně různými odpověďmi by byla nudná deska */
const MIN_ANSWERS = 3;

export function buildFromSurvey(data: SurveyData, makeId: () => string): Question[] {
  const out: Question[] = [];
  for (const q of data.questions) {
    const answers = data.responses.flatMap((r) => (typeof r.answers[q.id] === "string" ? [r.answers[q.id] as string] : []));
    const groups = data.groups[q.id];
    const skip = new Set(groups?.skip ?? []);
    const top = groupAnswers(answers, groups)
      .filter((g) => !skip.has(g.text))
      .slice(0, SLOTS);
    if (top.length < MIN_ANSWERS) continue;
    const points = toPoints(top.map((g) => g.count));
    out.push({
      id: makeId(),
      text: q.text,
      multiplier: 1,
      source: "chc",
      answers: top.map((g, i) => ({ text: g.text.slice(0, 60), points: points[i] })),
    });
  }
  return out;
}
