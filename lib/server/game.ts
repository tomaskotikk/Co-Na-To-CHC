import os from "node:os";
import crypto from "node:crypto";
import type { Server, Socket } from "socket.io";
import {
  TEAM_ICONS,
  MAX_STRIKES,
  MAX_TEAMS,
  nextMatch,
  type Ack,
  type AdminCmd,
  type AdminState,
  type Bracket,
  type Buzzer,
  type Match,
  type Fx,
  type PublicState,
  type Question,
  type Round,
  type Settings,
  type Team,
  type View,
} from "../types";
import type { Storage, Stored } from "./storage";
import { buildFromSurvey } from "./surveyImport";


type Persisted = {
  adminToken: string;
  adminSession: string | null;
  joinCode: string;
  teams: Team[];
  view: View;
  questionIndex: number;
  round: Round | null;
  bracket: Bracket | null;
  matchId: string | null;
  settings: Settings;
};

type Snapshot = Pick<Persisted, "teams" | "view" | "questionIndex" | "round" | "bracket" | "matchId"> & { buzzer: Buzzer };

type FxInput = { [K in Fx["kind"]]: Omit<Extract<Fx, { kind: K }>, "id"> }[Fx["kind"]];

type PendingInternal = { id: number; label: string; executeAt: number; delayMs: number; run: () => void; timer: NodeJS.Timeout };

const id = (n = 8) => crypto.randomBytes(n).toString("base64url").slice(0, n);
const code4 = () => String(crypto.randomInt(1000, 10000));
const clone = <T>(v: T): T => structuredClone(v);
const closedBuzzer = (): Buzzer => ({ open: false, winner: null, teams: null });

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** pořadí nasazení v pavoukovi (1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6…) — volné postupy dostanou různé větve */
function seedOrder(size: number) {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

const VIEWS: View[] = ["lobby", "intro", "bracket", "duel", "board", "final"];

function localAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) out.push(a.address);
  }
  return out;
}

/** IPv4 adresy v lokální síti, seřazené podle pravděpodobnosti, že jde o skutečnou Wi-Fi/LAN. */
function lanIps(): string[] {
  const ips: { ip: string; score: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      let score = 0;
      if (/wi-?fi|wlan|wireless|en0|eth|ethernet/i.test(name)) score += 2;
      if (/vEthernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier/i.test(name)) score -= 5;
      if (a.address.startsWith("192.168.")) score += 1;
      ips.push({ ip: a.address, score });
    }
  }
  return ips.sort((x, y) => y.score - x.score).map((x) => x.ip);
}

function defaultQuestions(): Question[] {
  return [
    {
      id: id(),
      text: "Který z učitelů by nejlépe sbalil holku / kluka na diskotéce?",
      multiplier: 1,
      answers: [
        { text: "Učitel č. 1", points: 31 },
        { text: "Učitel č. 2", points: 24 },
        { text: "Učitel č. 3", points: 17 },
        { text: "Učitel č. 4", points: 13 },
        { text: "Učitel č. 5", points: 9 },
        { text: "Učitel č. 6", points: 6 },
      ],
    },
    {
      id: id(),
      text: "Co nejčastěji děláš o přestávce?",
      multiplier: 1,
      answers: [
        { text: "Mobil", points: 38 },
        { text: "Svačina", points: 22 },
        { text: "Spánek na lavici", points: 14 },
        { text: "Opisování úkolů", points: 11 },
        { text: "Drby", points: 9 },
        { text: "Záchody", points: 6 },
      ],
    },
    {
      id: id(),
      text: "Bez čeho by ses neobešel/neobešla u maturity?",
      multiplier: 2,
      answers: [
        { text: "Tahák", points: 35 },
        { text: "Káva", points: 21 },
        { text: "Štěstí", points: 16 },
        { text: "Spolužák vedle", points: 12 },
        { text: "Energeťák", points: 10 },
        { text: "Modlitba", points: 6 },
      ],
    },
  ];
}

