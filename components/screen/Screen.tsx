"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bubble, Logo } from "@/components/Logo";
import { Qr } from "@/components/Qr";
import { BigX, CountUp, XIcon } from "@/components/shared";
import { TeamIcon } from "@/components/TeamIcon";
import { Smartphone, Volume2, VolumeX } from "lucide-react";
import { getSocket, resolveBaseUrl, useConnected, useOnConnect, useSocketEvent } from "@/lib/socket";
import { audioReady, isMuted, play, setMuted, startSuspense, unlockAudio } from "@/lib/sound";
import { MAX_STRIKES, type Fx, type PublicState, type Team } from "@/lib/types";

type Overlay =
  | { kind: "intro"; key: number; number: number; multiplier: number }
  | { kind: "strike"; key: number; team: Team; count: number }
  | { kind: "buzz"; key: number; team: Team };

const viewMotion = {
  initial: { opacity: 0, y: 24, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -24, filter: "blur(6px)" },
  transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
};

export function Screen() {
  const [st, setSt] = useState<PublicState | null>(null);
  const [adminPath, setAdminPath] = useState<string | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const stageRef = useRef<HTMLElement>(null);
  const [lastFx, setLastFx] = useState<Fx | null>(null);
  const seenFx = useRef<number | null>(null);
  const overlayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connected = useConnected();

  useOnConnect((s) => s.emit("hello:screen", { key: new URLSearchParams(location.search).get("klic") ?? undefined }));
  useSocketEvent<PublicState>("state", setSt);
  useSocketEvent<{ adminPath: string }>(
    "pairing",
    useCallback((p) => setAdminPath(p.adminPath), []),
  );

  const showOverlay = useCallback((o: Overlay, ms: number) => {
    if (overlayTimer.current) clearTimeout(overlayTimer.current);
    setOverlay(o);
    overlayTimer.current = setTimeout(() => setOverlay(null), ms);
  }, []);

  // efekty (zvuky, overlaye) — jen nové, ne po znovunačtení stránky
  useEffect(() => {
    if (!st) return;
    const fx = st.fx;
    if (seenFx.current === null) {
      seenFx.current = fx.id;
      return;
    }
    if (fx.id === seenFx.current) return;
    seenFx.current = fx.id;
    setLastFx(fx);
    const team = (id: string) => st.teams.find((t) => t.id === id);

    switch (fx.kind) {
      case "intro":
        play("intro");
        showOverlay({ kind: "intro", key: fx.id, number: fx.number, multiplier: st.question?.multiplier ?? 1 }, 2000);
        break;
      case "flip":
        setTimeout(() => play("correct"), 120);
        stageRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.012)" }, { transform: "scale(1)" }], {
          duration: 600,
          delay: 250,
          easing: "cubic-bezier(.16,1,.3,1)",
        });
        break;
      case "strike": {
        const t = team(fx.teamId);
        play("wrong");
        stageRef.current?.animate(
          [0, -1, 1.2, -1.4, 1.4, -1, 0.6, 0].map((x) => ({ transform: `translate3d(${x}vw,0,0)` })),
          { duration: 520, easing: "cubic-bezier(.36,.07,.19,.97)" },
        );
        if (t) showOverlay({ kind: "strike", key: fx.id, team: t, count: fx.count }, 1900);
        break;
      }
      case "revealAll":
        // zvuky jednotlivých karet řeší Board
        break;
      case "buzz": {
        const t = team(fx.teamId);
        play("buzz");
        if (t) showOverlay({ kind: "buzz", key: fx.id, team: t }, 2800);
        break;
      }
      case "join":
        play("pop");
        break;
      case "final":
        // časování zvuků řeší Final
        break;
      case "undo":
        play("tick");
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        setOverlay(null);
        break;
    }
  }, [st, showOverlay]);

  // napětí: admin odklepl akci a běží prodleva — projektor neví, jestli přijde trefa nebo X
  const suspense = !!st?.suspense && st.view === "board";
  useEffect(() => {
    if (!suspense) return;
    const stop = startSuspense();
    return stop;
  }, [suspense]);

  // zvuk smí začít až po interakci; F = fullscreen, M = ztlumit, Shift+A = nový admin QR
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setTimeout(() => setAudioOn(audioReady()), 50);
    };
    const onKey = (e: KeyboardEvent) => {
      unlock();
      const k = e.key.toLowerCase();
      if (k === "f") {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen().catch(() => {});
      } else if (k === "m") {
        setMuted(!isMuted());
        setMutedState(isMuted());
      } else if (k === "a" && e.shiftKey) {
        if (confirm("Odpojit současného admina a ukázat nový QR kód?")) getSocket().emit("screen:repair");
      }
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const base = st ? resolveBaseUrl(st) : "";

  return (
    <main className={`stage ${suspense ? "suspense" : ""}`} ref={stageRef}>
      <Backdrop />

      {st && (
        <>
          {st.view !== "lobby" && st.view !== "intro" && (
            <div className="topbar">
              <Logo />
              <div className="topbar-right">
                {st.view === "board" && st.question && (
                  <span className="pill">
                    Otázka {st.question.number} / {st.questionCount}
                  </span>
                )}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            {st.view === "lobby" && (
              <motion.div key="lobby" className="view" {...viewMotion}>
                <Lobby st={st} base={base} />
              </motion.div>
            )}
            {st.view === "intro" && (
              <motion.div key="intro" className="view" {...viewMotion}>
                <ShowIntro teams={st.teams} live={lastFx?.kind === "showIntro"} />
              </motion.div>
            )}
            {st.view === "board" && st.question && st.round && (
              <motion.div key={`board-${st.round.questionId}`} className="view" {...viewMotion}>
                <Board st={st} fx={lastFx} />
              </motion.div>
            )}
            {st.view === "scoreboard" && (
              <motion.div key="scores" className="view" {...viewMotion}>
                <Scoreboard teams={st.teams} />
              </motion.div>
            )}
            {st.view === "final" && (
              <motion.div key="final" className="view" {...viewMotion}>
                <Final teams={st.teams} live={lastFx?.kind === "final"} />
              </motion.div>
            )}
          </AnimatePresence>

          {overlay?.kind === "intro" && (
            <div className="overlay intro" key={overlay.key}>
              <div className="intro-inner">
                <span className="intro-kicker">Otázka</span>
                <span className="intro-num">{overlay.number}</span>
                {overlay.multiplier > 1 && <span className="intro-mult">Body ×{overlay.multiplier}</span>}
              </div>
            </div>
          )}

          {overlay?.kind === "strike" && (
            <div className="overlay strike-ov" key={overlay.key}>
              <div>
                <div className="x-row">
                  {Array.from({ length: overlay.count }, (_, i) => (
                    <BigX key={i} className="big-x" style={{ animationDelay: `${i * 90}ms` }} />
                  ))}
                </div>
                {overlay.count >= MAX_STRIKES && <div className="stamp">Vyřazeni</div>}
                <div className="strike-label">
                  {overlay.team.name}
                  <small>{overlay.count >= MAX_STRIKES ? "Konec pokusů — vyřazeni!" : `${overlay.count}. pokus vedle`}</small>
                </div>
              </div>
            </div>
          )}

          {overlay?.kind === "buzz" && (
            <div className="overlay buzz-ov" key={overlay.key}>
              <div className="rays" />
              <div className="buzz-inner">
                <span className="buzz-em">
                  <TeamIcon name={overlay.team.icon} />
                </span>
                <span className="buzz-name">{overlay.team.name}</span>
                <span className="buzz-sub">byli první!</span>
              </div>
            </div>
          )}

          {suspense && (
            <div className="suspense-ov" aria-hidden>
              <Bubble className="suspense-bubble" tail="46%">
                <span className="suspense-q">?</span>
              </Bubble>
            </div>
          )}

          {!st.adminClaimed && <Pairing adminUrl={adminPath ? base + adminPath : null} />}
        </>
      )}

      {!connected && <div className="pill conn-lost">Připojuji k serveru…</div>}
      {!audioOn && (
        <div className="pill y hint">
          <Volume2 className="pill-ic" /> Klikni kamkoli pro zapnutí zvuku · F = celá obrazovka
        </div>
      )}
      {audioOn && muted && (
        <div className="pill hint">
          <VolumeX className="pill-ic" /> Ztlumeno (M)
        </div>
      )}
      <div className="grain" />
    </main>
  );
}

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden>
      <div className="backdrop-glow" />
      <div className="beam l" />
      <div className="beam c" />
      <div className="beam r" />
      <div className="floor" />
    </div>
  );
}

