// Sdílené typy mezi serverem, projektorem, adminem a týmy.

export type Answer = { text: string; points: number };

export type Question = {
  id: string;
  text: string;
  answers: Answer[];
  /** násobič bodů (např. finálová otázka za dvojnásob) */
  multiplier: number;
  /** chc = z našeho dotazníku, cesi = záložní z Co na to Češi */
  source: QuestionSource;
};

export type QuestionSource = "chc" | "cesi";
export const SOURCE_LABEL: Record<QuestionSource, string> = { chc: "CHC", cesi: "Co na to Češi" };

export const TEAM_ICONS = [
  "rocket",
  "flame",
  "crown",
  "ghost",
  "zap",
  "gem",
  "cat",
  "dog",
  "bird",
  "fish",
  "rabbit",
  "turtle",
  "squirrel",
  "bug",
  "star",
  "coffee",
] as const;
export type TeamIconName = (typeof TEAM_ICONS)[number];

export type Team = {
  id: string;
  name: string;
  icon: TeamIconName;
  score: number;
  online: boolean;
};

export type View = "lobby" | "intro" | "rules" | "bracket" | "duel" | "board" | "final";

export type RevealInfo = { by: string | null; points: number };

/** jeden duel v pavoukovi */
export type Match = {
  id: string;
  /** 0 = první kolo, poslední = finále */
  round: number;
  /** pořadí v kole (shora) */
  index: number;
  a: string | null;
  b: string | null;
  winner: string | null;
  /** body získané v tomhle duelu */
  scoreA: number;
  scoreB: number;
  /** volný postup — soupeř nebyl (lichý počet týmů) */
  bye: boolean;
};

export type Bracket = {
  /** počet míst v prvním kole (mocnina 2) */
  size: number;
  rounds: number;
  matches: Match[];
};

/** question = jen otázka a bzučáky, play = karty a hádání */
export type DuelPhase = "question" | "play";

export type Round = {
  questionId: string;
  /** duel, ve kterém se otázka hraje (null = volná hra bez pavouka) */
  matchId: string | null;
  phase: DuelPhase;
  /** tým na tahu (kdo první bzučel) */
  turn: string | null;
  revealed: (RevealInfo | null)[];
  /** počet škrtů (X) na tým v aktuální otázce */
  strikes: Record<string, number>;
  /** soupeř po 3 X týmu „from“ dohádal všechny zbylé karty → admin potvrdí/odmítne krádež */
  stealOffer: StealOffer | null;
  /** kolik X tým v otázce snese (chybí = 3); soupeř po převzetí jen tolik, kolik zbývá karet */
  limits?: Record<string, number>;
};

/** krádež: „to“ bere týmu „from“ body ze všech jeho karet v otázce */
export type StealOffer = { from: string; to: string; points: number };

export type Fx =
  | { id: number; kind: "none" }
  | { id: number; kind: "intro"; number: number }
  | { id: number; kind: "flip"; index: number; teamId: string | null; points: number }
  | { id: number; kind: "strike"; teamId: string; count: number; limit: number }
  | { id: number; kind: "revealAll" }
  | { id: number; kind: "buzz"; teamId: string }
  | { id: number; kind: "join"; teamId: string }
  | { id: number; kind: "undo" }
  | { id: number; kind: "final" }
  | { id: number; kind: "showIntro" }
  | { id: number; kind: "draw" }
  | { id: number; kind: "duel"; matchId: string }
  | { id: number; kind: "turn"; teamId: string }
  /** soupeř dohádal zbytek po 3 X a admin potvrdil krádež → animace zloděje */
  | { id: number; kind: "steal"; from: string; to: string; points: number }
  | { id: number; kind: "advance"; matchId: string; teamId: string };

export type Pending = {
  id: number;
  label: string;
  /** kolik ms zbývalo v okamžiku odeslání stavu */
  remainingMs: number;
  delayMs: number;
};