function sanitizeQuestions(input: unknown): Question[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((q): Question => {
      const answers = Array.isArray(q?.answers) ? q.answers : [];
      return {
        id: typeof q?.id === "string" && q.id ? q.id : id(),
        text: String(q?.text ?? "").slice(0, 240),
        multiplier: [1, 2, 3].includes(Number(q?.multiplier)) ? Number(q.multiplier) : 1,
        answers: answers
          .slice(0, 8)
          .map((a: { text?: unknown; points?: unknown }) => ({
            text: String(a?.text ?? "").slice(0, 60),
            points: Math.max(0, Math.min(999, Math.round(Number(a?.points) || 0))),
          }))
          .filter((a: { text: string }) => a.text.trim() !== "")
          // nejčastější odpověď = karta č. 1
          .sort((a: { points: number }, b: { points: number }) => b.points - a.points),
      };
    })
    .filter((q) => q.text.trim() !== "" && q.answers.length > 0);
}

export class Game {
  private s: Persisted;
  private questions: Question[];
  private buzzer: Buzzer = closedBuzzer();
  private fx: Fx = { id: 0, kind: "none" };
  private fxSeq = Date.now();
  private pending: PendingInternal | null = null;
  private pendingSeq = 0;
  private undoStack: Snapshot[] = [];
  private teamSockets = new Map<string, Set<string>>();
  private saveTimer: NodeJS.Timeout | null = null;
  private broadcastQueued = false;
  private readonly localAddrs = new Set(["127.0.0.1", "::1", ...localAddresses()]);

  constructor(
    private io: Server,
    private port: number,
    private storage: Storage,
    stored: Stored,
  ) {
    const saved = stored.state as Persisted | null;
    this.s = {
      adminToken: saved?.adminToken ?? id(12),
      adminSession: saved?.adminSession ?? null,
      joinCode: saved?.joinCode ?? code4(),
      teams: (saved?.teams ?? []).map((t, i) => ({
        ...t,
        icon: TEAM_ICONS.includes(t.icon) ? t.icon : TEAM_ICONS[i % TEAM_ICONS.length],
        online: false,
      })),
      view: saved?.view && VIEWS.includes(saved.view) ? saved.view : saved?.bracket ? "bracket" : "lobby",
      questionIndex: saved?.questionIndex ?? -1,
      // starší uložený stav neměl duely
      round: saved?.round ? { ...({ matchId: null, phase: "play", turn: null } as const), ...(saved.round as Partial<Round>) } as Round : null,
      bracket: saved?.bracket ?? null,
      matchId: saved?.matchId ?? null,
      settings: {
        delayMs: 2500,
        baseUrl: "",
        ...saved?.settings,
        ...(process.env.PUBLIC_URL ? { baseUrl: process.env.PUBLIC_URL.replace(/\/+$/, "") } : {}),
      },
    };
    const qs = stored.questions;
    this.questions = qs ? sanitizeQuestions(qs) : defaultQuestions();
    // i při startu, ať má Firebase vždy aktuální kopii
    this.writeQuestions();
    this.save();
    io.on("connection", (socket) => this.onConnection(socket));
  }

  get adminPath() {
    return `/admin/${this.s.adminToken}`;
  }

  get lanUrls() {
    return lanIps().map((ip) => `http://${ip}:${this.port}`);
  }

  // ───────────────────────── sockety ─────────────────────────

  private isLocal(socket: Socket) {
    const h = socket.handshake.headers;
    if (h["cf-connecting-ip"] || h["x-forwarded-for"]) return false;
    return this.localAddrs.has(socket.handshake.address.replace(/^::ffff:/, ""));
  }

  /** projektor smí vidět admin QR: notebook (localhost) nebo online s tajným klíčem */
  private isTrustedScreen(socket: Socket, key: unknown) {
    const secret = process.env.SCREEN_KEY;
    if (secret && typeof key === "string" && key.length > 0) {
      const a = Buffer.from(key);
      const b = Buffer.from(secret);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    }
    return this.isLocal(socket);
  }

