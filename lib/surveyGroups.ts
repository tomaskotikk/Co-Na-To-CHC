// Sloučení psaných odpovědí z dotazníku („spánek“, „spát“, „spink“ = jedna odpověď).
// Pravidla jsou ve Firestore v dokumentu survey/groups a používá je web s výsledky (CHC-Dotaznik)
// i hra (Co-Na-To-CHC) — tenhle soubor je v obou repech stejný.
//
// survey/groups = { q09: { rules: [{ label: "Spát", match: "sp(a|i)n|spat" }, …], skip: ["Gooní"] }, … }
// match = regulární výraz na odpověď bez diakritiky a malými písmeny; první shoda vyhrává.
// skip = skupiny, které se ve výsledcích ukazují, ale do hry se nedávají.

export type GroupRule = { label: string; match: string };
export type QuestionGroups = { rules: GroupRule[]; skip?: string[] };
export type SurveyGroups = Record<string, QuestionGroups>;

export type GroupedAnswer = {
  text: string;
  count: number;
  /** true = sloučená skupina podle pravidla */
  merged: boolean;
  /** původní zápisy, nejčastější první */
  variants: { text: string; count: number }[];
};

/** bez diakritiky, malými písmeny, jedna mezera */
export const foldAnswer = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** „Mobil“, „mobil!“ i „ MOBIL “ = jedna odpověď i bez pravidla */
const plainKey = (folded: string) => folded.replace(/[^a-z0-9]+/g, " ").trim();

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function groupAnswers(answers: string[], groups?: QuestionGroups | null): GroupedAnswer[] {
  const rules = (groups?.rules ?? []).flatMap((r) => {
    try {
      return [{ label: r.label, re: new RegExp(r.match) }];
    } catch {
      return [];
    }
  });
  const map = new Map<string, { text: string | null; count: number; spellings: Map<string, number> }>();
  for (const raw of answers) {
    const text = raw.replace(/\s+/g, " ").trim();
    const folded = foldAnswer(text);
    const rule = rules.find((r) => r.re.test(folded));
    const key = rule ? `g:${rule.label}` : `a:${plainKey(folded)}`;
    if (key === "a:") continue;
    const g = map.get(key) ?? { text: rule?.label ?? null, count: 0, spellings: new Map<string, number>() };
    g.count++;
    g.spellings.set(text, (g.spellings.get(text) ?? 0) + 1);
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => {
      const variants = [...g.spellings.entries()].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count);
      return { text: g.text ?? capitalize(variants[0].text), count: g.count, merged: g.text !== null, variants };
    })
    .sort((a, b) => b.count - a.count);
}

/** body pro hru: podíl hlasů mezi vybranými, dohromady přesně 100 */
export function toPoints(counts: number[]): number[] {
  const total = counts.reduce((n, c) => n + c, 0) || 1;
  const raw = counts.map((c) => (c * 100) / total);
  const pts = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  const rest = 100 - pts.reduce((n, p) => n + p, 0);
  for (let k = 0; k < rest; k++) pts[order[k % order.length][1]]++;
  return pts.map((p) => Math.max(1, p));
}
