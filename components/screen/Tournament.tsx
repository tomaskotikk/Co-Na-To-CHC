"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Trophy } from "lucide-react";
import { TeamIcon } from "@/components/TeamIcon";
import { play } from "@/lib/sound";
import { champion, nextMatch, roundName, type Bracket, type Fx, type Match, type PublicState, type Team } from "@/lib/types";

// ───────────────────────────── PAVOUK ─────────────────────────────

/** časování losování (s) */
const DRAW = { first: 0.35, step: 0.16, spin: 1.5 };

type Pos = { x: number; y: number };

function layout(b: Bracket) {
  const cols = b.rounds + 1;
  const colW = 100 / cols;
  const boxW = colW * 0.76;
  const pos = (round: number, index: number): Pos => {
    const count = b.size / 2 ** (round + 1);
    return { x: round * colW + (colW - boxW) / 2, y: ((index + 0.5) / count) * 100 };
  };
  return { cols, colW, boxW, pos, champ: { x: b.rounds * colW + (colW - boxW) / 2, y: 50 } };
}

export function BracketView({ st, fx }: { st: PublicState; fx: Fx | null }) {
  const b = st.bracket!;
  const teamById = useMemo(() => new Map(st.teams.map((t) => [t.id, t])), [st.teams]);
  const { cols, colW, boxW, pos, champ } = layout(b);
  const drawing = fx?.kind === "draw";
  const advanced = fx?.kind === "advance" ? fx : null;
  const next = nextMatch(b);
  const champId = champion(b);
  const champTeam = champId ? teamById.get(champId) : undefined;
  const champJust = !!advanced && b.matches.find((m) => m.id === advanced.matchId)?.round === b.rounds - 1;
  const firstRound = b.matches.filter((m) => m.round === 0);

  // čáry kreslíme v pixelech — pathLength (animace dokreslení) nejde dohromady s non-scaling-stroke
  const field = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1600, h: 800 });
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const X = (pct: number) => (pct * size.w) / 100;
  const Y = (pct: number) => (pct * size.h) / 100;

  // čára k vítězi se dokreslí až po vstupu na pavouka
  const [armed, setArmed] = useState(!advanced);
  useEffect(() => {
    if (!advanced) return;
    const t = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(t);
  }, [advanced]);

  // zvuky: losování = bubny + tikání + „cvak“ u každého týmu; postup = švih a trefa
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (s: number, f: () => void) => timers.push(setTimeout(f, s * 1000));
    if (drawing) {
      at(0, () => play("drumroll"));
      firstRound.forEach((_, i) => at(DRAW.first + i * DRAW.step + DRAW.spin, () => play("pop")));
      at(DRAW.first + firstRound.length * DRAW.step + DRAW.spin + 0.3, () => play("crash"));
    } else if (advanced) {
      at(0.7, () => play("softFlip"));
      at(1.5, () => play("correct"));
      if (champJust) {
        at(1.9, () => play("crash"));
        at(2.05, () => play("fanfare"));
      }
    }
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fx?.id]);

  const delayOf = (m: Match) =>
    drawing ? DRAW.first + (m.round === 0 ? m.index : firstRound.length + m.round * 2) * DRAW.step : 0;
  const landAt = (m: Match) => DRAW.first + m.index * DRAW.step + DRAW.spin;
  const allLanded = DRAW.first + firstRound.length * DRAW.step + DRAW.spin;

  return (
    <section className={`bracket ${drawing ? "drawing" : ""}`}>
      <div className="bracket-heads">
        {Array.from({ length: cols }, (_, r) => (
          <span key={r} style={{ width: `${colW}%` }} className={r === b.rounds ? "y" : ""}>
            {r === b.rounds ? "Vítěz" : roundName(r, b.rounds)}
          </span>
        ))}
      </div>

      <div className="bracket-field" ref={field}>
        <svg className="bracket-lines" viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden>
          {b.matches.map((m) => {
            const from = pos(m.round, m.index);
            const to = m.round === b.rounds - 1 ? champ : pos(m.round + 1, Math.floor(m.index / 2));
            const x1 = from.x + boxW;
            const mid = (x1 + to.x) / 2;
            const d = `M ${X(x1)} ${Y(from.y)} H ${X(mid)} V ${Y(to.y)} H ${X(to.x)}`;
            const just = advanced?.matchId === m.id;
            const on = !!m.winner && (!just || armed);
            const style = drawing && m.bye ? { transitionDelay: `${allLanded + 0.2}s` } : undefined;
            return (
              <g key={m.id}>
                <path d={d} className="bl-base" />
                <path d={d} className={`bl-on ${on ? "on" : ""}`} pathLength={1} style={style} />
              </g>
            );
          })}
        </svg>

        {b.matches.map((m) => {
          const p = pos(m.round, m.index);
          const live = st.matchId === m.id;
          const isNext = !live && next?.id === m.id && !st.matchId;
          return (
            <div
              key={m.id}
              className={`bm ${m.bye ? "bye" : ""} ${m.winner ? "done" : ""} ${live || isNext ? "live" : ""}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${boxW}%`, animationDelay: `${delayOf(m)}s` }}
            >
              {(live || isNext) && <span className="bm-tag">{live ? "Hraje se" : "Na řadě"}</span>}
              {(["a", "b"] as const).map((side) => {
                const id = m[side];
                const t = id ? teamById.get(id) : undefined;
                if (m.bye && !t) return <div key={side} className="bm-row empty bye-row">volný postup</div>;
                const score = side === "a" ? m.scoreA : m.scoreB;
                const won = !!m.winner && m.winner === id;
                // tým, který právě postoupil sem
                const arrive = !!advanced && armed && id === advanced.teamId && m.id !== advanced.matchId && m.round > 0;
                const spin = drawing && m.round === 0 && !!t;
                return (
                  <div
                    key={side}
                    className={`bm-row ${t ? "" : "empty"} ${won ? "win" : m.winner ? "lose" : ""} ${arrive ? "arrive" : ""}`}
                    style={drawing && m.round > 0 && t ? { animationDelay: `${allLanded + 0.5}s` } : undefined}
                  >
                    {t ? (
                      <SlotTeam team={t} pool={st.teams} spinUntil={spin ? landAt(m) : 0} />
                    ) : (
                      <span className="bm-name tbd">?</span>
                    )}
                    {t && !m.bye && (m.winner || live) && <span className="bm-score">{score}</span>}
                  </div>
                );
              })}
            </div>
          );
        })}

        <div
          className={`bm champ ${champTeam ? "crowned" : ""} ${champJust ? "just" : ""}`}
          style={{ left: `${champ.x}%`, top: `${champ.y}%`, width: `${boxW}%` }}
        >
          <Trophy className="champ-ic" />
          {champTeam ? (
            <div className="champ-team">
              <span className="em">
                <TeamIcon name={champTeam.icon} />
              </span>
              <span className="champ-name">{champTeam.name}</span>
            </div>
          ) : (
            <span className="champ-name tbd">Kdo vyhraje?</span>
          )}
        </div>
      </div>
    </section>
  );
}