  private onConnection(socket: Socket) {
    socket.on("hello:screen", (p?: { key?: string }) => {
      socket.join("screens");
      socket.data.trustedScreen = this.isTrustedScreen(socket, p?.key);
      if (socket.data.trustedScreen) {
        socket.join("screens-local");
        socket.emit("pairing", { adminPath: this.adminPath });
      }
      socket.emit("state", this.publicState());
    });

    socket.on("screen:repair", () => {
      if (!socket.data.trustedScreen) return;
      this.s.adminToken = id(12);
      this.s.adminSession = null;
      this.io.to("admins").emit("admin:kicked");
      this.io.in("admins").socketsLeave("admins");
      this.io.to("screens-local").emit("pairing", { adminPath: this.adminPath });
      this.changed();
    });

    socket.on("hello:admin", (p: { token?: string; session?: string }, ack?: (r: unknown) => void) => {
      if (p?.session && p.session === this.s.adminSession) {
        socket.join("admins");
        socket.data.admin = true;
        ack?.({ status: "admin" });
        socket.emit("admin:state", this.adminState());
      } else if (p?.token && p.token === this.s.adminToken) {
        ack?.({ status: "claimable", claimed: this.s.adminSession !== null });
      } else {
        ack?.({ status: "invalid" });
      }
    });

    socket.on("admin:claim", (p: { token?: string }, ack?: (r: Ack<{ session: string }>) => void) => {
      if (!p?.token || p.token !== this.s.adminToken) return ack?.({ ok: false, error: "Odkaz už neplatí." });
      const session = id(16);
      this.io.to("admins").emit("admin:kicked");
      this.io.in("admins").socketsLeave("admins");
      this.s.adminSession = session;
      // jednorázový odkaz — po spárování ho už nikdo jiný nepoužije
      this.s.adminToken = id(12);
      socket.join("admins");
      socket.data.admin = true;
      ack?.({ ok: true, session });
      this.changed();
    });

    socket.on("admin:cmd", async (cmd: AdminCmd, ack?: (r: Ack) => void) => {
      if (!socket.data.admin || !socket.rooms.has("admins")) return ack?.({ ok: false, error: "Nejsi admin." });
      try {
        const err = cmd.type === "importSurvey" ? await this.importSurvey() : this.command(cmd);
        ack?.(err ? { ok: false, error: err } : { ok: true });
      } catch (e) {
        console.error(e);
        ack?.({ ok: false, error: "Chyba serveru." });
      }
    });

    socket.on("hello:team", (p: { teamId?: string }, ack?: (r: { team: Team | null }) => void) => {
      socket.join("teams");
      const team = this.s.teams.find((t) => t.id === p?.teamId) ?? null;
      if (team) this.attachTeam(socket, team.id);
      ack?.({ team });
      socket.emit("state", this.publicState());
    });

    socket.on("team:join", (p: { code?: string; name?: string }, ack?: (r: Ack<{ team: Team }>) => void) => {
      const name = String(p?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 20);
      if (String(p?.code ?? "").trim() !== this.s.joinCode) return ack?.({ ok: false, error: "Špatný kód hry." });
      if (name.length < 2) return ack?.({ ok: false, error: "Název týmu je moc krátký." });
      if (this.s.teams.length >= MAX_TEAMS) return ack?.({ ok: false, error: "Hra je plná." });
      if (this.s.teams.some((t) => t.name.toLowerCase() === name.toLowerCase()))
        return ack?.({ ok: false, error: "Tým s tímhle jménem už existuje." });
      const team = this.createTeam(name);
      this.attachTeam(socket, team.id);
      this.emitFx({ kind: "join", teamId: team.id });
      ack?.({ ok: true, team });
      this.changed();
    });

    socket.on("team:buzz", () => {
      const teamId = socket.data.teamId as string | undefined;
      if (!teamId || !this.buzzer.open || this.buzzer.winner) return;
      if (!this.s.teams.some((t) => t.id === teamId)) return;
      if (this.buzzer.teams && !this.buzzer.teams.includes(teamId)) return;
      // přes apply → moderátor může omylem zmáčknutý bzučák vrátit
      this.apply(() => {
        this.buzzer = { ...this.buzzer, open: false, winner: teamId };
        const round = this.s.round;
        if (round && round.phase === "question") {
          round.phase = "play";
          round.turn = teamId;
        }
        this.emitFx({ kind: "buzz", teamId });
      });
    });

    socket.on("disconnect", () => {
      const teamId = socket.data.teamId as string | undefined;
      if (!teamId) return;
      const set = this.teamSockets.get(teamId);
      set?.delete(socket.id);
      if (!set?.size) this.setOnline(teamId, false);
    });
  }

