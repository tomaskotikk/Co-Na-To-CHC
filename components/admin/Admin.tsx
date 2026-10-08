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
  Trash2,
  Trophy,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { emitAck, useConnected, useOnConnect, useSocketEvent } from "@/lib/socket";
import { MAX_STRIKES, type Ack, type AdminCmd, type AdminState, type Team, type View } from "@/lib/types";
import { QuestionsTab } from "./QuestionsTab";

const SESSION_KEY = "chc-admin-session";

type Status = "connecting" | "claimable" | "invalid" | "admin" | "kicked" | "ended";
type Tab = "game" | "teams" | "questions" | "settings";
type Sheet = { kind: "flip"; index: number } | { kind: "strike" } | null;

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
  ["board", "Otázka"],
  ["scoreboard", "Pořadí"],
  ["final", "Finále"],
];

type Step = "lobby" | "intro" | "question" | "scores" | "final";

function stepOf(st: AdminState): Step {
  switch (st.view) {
    case "lobby":
      return "lobby";
    case "intro":
      return "intro";
    case "board":
      return st.round ? "question" : "lobby";
    case "scoreboard":
      return "scores";
    case "final":
      return "final";
  }
}

const teamsWord = (n: number) => (n === 1 ? "tým" : n < 5 ? "týmy" : "týmů");

function GameTab({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const step = stepOf(st);
  const total = st.questions.length;
  const next = st.questionIndex + 1;
  const hasNext = next < total;
  const unrevealed = st.round?.revealed.some((r) => !r) ?? false;

  let primary: { icon?: LucideIcon; label: string; sub?: string; run: () => void; disabled?: boolean };
  switch (step) {
    case "lobby":
      primary = {
        icon: Play,
        label: "Start hry",
        sub: st.teams.length ? `${st.teams.length} ${teamsWord(st.teams.length)} ve hře` : "Čekáme na týmy…",
        run: () => cmd({ type: "startShow" }),
        disabled: st.teams.length === 0,
      };
      break;
    case "intro":
      primary = {
        icon: Megaphone,
        label: "Ohlásit 1. otázku",
        run: () => cmd({ type: "goto", index: 0 }),
        disabled: total === 0,
      };
      break;
    case "scores":
      primary = hasNext
        ? {
            icon: Megaphone,
            label: `Ohlásit ${next + 1}. otázku`,
            sub: `${next + 1} z ${total}`,
            run: () => cmd({ type: "goto", index: next }),
          }
        : { icon: Trophy, label: "Vyhlásit vítěze", run: () => cmd({ type: "setView", view: "final" }) };
      break;
    case "final":
      primary = { icon: PartyPopper, label: "Přehrát vyhlášení znovu", run: () => cmd({ type: "setView", view: "final" }) };
      break;
    default:
      primary = { label: "", run: () => {} };
  }

  return (
    <div className="adm-body">
      <Stepper st={st} step={step} />

      <AnimatePresence mode="wait">
        <motion.div
          key={`${step}-${st.questionIndex}`}
          className="step"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.22 }}
        >
          {step === "lobby" && <LobbyStep st={st} />}
          {step === "intro" && <IntroStep cmd={cmd} />}
          {step === "question" && <QuestionStep st={st} cmd={cmd} onFlip={(index) => setSheet({ kind: "flip", index })} />}
          {step === "scores" && <ScoresStep st={st} cmd={cmd} />}
          {step === "final" && <FinalStep st={st} cmd={cmd} />}
        </motion.div>
      </AnimatePresence>

      <Advanced st={st} cmd={cmd} />

      <div className="spacer" />

      {step === "question" ? (
        <div className="actionbar">
          <button className="btn act-undo" onClick={() => cmd({ type: "undo" })} disabled={!st.canUndo}>
            <Undo2 className="act-ic" />
            <small>Zpět</small>
          </button>
          <button className="btn act-buzz" disabled={st.teams.length === 0} onClick={() => setSheet({ kind: "strike" })}>
            <XIcon className="act-x" />
            BZZZ
          </button>
          {unrevealed ? (
            <button className="btn act-next" onClick={() => cmd({ type: "revealAll" })}>
              <Eye className="act-ic" />
              <small>Odkrýt zbytek</small>
            </button>
          ) : (
            <button className="btn act-next" onClick={() => cmd({ type: "setView", view: "scoreboard" })}>
              <Trophy className="act-ic" />
              <small>Pořadí</small>
            </button>
          )}
        </div>
      ) : (
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
      )}

      <TeamSheet
        sheet={sheet}
        st={st}
        onClose={() => setSheet(null)}
        onPick={(teamId) => {
          if (!sheet) return;
          if (sheet.kind === "flip") cmd({ type: "flip", index: sheet.index, teamId });
          else if (teamId) cmd({ type: "strike", teamId });
          setSheet(null);
        }}
      />
    </div>
  );
}

