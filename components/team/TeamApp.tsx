"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bubble, Logo } from "@/components/Logo";
import { CountUp, XIcon } from "@/components/shared";
import { emitAck, getSocket, useConnected, useOnConnect, useSocketEvent } from "@/lib/socket";
import { MAX_STRIKES, type Ack, type PublicState, type Team } from "@/lib/types";

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
    } else if (fx.kind === "buzz") {
      vibrate(fx.teamId === teamId ? [80, 50, 80, 50, 200] : 60);
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
  const sorted = [...st.teams].sort((a, b) => b.score - a.score);
  const rank = sorted.findIndex((t) => t.id === team.id) + 1;
  const strikes = st.round?.strikes[team.id] ?? 0;
  const winner = st.buzzer.winner ? st.teams.find((t) => t.id === st.buzzer.winner) : undefined;

  const status =
    st.view === "lobby"
      ? "Jste ve hře! Čekáme, až moderátor spustí show…"
      : st.view === "scoreboard"
        ? "Koukejte na projektor — průběžné pořadí!"
        : st.view === "final"
          ? rank === 1
            ? "🏆 VYHRÁLI JSTE! 🏆"
            : `Konec hry — skončili jste ${rank}.`
          : null;

  return (
    <div className="tm-view">
      <header className="tm-head">
        <Logo className="tm-logo" />
        <span className="tm-rank">
          {rank}.<small> z {st.teams.length}</small>
        </span>
      </header>

      <section className="tm-hero">
        <Bubble className="tm-em-bubble" tail="58%">
          <span className="tm-em">{team.emoji}</span>
        </Bubble>
        <h1 className="tm-name">{team.name}</h1>
        <div className="tm-score">
          <CountUp value={team.score} delay={500} />
          <small>bodů</small>
        </div>
      </section>

      {st.buzzer.open ? (
        <button
          className="tm-buzzer"
          onPointerDown={() => {
            vibrate(40);
            getSocket().emit("team:buzz");
          }}
        >
          <span>BZUČ!</span>
        </button>
      ) : winner ? (
        <div className={`tm-card tm-buzz-res ${winner.id === team.id ? "win" : ""}`}>
          {winner.id === team.id ? "⚡ Byli jste první! Odpovídejte!" : `Rychlejší: ${winner.emoji} ${winner.name}`}
        </div>
      ) : status ? (
        <div className="tm-card">{status}</div>
      ) : st.question ? (
        <div className="tm-card">
          <span className="tm-q-label">Otázka {st.question.number}</span>
          <p className="tm-q">{st.question.text}</p>
          <div className="tm-strikes">
            {Array.from({ length: MAX_STRIKES }, (_, i) => (
              <span key={i} className={i < strikes ? "on" : ""}>
                {i < strikes && <XIcon />}
              </span>
            ))}
            <em>{strikes >= MAX_STRIKES ? "Vyřazeni z této otázky" : MAX_STRIKES - strikes === 1 ? "Zbývá poslední pokus" : `Zbývají ${MAX_STRIKES - strikes} pokusy`}</em>
          </div>
        </div>
      ) : null}
    </div>
  );
}