  private attachTeam(socket: Socket, teamId: string) {
    socket.data.teamId = teamId;
    if (!this.teamSockets.has(teamId)) this.teamSockets.set(teamId, new Set());
    this.teamSockets.get(teamId)!.add(socket.id);
    this.setOnline(teamId, true);
  }

  private setOnline(teamId: string, online: boolean) {
    const t = this.s.teams.find((x) => x.id === teamId);
    if (t && t.online !== online) {
      t.online = online;
      this.queueBroadcast();
    }
  }

  private createTeam(name: string): Team {
    const used = new Set(this.s.teams.map((t) => t.icon));
    const icon = TEAM_ICONS.find((e) => !used.has(e)) ?? TEAM_ICONS[this.s.teams.length % TEAM_ICONS.length];
    const team: Team = { id: id(), name, icon, score: 0, online: false };
    this.s.teams.push(team);
    return team;
  }

  // ───────────────────────── příkazy admina ─────────────────────────

  /** vrací chybovou hlášku nebo null */
  private command(cmd: AdminCmd): string | null {
    switch (cmd.type) {
      case "startShow": {
        if (this.s.teams.length === 0) return "Nejdřív se musí připojit aspoň jeden tým.";
        this.flushPending();
        this.apply(() => {
          this.s.view = "intro";
          this.buzzer = closedBuzzer();
          this.emitFx({ kind: "showIntro" });
        });
        return null;
      }
      case "goto":
        return this.openQuestion(cmd.index);
      case "importSurvey":
        // asynchronní — řeší handler admin:cmd
        return null;
      case "showQuestion": {
        const index = this.s.questionIndex + 1;
        if (!this.questions[index]) return "Došly otázky — načti je z dotazníku nebo přidej v záložce Otázky.";
        return this.openQuestion(index);
      }
      case "drawBracket": {
        if (this.s.teams.length < 2) return "Na pavouka jsou potřeba aspoň 2 týmy.";
        if (this.s.bracket?.matches.some((m) => !m.bye && m.winner)) return "Pavouk už běží — přelosovat jde jen před prvním duelem.";
        this.flushPending();
        this.apply(() => {
          this.s.bracket = this.buildBracket();
          this.s.matchId = null;
          this.s.round = null;
          this.s.teams.forEach((t) => (t.score = 0));
          this.buzzer = closedBuzzer();
          this.s.view = "bracket";
          this.emitFx({ kind: "draw" });
        });
        return null;
      }
      case "startDuel": {
        const b = this.s.bracket;
        if (!b) return "Nejdřív vylosuj pavouka.";
        const m = cmd.matchId ? b.matches.find((x) => x.id === cmd.matchId) : nextMatch(b);
        if (!m) return "Žádný další duel — vyhlas vítěze.";
        if (!m.a || !m.b || m.winner) return "Tenhle duel se nedá hrát.";
        this.flushPending();
        this.apply(() => {
          this.s.matchId = m.id;
          this.s.round = null;
          this.buzzer = closedBuzzer();
          this.s.view = "duel";
          this.emitFx({ kind: "duel", matchId: m.id });
        });
        return null;
      }
      case "setTurn": {
        const round = this.s.round;
        if (!round) return "Není rozehraná otázka.";
        const m = this.currentMatch();
        if (m && cmd.teamId !== m.a && cmd.teamId !== m.b) return "Tým v tomhle duelu nehraje.";
        if (!this.s.teams.some((t) => t.id === cmd.teamId)) return "Tým neexistuje.";
        this.flushPending();
        this.apply(() => {
          round.turn = cmd.teamId;
          if (round.phase === "question") {
            round.phase = "play";
            this.buzzer = { ...this.buzzer, open: false, winner: cmd.teamId };
          }
          this.emitFx({ kind: "turn", teamId: cmd.teamId });
        });
        return null;
      }
      case "endDuel": {
        const m = this.currentMatch();
        if (!m || !this.s.bracket) return "Neběží žádný duel.";
        if (cmd.winnerId !== m.a && cmd.winnerId !== m.b) return "Vítěz musí být jeden ze soupeřů.";
        this.flushPending();
        this.apply(() => {
          m.winner = cmd.winnerId;
          this.propagate(m);
          this.s.matchId = null;
          this.s.round = null;
          this.buzzer = closedBuzzer();
          this.s.view = "bracket";
          this.emitFx({ kind: "advance", matchId: m.id, teamId: cmd.winnerId });
        });
        return null;
      }
      case "flip": {
        const q = this.currentQuestion();
        if (!q || !this.s.round) return "Není vybraná otázka.";
        if (!q.answers[cmd.index]) return "Karta neexistuje.";
        if (this.s.round.revealed[cmd.index]) return "Karta už je otočená.";
        const team = cmd.teamId ? this.s.teams.find((t) => t.id === cmd.teamId) : null;
        const label = `Otočit #${cmd.index + 1}${team ? ` → ${team.name}` : " (bez bodů)"}`;
        this.schedule(label, () => {
          const round = this.s.round;
          if (!round || round.questionId !== q.id || round.revealed[cmd.index]) return;
          const points = q.answers[cmd.index].points * q.multiplier;
          const t = cmd.teamId ? this.s.teams.find((x) => x.id === cmd.teamId) : undefined;
          if (t) {
            t.score += points;
            const m = this.currentMatch();
            if (m?.a === t.id) m.scoreA += points;
            else if (m?.b === t.id) m.scoreB += points;
          }
          round.revealed[cmd.index] = { by: t?.id ?? null, points };
          round.phase = "play";
          this.s.view = "board";
          this.emitFx({ kind: "flip", index: cmd.index, teamId: t?.id ?? null, points: t ? points : 0 });
        });
        return null;
      }
      case "strike": {
        const team = this.s.teams.find((t) => t.id === cmd.teamId);
        if (!team || !this.s.round) return "Tým nebo otázka neexistuje.";
        if ((this.s.round.strikes[team.id] ?? 0) >= MAX_STRIKES) return "Tým už má 3 pokusy pryč.";
        this.schedule(`BZZZ → ${team.name}`, () => {
          const round = this.s.round;
          if (!round || !this.s.teams.some((t) => t.id === team.id)) return;
          const count = Math.min(MAX_STRIKES, (round.strikes[team.id] ?? 0) + 1);
          round.strikes[team.id] = count;
          // po třetí chybě přechází tah na soupeře (šance ukrást body)
          const m = this.currentMatch();
          const rival = m ? (m.a === team.id ? m.b : m.b === team.id ? m.a : null) : null;
          if (count >= MAX_STRIKES && round.turn === team.id && rival && (round.strikes[rival] ?? 0) < MAX_STRIKES) {
            round.turn = rival;
          }
          this.s.view = "board";
          this.emitFx({ kind: "strike", teamId: team.id, count });
        });
        return null;
      }
      case "revealAll": {
        const q = this.currentQuestion();
        if (!q || !this.s.round) return "Není vybraná otázka.";
        this.schedule("Odkrýt zbylé karty", () => {
          const round = this.s.round;
          if (!round || round.questionId !== q.id) return;
          q.answers.forEach((a, i) => {
            if (!round.revealed[i]) round.revealed[i] = { by: null, points: a.points * q.multiplier };
          });
          this.s.view = "board";
          this.emitFx({ kind: "revealAll" });
        });
        return null;
      }
      case "cancelPending": {
        if (this.pending) {
          clearTimeout(this.pending.timer);
          this.pending = null;
          this.queueBroadcast();
        }
        return null;
      }
      case "undo": {
        this.cancelPendingSilently();
        const snap = this.undoStack.pop();
        if (!snap) return "Není co vrátit.";
        const online = new Map(this.s.teams.map((t) => [t.id, t.online]));
        this.s.teams = snap.teams.map((t) => ({ ...t, online: online.get(t.id) ?? false }));
        this.s.view = snap.view;
        this.s.questionIndex = snap.questionIndex;
        this.s.round = snap.round;
        this.s.bracket = snap.bracket;
        this.s.matchId = snap.matchId;
        this.buzzer = snap.buzzer;
        this.emitFx({ kind: "undo" });
        this.changed();
        return null;
      }
      case "setView": {
        this.flushPending();
        if (cmd.view === "board" && !this.s.round) return "Nejdřív vyber otázku.";
        if (cmd.view === "bracket" && !this.s.bracket) return "Nejdřív vylosuj pavouka.";
        if (cmd.view === "duel" && !this.currentMatch()) return "Neběží žádný duel.";
        this.apply(() => {
          this.s.view = cmd.view;
          if (cmd.view === "final") this.emitFx({ kind: "final" });
          if (cmd.view === "intro") this.emitFx({ kind: "showIntro" });
        });
        return null;
      }
      case "buzzer": {
        const m = this.currentMatch();
        const teams = m?.a && m.b ? [m.a, m.b] : null;
        if (cmd.action === "open") this.buzzer = { open: true, winner: null, teams };
        else if (cmd.action === "close") this.buzzer = { ...this.buzzer, open: false };
        else this.buzzer = closedBuzzer();
        this.changed();
        return null;
      }
      case "clearStrikes": {
        if (!this.s.round) return null;
        this.apply(() => {
          this.s.round!.strikes = {};
        });
        return null;
      }
      case "teamAdd": {
        const name = cmd.name.replace(/\s+/g, " ").trim().slice(0, 20);
        if (name.length < 2) return "Název je moc krátký.";
        if (this.s.teams.length >= MAX_TEAMS) return "Maximum týmů.";
        if (this.s.teams.some((t) => t.name.toLowerCase() === name.toLowerCase())) return "Tento název už existuje.";
        this.apply(() => {
          const t = this.createTeam(name);
          this.emitFx({ kind: "join", teamId: t.id });
        });
        return null;
      }
      case "teamRename": {
        const name = cmd.name.replace(/\s+/g, " ").trim().slice(0, 20);
        const t = this.s.teams.find((x) => x.id === cmd.id);
        if (!t || name.length < 2) return "Neplatný název.";
        this.apply(() => {
          t.name = name;
        });
        return null;
      }
      case "teamRemove": {
        this.apply(() => {
          this.s.teams = this.s.teams.filter((t) => t.id !== cmd.id);
          if (this.s.round) delete this.s.round.strikes[cmd.id];
          this.walkover(cmd.id);
        });
        this.io.to("teams").emit("team:removed", cmd.id);
        return null;
      }
      case "teamAdjust": {
        const t = this.s.teams.find((x) => x.id === cmd.id);
        if (!t || !Number.isFinite(cmd.delta)) return "Tým neexistuje.";
        this.apply(() => {
          t.score = Math.max(0, t.score + Math.round(cmd.delta));
        });
        return null;
      }
      case "saveQuestions": {
        const qs = sanitizeQuestions(cmd.questions);
        this.questions = qs;
        this.writeQuestions();
        // aktuální kolo přizpůsobit, pokud se otázka změnila / smazala
        const q = this.s.round ? qs.find((x) => x.id === this.s.round!.questionId) : undefined;
        if (this.s.round && !q) {
          this.s.round = null;
          this.s.questionIndex = -1;
          if (this.s.view === "board") this.s.view = "lobby";
        } else if (q && this.s.round) {
          this.s.questionIndex = qs.indexOf(q);
          const r = this.s.round.revealed;
          this.s.round.revealed = q.answers.map((_, i) => r[i] ?? null);
        }
        this.undoStack = [];
        this.changed();
        return null;
      }
      case "settings": {
        const st = cmd.settings;
        if (st.delayMs !== undefined) this.s.settings.delayMs = Math.max(0, Math.min(5000, Math.round(st.delayMs)));
        if (st.baseUrl !== undefined) this.s.settings.baseUrl = st.baseUrl.trim().replace(/\/+$/, "");
        this.changed();
        return null;
      }
      case "resetScores": {
        this.apply(() => {
          this.s.teams.forEach((t) => (t.score = 0));
        });
        return null;
      }
      case "endShow": {
        // vše vynulovat a odpárovat admina — projektor znovu ukáže admin QR
        this.cancelPendingSilently();
        this.s.teams = [];
        this.s.view = "lobby";
        this.s.questionIndex = -1;
        this.s.round = null;
        this.s.bracket = null;
        this.s.matchId = null;
        this.s.joinCode = code4();
        this.buzzer = closedBuzzer();
        this.undoStack = [];
        this.teamSockets.clear();
        this.io.to("teams").emit("team:removed", "*");
        this.s.adminToken = id(12);
        this.s.adminSession = null;
        this.io.to("admins").emit("admin:kicked", "ended");
        this.io.in("admins").socketsLeave("admins");
        this.io.to("screens-local").emit("pairing", { adminPath: this.adminPath });
        this.changed();
        return null;
      }
      case "resetGame": {
        this.cancelPendingSilently();
        this.s.teams = [];
        this.s.view = "lobby";
        this.s.questionIndex = -1;
        this.s.round = null;
        this.s.bracket = null;
        this.s.matchId = null;
        this.s.joinCode = code4();
        this.buzzer = closedBuzzer();
        this.undoStack = [];
        this.teamSockets.clear();
        this.io.to("teams").emit("team:removed", "*");
        this.changed();
        return null;
      }
    }
  }

