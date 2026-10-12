// Dotazník před show — sdílené mezi formulářem a API.
// Otázky zatím NEJSOU ve hře (data/questions.json), sem se sbírají odpovědi.

export const SURVEY_QUESTIONS = [
  "Nejlepší učebna na CHC?",
  "Nejlepší učitel na CHC?",
  "Nejlepší produkt z automatu?",
  "Nejvíc sexy učitel?",
  "Nejbohatší učitel?",
  "Který učitel by nejlépe sbalil dámu / muže na diskotéce?",
  "Který učitel chodí nejpozději?",
  "Nejméně pohodlná učebna?",
  "Nejlepší aktivita o volné hodině?",
  "Nejlepší aktivita v tělocviku?",
  "Největší drbna ve sborovně?",
  "Kdo má největší body count z učitelů?",
  "Co nejčastěji děláš o přestávce?",
  "Jaký je nejlepší předmět?",
  "Jaké nemoci / postihy ti přineslo studium na CHC?",
  "Jaká je nejčastější výmluva na to, že nemáš DÚ?",
  "Kterého učitele by sis vzal/a na pustý ostrov?",
  "Kde bys nechtěl/a potkat svého třídního učitele?",
  "Který z učitelů má nejpravděpodobněji varnu perníku?",
  "Co dělá student místo hodiny, když řekne, že jde na záchod?",
  "Podle čeho poznáš, že učitel včera pil?",
  "Co si studenti objednávají, když nemají oběd?",
  "Který učitel umí nejméně s počítačem?",
  "Kde se nejčastěji schovává pan Pěšák?",
  "Co bys zrušil/a na škole CHC?",
  "Kdo z učitelů má největší plat?",
  "Kdo z učitelů by dnes nejpravděpodobněji neodmaturoval?",
  "Nejhorší předmět na CHC?",
  "Který z učitelů nejpravděpodobněji dělá content na OnlyFans?",
  "Kdo z učitelů byl nejpravděpodobněji ve vězení?",
].map((text, i) => ({ id: `q${String(i + 1).padStart(2, "0")}`, text }));

export type SurveyRole = "zak" | "ucitel";

export const SURVEY_LIMITS = { name: 40, className: 8, answer: 80 };

/** rychleji to poctivě vyplnit nejde — rychlejší odeslání bere server jako bota */
export const SURVEY_MIN_FILL_MS = 30_000;

/** cookie od serveru „už odesláno“ (druhá pojistka vedle localStorage) */
export const SURVEY_COOKIE = "chc_dotaznik";
