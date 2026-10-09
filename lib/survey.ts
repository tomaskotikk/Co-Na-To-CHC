// Dotazník před show — sdílené mezi formulářem a API.
// Otázky zatím NEJSOU ve hře (data/questions.json), sem se sbírají odpovědi.

export type SurveyKind = "text" | "teacher" | "room" | "subject";

const T = "teacher";
const U = "room";
const P = "subject";

const QUESTIONS: [string, SurveyKind?][] = [
  ["Nejlepší učebna na CHC?", U],
  ["Nejlepší učitel na CHC?", T],
  ["Nejlepší produkt z automatu?"],
  ["Nejvíc sexy učitel?", T],
  ["Nejbohatší učitel?", T],
  ["Který učitel by nejlépe sbalil dámu / muže na diskotéce?", T],
  ["Který učitel chodí nejpozději?", T],
  ["Nejméně pohodlná učebna?", U],
  ["Nejlepší aktivita o volné hodině?"],
  ["Nejlepší aktivita v tělocviku?"],
  ["Největší drbna ve sborovně?", T],
  ["Kdo má největší body count z učitelů?", T],
  ["Co nejčastěji děláš o přestávce?"],
  ["Jaký je nejlepší předmět?", P],
  ["Jaké nemoci / postihy ti přineslo studium na CHC?"],
  ["Jaká je nejčastější výmluva na to, že nemáš DÚ?"],
  ["Kterého učitele by sis vzal/a na pustý ostrov?", T],
  ["Kde bys nechtěl/a potkat svého třídního učitele?"],
  ["Který z učitelů má nejpravděpodobněji varnu perníku?", T],
  ["Co dělá student místo hodiny, když řekne, že jde na záchod?"],
  ["Podle čeho poznáš, že učitel včera pil?"],
  ["Co si studenti objednávají, když nemají oběd?"],
  ["Který učitel umí nejméně s počítačem?", T],
  ["Kde se nejčastěji schovává pan Pešák?"],
  ["Co bys zrušil/a na škole CHC?"],
  ["Kdo z učitelů má největší plat?", T],
  ["Kdo z učitelů by dnes nejpravděpodobněji neodmaturoval?", T],
  ["Nejhorší předmět na CHC?", P],
  ["Který z učitelů nejpravděpodobněji dělá content na OnlyFans?", T],
  ["Kdo z učitelů byl nejpravděpodobněji ve vězení?", T],
];

export const SURVEY_QUESTIONS = QUESTIONS.map(([text, kind = "text"], i) => ({
  id: `q${String(i + 1).padStart(2, "0")}`,
  text,
  kind,
}));

/** seřazeno podle příjmení (jako v Bakalářích) */
export const SURVEY_TEACHERS = [
  "Šárka Adamcová",
  "Ondřej Belica",
  "Martin Davidov",
  "Terezie Dobešová",
  "Blahoslav Fajmon",
  "Lukáš Gregor",
  "Miroslava Gregorová",
  "Hana Háblová",
  "Petr Chromčák",
  "Renata Klepšová",
  "Jana Klinkovská",
  "Marek Kolář",
  "Jozef Kováčik",
  "Monika Kováčiková",
  "Jaroslava Krmela Vacková",
  "Robin Lipo",
  "Martina Malaníková",
  "Renáta Molová",
  "Lena Navrátilová",
  "Adam Němec",
  "Veronika Pasterná Szemlová",
  "Aleš Pešák",
  "Hana Pešáková",
  "Ondřej Polách",
  "Jiří Pometlo",
  "Věra Pospíšilová",
  "Vít Přibyla",
  "Martina Růžičková",
  "Dalibor Silný",
  "Gabriela Slezáčková",
  "Jarmila Sýkorová",
  "Jaromír Švejda",
  "Zuzana Teličková",
  "Jonáš Vacek",
  "Tereza Valíková",
  "Barbora Večerková",
  "Viktor Vráblík",
  "Martina Zbořil Chytková",
  "Lenka Zbořilová",
];

export const SURVEY_ROOMS = [
  "Alfa",
  "Ateliér Zeman - Zvukárna",
  "Ateliér Zeman A",
  "Ateliér Zeman B",
  "Delta",
  "Epsilon",
  "Eta",
  "Fí",
  "Fotografický ateliér",
  "Gama",
  "Iota",
  "Jídelna",
  "Kappa",
  "Kinosál",
  "Lambda",
  "Omicron",
  "Pod Borovicemi",
  "Ró",
  "Sborovna",
  "Sigma",
  "Studovna",
  "Tau neformální",
  "Tělocvična",
  "Theta",
  "Tutoring 1",
  "Tutoring 2",
  "U Branky",
];

