"use client";

// Všechny zvuky jsou syntetizované přes Web Audio — žádné soubory, nulové načítání.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx.state !== "closed";
}

export const audioReady = () => !!ctx && ctx.state === "running";
export const setMuted = (m: boolean) => {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.02);
};
export const isMuted = () => muted;

type ToneOpts = {
  type?: OscillatorType;
  freq: number;
  to?: number;
  start?: number;
  dur: number;
  vol?: number;
  attack?: number;
  filter?: number;
  out?: AudioNode;
};

function tone({ type = "sine", freq, to, start = 0, dur, vol = 0.3, attack = 0.005, filter, out }: ToneOpts) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node: AudioNode = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filter;
    node = osc.connect(f);
  }
  node.connect(g).connect(out ?? master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise(start: number, dur: number, vol: number, freq = 2000, out?: AudioNode) {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(freq * 4, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out ?? master);
  src.start(t0);
}

/** zvonek správné odpovědi (ding-ding jako v televizi) */
function correct() {
  noise(0, 0.18, 0.08, 1500);
  [0, 0.13].forEach((s, i) => {
    const base = i ? 1318.5 : 987.8;
    tone({ freq: base, start: s + 0.06, dur: 0.9, vol: 0.35 });
    tone({ freq: base * 2, start: s + 0.06, dur: 0.5, vol: 0.08 });
    tone({ type: "triangle", freq: base / 2, start: s + 0.06, dur: 0.6, vol: 0.12 });
  });
}

/** chybový bzučák */
function wrong() {
  tone({ type: "sawtooth", freq: 92, dur: 0.85, vol: 0.32, filter: 1400, attack: 0.01 });
  tone({ type: "square", freq: 97.5, dur: 0.85, vol: 0.18, filter: 900, attack: 0.01 });
  tone({ type: "sawtooth", freq: 184, dur: 0.85, vol: 0.1, filter: 1800, attack: 0.01 });
}

function intro() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((f, i) => {
    tone({ type: "triangle", freq: f, start: i * 0.09, dur: 0.35, vol: 0.22 });
    tone({ type: "square", freq: f / 2, start: i * 0.09, dur: 0.15, vol: 0.04, filter: 1800 });
  });
  tone({ freq: 1567.98, start: 0.38, dur: 1.1, vol: 0.18 });
  noise(0.3, 0.6, 0.05, 3000);
}

function revealAll() {
  noise(0, 0.5, 0.07, 800);
  [783.99, 659.25, 523.25].forEach((f, i) => tone({ type: "triangle", freq: f, start: 0.1 + i * 0.1, dur: 0.4, vol: 0.14 }));
}

function pop() {
  tone({ freq: 600, to: 1200, dur: 0.12, vol: 0.2 });
  tone({ type: "triangle", freq: 1400, start: 0.06, dur: 0.15, vol: 0.1 });
}

function buzz() {
  tone({ type: "square", freq: 880, dur: 0.12, vol: 0.15, filter: 3000 });
  tone({ type: "square", freq: 1174.66, start: 0.12, dur: 0.35, vol: 0.15, filter: 3000 });
}

function fanfare() {
  const seq: [number, number, number][] = [
    [523.25, 0, 0.18],
    [523.25, 0.2, 0.12],
    [523.25, 0.34, 0.12],
    [698.46, 0.48, 0.6],
    [880, 1.1, 0.25],
    [1046.5, 1.36, 1.4],
  ];
  seq.forEach(([f, s, d]) => {
    tone({ type: "sawtooth", freq: f, start: s, dur: d, vol: 0.12, filter: 2600 });
    tone({ type: "triangle", freq: f * 2, start: s, dur: d, vol: 0.08 });
  });
  noise(1.3, 1.5, 0.06, 4000);
}

function tick() {
  tone({ type: "square", freq: 1800, dur: 0.03, vol: 0.05, filter: 4000 });
}

/** vířivý buben s crescendem (~2.4 s) */
function drumroll() {
  const len = 2.4;
  for (let t = 0; t < len; t += 0.042) {
    const p = t / len;
    noise(t, 0.06, 0.03 + p * p * 0.22, 1600 + p * 900);
    if (Math.round(t / 0.042) % 4 === 0) tone({ freq: 140, to: 90, start: t, dur: 0.12, vol: 0.05 + p * 0.12 });
  }
}

/** činel + basový úder */
function crash() {
  noise(0, 1.8, 0.32, 4500);
  noise(0, 0.5, 0.2, 900);
  tone({ freq: 70, to: 38, dur: 0.9, vol: 0.55 });
  tone({ type: "triangle", freq: 140, to: 70, dur: 0.5, vol: 0.25 });
}

/** tiché otočení karty při „Odkrýt zbytek“ */
function softFlip() {
  noise(0, 0.14, 0.05, 1200);
  tone({ type: "triangle", freq: 659.25, start: 0.05, dur: 0.35, vol: 0.14 });
  tone({ freq: 1318.5, start: 0.05, dur: 0.25, vol: 0.05 });
}

/**
 * Napětí během prodlevy: zrychlující tlukot srdce + stoupající hučení.
 * Vrací funkci, která vše rychle ztlumí (přijde trefa nebo X).
 */
export function startSuspense(maxSec = 6) {
  if (!ctx || !master || muted) return () => {};
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  let t = 0.05;
  let gap = 0.62;
  while (t < maxSec) {
    const p = t / maxSec;
    // „lub-dub“
    tone({ freq: 62, to: 40, start: t, dur: 0.16, vol: 0.5 + p * 0.3, out: bus });
    tone({ freq: 58, to: 38, start: t + 0.17, dur: 0.14, vol: 0.32 + p * 0.25, out: bus });
    t += gap;
    gap = Math.max(0.3, gap * 0.9);
  }
  // stoupající drone
  tone({ type: "sawtooth", freq: 55, to: 220, dur: maxSec, vol: 0.07, attack: 0.6, filter: 700, out: bus });
  tone({ type: "sine", freq: 110, to: 440, dur: maxSec, vol: 0.05, attack: 0.6, out: bus });
  return () => {
    if (!ctx) return;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
    setTimeout(() => bus.disconnect(), 400);
  };
}

export const sfx = { correct, wrong, intro, revealAll, pop, buzz, fanfare, tick, drumroll, crash, softFlip };

export function play(name: keyof typeof sfx) {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") void ctx.resume();
  sfx[name]();
}
