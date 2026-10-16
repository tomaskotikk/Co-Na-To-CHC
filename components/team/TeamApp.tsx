"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bubble, Logo } from "@/components/Logo";
import { CountUp, XIcon } from "@/components/shared";
import { TeamIcon } from "@/components/TeamIcon";
import { emitAck, getSocket, useConnected, useOnConnect, useSocketEvent } from "@/lib/socket";
import { champion, MAX_STRIKES, roundName, type Ack, type PublicState, type Team } from "@/lib/types";

const TEAM_KEY = "chc-team";

const vibrate = (p: number | number[]) => {
  try {
    navigator.vibrate?.(p);
  } catch {}
};

function storedTeam() {
  try {
    return localStorage.getItem(TEAM_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

type Flash = { key: number; kind: "plus"; points: number } | { key: number; kind: "strike"; count: number } | null;

export function TeamApp({ initialCode }: { initialCode: string }) {
  const [teamId, setTeamId] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [st, setSt] = useState<PublicState | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const seenFx = useRef<number | null>(null);
  const connected = useConnected();

  useOnConnect(() => {
    emitAck<{ team: Team | null }>("hello:team", { teamId: storedTeam() })
      .then((r) => {
        if (r.team) setTeamId(r.team.id);
        else {
          setTeamId(null);
          try {
            localStorage.removeItem(TEAM_KEY);
          } catch {}
        }
        setChecked(true);
      })
      .catch(() => setChecked(true));
  });
  useSocketEvent<PublicState>("state", setSt);
  useSocketEvent<string>(
    "team:removed",
    useCallback((id: string) => {
      const mine = storedTeam();
      if (id === "*" || id === mine) {
        try {
          localStorage.removeItem(TEAM_KEY);
        } catch {}
        setTeamId(null);
      }
    }, []),
  );

  // reakce na dění na projektoru
  useEffect(() => {
    if (!st || !teamId) return;
    const fx = st.fx;
    if (seenFx.current === null || fx.id === seenFx.current) {
      seenFx.current = fx.id;
      return;
    }
    seenFx.current = fx.id;
    if (fx.kind === "flip" && fx.teamId === teamId) {
      vibrate([40, 60, 40, 60, 120]);
      setFlash({ key: fx.id, kind: "plus", points: fx.points });
    } else if (fx.kind === "strike" && fx.teamId === teamId) {
      vibrate(500);
      setFlash({ key: fx.id, kind: "strike", count: fx.count });
    } else if (fx.kind === "buzz" || fx.kind === "turn") {
      if (fx.teamId === teamId) vibrate([80, 50, 80, 50, 200]);
    } else if (fx.kind === "duel") {
      const m = st.bracket?.matches.find((x) => x.id === fx.matchId);
      if (m && (m.a === teamId || m.b === teamId)) vibrate([60, 40, 60]);
    } else if (fx.kind === "advance" && fx.teamId === teamId) {
      vibrate([40, 60, 40, 60, 160]);
    }
  }, [st, teamId]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(t);
  }, [flash]);

  const team = st?.teams.find((t) => t.id === teamId);

  return (
    <main className="tm">
      <AnimatePresence mode="wait">
        {!checked || !st ? (
          <motion.div key="load" className="tm-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Logo className="tm-logo-big" />
            <p className="mute">Připojuji…</p>
          </motion.div>
        ) : !team ? (
          <JoinForm
            key="join"
            initialCode={initialCode}
            onJoined={(t) => {
              try {
                localStorage.setItem(TEAM_KEY, t.id);
              } catch {}
              seenFx.current = null;
              setTeamId(t.id);
            }}
          />
        ) : (
          <motion.div key="play" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="tm-play">
            <TeamView st={st} team={team} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.key}
            className={`tm-flash ${flash.kind}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.3, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 14 }}
              className="tm-flash-inner"
            >
              {flash.kind === "plus" ? (
                <>
                  <span className="tm-flash-big">+{flash.points}</span>
                  <span>Trefa!</span>
                </>
              ) : (
                <>
                  <span className="tm-flash-xs">
                    {Array.from({ length: flash.count }, (_, i) => (
                      <XIcon key={i} stroke="#ffd500" />
                    ))}
                  </span>
                  <span>{flash.count >= MAX_STRIKES ? "Vyřazeni z otázky" : "Vedle!"}</span>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!connected && checked && <div className="tm-offline">Připojuji znovu…</div>}
    </main>
  );
}

function JoinForm({ initialCode, onJoined }: { initialCode: string; onJoined: (t: Team) => void }) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const r = await emitAck<Ack<{ team: Team }>>("team:join", { code, name });
      if (r.ok) {
        vibrate([30, 40, 60]);
        onJoined(r.team);
      } else {
        setErr(r.error);
        vibrate(200);
      }
    } catch {
      setErr("Server neodpovídá, zkus to znovu.");
    }
    setBusy(false);
  };

  return (
    <motion.form
      className="tm-join"
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <Logo className="tm-logo-big" />
      <p className="tm-lead">Stužkovací show Creative Hill College. Vymyslete jméno týmu a jdeme na to!</p>

      <label className="tm-field">
        <span>Kód hry</span>
        <input
          className="tm-input code"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          placeholder="0000"
        />
      </label>
      <label className="tm-field">
        <span>Název týmu</span>
        <input
          className="tm-input"
          autoComplete="off"
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="např. Zadní lavice"
          autoFocus={!!initialCode}
        />
      </label>

      <AnimatePresence>
        {err && (
          <motion.p className="tm-err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            {err}
          </motion.p>
        )}
      </AnimatePresence>

      <button className="tm-btn" disabled={busy || code.length !== 4 || name.trim().length < 2}>
        {busy ? "Připojuji…" : "Připojit tým"}
      </button>
    </motion.form>
  );
}

function TeamView({ st, team }: { st: PublicState; team: Team }) {
  const b = st.bracket;
  const match = b?.matches.find((m) => m.id === st.matchId) ?? null;
  const inMatch = !!match && (match.a === team.id || match.b === team.id);
  const rival = inMatch ? st.teams.find((t) => t.id === (match!.a === team.id ? match!.b : match!.a)) : undefined;
  const nameOf = (id: string | null) => st.teams.find((t) => t.id === id)?.name ?? "?";
  const lostIn = b?.matches.find((m) => m.winner && m.winner !== team.id && (m.a === team.id || m.b === team.id));
  const champId = champion(b);
  const myNext = b?.matches.find((m) => !m.winner && (m.a === team.id || m.b === team.id));
  const round = st.round;
  const canBuzz = st.buzzer.open && (!st.buzzer.teams || st.buzzer.teams.includes(team.id));
  const strikes = round?.strikes[team.id] ?? 0;
  const stage = match && b ? roundName(match.round, b.rounds) : myNext && b ? roundName(myNext.round, b.rounds) : null;

  let body: React.ReactNode;
  if (canBuzz) {
    body = <BuzzButton key="buzz" question={st.question?.text} />;
  } else if (st.view === "final") {
    body = (
      <Panel key="final" tone={champId === team.id ? "win" : "dark"} big={champId === team.id ? "ŠAMPIONI!" : "Konec turnaje"}>
        {champId === team.id ? "Vyhráli jste celou show!" : `Vítěz: ${nameOf(champId)}`}
      </Panel>
    );
  } else if (st.view === "board" && round && inMatch) {
    const mine = round.turn === team.id;
    body = (
      <div key="play" className="tm-stack">
        {round.phase === "question" ? (
          <Panel tone="dark" big="Čekejte…">Bzučák se za chvíli odemkne.</Panel>
        ) : mine ? (
          <Panel tone="win" big="JSTE NA TAHU" pulse>
            Hádejte odpověď nahlas!
          </Panel>
        ) : (
          <Panel tone="dark" big={`Na tahu: ${nameOf(round.turn)}`}>
            {strikes >= MAX_STRIKES ? "Máte 3 chyby — čekejte." : "Poslouchejte, třeba přijde vaše šance."}
          </Panel>
        )}
        <DuelScore st={st} me={team.id} />
        {st.question && <QuestionCard text={st.question.text} strikes={strikes} />}
      </div>
    );
  } else if (st.view === "duel" && inMatch) {
    body = (
      <Panel key="duel" tone="win" big="Jdete na to!" pulse>
        Duel proti <b>{rival?.name}</b>. Pošlete zástupce ke stolu!
      </Panel>
    );
  } else if (lostIn && b) {
    body = (
      <Panel key="out" tone="dark" big="Vypadli jste">
        {roundName(lostIn.round, b.rounds)} · porazil vás tým {nameOf(lostIn.winner)}. Fanděte dál!
      </Panel>
    );
  } else if (match && (st.view === "duel" || st.view === "board")) {
    body = (
      <div key="watch" className="tm-stack">
        <Panel tone="dark" big="Teď hrají">
          {nameOf(match.a)} vs {nameOf(match.b)}
        </Panel>
        <DuelScore st={st} me={team.id} />
      </div>
    );
  } else if (st.view === "bracket" && myNext && b) {
    const opp = myNext.a === team.id ? myNext.b : myNext.a;
    body = (
      <Panel key="next" tone="dark" big={opp ? `Soupeř: ${nameOf(opp)}` : "Postupujete!"}>
        {opp ? `${roundName(myNext.round, b.rounds)} — koukejte na pavouka.` : "Čekáte, kdo vyhraje duel před vámi."}
      </Panel>
    );
  } else {
    body = (
      <Panel key="wait" tone="dark" big={st.view === "lobby" ? "Jste ve hře!" : "Koukejte na projektor"}>
        {st.view === "lobby" ? "Čekáme, až moderátor spustí show…" : st.view === "intro" ? "Show začíná!" : "Za chvíli se losuje pavouk."}
      </Panel>
    );
  }

  return (
    <div className="tm-view">
      <header className="tm-head">
        <Logo className="tm-logo" />
        {stage && <span className="tm-stage">{stage}</span>}
      </header>

      <section className={`tm-hero ${canBuzz ? "small" : ""}`}>
        <Bubble className="tm-em-bubble" tail="58%">
          <span className="tm-em">
            <TeamIcon name={team.icon} />
          </span>
        </Bubble>
        <h1 className="tm-name">{team.name}</h1>
      </section>

      <AnimatePresence mode="wait">
        <motion.div
          key={canBuzz ? "buzz" : `${st.view}-${round?.phase}-${round?.turn}-${st.matchId}`}
          className="tm-body"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -16, scale: 0.97 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Panel({ tone, big, pulse, children }: { tone: "win" | "dark"; big: string; pulse?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`tm-panel ${tone} ${pulse ? "pulse" : ""}`}>
      <span className="tm-panel-big">{big}</span>
      {children && <p>{children}</p>}
    </div>
  );
}

function DuelScore({ st, me }: { st: PublicState; me: string }) {
  const m = st.bracket?.matches.find((x) => x.id === st.matchId);
  if (!m) return null;
  const side = (id: string | null, score: number) => {
    const t = st.teams.find((x) => x.id === id);
    return (
      <div className={`tm-ds-side ${id === me ? "me" : ""} ${st.round?.turn === id ? "turn" : ""}`}>
        <span className="tm-ds-ic">{t && <TeamIcon name={t.icon} />}</span>
        <span className="tm-ds-name">{t?.name}</span>
        <b>
          <CountUp value={score} delay={400} />
        </b>
      </div>
    );
  };
  return (
    <div className="tm-ds">
      {side(m.a, m.scoreA)}
      <span className="tm-ds-vs">vs</span>
      {side(m.b, m.scoreB)}
    </div>
  );
}

function QuestionCard({ text, strikes }: { text: string; strikes: number }) {
  return (
    <div className="tm-card">
      <span className="tm-q-label">Otázka</span>
      <p className="tm-q">{text}</p>
      <div className="tm-strikes">
        {Array.from({ length: MAX_STRIKES }, (_, i) => (
          <span key={i} className={i < strikes ? "on" : ""}>
            {i < strikes && <XIcon />}
          </span>
        ))}
      </div>
    </div>
  );
}

/** obří bzučák přes skoro celou obrazovku; po stisku hned ukáže „odesláno“ */
function BuzzButton({ question }: { question?: string }) {
  const [pressed, setPressed] = useState(false);
  return (
    <div className="tm-buzz-wrap">
      {question && <p className="tm-buzz-q">{question}</p>}
      <button
        className={`tm-buzzer ${pressed ? "pressed" : ""}`}
        onPointerDown={() => {
          if (pressed) return;
          setPressed(true);
          vibrate(60);
          getSocket().emit("team:buzz");
        }}
      >
        <span>{pressed ? "…" : "BZUČ!"}</span>
      </button>
      <p className="tm-buzz-hint">{pressed ? "Odesláno — koukejte na projektor" : "Kdo dřív zmáčkne, hraje!"}</p>
    </div>
  );
}