  private currentQuestion() {
    return this.s.round ? this.questions.find((q) => q.id === this.s.round!.questionId) : undefined;
  }

  private newRound(q: Question): Round {
    return { questionId: q.id, matchId: this.s.matchId, phase: "question", turn: null, revealed: q.answers.map(() => null), strikes: {} };
  }

  private currentMatch(): Match | null {
    return this.s.bracket?.matches.find((m) => m.id === this.s.matchId) ?? null;
  }

  /** otázka se ukáže jen jako text — karty až po bzučáku; bzučet smí jen dva týmy v duelu */
  private openQuestion(index: number): string | null {
    const q = this.questions[index];
    if (!q) return "Otázka neexistuje.";
    const m = this.currentMatch();
    this.flushPending();
    this.apply(() => {
      this.s.questionIndex = index;
      this.s.round = this.newRound(q);
      this.s.view = "board";
      this.buzzer = { open: true, winner: null, teams: m?.a && m.b ? [m.a, m.b] : null };
      this.emitFx({ kind: "intro", number: index + 1 });
    });
    return null;
  }

  private buildBracket(): Bracket {
    const ids = shuffle(this.s.teams.map((t) => t.id));
    const size = 2 ** Math.ceil(Math.log2(ids.length));
    const rounds = Math.log2(size);
    const order = seedOrder(size);
    const matches: Match[] = [];
    for (let r = 0; r < rounds; r++) {
      const count = size / 2 ** (r + 1);
      for (let i = 0; i < count; i++) {
        const a = r === 0 ? (ids[order[2 * i] - 1] ?? null) : null;
        const b = r === 0 ? (ids[order[2 * i + 1] - 1] ?? null) : null;
        matches.push({ id: `r${r}m${i}`, round: r, index: i, a, b, winner: null, scoreA: 0, scoreB: 0, bye: r === 0 && (!a || !b) });
      }
    }
    const bracket: Bracket = { size, rounds, matches };
    for (const m of matches.filter((x) => x.bye)) {
      m.winner = m.a ?? m.b;
      this.propagate(m, bracket);
    }
    return bracket;
  }

