// Sdílené typy mezi serverem, projektorem, adminem a týmy.

export type Answer = { text: string; points: number };

export type Question = {
  id: string;
  text: string;
  answers: Answer[];
  /** násobič bodů (např. finálová otázka za dvojnásob) */
  multiplier: number;
};

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

export type View = "lobby" | "intro" | "board" | "scoreboard" | "final";

export type RevealInfo = { by: string | null; points: number };

export type Round = {
  questionId: string;
  revealed: (RevealInfo | null)[];
  /** počet škrtů (X) na tým v aktuální otázce */
  strikes: Record<string, number>;
};

export type Fx =
  | { id: number; kind: "none" }
  | { id: number; kind: "intro"; number: number }
  | { id: number; kind: "flip"; index: number; teamId: string | null; points: number }
  | { id: number; kind: "strike"; teamId: string; count: number }
  | { id: number; kind: "revealAll" }
  | { id: number; kind: "buzz"; teamId: string }
  | { id: number; kind: "join"; teamId: string }
  | { id: number; kind: "undo" }
  | { id: number; kind: "final" }
  | { id: number; kind: "showIntro" };

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

export type Buzzer = { open: boolean; winner: string | null };

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
  question: PublicQuestion | null;
  round: Round | null;
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
  | { type: "endShow" };

export type Ack<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const MAX_STRIKES = 3;
export const MAX_TEAMS = 12;