function Stepper({ st, step }: { st: AdminState; step: Step }) {
  const items: React.ReactNode[] = [
    "Lobby",
    "Intro",
    ...st.questions.map((_, i) => `${i + 1}`),
    <Trophy key="t" className="stp-ic" />,
  ];
  const at =
    step === "lobby" ? 0 : step === "intro" ? 1 : step === "final" ? items.length - 1 : 2 + Math.max(0, st.questionIndex);
  return (
    <div className="stepper">
      {items.map((label, i) => (
        <span key={i} className={`stp ${i < at ? "done" : ""} ${i === at ? "now" : ""}`}>
          {label}
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
        <p className="mute small">Týmy naskenují QR na projektoru. Tým bez telefonu přidáš v záložce Týmy.</p>
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
      <p className="mute">Buben, logo a představení týmů. Až dohraje (cca 6 s), ohlas první otázku.</p>
      <button className="btn btn-sm" onClick={() => cmd({ type: "setView", view: "intro" })}>
        <RotateCcw className="btn-ic" /> Přehrát intro znovu
      </button>
    </section>
  );
}

function QuestionStep({ st, cmd, onFlip }: { st: AdminState; cmd: Cmd; onFlip: (i: number) => void }) {
  const q = st.questions[st.questionIndex];
  const round = st.round;
  if (!q || !round) return null;
  const winner = st.buzzer.winner ? st.teams.find((t) => t.id === st.buzzer.winner) : undefined;

  return (
    <>
      <section className="card-a qcard">
        <div className="q-head">
          <span className="qnav-num">
            Otázka {st.questionIndex + 1}
            <span className="mute"> / {st.questions.length}</span>
          </span>
          {q.multiplier > 1 && <span className="mult">body ×{q.multiplier}</span>}
        </div>
        <p className="qtext">{q.text}</p>
        <p className="mute small">Klepni na odpověď, kterou někdo uhodl.</p>
        <ol className="answers">
          {q.answers.map((a, i) => {
            const rev = round.revealed[i];
            const by = rev?.by ? st.teams.find((t) => t.id === rev.by) : undefined;
            return (
              <li key={i}>
                <button className={`ans ${rev ? (rev.by ? "done" : "done dim") : ""}`} disabled={!!rev} onClick={() => onFlip(i)}>
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

      <section className="card-a">
        <h3 className="h3">Bzučáky na telefonech týmů</h3>
        <p className="mute small">
          {st.buzzer.open
            ? "Otevřeno — kdo zmáčkne první, ukáže se na projektoru."
            : winner
              ? `První: ${winner.name}`
              : "Volitelné — souboj „kdo dřív“."}
        </p>
        <div className="row-btns">
          <button className={`btn btn-sm ${st.buzzer.open ? "btn-y" : ""}`} onClick={() => cmd({ type: "buzzer", action: "open" })}>
            {st.buzzer.open ? "● Otevřeno" : "Otevřít"}
          </button>
          <button className="btn btn-sm" onClick={() => cmd({ type: "buzzer", action: "reset" })}>
            Zavřít / reset
          </button>
        </div>
      </section>
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

function ScoresStep({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  return (
    <section className="card-a">
      <h3 className="h3">Na projektoru: průběžné pořadí</h3>
      <Ranking teams={st.teams} />
      {st.round && (
        <button className="btn btn-sm" onClick={() => cmd({ type: "setView", view: "board" })}>
          <ArrowLeft className="btn-ic" /> Zpět na otázku {st.questionIndex + 1}
        </button>
      )}
    </section>
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
  const winner = [...st.teams].sort((a, b) => b.score - a.score)[0];
  return (
    <section className="card-a center-card">
      <span className="step-ic-wrap">{winner ? <TeamIcon name={winner.icon} /> : <Trophy className="step-ic" />}</span>
      <h2 className="step-title">Vítěz: {winner?.name ?? "—"}</h2>
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
      <div className="seg seg5">
        {VIEWS.map(([v, label]) => (
          <button
            key={v}
            className={`seg-btn ${st.view === v ? "on" : ""}`}
            onClick={() => cmd({ type: "setView", view: v })}
            disabled={v === "board" && !st.round}
          >
            {label}
          </button>
        ))}
      </div>
      <h3 className="h3">Skočit na otázku</h3>
      <div className="jump-list">
        {st.questions.map((q, i) => (
          <button
            key={q.id}
            className={`jump ${i === st.questionIndex ? "on" : ""}`}
            onClick={() => confirm(`Spustit otázku ${i + 1}? Aktuální kolo se zahodí.`) && cmd({ type: "goto", index: i })}
          >
            <span className="qedit-n">{i + 1}</span>
            <span className="qedit-t">{q.text}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

function TeamSheet({
  sheet,
  st,
  onClose,
  onPick,
}: {
  sheet: Sheet;
  st: AdminState;
  onClose: () => void;
  onPick: (teamId: string | null) => void;
}) {
  const q = st.questions[st.questionIndex];
  const strikes = st.round?.strikes ?? {};
  const answer = sheet?.kind === "flip" && q ? q.answers[sheet.index] : null;

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
            ) : (
              <h2 className="sheet-title">
                Kdo se <em>netrefil</em>?
              </h2>
            )}
            <div className="team-grid">
              {st.teams.map((t: Team) => {
                const n = strikes[t.id] ?? 0;
                const out = n >= MAX_STRIKES;
                return (
                  <button key={t.id} className="team-btn" disabled={out} onClick={() => onPick(t.id)}>
                    <span className="team-btn-em">
                      <TeamIcon name={t.icon} />
                    </span>
                    <span className="team-btn-name">{t.name}</span>
                    <span className="team-btn-meta">
                      {t.score} b. · {out ? "vyřazen" : n ? `${n}× vedle` : "bez chyby"}
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
