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

/** jak moc se srovnají rozdíly (1 = čistý podíl hlasů, menší = vyrovnanější karty) */
const FLATTEN = 0.5;
/** nejčastější odpověď nesmí mít víc bodů — jinak by jedna karta rozhodla celou otázku */
const MAX_TOP = 35;

/** body pro hru: pořadí podle hlasů, ale vyrovnané (Pivo 137 vs. Město 5 nedá 91 : 4), dohromady přesně 100 */
export function toPoints(counts: number[]): number[] {
  let w = counts.map((c) => Math.max(c, 0) ** FLATTEN);
  const sum = w.reduce((n, x) => n + x, 0) || 1;
  w = w.map((x) => x / sum);
  const top = Math.max(...w);
  if (top > MAX_TOP / 100 && w.length > 1) {
    // srazit vítěze na strop a zbytek rozdělit mezi ostatní ve stejném poměru
    const restSum = 1 - top;
    const i = w.indexOf(top);
    const capped = w.map((x, j) => (j === i ? MAX_TOP / 100 : restSum ? (x / restSum) * (1 - MAX_TOP / 100) : 0));
    // jen když tím vítěz zůstane první (při vyrovnaném souboji by se pořadí prohodilo)
    if (capped.every((x, j) => j === i || x <= MAX_TOP / 100)) w = capped;
  }
  const raw = w.map((x) => x * 100);
  const pts = raw.map(Math.floor);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  const rest = 100 - pts.reduce((n, p) => n + p, 0);
  for (let k = 0; k < rest; k++) pts[order[k % order.length][1]]++;
  return pts.map((p) => Math.max(1, p));
}
