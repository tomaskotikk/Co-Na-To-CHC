"use client";

// Animace krádeže: zloděj se připlíží k bodům okradeného týmu, strčí je do pytle,
// přeběhne doprostřed a hodí je zlodějskému týmu. Okradený tým zuří.
// Časování je v CSS (screen.css, .heist) — klíčové snímky jsou v % z HEIST_MS.

import { useEffect, useRef, useState } from "react";
import { Angry } from "lucide-react";
import { play } from "@/lib/sound";
import { TeamIcon } from "@/components/TeamIcon";
import type { Team } from "@/lib/types";

export const HEIST_MS = 7600;
/** kdy zloděj body sebere a kdy dopadnou k druhému týmu (shodně s CSS a s telefony) */
const GRAB_MS = 3000;
const LAND_MS = 4600;

export type HeistInfo = { from: Team; to: Team; points: number; fromScore: number; toScore: number };

/** číslo, které se v daný čas přepočítá z „from“ na „to“ */
function Rolling({ from, to, delay, duration = 900 }: { from: number; to: number; delay: number; duration?: number }) {
  const [v, setV] = useState(from);
  const raf = useRef(0);
  useEffect(() => {
    const t0 = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / duration));
      const e = 1 - Math.pow(1 - p, 3);
      setV(Math.round(from + (to - from) * e));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [from, to, delay, duration]);
  return <>{v}</>;
}

/** zloděj: čepice, škraboška, pruhované tričko, pytel přes rameno */
function Thief() {
  return (
    <svg className="thief" viewBox="0 0 140 190" aria-hidden>
      {/* pytel za zády */}
      <g className="thief-sack">
        <path d="M14 64 C2 92 6 128 34 134 C62 140 72 108 62 80 C56 64 40 58 30 60 Z" fill="#f7f6f1" stroke="#0b0b0b" strokeWidth="5" />
        <path d="M30 60 C34 52 44 50 50 56" fill="none" stroke="#0b0b0b" strokeWidth="5" strokeLinecap="round" />
        <text x="36" y="112" textAnchor="middle" fontSize="34" fontWeight="900" fill="#ffd500" stroke="#0b0b0b" strokeWidth="2">
          $
        </text>
      </g>
      {/* nohy */}
      <g className="thief-leg l">
        <line x1="70" y1="132" x2="62" y2="174" stroke="#0b0b0b" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="58" cy="177" rx="11" ry="6" fill="#0b0b0b" />
      </g>
      <g className="thief-leg r">
        <line x1="86" y1="132" x2="94" y2="174" stroke="#0b0b0b" strokeWidth="9" strokeLinecap="round" />
        <ellipse cx="98" cy="177" rx="11" ry="6" fill="#0b0b0b" />
      </g>
      {/* tělo — pruhované tričko */}
      <g className="thief-body">
        <rect x="56" y="74" width="44" height="62" rx="14" fill="#f7f6f1" stroke="#0b0b0b" strokeWidth="5" />
        {[86, 100, 114].map((y) => (
          <rect key={y} x="58" y={y} width="40" height="7" fill="#0b0b0b" />
        ))}
        {/* ruka drží pytel */}
        <path d="M60 84 C46 80 40 70 44 60" fill="none" stroke="#0b0b0b" strokeWidth="8" strokeLinecap="round" />
        {/* druhá ruka (při hodu jde nahoru) */}
        <g className="thief-arm">
          <path d="M96 84 C110 92 116 104 112 116" fill="none" stroke="#0b0b0b" strokeWidth="8" strokeLinecap="round" />
        </g>
        {/* hlava */}
        <circle cx="78" cy="48" r="27" fill="#f5c89a" stroke="#0b0b0b" strokeWidth="5" />
        {/* čepice */}
        <path d="M51 44 C52 18 104 18 105 44 Z" fill="#0b0b0b" />
        <circle cx="78" cy="18" r="6" fill="#0b0b0b" />
        {/* škraboška */}
        <rect x="52" y="40" width="52" height="15" rx="7" fill="#0b0b0b" />
        <circle className="thief-eye" cx="69" cy="47" r="4.2" fill="#f7f6f1" />
        <circle className="thief-eye" cx="88" cy="47" r="4.2" fill="#f7f6f1" />
        {/* úšklebek */}
        <path d="M68 62 C74 70 86 70 92 61" fill="none" stroke="#0b0b0b" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function Heist({ info }: { info: HeistInfo }) {
  const { from, to, points, fromScore, toScore } = info;

  useEffect(() => {
    const cue: [Parameters<typeof play>[0], number][] = [
      ["alarm", 0],
      ["sneak", 950],
      ["pop", GRAB_MS - 250],
      ["sadTrombone", GRAB_MS],
      ["whoosh", 3850],
      ["crash", LAND_MS],
      ["laugh", LAND_MS + 250],
      ["fanfare", 5500],
    ];
    const timers = cue.map(([s, at]) => setTimeout(() => play(s), at));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="overlay heist" style={{ ["--T" as string]: `${HEIST_MS}ms` }}>
      <div className="heist-alarm" />
      <div className="heist-beacon" />

      <div className="heist-title">
        <span className="heist-siren">🚨</span> Krádež! <span className="heist-siren">🚨</span>
      </div>

      {/* okradený tým */}
      <div className="heist-box victim">
        <span className="heist-angry">
          <Angry />
        </span>
        <span className="heist-say victim-say">NEEEE!</span>
        <span className="heist-em">
          <TeamIcon name={from.icon} />
        </span>
        <span className="heist-name">{from.name}</span>
        <span className="heist-score">
          <Rolling from={fromScore + points} to={fromScore} delay={GRAB_MS - 100} />
        </span>
        <span className="heist-steam s1">💢</span>
        <span className="heist-steam s2">💨</span>
      </div>

      {/* zlodějský tým */}
      <div className="heist-box robber">
        <span className="heist-em">
          <TeamIcon name={to.icon} />
        </span>
        <span className="heist-name">{to.name}</span>
        <span className="heist-score">
          <Rolling from={toScore - points} to={toScore} delay={LAND_MS} />
        </span>
        <span className="heist-burst" />
      </div>

      {/* body: leží u okradených, pak letí vzduchem */}
      <span className="heist-loot grab">{points}</span>
      <span className="heist-loot fly">{points}</span>

      <div className="heist-runner">
        <span className="heist-say thief-say">HEHEHE 😎</span>
        <Thief />
      </div>

      <div className="heist-final">
        <span className="heist-stamp">Ukradeno!</span>
        <span className="heist-sub">
          <b>{to.name}</b> berou <b>{points}</b> bodů týmu <b>{from.name}</b>
        </span>
      </div>
    </div>
  );
}