function Pairing({ adminUrl }: { adminUrl: string | null }) {
  return (
    <div className="pairing">
      <div className="pairing-inner">
        <Logo />
        <div className="pairing-card">
          {adminUrl ? (
            <>
              <h2>Moderátore, naskenuj</h2>
              <div className="qr-frame">
                <Qr value={adminUrl} className="qr" />
              </div>
              <p>Otevři odkaz v telefonu a klepni na „Jsem admin“. QR kód pak zmizí a začne show.</p>
            </>
          ) : (
            <>
              <h2>
                Čekáme na moderátora
                <span className="waiting-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </h2>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── LOBBY ─────────────────────────────

function Lobby({ st, base }: { st: PublicState; base: string }) {
  const joinUrl = `${base}/join?c=${st.joinCode}`;
  return (
    <section className="lobby">
      <div className="lobby-hero">
        <Logo />
        <p className="lobby-sub">
          Stužkovací show · <b>Creative Hill College</b>
        </p>
      </div>

      <div className="join-card">
        <h2>Připoj svůj tým</h2>
        <Qr value={joinUrl} className="qr" />
        <div className="join-meta">
          <span className="join-label">Kód hry</span>
          <span className="join-code">{st.joinCode}</span>
          <span className="join-url">{joinUrl.replace(/^https?:\/\//, "").replace(/\?.*$/, "")}</span>
        </div>
      </div>

      <div className="lobby-teams">
        <div className="lobby-teams-head">
          Týmy <b>{st.teams.length}</b>
        </div>
        <div className="lobby-chips">
          <AnimatePresence>
            {st.teams.length === 0 && (
              <motion.span className="lobby-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Zatím nikdo… naskenujte QR kód <Smartphone className="inline-ic" />
              </motion.span>
            )}
            {st.teams.map((t) => (
              <motion.span
                key={t.id}
                layout
                className={`lobby-chip ${t.online ? "" : "off"}`}
                initial={{ opacity: 0, scale: 0.3, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
              >
                <span className="em">
                  <TeamIcon name={t.icon} />
                </span>
                {t.name}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <span className="ghost-word" aria-hidden>
        CHC
      </span>
    </section>
  );
}

// ───────────────────────────── DESKA ─────────────────────────────

const REVEAL_STEP_MS = 650;

function Board({ st, fx }: { st: PublicState; fx: Fx | null }) {
  const q = st.question!;
  const round = st.round!;
  const rows = Math.ceil(q.slots / 2);
  const teamById = useMemo(() => new Map(st.teams.map((t) => [t.id, t])), [st.teams]);
  const flipFx = fx?.kind === "flip" ? fx : null;
  // po ohlášení otázky naskočí bublina a karty až za žlutým stěračem
  const entering = fx?.kind === "intro" && fx.number === q.number;

  // „Odkrýt zbytek“: karty se otáčí postupně od nejméně častých až k #1
  // st.fx (ne lastFx) — musí to být ve stejném vykreslení, kdy přijdou odkryté karty
  const prevRevealed = useRef(round.revealed);
  const liveFx = st.fx;
  const lateOrder = useMemo(() => {
    const order = new Map<number, number>();
    if (liveFx.kind !== "revealAll") return order;
    const fresh = round.revealed
      .map((r, i) => (r && !prevRevealed.current[i] ? i : -1))
      .filter((i) => i >= 0)
      .reverse();
    fresh.forEach((idx, k) => order.set(idx, k));
    return order;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveFx.id]);
  useEffect(() => {
    prevRevealed.current = round.revealed;
  });
  useEffect(() => {
    if (lateOrder.size === 0) return;
    const timers = [...lateOrder.values()].map((k) => setTimeout(() => play("softFlip"), 250 + k * REVEAL_STEP_MS));
    return () => timers.forEach(clearTimeout);
  }, [lateOrder]);

  return (
    <section className={`board ${entering ? "enter" : ""}`}>
      <div className="q-wrap">
        <div className="q-meta">{q.multiplier > 1 && <span className="pill y">Body ×{q.multiplier}</span>}</div>
        <Bubble className="q-bubble" tail="14%">
          <h1 className="q-text">{q.text}</h1>
        </Bubble>
      </div>

      <div className="cards" style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {Array.from({ length: q.slots }, (_, i) => {
          const a = q.answers[i];
          const info = round.revealed[i];
          const by = info?.by ? teamById.get(info.by) : undefined;
          const justFlipped = flipFx?.index === i;
          const late = lateOrder.get(i);
          return (
            <div
              key={i}
              className={`card ${a ? "open" : ""} ${justFlipped ? "flash" : ""}`}
              style={{ ["--i" as string]: i }}
            >
              <div className="card-inner" style={late !== undefined ? { transitionDelay: `${late * REVEAL_STEP_MS}ms` } : undefined}>
                <div className="card-face card-front">
                  <Bubble className="card-num" tail="34%">
                    {i + 1}
                  </Bubble>
                </div>
                <div className={`card-face card-back ${info && !info.by ? "dim" : ""}`}>
                  {a && (
                    <>
                      <span className="card-rank">{i + 1}</span>
                      <span className="card-text">{a.text}</span>
                      {by && (
                        <span className="card-by">
                          <TeamIcon name={by.icon} />
                        </span>
                      )}
                      <span className="card-pts">{a.points}</span>
                    </>
                  )}
                </div>
              </div>
              {justFlipped && flipFx.points > 0 && (
                <span className="plus" key={flipFx.id}>
                  +{flipFx.points}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <TeamBar st={st} fx={fx} />
    </section>
  );
}

function TeamBar({ st, fx }: { st: PublicState; fx: Fx | null }) {
  const strikes = st.round?.strikes ?? {};
  const hitTeam = fx?.kind === "flip" ? fx.teamId : null;
  return (
    <div className="teambar">
      {st.teams.map((t) => {
        const n = strikes[t.id] ?? 0;
        return (
          <motion.div layout key={t.id} className={`chip ${n >= MAX_STRIKES ? "out" : ""} ${t.online ? "" : "offline"}`}>
            <span className="em">
                  <TeamIcon name={t.icon} />
                </span>
            <span className="chip-name">{t.name}</span>
            <div className="chip-row">
              <span className="chip-score">
                <CountUp value={t.score} delay={600} />
              </span>
              <span className="strikes">
                {Array.from({ length: MAX_STRIKES }, (_, i) => (
                  <span key={i} className={`strike ${i < n ? "on" : ""}`}>
                    {i < n && <XIcon />}
                  </span>
                ))}
              </span>
            </div>
            {hitTeam === t.id && fx && <span className="chip-flash" key={fx.id} />}
          </motion.div>
        );
      })}
    </div>
  );
}

// ───────────────────────────── ŽEBŘÍČEK ─────────────────────────────

function Scoreboard({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const max = Math.max(1, ...sorted.map((t) => t.score));
  const [grown, setGrown] = useState(false);
  const pct = (score: number) => (grown ? Math.max(3, (score / max) * 100) : 0);
  useEffect(() => {
    const t = setTimeout(() => setGrown(true), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <section className="scores">
      <h1 className="view-title">
        Průběžné <em>pořadí</em>
      </h1>
      <div className="score-rows">
        {sorted.map((t, i) => (
          <motion.div
            layout
            key={t.id}
            className="score-row"
            initial={{ opacity: 0, x: -60 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: (sorted.length - 1 - i) * 0.18, type: "spring", stiffness: 260, damping: 26 }}
          >
            <span className="score-rank">{i + 1}.</span>
            <span className="em">
                  <TeamIcon name={t.icon} />
                </span>
            <div className="score-track">
              <div className="score-fill" style={{ width: `${pct(t.score)}%` }} />
              {[false, true].map((onFill) => (
                <div
                  key={String(onFill)}
                  className={`score-label ${onFill ? "on-fill" : ""}`}
                  style={onFill ? { clipPath: `inset(0 ${100 - pct(t.score)}% 0 0)` } : undefined}
                  aria-hidden={onFill}
                >
                  <span>{t.name}</span>
                  <b>
                    <CountUp value={grown ? t.score : 0} duration={1400} />
                  </b>
                </div>
              ))}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ───────────────────────────── FINÁLE ─────────────────────────────

function Final({ teams, live }: { teams: Team[]; live: boolean }) {
  const sorted = [...teams].sort((a, b) => b.score - a.score);
  const [first, second, third] = sorted;

  // 3. místo → 2. místo → buben → vítěz
  useEffect(() => {
    if (!live) return;
    const timers = [
      setTimeout(() => play("tick"), 0),
      setTimeout(() => play("pop"), FINAL_T.third * 1000),
      setTimeout(() => play("pop"), FINAL_T.second * 1000),
      setTimeout(() => play("drumroll"), FINAL_T.roll * 1000),
      setTimeout(() => play("crash"), FINAL_T.first * 1000),
      setTimeout(() => play("fanfare"), FINAL_T.first * 1000 + 150),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);
  const pieces = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 4,
        dur: 3 + Math.random() * 3,
        dx: `${(Math.random() - 0.5) * 30}vw`,
        rot: `${Math.random() * 1440 - 720}deg`,
        color: ["#ffd500", "#f7f6f1", "#ffe766", "#0b0b0b"][i % 4],
        round: i % 3 === 0,
      })),
    [],
  );

  if (!first) {
    return (
      <section className="final">
        <h1 className="view-title">Žádné týmy</h1>
      </section>
    );
  }

  return (
    <section className={`final ${live ? "live" : ""}`} style={finalVars}>
      {live && (
        <p className="final-pre" aria-hidden>
          A vítězem stužkovací show se stává…
        </p>
      )}
      <div className="flash-full" aria-hidden />
      <div className="confetti" aria-hidden>
        {pieces.map((p, i) => (
          <i
            key={i}
            style={{
              left: `${p.left}%`,
              background: p.color,
              borderRadius: p.round ? "50%" : "2px",
              outline: p.color === "#0b0b0b" ? "1px solid #ffd500" : undefined,
              animationDuration: `${p.dur}s`,
              ["--d" as string]: `${p.delay}s`,
              ["--dx" as string]: p.dx,
              ["--rot" as string]: p.rot,
            }}
          />
        ))}
      </div>
      <span className="final-kicker">Vítěz večera</span>
      <div className="podium">
        <Pod t={second} place={2} h={12} />
        <Pod t={first} place={1} h={18} />
        <Pod t={third} place={3} h={8} />
      </div>
    </section>
  );
}

const FINAL_T = { third: 3.2, second: 4.6, roll: 5.6, first: 8.0 };
const finalVars = {
  ["--t3" as string]: `${FINAL_T.third}s`,
  ["--t2" as string]: `${FINAL_T.second}s`,
  ["--t1" as string]: `${FINAL_T.first}s`,
} as React.CSSProperties;

function Pod({ t, place, h }: { t?: Team; place: number; h: number }) {
  if (!t) return <div className="pod" />;
  return (
    <div className={`pod p${place} ${place === 1 ? "first" : ""}`}>
      <span className="pod-em">
        <TeamIcon name={t.icon} />
      </span>
      <span className="pod-name">{t.name}</span>
      <div className="pod-block" style={{ height: `calc(var(--u) * ${h})` }}>
        <span>
          {place}.<small>{t.score} bodů</small>
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────── INTRO SHOW ─────────────────────────────

function ShowIntro({ teams, live }: { teams: Team[]; live: boolean }) {
  useEffect(() => {
    if (!live) return;
    const timers = [
      setTimeout(() => play("drumroll"), 0),
      setTimeout(() => play("crash"), 2600),
      setTimeout(() => play("fanfare"), 2750),
      ...teams.map((_, i) => setTimeout(() => play("pop"), 4300 + i * 160)),
    ];
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  return (
    <section className={`showintro ${live ? "play" : "hold"}`} style={{ ["--n" as string]: teams.length }}>
      <div className="si-flash" />
      <p className="si-pre si-pre1">Dámy a pánové…</p>
      <p className="si-pre si-pre2">vítejte u show</p>
      <div className="si-logo">
        <Logo />
      </div>
      <p className="si-sub">
        Stužkovací show · <b>Creative Hill College</b>
      </p>
      <div className="si-teams">
        <span className="si-label">Dnes hrají</span>
        <div className="si-chips">
          {teams.map((t, i) => (
            <span key={t.id} className="lobby-chip si-chip" style={{ ["--i" as string]: i }}>
              <span className="em">
                  <TeamIcon name={t.icon} />
                </span>
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <p className="si-ready">Připravte se na první otázku</p>
    </section>
  );
}