export type PublicQuestion = {
  number: number;
  text: string;
  slots: number;
  multiplier: number;
  /** odhalené odpovědi, neodhalené = null (projektor nesmí znát zbytek) */
  answers: ({ text: string; points: number } | null)[];
};

/** teams = kdo smí bzučet (null = všichni) */
export type Buzzer = { open: boolean; winner: string | null; teams: string[] | null };

export type Settings = {
  delayMs: number;
  /** ručně zvolená veřejná adresa (např. tunel); prázdné = automaticky */
  baseUrl: string;
};

export type PublicState = {
  view: View;
  adminClaimed: boolean;
  joinCode: string;
  teams: Team[];
  questionCount: number;
  questionIndex: number;
  /** který snímek pravidel je na projektoru (view = "rules") */
  rulesPage: number;
  question: PublicQuestion | null;
  round: Round | null;
  bracket: Bracket | null;
  /** id už zahraných otázek — nejdou pustit znovu */
  used: string[];
  /** právě hraný (nebo ohlášený) duel */
  matchId: string | null;
  buzzer: Buzzer;
  fx: Fx;
  /** admin právě něco odklepl a běží prodleva — projektor stupňuje napětí (neví co) */
  suspense: boolean;
  /** ručně nastavená veřejná adresa (prázdné = automaticky) */
  manualUrl: string;
  /** adresa notebooku v lokální síti */
  lanUrl: string;
};

export type AdminState = PublicState & {
  questions: Question[];
  settings: Settings;
  pending: Pending | null;
  canUndo: boolean;
  lanUrls: string[];
};

export type AdminCmd =
  | { type: "startShow" }
  | { type: "goto"; index: number }
  | { type: "flip"; index: number; teamId: string | null }
  | { type: "strike"; teamId: string }
  | { type: "revealAll" }
  | { type: "cancelPending" }
  | { type: "undo" }
  | { type: "setView"; view: View }
  | { type: "buzzer"; action: "open" | "close" | "reset" }
  | { type: "clearStrikes" }
  | { type: "teamAdd"; name: string }
  | { type: "teamRename"; id: string; name: string }
  | { type: "teamRemove"; id: string }
  | { type: "teamAdjust"; id: string; delta: number }
  | { type: "saveQuestions"; questions: Question[] }
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "resetScores" }
  | { type: "resetGame" }
  | { type: "endShow" }
  | { type: "drawBracket" }
  | { type: "startDuel"; matchId?: string }
  | { type: "showQuestion"; questionId?: string }
  | { type: "setTurn"; teamId: string }
  | { type: "endDuel"; winnerId: string }
  | { type: "importSurvey" }
  | { type: "rules"; page: number }
  | { type: "steal"; accept: boolean };

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const MAX_STRIKES = 3;

/** kolik pokusů má tým v otázce (soupeř po převzetí tolik, kolik zbývá karet, max 3) */
export const strikeLimit = (round: Pick<Round, "limits"> | null | undefined, teamId: string | null | undefined) =>
  (teamId && round?.limits?.[teamId]) || MAX_STRIKES;

/** tým má v otázce vyčerpané pokusy */
export const isOut = (round: Pick<Round, "limits" | "strikes"> | null | undefined, teamId: string | null | undefined) =>
  !!teamId && (round?.strikes[teamId] ?? 0) >= strikeLimit(round, teamId);
/** pavouk je hezky čitelný do 8 týmů */
export const MAX_TEAMS = 8;

export function roundName(round: number, rounds: number) {
  const fromEnd = rounds - 1 - round;
  return fromEnd === 0 ? "Finále" : fromEnd === 1 ? "Semifinále" : fromEnd === 2 ? "Čtvrtfinále" : `${round + 1}. kolo`;
}

/** další duel, který se dá hrát (oba soupeři známí, ještě nerozhodnutý) */
export function nextMatch(b: Bracket | null) {
  return b?.matches.find((m) => !m.winner && m.a && m.b) ?? null;
}

export function champion(b: Bracket | null) {
  return b?.matches.find((m) => m.round === b.rounds - 1)?.winner ?? null;
}
