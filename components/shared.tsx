"use client";

import { useEffect, useRef, useState } from "react";

/** číslo, které se plynule „napočítá“ na novou hodnotu */
export function CountUp({ value, delay = 0, duration = 1000 }: { value: number; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(value);
  const cur = useRef(value);

  useEffect(() => {
    const from = cur.current;
    if (from === value) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (t: number) => {
      const p = Math.max(0, Math.min(1, (t - t0) / duration));
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(from + (value - from) * e);
      cur.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, delay, duration]);

  return <>{shown}</>;
}

export function XIcon({ className, stroke = "#0b0b0b" }: { className?: string; stroke?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" aria-hidden>
      <path d="M20 20 L80 80 M80 20 L20 80" stroke={stroke} strokeWidth="16" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** velké X pro projektor — žluté s černou konturou */
export function BigX({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" aria-hidden>
      <path d="M18 18 L82 82 M82 18 L18 82" stroke="#0b0b0b" strokeWidth="26" strokeLinecap="round" fill="none" />
      <path d="M18 18 L82 82 M82 18 L18 82" stroke="#ffd500" strokeWidth="17" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export function ordinal(n: number) {
  return `${n}.`;
}