/** z Bakalářů; varianty „maturitní práce“ / „teoretická část“ / „profilová zkouška“ sloučené, ať se hlasy netříští */
export const SURVEY_SUBJECTS = [
  "AI engineering",
  "Anglický jazyk",
  "Animace",
  "Aplikace Adobe Photoshop",
  "Ateliér - kamerová cvičení",
  "Ateliér 3D počítačových her",
  "Ateliér filmové tvorby",
  "Ateliér fotografie",
  "Ateliér mobilních aplikací",
  "Ateliér multimediální 2D tvorby",
  "Ateliér multimediální tvorby",
  "Bezpečnost informačních systémů",
  "Český jazyk a literatura",
  "Databáze a programování MySQL",
  "Dějepis",
  "Dějiny filmu",
  "Dějiny výtvarné kultury",
  "Ekonomie",
  "Environmentální výchova",
  "Hardware a PC sítě",
  "Internet, elektronická komunikace a soc. sítě",
  "Kamera AVD",
  "Marketing a teorie reklamy",
  "Matematika",
  "Mediální tvorba",
  "Multimédia a digitální design",
  "Multimediální tvorba 3D",
  "NoSQL databáze",
  "Písmo",
  "Počítačová grafika",
  "Praktická analýza AVD",
  "Produkce a producentství AVD",
  "Programovací jazyk C++",
  "Programovací jazyk Java",
  "Programovací jazyk JavaScript",
  "Programování 2D her a aplikací",
  "Programování 3D počítačových her",
  "Programování webových stránek v PHP",
  "Realizace nestandardních scén",
  "Režie a scenáristika AVD",
  "Seminář českého jazyka",
  "Seminář matematiky",
  "Seminář ZSV",
  "Softwarové inženýrství",
  "Střih AVD",
  "Tělesná výchova",
  "Teorie umění a analýza uměleckých děl",
  "Třídnická hodina",
  "Úvod do audiovize",
  "Úvod do programování a základy robotiky",
  "Úvod do programování www stránek",
  "Úvod do střihu AVD",
  "Úvod do technologie výroby AVD",
  "Výtvarná příprava",
  "Vývoj PC her a multimediálních aplikací",
  "Základy informatiky",
  "Základy mediální výchovy",
  "Základy přírodních věd",
  "Základy společenských věd",
  "Základy účetnictví a podnikání",
  "Zvuková složka multimediálního díla",
];

/** z čeho se u které otázky vybírá (server nic jiného nepřijme) */
export const SURVEY_CHOICES: Record<Exclude<SurveyKind, "text">, string[]> = {
  teacher: SURVEY_TEACHERS,
  room: SURVEY_ROOMS,
  subject: SURVEY_SUBJECTS,
};

/** hovorové názvy a zkratky — jen pro hledání, ať „matika“ nebo „tělák“ najde, co má */
export const SURVEY_ALIASES: Record<string, string> = {
  Matematika: "matika math",
  "Seminář matematiky": "matika",
  "Tělesná výchova": "tělák tělocvik TV",
  Tělocvična: "tělák tělocvik",
  "Český jazyk a literatura": "čeština češtinu ČJ",
  "Seminář českého jazyka": "čeština ČJ",
  "Anglický jazyk": "angličtina angličtinu AJ english",
  "Základy společenských věd": "ZSV",
  "Základy informatiky": "informatika",
  "Třídnická hodina": "třídnická TH",
  "Programovací jazyk JavaScript": "JS",
  "Programovací jazyk C++": "cpp",
  "Programování webových stránek v PHP": "web",
  "Úvod do programování www stránek": "web html",
  "Databáze a programování MySQL": "SQL",
  "Hardware a PC sítě": "HW",
  "Aplikace Adobe Photoshop": "PS fotošop",
  "Bezpečnost informačních systémů": "BIS",
  "Ateliér Zeman - Zvukárna": "zvukovka",
  Fí: "fi phi",
  Ró: "ro rho",
  Omicron: "omikron",
  Gama: "gamma",
};

const OBORY = [
  ["A", "filmaři"],
  ["B", "grafici"],
  ["C", "vývojáři"],
] as const;

/** 1.A … 4.C */
export const SURVEY_CLASSES = [1, 2, 3, 4].flatMap((year) =>
  OBORY.map(([letter, obor]) => ({ id: `${year}.${letter}`, label: `${year}.${letter}`, hint: obor })),
);

export type SurveyRole = "zak" | "ucitel";

export const SURVEY_LIMITS = { name: 40, answer: 80 };

/** rychleji to poctivě vyplnit nejde — rychlejší odeslání bere server jako bota */
export const SURVEY_MIN_FILL_MS = 30_000;

/** cookie od serveru „už odesláno“ (druhá pojistka vedle localStorage) */
export const SURVEY_COOKIE = "chc_dotaznik";

/** bez diakritiky a velikosti písmen — „pesak“ najde „Pešák“ */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
