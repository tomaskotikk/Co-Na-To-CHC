"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { XIcon } from "@/components/shared";
import { TeamIcon } from "@/components/TeamIcon";
import {
  ArrowLeft,
  ChevronDown,
  Clapperboard,
  Eye,
  Hourglass,
  Megaphone,
  PartyPopper,
  Pencil,
  Play,
  RotateCcw,
  Settings,
  Shuffle,
  Swords,
  Trash2,
  Trophy,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { emitAck, useConnected, useOnConnect, useSocketEvent } from "@/lib/socket";
import {
  champion,
  MAX_STRIKES,
  MAX_TEAMS,
  nextMatch,
  roundName,
  type Ack,
  type AdminCmd,
  type AdminState,
  type Match,
  type QuestionSource,
  SOURCE_LABEL,
  type Team,
  type View,
} from "@/lib/types";
import { QuestionsTab } from "./QuestionsTab";

const SESSION_KEY = "chc-admin-session";

type Status = "connecting" | "claimable" | "invalid" | "admin" | "kicked" | "ended";
type Tab = "game" | "teams" | "questions" | "settings";
type Sheet = { kind: "flip"; index: number } | { kind: "strike" } | { kind: "endDuel" } | null;

const buzz = (ms: number | number[] = 12) => {
  try {
    navigator.vibrate?.(ms);
  } catch {}
};

function readSession() {
  try {
    return localStorage.getItem(SESSION_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function Admin({ token }: { token: string }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [alreadyClaimed, setAlreadyClaimed] = useState(false);
  const [st, setSt] = useState<AdminState | null>(null);
  const [tab, setTab] = useState<Tab>("game");
  const [toast, setToast] = useState<string | null>(null);
  const connected = useConnected();

  const hello = useCallback(() => {
    emitAck<{ status: Status; claimed?: boolean }>("hello:admin", { token, session: readSession() })
      .then((r) => {
        setStatus(r.status);
        setAlreadyClaimed(!!r.claimed);
      })
      .catch(() => setStatus("connecting"));
  }, [token]);

  useOnConnect(() => hello());
  useSocketEvent<AdminState>("admin:state", setSt);
  useSocketEvent(
    "admin:kicked",
    useCallback((reason?: string) => {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
      setStatus(reason === "ended" ? "ended" : "kicked");
      setSt(null);
    }, []),
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    buzz([30, 40, 30]);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const cmd = useCallback(
    async (c: AdminCmd) => {
      buzz();
      try {
        const r = await emitAck<Ack>("admin:cmd", c);
        if (!r.ok) showToast(r.error);
        return r.ok;
      } catch {
        showToast("Server neodpovídá.");
        return false;
      }
    },
    [showToast],
  );

  const claim = async () => {
    buzz(20);
    try {
      const r = await emitAck<Ack<{ session: string }>>("admin:claim", { token });
      if (!r.ok) return showToast(r.error);
      try {
        localStorage.setItem(SESSION_KEY, r.session);
      } catch {}
      // čistá adresa — starý token už stejně neplatí
      window.history.replaceState(null, "", "/admin/ovladac");
      hello();
    } catch {
      showToast("Server neodpovídá.");
    }
  };

  if (status !== "admin" || !st) {
    return (
      <main className="adm adm-gate">
        <Logo className="gate-logo" />
        {status === "connecting" && <p className="gate-text">Připojuji…</p>}
        {status === "claimable" && (
          <>
            <p className="gate-text">
              {alreadyClaimed ? "Show už někdo ovládá. Převzít ovládání na tento telefon?" : "Tenhle telefon bude ovládat celou show."}
            </p>
            <button className="btn btn-y btn-xl" onClick={claim}>
              Jsem admin
            </button>
          </>
        )}
        {(status === "invalid" || status === "kicked" || status === "ended") && (
          <p className="gate-text">
            {status === "ended"
              ? "Show je ukončená a vše je vynulované."
              : status === "kicked"
                ? "Ovládání převzalo jiné zařízení."
                : "Tenhle odkaz už neplatí."}
            <br />
            <span className="mute">Pro novou hru naskenuj admin QR kód na projektoru.</span>
          </p>
        )}
        {toast && <div className="toast">{toast}</div>}
      </main>
    );
  }

  return (
    <main className="adm">
      <header className="adm-head">
        <div className="adm-head-row">
          <Logo className="adm-logo" />
          <span className="adm-conn">
            <span className={`dot ${connected ? "on" : ""}`} />
            {connected ? "Online" : "Offline"}
          </span>
        </div>
        <nav className="tabs">
          {(
            [
              ["game", "Hra"],
              ["teams", `Týmy · ${st.teams.length}`],
              ["questions", "Otázky"],
              ["settings", <Settings key="s" className="tab-ic" aria-label="Nastavení" />],
            ] as [Tab, React.ReactNode][]
          ).map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "game" && <GameTab st={st} cmd={cmd} />}
      {tab === "teams" && <TeamsTab st={st} cmd={cmd} />}
      {tab === "questions" && <QuestionsTab st={st} cmd={cmd} onPlay={() => setTab("game")} />}
      {tab === "settings" && <SettingsTab st={st} cmd={cmd} />}

      <PendingBar st={st} cmd={cmd} />
      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ y: -30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -30, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

type Cmd = (c: AdminCmd) => Promise<boolean>;

// ───────────────────────────── HRA ─────────────────────────────

const VIEWS: [View, string][] = [
  ["lobby", "Lobby"],
  ["intro", "Intro"],
  ["bracket", "Pavouk"],
  ["duel", "Duel"],
  ["board", "Otázka"],
  ["final", "Finále"],
];

type Step = "lobby" | "intro" | "bracket" | "duel" | "ask" | "play" | "final";

function stepOf(st: AdminState): Step {
  switch (st.view) {
    case "lobby":
      return "lobby";
    case "intro":
      return "intro";
    case "bracket":
      return "bracket";
    case "duel":
      return "duel";
    case "board":
      return st.round ? (st.round.phase === "question" ? "ask" : "play") : st.bracket ? "bracket" : "lobby";
    case "final":
      return "final";
  }
}

const teamsWord = (n: number) => (n === 1 ? "tým" : n < 5 ? "týmy" : "týmů");
const short = (round: number, rounds: number) => {
  const n = roundName(round, rounds);
  return n === "Finále" ? "F" : n === "Semifinále" ? "SF" : n === "Čtvrtfinále" ? "ČF" : `K${round + 1}`;
};

function GameTab({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const step = stepOf(st);
  const b = st.bracket;
  const match = b?.matches.find((m) => m.id === st.matchId) ?? null;
  const upcoming = nextMatch(b);
  const champ = champion(b);
  const name = (id: string | null) => st.teams.find((t) => t.id === id)?.name ?? "?";
  const fresh = st.questions.filter((q) => !st.used.includes(q.id));
  const nextQ = fresh.length > 0;
  const [picking, setPicking] = useState(false);
  const unrevealed = st.round?.revealed.some((r) => !r) ?? false;
  const played = b?.matches.some((m) => !m.bye && m.winner) ?? false;

  let primary: { icon?: LucideIcon; label: string; sub?: string; run: () => void; disabled?: boolean } | null = null;
  switch (step) {
    case "lobby":
      primary = {
        icon: Play,
        label: "Start hry",
        sub: st.teams.length >= 2 ? `${st.teams.length} ${teamsWord(st.teams.length)} ve hře` : "Čekáme na týmy (aspoň 2)…",
        run: () => cmd({ type: "startShow" }),
        disabled: st.teams.length < 2,
      };
      break;
    case "intro":
      primary = { icon: Shuffle, label: "Vylosovat pavouka", run: () => cmd({ type: "drawBracket" }) };
      break;
    case "bracket":
      primary = champ
        ? { icon: Trophy, label: "Vyhlásit vítěze", sub: name(champ), run: () => cmd({ type: "setView", view: "final" }) }
        : upcoming
          ? {
              icon: Swords,
              label: "Spustit duel",
              sub: `${name(upcoming.a)} vs ${name(upcoming.b)}`,
              run: () => cmd({ type: "startDuel", matchId: upcoming.id }),
            }
          : { label: "Vylosovat pavouka", run: () => cmd({ type: "drawBracket" }) };
      break;
    case "duel":
      primary = {
        icon: Megaphone,
        label: "Ukázat otázku",
        sub: nextQ ? `vybereš ze ${fresh.length} nezahraných` : "Došly otázky!",
        run: () => setPicking(true),
        disabled: !nextQ,
      };
      break;
    case "final":
      primary = { icon: PartyPopper, label: "Přehrát vyhlášení znovu", run: () => cmd({ type: "setView", view: "final" }) };
      break;
  }

  return (
    <div className="adm-body">
      <Stepper st={st} step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={`${step}-${st.questionIndex}-${st.matchId}`}
          className="step"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.22 }}
        >
          {step === "lobby" && <LobbyStep st={st} />}
          {step === "intro" && <IntroStep cmd={cmd} />}
          {step === "bracket" && <BracketStep st={st} cmd={cmd} played={played} />}
          {step === "duel" && match && <DuelStep st={st} match={match} />}
          {(step === "ask" || step === "play") && (
            <QuestionStep st={st} cmd={cmd} match={match} onFlip={(index) => setSheet({ kind: "flip", index })} />
          )}
          {step === "final" && <FinalStep st={st} cmd={cmd} />}
        </motion.div>
      </AnimatePresence>

      <Advanced st={st} cmd={cmd} />

      <div className="spacer" />

      {step === "play" || step === "ask" ? (
        <div className="actionbar">
          <button className="btn act-undo" onClick={() => cmd({ type: "undo" })} disabled={!st.canUndo}>
            <Undo2 className="act-ic" />
            <small>Zpět</small>
          </button>
          {unrevealed ? (
            <>
              <button
                className="btn act-buzz"
                disabled={step === "ask"}
                onClick={() =>
                  match && st.round?.turn ? cmd({ type: "strike", teamId: st.round.turn }) : setSheet({ kind: "strike" })
                }
              >
                <XIcon className="act-x" />
                <span className="act-buzz-txt">
                  BZZZ
                  {match && st.round?.turn && <small>{name(st.round.turn)}</small>}
                </span>
              </button>
              <button className="btn act-next" disabled={step === "ask"} onClick={() => cmd({ type: "revealAll" })}>
                <Eye className="act-ic" />
                <small>Odkrýt zbytek</small>
              </button>
            </>
          ) : match ? (
            <>
              <button className="btn act-next wide" onClick={() => setPicking(true)} disabled={!nextQ}>
                <Megaphone className="act-ic" />
                <small>Další otázka</small>
              </button>
              <button className="btn btn-y act-next wide" onClick={() => setSheet({ kind: "endDuel" })}>
                <Trophy className="act-ic" />
                <small>Konec duelu</small>
              </button>
            </>
          ) : (
            <button className="btn act-next wide" onClick={() => setPicking(true)} disabled={!nextQ}>
              <Megaphone className="act-ic" />
              <small>Další otázka</small>
            </button>
          )}
        </div>
      ) : (
        primary && (
          <div className="actionbar single">
            <button className="btn act-undo" onClick={() => cmd({ type: "undo" })} disabled={!st.canUndo}>
              <Undo2 className="act-ic" />
              <small>Zpět</small>
            </button>
            <button className="btn btn-y act-primary" onClick={primary.run} disabled={primary.disabled}>
              <span className="act-primary-row">
                {primary.icon && <primary.icon className="act-ic" strokeWidth={2.6} />}
                {primary.label}
              </span>
              {primary.sub && <small>{primary.sub}</small>}
            </button>
          </div>
        )
      )}

      <QuestionPicker
        st={st}
        open={picking}
        onClose={() => setPicking(false)}
        onPick={async (questionId) => {
          if (await cmd({ type: "showQuestion", questionId })) setPicking(false);
        }}
      />

      <TeamSheet
        sheet={sheet}
        st={st}
        match={match}
        onClose={() => setSheet(null)}
        onPick={(teamId) => {
          if (!sheet) return;
          if (sheet.kind === "flip") cmd({ type: "flip", index: sheet.index, teamId });
          else if (sheet.kind === "strike" && teamId) cmd({ type: "strike", teamId });
          else if (sheet.kind === "endDuel" && teamId) cmd({ type: "endDuel", winnerId: teamId });
          setSheet(null);
        }}
      />
    </div>
  );
}

function Stepper({ st, step }: { st: AdminState; step: Step }) {
  const b = st.bracket;
  const duels = b?.matches.filter((m) => !m.bye) ?? [];
  type Item = { label: React.ReactNode; done: boolean; now: boolean };
  const items: Item[] = [
    { label: "Lobby", done: step !== "lobby", now: step === "lobby" },
    { label: "Intro", done: !!b || step === "final", now: step === "intro" },
    { label: "Pavouk", done: !!b && step !== "bracket" && step !== "intro", now: step === "bracket" },
    ...duels.map((m) => {
      const inRound = duels.filter((x) => x.round === m.round);
      return { m, label: `${short(m.round, b!.rounds)}${inRound.length > 1 ? inRound.indexOf(m) + 1 : ""}` };
    }).map(({ m, label }) => ({
      label,
      done: !!m.winner,
      now: st.matchId === m.id,
    })),
    { label: <Trophy key="t" className="stp-ic" />, done: false, now: step === "final" },
  ];
  return (
    <div className="stepper">
      {items.map((it, i) => (
        <span key={i} className={`stp ${it.done ? "done" : ""} ${it.now ? "now" : ""}`}>
          {it.label}
        </span>
      ))}
    </div>
  );
}

function LobbyStep({ st }: { st: AdminState }) {
  return (
    <section className="card-a">
      <div className="lobby-a-head">
        <div>
          <h3 className="h3">Kód hry</h3>
          <span className="big-code">{st.joinCode}</span>
        </div>
        <p className="mute small">Týmy naskenují QR na projektoru (ideálně 6, max {MAX_TEAMS}). Tým bez telefonu přidáš v záložce Týmy.</p>
      </div>
      <h3 className="h3">Připojené týmy · {st.teams.length}</h3>
      {st.teams.length === 0 ? (
        <p className="waiting-a">
          Zatím nikdo
          <span className="waiting-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        </p>
      ) : (
        <div className="team-chips">
          <AnimatePresence>
            {st.teams.map((t) => (
              <motion.span
                key={t.id}
                layout
                className="team-chip"
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
              >
                <span className="t-ic">
                  <TeamIcon name={t.icon} />
                </span>
                {t.name} <span className={`dot ${t.online ? "on" : ""}`} />
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function IntroStep({ cmd }: { cmd: Cmd }) {
  return (
    <section className="card-a center-card">
      <span className="step-ic-wrap">
        <Clapperboard className="step-ic" />
      </span>
      <h2 className="step-title">Na projektoru běží intro</h2>
      <p className="mute">Buben, logo a představení týmů. Až dohraje (cca 6 s), vylosuj pavouka.</p>
      <button className="btn btn-sm" onClick={() => cmd({ type: "setView", view: "intro" })}>
        <RotateCcw className="btn-ic" /> Přehrát intro znovu
      </button>
    </section>
  );
}

function TeamTag({ st, id, win, lose }: { st: AdminState; id: string | null; win?: boolean; lose?: boolean }) {
  const t = st.teams.find((x) => x.id === id);
  return (
    <span className={`mt-team ${win ? "win" : ""} ${lose ? "lose" : ""} ${t ? "" : "tbd"}`}>
      {t && (
        <span className="t-ic">
          <TeamIcon name={t.icon} />
        </span>
      )}
      <span className="mt-name">{t?.name ?? "?"}</span>
    </span>
  );
}

function BracketStep({ st, cmd, played }: { st: AdminState; cmd: Cmd; played: boolean }) {
  const b = st.bracket;
  if (!b) return null;
  const upcoming = nextMatch(b);
  return (
    <section className="card-a">
      {Array.from({ length: b.rounds }, (_, r) => (
        <div key={r} className="mt-round">
          <h3 className="h3">{roundName(r, b.rounds)}</h3>
          {b.matches
            .filter((m) => m.round === r)
            .map((m) => (
              <div key={m.id} className={`mt ${upcoming?.id === m.id ? "next" : ""} ${m.winner ? "done" : ""}`}>
                {m.bye ? (
                  <>
                    <TeamTag st={st} id={m.a ?? m.b} win />
                    <span className="mt-bye">volný postup</span>
                  </>
                ) : (
                  <>
                    <TeamTag st={st} id={m.a} win={!!m.winner && m.winner === m.a} lose={!!m.winner && m.winner !== m.a} />
                    <span className="mt-vs">{m.winner ? `${m.scoreA} : ${m.scoreB}` : "vs"}</span>
                    <TeamTag st={st} id={m.b} win={!!m.winner && m.winner === m.b} lose={!!m.winner && m.winner !== m.b} />
                  </>
                )}
                {upcoming?.id === m.id && <span className="mt-flag">na řadě</span>}
              </div>
            ))}
        </div>
      ))}
      {!played && (
        <button className="btn btn-sm" onClick={() => confirm("Vylosovat pavouka znovu?") && cmd({ type: "drawBracket" })}>
          <Shuffle className="btn-ic" /> Přelosovat
        </button>
      )}
    </section>
  );
}

function DuelStep({ st, match }: { st: AdminState; match: Match }) {
  const b = st.bracket!;
  return (
    <>
      <section className="card-a duel-a">
        <span className="duel-a-round">{roundName(match.round, b.rounds)}</span>
        <div className="duel-a-row">
          <TeamTag st={st} id={match.a} />
          <span className="duel-a-vs">VS</span>
          <TeamTag st={st} id={match.b} />
        </div>
        <p className="mute small center">
          Na projektoru: představení duelu. Zavolej zástupce ke stolu a pak vyber otázku (Ukázat otázku).
        </p>
      </section>
    </>
  );
}

function QuestionStep({ st, cmd, match, onFlip }: { st: AdminState; cmd: Cmd; match: Match | null; onFlip: (i: number) => void }) {
  const q = st.questions[st.questionIndex];
  const round = st.round;
  if (!q || !round) return null;
  const asking = round.phase === "question";

  return (
    <>
      {match && (
        <section className="card-a duel-head">
          {(["a", "b"] as const).map((side) => {
            const id = match[side];
            const t = st.teams.find((x) => x.id === id);
            const n = id ? (round.strikes[id] ?? 0) : 0;
            const turn = round.turn === id;
            return (
              <button
                key={side}
                className={`dh-side ${turn ? "turn" : ""} ${n >= MAX_STRIKES ? "out" : ""}`}
                onClick={() => id && !turn && cmd({ type: "setTurn", teamId: id })}
              >
                {turn && <motion.span layoutId="adm-turn" className="dh-turn">na tahu</motion.span>}
                <span className="t-ic">{t && <TeamIcon name={t.icon} />}</span>
                <span className="dh-name">{t?.name}</span>
                <span className="dh-score">{side === "a" ? match.scoreA : match.scoreB}</span>
                <span className="mini-x">
                  {Array.from({ length: MAX_STRIKES }, (_, i) => (
                    <span key={i} className={i < n ? "on" : ""}>
                      {i < n && <XIcon />}
                    </span>
                  ))}
                </span>
              </button>
            );
          })}
        </section>
      )}

      {asking && (
        <section className="card-a waiting-buzz">
          <span className="wb-dot" />
          <div>
            <b>Čekám na bzučák…</b>
            <p className="mute small">
              {match ? "Kdo z dvojice zmáčkne první, je na tahu. Bez telefonu? Klepni nahoře na tým." : "Bzučet můžou všechny týmy."}
            </p>
          </div>
        </section>
      )}

      <section className="card-a qcard">
        <div className="q-head">
          <span className="qnav-num">
            Otázka {st.questionIndex + 1}
            <span className="mute"> / {st.questions.length}</span>
          </span>
          {q.multiplier > 1 && <span className="mult">body ×{q.multiplier}</span>}
        </div>
        <p className="qtext">{q.text}</p>
        <p className="mute small">{asking ? "Karty se otočí až po bzučáku." : "Klepni na odpověď, kterou někdo uhodl."}</p>
        <ol className="answers">
          {q.answers.map((a, i) => {
            const rev = round.revealed[i];
            const by = rev?.by ? st.teams.find((t) => t.id === rev.by) : undefined;
            return (
              <li key={i}>
                <button className={`ans ${rev ? (rev.by ? "done" : "done dim") : ""}`} disabled={!!rev || asking} onClick={() => onFlip(i)}>
                  <span className="ans-n">{i + 1}</span>
                  <span className="ans-t">{a.text}</span>
                  {by && (
                    <span className="ans-by t-ic">
                      <TeamIcon name={by.icon} />
                    </span>
                  )}
                  {rev && !rev.by && <span className="ans-by mute">—</span>}
                  <span className="ans-p">{a.points * q.multiplier}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {!match && (
        <section className="card-a">
          <h3 className="h3">Pokusy týmů</h3>
          <div className="strike-list">
            {st.teams.map((t) => {
              const n = round.strikes[t.id] ?? 0;
              return (
                <div key={t.id} className={`strike-item ${n >= MAX_STRIKES ? "out" : ""}`}>
                  <span className="t-ic">
                    <TeamIcon name={t.icon} />
                  </span>
                  <span className="strike-name">{t.name}</span>
                  <span className="mini-x">
                    {Array.from({ length: MAX_STRIKES }, (_, i) => (
                      <span key={i} className={i < n ? "on" : ""}>
                        {i < n && <XIcon />}
                      </span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>
          <button className="btn btn-sm" onClick={() => cmd({ type: "clearStrikes" })}>
            Vynulovat pokusy
          </button>
        </section>
      )}
    </>
  );
}

function Ranking({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  return (
    <ol className="rank-list">
      {sorted.map((t, i) => (
        <li key={t.id}>
          <span className="team-rank">{i + 1}.</span>
          <span className="t-ic">
            <TeamIcon name={t.icon} />
          </span>
          <span className="strike-name">{t.name}</span>
          <b className="y">{t.score}</b>
        </li>
      ))}
    </ol>
  );
}

function EndShowButton({ cmd }: { cmd: Cmd }) {
  return (
    <button
      className="btn btn-danger btn-block"
      onClick={() =>
        confirm("Ukončit show? Smažou se týmy i body a telefon se odpojí. Na projektoru se znovu ukáže admin QR.") &&
        cmd({ type: "endShow" })
      }
    >
      Ukončit show a vše vynulovat
    </button>
  );
}

function FinalStep({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const champId = champion(st.bracket);
  const winner = st.teams.find((t) => t.id === champId) ?? [...st.teams].sort((a, b) => b.score - a.score)[0];
  return (
    <section className="card-a center-card">
      <span className="step-ic-wrap">{winner ? <TeamIcon name={winner.icon} /> : <Trophy className="step-ic" />}</span>
      <h2 className="step-title">Vítěz: {winner?.name ?? "—"}</h2>
      <p className="mute small">Body za celý turnaj:</p>
      <Ranking teams={st.teams} />
      <EndShowButton cmd={cmd} />
    </section>
  );
}

function Advanced({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  return (
    <details className="card-a adv">
      <summary>
        <ChevronDown className="adv-chev" /> Pokročilé ovládání
      </summary>
      <h3 className="h3">Projektor ukazuje</h3>
      <div className="seg seg6">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            className={`seg-btn ${st.view === v ? "on" : ""}`}
            onClick={() => cmd({ type: "setView", view: v })}
            disabled={(v === "board" && !st.round) || (v === "bracket" && !st.bracket) || (v === "duel" && !st.matchId)}
          >
            {label}
          </button>
        ))}
      </div>
      <h3 className="h3">Bzučáky</h3>
      <div className="row-btns">
        <button className={`btn btn-sm ${st.buzzer.open ? "btn-y" : ""}`} onClick={() => cmd({ type: "buzzer", action: "open" })}>
          {st.buzzer.open ? "● Otevřeno" : "Otevřít znovu"}
        </button>
        <button className="btn btn-sm" onClick={() => cmd({ type: "buzzer", action: "reset" })}>
          Zavřít / reset
        </button>
      </div>
      <h3 className="h3">Skočit na otázku</h3>
      <div className="jump-list">
        {st.questions.map((q, i) => (
          <button
            key={q.id}
            className={`jump ${i === st.questionIndex ? "on" : ""} ${st.used.includes(q.id) ? "used" : ""}`}
            onClick={() => confirm(`Spustit otázku ${i + 1}? Aktuální otázka se zahodí.`) && cmd({ type: "goto", index: i })}
          >
            <span className="qedit-n">{i + 1}</span>
            <span className="qedit-t">{q.text}</span>
            <span className={`src-tag ${q.source}`}>{q.source === "chc" ? "CHC" : "ČEŠI"}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

/** ruční výběr otázky — zahrané se nenabízí, filtr CHC / Co na to Češi */
function QuestionPicker({
  st,
  open,
  onClose,
  onPick,
}: {
  st: AdminState;
  open: boolean;
  onClose: () => void;
  onPick: (questionId: string) => void;
}) {
  const [src, setSrc] = useState<QuestionSource>("chc");
  const [sel, setSel] = useState<string | null>(null);
  const fresh = st.questions.filter((q) => !st.used.includes(q.id));
  const count = (x: QuestionSource) => fresh.filter((q) => q.source === x).length;
  const list = fresh.filter((q) => q.source === src);
  useEffect(() => {
    if (open) setSel(null);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="sheet-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="sheet qpick"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <div className="sheet-grip" />
            <h2 className="sheet-title">
              Vyber <em>otázku</em>
              <span className="mute small"> · zahraných {st.used.length}</span>
            </h2>
            <div className="seg qpick-tabs">
              {(["chc", "cesi"] as const).map((x) => (
                <button key={x} className={`seg-btn ${src === x ? "on" : ""}`} onClick={() => setSrc(x)}>
                  {SOURCE_LABEL[x]} · {count(x)}
                </button>
              ))}
            </div>
            <div className="qpick-list">
              {list.length === 0 && <p className="mute small center">Tady už žádná nezahraná otázka není.</p>}
              {list.map((q) => (
                <div key={q.id} className={`qpick-item ${sel === q.id ? "on" : ""}`}>
                  <button className="qpick-head" onClick={() => setSel(sel === q.id ? null : q.id)}>
                    <span className="qpick-text">{q.text}</span>
                    {q.multiplier > 1 && <span className="mult">×{q.multiplier}</span>}
                    <ChevronDown className="qpick-chev" />
                  </button>
                  {sel === q.id && (
                    <>
                      <ol className="answers preview">
                        {q.answers.map((a, i) => (
                          <li key={i} className="ans">
                            <span className="ans-n">{i + 1}</span>
                            <span className="ans-t">{a.text}</span>
                            <span className="ans-p">{a.points * q.multiplier}</span>
                          </li>
                        ))}
                      </ol>
                      <button className="btn btn-y btn-block" onClick={() => onPick(q.id)}>
                        <Megaphone className="btn-ic" /> Ukázat tuhle otázku
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="row-btns">
              <button className="btn btn-ghost" onClick={onClose}>
                Zrušit
              </button>
              <button className="btn" disabled={!list.length} onClick={() => onPick(list[Math.floor(Math.random() * list.length)].id)}>
                <Shuffle className="btn-ic" /> Náhodná ({SOURCE_LABEL[src]})
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TeamSheet({
  sheet,
  st,
  match,
  onClose,
  onPick,
}: {
  sheet: Sheet;
  st: AdminState;
  match: Match | null;
  onClose: () => void;
  onPick: (teamId: string | null) => void;
}) {
  const q = st.questions[st.questionIndex];
  const strikes = st.round?.strikes ?? {};
  const answer = sheet?.kind === "flip" && q ? q.answers[sheet.index] : null;
  const turn = st.round?.turn ?? null;
  // v duelu jen dva soupeři, tým na tahu první
  const teams = match
    ? [match.a, match.b]
        .map((id) => st.teams.find((t) => t.id === id))
        .filter((t): t is Team => !!t)
        .sort((x, y) => Number(y.id === turn) - Number(x.id === turn))
    : st.teams;
  const scoreOf = (id: string) => (match ? (id === match.a ? match.scoreA : match.scoreB) : 0);
  const leader = match ? (match.scoreA === match.scoreB ? null : match.scoreA > match.scoreB ? match.a : match.b) : null;

  return (
    <AnimatePresence>
      {sheet && (
        <>
          <motion.div className="sheet-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className={`sheet ${sheet.kind === "strike" ? "sheet-strike" : ""}`}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
          >
            <div className="sheet-grip" />
            {sheet.kind === "flip" ? (
              <h2 className="sheet-title">
                Kdo uhodl <em>„{answer?.text}“</em>?
                <span className="mute small"> +{(answer?.points ?? 0) * (q?.multiplier ?? 1)} b.</span>
              </h2>
            ) : sheet.kind === "endDuel" ? (
              <h2 className="sheet-title">
                Kdo <em>vyhrál duel</em> a postupuje?
                <span className="mute small"> {leader ? `Vede ${st.teams.find((t) => t.id === leader)?.name}.` : "Je to nerozhodně."}</span>
              </h2>
            ) : (
              <h2 className="sheet-title">
                Kdo se <em>netrefil</em>?
              </h2>
            )}
            <div className={`team-grid ${match ? "duo" : ""}`}>
              {teams.map((t: Team) => {
                const n = strikes[t.id] ?? 0;
                const out = sheet.kind === "strike" && n >= MAX_STRIKES;
                const primary = sheet.kind === "endDuel" ? t.id === leader : t.id === turn;
                return (
                  <button key={t.id} className={`team-btn ${primary ? "primary" : ""}`} disabled={out} onClick={() => onPick(t.id)}>
                    <span className="team-btn-em">
                      <TeamIcon name={t.icon} />
                    </span>
                    <span className="team-btn-name">{t.name}</span>
                    <span className="team-btn-meta">
                      {sheet.kind === "endDuel"
                        ? `${scoreOf(t.id)} bodů v duelu`
                        : match
                          ? `${t.id === turn ? "na tahu · " : ""}${out ? "vyřazen" : n ? `${n}× vedle` : "bez chyby"}`
                          : `${t.score} b. · ${out ? "vyřazen" : n ? `${n}× vedle` : "bez chyby"}`}
                    </span>
                  </button>
                );
              })}
            </div>
            {sheet.kind === "flip" && (
              <button className="btn btn-block" onClick={() => onPick(null)}>
                Jen otočit — bez bodů
              </button>
            )}
            <button className="btn btn-block btn-ghost" onClick={onClose}>
              Zrušit
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PendingBar({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const p = st.pending;
  return (
    <AnimatePresence>
      {p && (
        <motion.div
          key={p.id}
          className="pending"
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 34 }}
        >
          <div className="pending-row">
            <span className="pending-label">
              <Hourglass className="pending-ic" /> {p.label}
            </span>
            <button className="btn btn-dark" onClick={() => cmd({ type: "cancelPending" })}>
              ZRUŠIT
            </button>
          </div>
          <div className="pending-track">
            <div
              className="pending-fill"
              style={{ animationDuration: `${p.remainingMs}ms`, transform: `scaleX(${p.remainingMs / p.delayMs})` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ───────────────────────────── TÝMY ─────────────────────────────

function TeamsTab({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const [name, setName] = useState("");
  const sorted = useMemo(() => [...st.teams].sort((a, b) => b.score - a.score), [st.teams]);

  return (
    <div className="adm-body">
      <section className="card-a">
        <h3 className="h3">Přidat tým ručně</h3>
        <form
          className="inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await cmd({ type: "teamAdd", name })) setName("");
          }}
        >
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Název týmu" maxLength={20} />
          <button className="btn btn-y" disabled={name.trim().length < 2}>
            Přidat
          </button>
        </form>
        <p className="mute small">
          Týmy se připojují přes QR v lobby · kód <b className="y">{st.joinCode}</b>
        </p>
      </section>

      {sorted.map((t, i) => (
        <section className="card-a team-row" key={t.id}>
          <div className="team-row-top">
            <span className="team-rank">{i + 1}.</span>
            <span className="team-em">
              <TeamIcon name={t.icon} />
            </span>
            <button
              className="team-name"
              onClick={() => {
                const n = prompt("Nový název týmu", t.name);
                if (n && n.trim() !== t.name) cmd({ type: "teamRename", id: t.id, name: n });
              }}
            >
              {t.name} <Pencil className="pencil-ic" />
            </button>
            <span className={`dot ${t.online ? "on" : ""}`} title={t.online ? "online" : "offline"} />
            <span className="team-score">{t.score}</span>
          </div>
          <div className="team-row-btns">
            {[-10, -1, +1, +10].map((d) => (
              <button key={d} className="btn btn-sm" onClick={() => cmd({ type: "teamAdjust", id: t.id, delta: d })}>
                {d > 0 ? `+${d}` : d}
              </button>
            ))}
            <button
              className="btn btn-sm btn-danger"
              onClick={() => confirm(`Odstranit tým ${t.name}?`) && cmd({ type: "teamRemove", id: t.id })}
            >
              <Trash2 className="btn-ic" />
            </button>
          </div>
        </section>
      ))}
      {st.teams.length === 0 && <div className="card-a empty">Zatím žádné týmy.</div>}
    </div>
  );
}

// ───────────────────────────── NASTAVENÍ ─────────────────────────────

function SettingsTab({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const [delay, setDelay] = useState(st.settings.delayMs);
  const [custom, setCustom] = useState(st.settings.baseUrl);
  useEffect(() => setDelay(st.settings.delayMs), [st.settings.delayMs]);

  return (
    <div className="adm-body">
      <section className="card-a">
        <h3 className="h3">Prodleva před zobrazením</h3>
        <p className="mute small">Po klepnutí máš tolik času na „Zrušit“, než se to ukáže na projektoru.</p>
        <div className="range-row">
          <input
            type="range"
            min={0}
            max={4000}
            step={500}
            value={delay}
            onChange={(e) => setDelay(Number(e.target.value))}
            onPointerUp={() => cmd({ type: "settings", settings: { delayMs: delay } })}
            onKeyUp={() => cmd({ type: "settings", settings: { delayMs: delay } })}
          />
          <b className="y">{(delay / 1000).toFixed(1)} s</b>
        </div>
      </section>

      <section className="card-a">
        <h3 className="h3">Adresa v QR kódech</h3>
        <p className="mute small">Telefony musí být na stejné Wi-Fi jako notebook, nebo použij veřejný tunel (viz README).</p>
        <div className="url-list">
          <button className={`url-opt ${!st.settings.baseUrl ? "on" : ""}`} onClick={() => cmd({ type: "settings", settings: { baseUrl: "" } })}>
            Automaticky <span className="mute small">({st.lanUrl})</span>
          </button>
          {st.lanUrls.map((u) => (
            <button
              key={u}
              className={`url-opt ${st.settings.baseUrl === u ? "on" : ""}`}
              onClick={() => cmd({ type: "settings", settings: { baseUrl: u } })}
            >
              {u}
            </button>
          ))}
        </div>
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            cmd({ type: "settings", settings: { baseUrl: custom } });
          }}
        >
          <input className="input" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="https://…trycloudflare.com" />
          <button className="btn">Uložit</button>
        </form>
      </section>

      <section className="card-a">
        <h3 className="h3">Notebook — klávesy</h3>
        <ul className="keys">
          <li>
            <kbd>F</kbd> celá obrazovka
          </li>
          <li>
            <kbd>M</kbd> ztlumit zvuk
          </li>
          <li>
            <kbd>T</kbd> zvuková zkouška (přehraje všechny zvuky)
          </li>
          <li>
            <kbd>Shift</kbd>+<kbd>A</kbd> nový admin QR kód
          </li>
        </ul>
      </section>

      <section className="card-a">
        <h3 className="h3">Reset</h3>
        <p className="mute small">
          <b>Vynulovat body</b> — týmy zůstanou. <b>Nová hra</b> — smaže týmy, nový kód hry, ty zůstaneš adminem.{" "}
          <b>Ukončit show</b> — smaže vše a odpojí i tento telefon (na projektoru se znovu ukáže admin QR).
        </p>
        <div className="row-btns">
          <button className="btn" onClick={() => confirm("Vynulovat body všech týmů?") && cmd({ type: "resetScores" })}>
            Vynulovat body
          </button>
          <button
            className="btn"
            onClick={() => confirm("Opravdu novou hru? Smažou se všechny týmy i body.") && cmd({ type: "resetGame" })}
          >
            Nová hra
          </button>
        </div>
        <EndShowButton cmd={cmd} />
      </section>

      <p className="mute small center">Ovládání je spárované s tímto telefonem.</p>
    </div>
  );
}