/** při losování se jména protáčí jako na výherním automatu a pak „cvaknou“ na místo */
function SlotTeam({ team, pool, spinUntil }: { team: Team; pool: Team[]; spinUntil: number }) {
  const [shown, setShown] = useState<Team>(spinUntil ? pool[Math.floor(Math.random() * pool.length)] : team);
  const [landed, setLanded] = useState(!spinUntil);

  useEffect(() => {
    if (!spinUntil) return;
    const end = performance.now() + spinUntil * 1000;
    let t: ReturnType<typeof setTimeout>;
    let k = 0;
    const tick = () => {
      const left = end - performance.now();
      if (left <= 0) {
        setShown(team);
        setLanded(true);
        return;
      }
      setShown(pool[(k++ + Math.floor(Math.random() * pool.length)) % pool.length]);
      // zpomaluje ke konci
      t = setTimeout(tick, Math.min(220, 45 + (1 - left / (spinUntil * 1000)) * 180));
    };
    tick();
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinUntil, team.id]);

  return (
    <span className={`slot ${landed ? "landed" : "spinning"}`}>
      <span className="em">
        <TeamIcon name={shown.icon} />
      </span>
      <span className="bm-name">{shown.name}</span>
    </span>
  );
}

// ───────────────────────────── DUEL (VS) ─────────────────────────────

export function DuelView({ st, match, live }: { st: PublicState; match: Match; live: boolean }) {
  const b = st.bracket!;
  const a = st.teams.find((t) => t.id === match.a);
  const z = st.teams.find((t) => t.id === match.b);
  const inRound = b.matches.filter((m) => m.round === match.round && !m.bye);
  const k = inRound.findIndex((m) => m.id === match.id) + 1;

  useEffect(() => {
    if (!live) return;
    const timers = [
      setTimeout(() => play("intro"), 0),
      setTimeout(() => play("crash"), 950),
      setTimeout(() => play("pop"), 1700),
    ];
    return () => timers.forEach(clearTimeout);
  }, [live]);

  if (!a || !z) return null;
  return (
    <section className={`duel ${live ? "play" : "hold"}`}>
      <div className="duel-half a">
        <div className="duel-team">
          <span className="duel-em">
            <TeamIcon name={a.icon} />
          </span>
          <span className="duel-name" style={{ ["--len" as string]: Math.max(8, a.name.length) }}>
            {a.name}
          </span>
        </div>
      </div>
      <div className="duel-half b">
        <div className="duel-team">
          <span className="duel-em">
            <TeamIcon name={z.icon} />
          </span>
          <span className="duel-name" style={{ ["--len" as string]: Math.max(8, z.name.length) }}>
            {z.name}
          </span>
        </div>
      </div>
      <div className="duel-flash" aria-hidden />
      <div className="duel-vs">
        <span>VS</span>
      </div>
      <div className="duel-top">
        <span className="duel-round">{roundName(match.round, b.rounds)}</span>
        {inRound.length > 1 && (
          <span className="duel-count">
            Duel {k} z {inRound.length}
          </span>
        )}
      </div>
      <p className="duel-call">Zástupci týmů, ke stolu!</p>
    </section>
  );
}

// ───────────────────────────── PÓDIUM ─────────────────────────────

/** 1. = vítěz finále, 2. = poražený finalista, 3. = lepší poražený semifinalista (podle bodů) */
export function podiumOrder(st: PublicState): Team[] {
  const b = st.bracket;
  const byId = new Map(st.teams.map((t) => [t.id, t]));
  const champ = champion(b);
  if (!b || !champ) return [...st.teams].sort((x, y) => y.score - x.score);
  const final = b.matches.find((m) => m.round === b.rounds - 1)!;
  const second = final.a === champ ? final.b : final.a;
  const semiLosers = b.matches
    .filter((m) => m.round === b.rounds - 2 && m.winner && !m.bye)
    .map((m) => (m.winner === m.a ? m.b : m.a))
    .map((id) => (id ? byId.get(id) : undefined))
    .filter((t): t is Team => !!t)
    .sort((x, y) => y.score - x.score);
  return [byId.get(champ), second ? byId.get(second) : undefined, semiLosers[0]].filter((t): t is Team => !!t);
}
