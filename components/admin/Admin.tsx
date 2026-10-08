"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import { XIcon } from "@/components/shared";
import { emitAck, useConnected, useOnConnect, useSocketEvent } from "@/lib/socket";
import { MAX_STRIKES, type Ack, type AdminCmd, type AdminState, type Question, type Team, type View } from "@/lib/types";
import { QuestionsTab } from "./QuestionsTab";

const SESSION_KEY = "chc-admin-session";

type Status = "connecting" | "claimable" | "invalid" | "admin" | "kicked";
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
    useCallback(() => {
      try {
        localStorage.removeItem(SESSION_KEY);
      } catch {}
      setStatus("kicked");
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
        {(status === "invalid" || status === "kicked") && (
          <p className="gate-text">
            {status === "kicked" ? "Ovládání převzalo jiné zařízení." : "Tenhle odkaz už neplatí."}
            <br />
            <span className="mute">Na notebooku stiskni Shift + A pro nový QR kód.</span>
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
              ["settings", "⚙"],
            ] as [Tab, string][]
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
  ["lobby", "Lobby + QR"],
  ["board", "Otázka"],
  ["scoreboard", "Pořadí"],
  ["final", "Finále"],
];

function GameTab({ st, cmd }: { st: AdminState; cmd: Cmd }) {
  const [sel, setSel] = useState(Math.max(0, st.questionIndex));
  const [sheet, setSheet] = useState<Sheet>(null);
  const current = st.questionIndex;
  const q: Question | undefined = st.questions[sel];
  const isLive = sel === current && !!st.round;
  const strikes = st.round?.strikes ?? {};

  // když se otázka změní odjinud, přeskočit na ni
  useEffect(() => {
    if (current >= 0) setSel(current);
  }, [current]);

  const total = st.questions.length;
  const next = current + 1;

  return (
    <div className="adm-body">
      <section className="seg">
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
      </section>

      {total === 0 ? (
        <div className="card-a empty">Nemáš žádné otázky. Přidej je v záložce Otázky.</div>
      ) : (
        <section className="card-a qcard">
          <div className="qnav">
            <button className="icon-btn" onClick={() => setSel((s) => Math.max(0, s - 1))} disabled={sel <= 0} aria-label="Předchozí">
              ‹
            </button>
            <div className="qnav-mid">
              <span className="qnav-num">
                Otázka {sel + 1}
                <span className="mute"> / {total}</span>
              </span>
              <span className={`tag ${isLive ? "live" : ""}`}>
                {isLive ? "● Na projektoru" : current === -1 ? "Nespuštěno" : "Náhled"}
              </span>
            </div>
            <button
              className="icon-btn"
              onClick={() => setSel((s) => Math.min(total - 1, s + 1))}
              disabled={sel >= total - 1}
              aria-label="Další"
            >
              ›
            </button>
          </div>

          {q && (
            <>
              <p className="qtext">
                {q.text}
                {q.multiplier > 1 && <span className="mult">×{q.multiplier}</span>}
              </p>

              <ol className="answers">
                {q.answers.map((a, i) => {
                  const rev = isLive ? st.round!.revealed[i] : null;
                  const by = rev?.by ? st.teams.find((t) => t.id === rev.by) : undefined;
                  return (
                    <li key={i}>
                      <button
                        className={`ans ${rev ? (rev.by ? "done" : "done dim") : ""}`}
                        disabled={!isLive || !!rev}
                        onClick={() => setSheet({ kind: "flip", index: i })}
                      >
                        <span className="ans-n">{i + 1}</span>
                        <span className="ans-t">{a.text}</span>
                        {by && <span className="ans-by">{by.emoji}</span>}
                        {rev && !rev.by && <span className="ans-by mute">—</span>}
                        <span className="ans-p">{a.points * q.multiplier}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>

              {!isLive && (
                <button className="btn btn-y btn-block" onClick={() => cmd({ type: "goto", index: sel })}>
                  ▶ Spustit otázku {sel + 1} na projektoru
                </button>
              )}
            </>
          )}
        </section>
      )}

      {st.round && (
        <section className="card-a">
          <h3 className="h3">Pokusy týmů</h3>
          <div className="strike-list">
            {st.teams.map((t) => {
              const n = strikes[t.id] ?? 0;
              return (
                <div key={t.id} className={`strike-item ${n >= MAX_STRIKES ? "out" : ""}`}>
                  <span>{t.emoji}</span>
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
            {st.teams.length === 0 && <span className="mute">Žádné týmy.</span>}
          </div>
          <div className="row-btns">
            <button className="btn" onClick={() => cmd({ type: "revealAll" })} disabled={!st.round.revealed.some((r) => !r)}>
              Odkrýt zbytek
            </button>
            <button className="btn" onClick={() => cmd({ type: "clearStrikes" })}>
              Vynulovat pokusy
            </button>
          </div>
        </section>
      )}

      <section className="card-a">
        <h3 className="h3">Bzučáky na telefonech týmů</h3>
        <p className="mute small">
          {st.buzzer.open
            ? "Otevřeno — kdo zmáčkne první, ukáže se na projektoru."
            : st.buzzer.winner
              ? `První: ${st.teams.find((t) => t.id === st.buzzer.winner)?.emoji ?? ""} ${st.teams.find((t) => t.id === st.buzzer.winner)?.name ?? "?"}`
              : "Volitelné — pro souboj „kdo dřív“."}
        </p>
        <div className="row-btns">
          <button className={`btn ${st.buzzer.open ? "btn-y" : ""}`} onClick={() => cmd({ type: "buzzer", action: "open" })}>
            {st.buzzer.open ? "● Otevřeno" : "Otevřít"}
          </button>
          <button className="btn" onClick={() => cmd({ type: "buzzer", action: "reset" })}>
            Zavřít / reset
          </button>
        </div>
      </section>

      <div className="spacer" />

      <div className="actionbar">
        <button className="btn act-undo" onClick={() => cmd({ type: "undo" })} disabled={!st.canUndo}>
          ↶<small>Zpět</small>
        </button>
        <button className="btn act-buzz" disabled={!st.round || st.teams.length === 0} onClick={() => setSheet({ kind: "strike" })}>
          <XIcon className="act-x" />
          BZZZ
        </button>
        <button
          className="btn act-next"
          onClick={() => (next < total ? cmd({ type: "goto", index: next }) : cmd({ type: "setView", view: "scoreboard" }))}
          disabled={total === 0}
        >
          {next < total ? "›" : "🏆"}
          <small>{next < total ? `Otázka ${next + 1}` : "Pořadí"}</small>
        </button>
      </div>

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
                    <span className="team-btn-em">{t.emoji}</span>
                    <span className="team-btn-name">{t.name}</span>
                    <span className="team-btn-meta">
                      {t.score} b. · {out ? "vyřazen" : `${"✕".repeat(n)}${"·".repeat(MAX_STRIKES - n)}`}
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
            <span className="pending-label">⏳ {p.label}</span>
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
            <span className="team-em">{t.emoji}</span>
            <button
              className="team-name"
              onClick={() => {
                const n = prompt("Nový název týmu", t.name);
                if (n && n.trim() !== t.name) cmd({ type: "teamRename", id: t.id, name: n });
              }}
            >
              {t.name} <span className="mute small">✎</span>
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
              🗑
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
            <kbd>Shift</kbd>+<kbd>A</kbd> nový admin QR kód
          </li>
        </ul>
      </section>

      <section className="card-a">
        <h3 className="h3">Reset</h3>
        <div className="row-btns">
          <button className="btn" onClick={() => confirm("Vynulovat body všech týmů?") && cmd({ type: "resetScores" })}>
            Vynulovat body
          </button>
          <button
            className="btn btn-danger"
            onClick={() => confirm("Opravdu novou hru? Smažou se všechny týmy i body.") && cmd({ type: "resetGame" })}
          >
            Nová hra
          </button>
        </div>
      </section>

      <p className="mute small center">Ovládání je spárované s tímto telefonem.</p>
    </div>
  );
}