  /** vítěz duelu postoupí do dalšího kola */
  private propagate(m: Match, bracket = this.s.bracket) {
    const next = bracket?.matches.find((x) => x.round === m.round + 1 && x.index === Math.floor(m.index / 2));
    if (!next) return;
    if (m.index % 2 === 0) next.a = m.winner;
    else next.b = m.winner;
  }

  /** odstraněný tým: soupeř v nerozhodnutém duelu postupuje bez boje */
  private walkover(teamId: string) {
    const b = this.s.bracket;
    if (!b) return;
    for (const m of b.matches) {
      if (m.winner || (m.a !== teamId && m.b !== teamId)) continue;
      if (m.a === teamId) m.a = null;
      if (m.b === teamId) m.b = null;
      const rival = m.a ?? m.b;
      if (rival && m.round === 0) {
        m.winner = rival;
        m.bye = true;
        this.propagate(m);
      } else if (rival && this.s.matchId === m.id) {
        m.winner = rival;
        this.propagate(m);
      }
      if (this.s.matchId === m.id) {
        this.s.matchId = null;
        this.s.round = null;
        this.buzzer = closedBuzzer();
        if (this.s.view === "board" || this.s.view === "duel") this.s.view = "bracket";
      }
    }
  }

  private async importSurvey(): Promise<string | null> {
    const data = await this.storage.readSurvey?.();
    if (!data) return "Firebase není nastavený — dotazník nejde načíst.";
    const qs = buildFromSurvey(data.questions, data.responses, () => id());
    if (!qs.length) return "V dotazníku zatím nejsou odpovědi.";
    this.cancelPendingSilently();
    this.questions = shuffle(qs);
    this.writeQuestions();
    this.s.questionIndex = -1;
    this.s.round = null;
    this.buzzer = closedBuzzer();
    if (this.s.view === "board") this.s.view = this.s.matchId ? "duel" : this.s.bracket ? "bracket" : "lobby";
    this.undoStack = [];
    this.changed();
    return null;
  }

