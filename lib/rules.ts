// Pravidla na projektor (podle „Co na to Češi“, upravená na turnaj tým proti týmu).
// Projektor je ukazuje po snímcích, admin přepíná. Moderátor je čte nahlas — tady jsou jen hesla.

export type RuleIcon = "users" | "zap" | "swords" | "x" | "hand" | "trophy" | "scale" | "megaphone";

export type RuleSlide = {
  title: string;
  /** krátký podtitul pod nadpisem */
  lead: string;
  items: { icon: RuleIcon; text: string; strong?: string }[];
};

export const RULES: RuleSlide[] = [
  {
    title: "Jak se hraje",
    lead: "Nehádáte, co je správně. Hádáte, co řekla většina.",
    items: [
      { icon: "users", strong: "Ptali jsme se vás.", text: "Na tabuli je 6 nejčastějších odpovědí z dotazníku (a pár otázek z Co na to Češi)." },
      { icon: "trophy", strong: "Karta č. 1", text: "= nejčastější odpověď = nejvíc bodů. Čím níž, tím méně." },
      { icon: "swords", strong: "Turnaj:", text: "tým proti týmu, kdo prohraje duel, letí z pavouka." },
    ],
  },
  {
    title: "Rozehra u stolu",
    lead: "Kapitáni obou týmů jdou ke stolu. Telefon s bzučákem v ruce.",
    items: [
      { icon: "megaphone", text: "Moderátor přečte otázku — teprve pak se ukážou zakryté karty." },
      { icon: "zap", strong: "Kdo první zmáčkne BZUČ!,", text: "ten odpovídá." },
      { icon: "trophy", strong: "Trefa karty č. 1", text: "→ jeho tým hraje." },
      { icon: "swords", strong: "Jinak může soupeř přestřelit:", text: "trefí vyšší kartu → hraje jeho tým." },
      { icon: "x", text: "Netrefí nikdo nic? Kapitáni zkouší dál, dokud někdo netrefí." },
    ],
  },
  {
    title: "Tým na tahu",
    lead: "Vítěz rozehry jde za svým týmem a hraje se dál.",
    items: [
      { icon: "users", strong: "Hráči se střídají po řadě", text: "— každý řekne jednu odpověď, neradí se." },
      { icon: "trophy", strong: "Trefa", text: "→ karta se otočí a body jdou týmu." },
      { icon: "x", strong: "Vedle", text: "→ červené X." },
      { icon: "zap", strong: "Cíl:", text: "otočit všech 6 karet dřív než dostanete 3 X." },
    ],
  },
  {
    title: "3 chyby = krádež",
    lead: "Po třetím X tým končí a šanci dostane soupeř.",
    items: [
      { icon: "users", strong: "Soupeř se smí krátce poradit", text: "— pak kapitán řekne JEDNU odpověď." },
      { icon: "hand", strong: "Trefa → ukradne VŠECHNY body", text: "z otázky, i ty, co nahrál druhý tým." },
      { icon: "x", strong: "Vedle", text: "→ body si nechává tým, který hrál." },
      { icon: "megaphone", text: "Nakonec se odkryjí zbylé karty." },
    ],
  },
  {
    title: "Kdo vypadává",
    lead: "Hraje se pavouk — prohra v duelu znamená konec.",
    items: [
      { icon: "swords", strong: "Duel má víc otázek,", text: "body z nich se sčítají. Kolik jich bude, ohlásí moderátor." },
      { icon: "trophy", strong: "Víc bodů po duelu = postup.", text: "Kdo má méně, vypadává." },
      { icon: "scale", strong: "Lichý počet týmů?", text: "Vylosovaný tým postupuje rovnou o kolo dál." },
      { icon: "zap", strong: "Ve finále", text: "můžou být body ×2 nebo ×3." },
      { icon: "trophy", strong: "Pódium:", text: "vítěz finále, finalista a lepší ze semifinalistů." },
    ],
  },
  {
    title: "Fair play",
    lead: "Moderátor má vždycky poslední slovo.",
    items: [
      { icon: "megaphone", strong: "Platí první vyslovená odpověď.", text: "Opravovat se nedá." },
      { icon: "scale", strong: "Podobné odpovědi se uznávají", text: "— „spát“ = „spánek“. Rozhoduje moderátor." },
      { icon: "hand", strong: "Publikum nenapovídá!", text: "Napovězená odpověď = X." },
      { icon: "zap", strong: "Bzučák má jen kapitán", text: "u stolu — kdo dřív, ten dřív." },
    ],
  },
];