  /** zpožděná akce — admin ji může během prodlevy zrušit */
  private schedule(label: string, run: () => void) {
    this.flushPending();
    const delayMs = this.s.settings.delayMs;
    if (delayMs <= 0) return this.apply(run);
    const pid = ++this.pendingSeq;
    const timer = setTimeout(() => {
      if (this.pending?.id === pid) this.flushPending();
    }, delayMs);
    this.pending = { id: pid, label, executeAt: Date.now() + delayMs, delayMs, run, timer };
    this.queueBroadcast();
  }

  private flushPending() {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    this.apply(p.run);
  }

  private cancelPendingSilently() {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private apply(fn: () => void) {
    this.undoStack.push(
      clone({
        teams: this.s.teams,
        view: this.s.view,
        questionIndex: this.s.questionIndex,
        round: this.s.round,
        bracket: this.s.bracket,
        matchId: this.s.matchId,
        buzzer: this.buzzer,
      }),
    );
    if (this.undoStack.length > 40) this.undoStack.shift();
    fn();
    this.changed();
  }

  private emitFx(fx: FxInput) {
    this.fx = { ...fx, id: ++this.fxSeq } as Fx;
  }

  // ───────────────────────── stav & ukládání ─────────────────────────

  publicState(): PublicState {
    const q = this.currentQuestion();
    const round = this.s.round;
    return {
      view: this.s.view,
      adminClaimed: this.s.adminSession !== null,
      joinCode: this.s.joinCode,
      teams: this.s.teams,
      questionCount: this.questions.length,
      questionIndex: this.s.questionIndex,
      question:
        q && round
          ? {
              number: this.questions.indexOf(q) + 1,
              text: q.text,
              slots: q.answers.length,
              multiplier: q.multiplier,
              answers: q.answers.map((a, i) => (round.revealed[i] ? { text: a.text, points: round.revealed[i]!.points } : null)),
            }
          : null,
      round,
      bracket: this.s.bracket,
      matchId: this.s.matchId,
      buzzer: this.buzzer,
      fx: this.fx,
      suspense: this.pending !== null,
      manualUrl: this.s.settings.baseUrl,
      lanUrl: this.lanUrls[0] ?? `http://localhost:${this.port}`,
    };
  }

  adminState(): AdminState {
    return {
      ...this.publicState(),
      questions: this.questions,
      settings: this.s.settings,
      pending: this.pending
        ? {
            id: this.pending.id,
            label: this.pending.label,
            delayMs: this.pending.delayMs,
            remainingMs: Math.max(0, this.pending.executeAt - Date.now()),
          }
        : null,
      canUndo: this.undoStack.length > 0,
      lanUrls: this.lanUrls,
    };
  }

  private changed() {
    this.queueBroadcast();
    this.save();
  }

  private queueBroadcast() {
    if (this.broadcastQueued) return;
    this.broadcastQueued = true;
    queueMicrotask(() => {
      this.broadcastQueued = false;
      const pub = this.publicState();
      this.io.to("screens").to("teams").emit("state", pub);
      this.io.to("admins").emit("admin:state", this.adminState());
    });
  }

  private save() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.storage.saveState(this.s);
    }, 300);
  }

  private writeQuestions() {
    this.storage.saveQuestions(this.questions);
  }
}
