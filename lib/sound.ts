"use client";

/*
 * Zvuky show. Výchozí jsou syntetizované přes Web Audio (realistické recepty + studiový dozvuk),
 * takže nic nenačítáme. Když ale do public/sounds/ dáš soubor se stejným jménem
 * (např. correct.mp3, wrong.mp3, fanfare.mp3…), použije se místo syntézy.
 */

export type SoundName =
  | "correct"
  | "wrong"
  | "intro"
  | "softFlip"
  | "pop"
  | "buzz"
  | "fanfare"
  | "tick"
  | "drumroll"
  | "crash"
  | "applause"
  | "suspense";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let reverbIn: GainNode | null = null;
let muted = false;
const MASTER_VOL = 0.85;
const samples = new Map<string, AudioBuffer>();
const noiseCache = new Map<number, AudioBuffer>();

function buildGraph(c: BaseAudioContext) {
  const m = c.createGain();
  m.gain.value = MASTER_VOL;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  m.connect(comp).connect(c.destination);
  // studiový dozvuk — impulsní odezva z doznívajícího šumu
  const conv = c.createConvolver();
  conv.buffer = impulse(c, 2.2, 3.2);
  const rIn = c.createGain();
  const wet = c.createGain();
  wet.gain.value = 0.32;
  rIn.connect(conv).connect(wet).connect(m);
  return { m, rIn };
}

export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    const g = buildGraph(ctx);
    master = g.m;
    reverbIn = g.rIn;
    void loadSamples();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx.state !== "closed";
}

export const audioReady = () => !!ctx && ctx.state === "running";
export const setMuted = (m: boolean) => {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : MASTER_VOL, ctx.currentTime, 0.02);
};
export const isMuted = () => muted;

async function loadSamples() {
  try {
    const res = await fetch("/api/sounds");
    if (!res.ok) return;
    const files: string[] = await res.json();
    await Promise.all(
      files.map(async (file) => {
        const buf = await fetch(`/sounds/${encodeURIComponent(file)}`).then((r) => r.arrayBuffer());
        const audio = await ctx!.decodeAudioData(buf);
        samples.set(file.replace(/\.[^.]+$/, ""), audio);
      }),
    );
  } catch {
    // vlastní zvuky jsou volitelné
  }
}

// ───────────────────────────── stavební kameny ─────────────────────────────

function impulse(c: BaseAudioContext, seconds: number, decay: number) {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function noiseBuffer(seconds: number) {
  const key = Math.ceil(seconds * 10);
  let buf = noiseCache.get(key);
  if (!buf) {
    const len = Math.ceil(ctx!.sampleRate * (key / 10));
    buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    noiseCache.set(key, buf);
  }
  return buf;
}

/** výstup s nastavitelným poměrem „na sucho“ a do dozvuku */
function bus(dry = 1, wet = 0.3, pan = 0) {
  const input = ctx!.createGain();
  let node: AudioNode = input;
  if (pan) {
    const p = ctx!.createStereoPanner();
    p.pan.value = pan;
    input.connect(p);
    node = p;
  }
  const d = ctx!.createGain();
  d.gain.value = dry;
  node.connect(d).connect(master!);
  if (wet > 0) {
    const w = ctx!.createGain();
    w.gain.value = wet;
    node.connect(w).connect(reverbIn!);
  }
  return input;
}

function env(g: GainNode, t0: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

function osc(type: OscillatorType, freq: number, t0: number, dur: number, out: AudioNode, peak: number, attack = 0.004, to?: number) {
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env(g, t0, peak, attack, dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + attack + dur + 0.05);
  return o;
}

function noise(t0: number, dur: number, out: AudioNode, peak: number, filter: BiquadFilterType, freq: number, q = 1, attack = 0.002) {
  const src = ctx!.createBufferSource();
  src.buffer = noiseBuffer(dur + attack + 0.05);
  const f = ctx!.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx!.createGain();
  env(g, t0, peak, attack, dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0);
  src.stop(t0 + attack + dur + 0.05);
  return f;
}

// ───────────────────────────── zvuky ─────────────────────────────

/** zvon s neharmonickými alikvotami (jako skutečný kovový zvonek) */
function bell(t0: number, f: number, vol: number, out: AudioNode) {
  const partials: [number, number, number][] = [
    [0.5, 0.35, 1.6],
    [1, 1, 2.2],
    [2.0, 0.45, 1.4],
    [2.76, 0.4, 1.0],
    [5.4, 0.18, 0.5],
    [8.93, 0.08, 0.25],
  ];
  for (const [ratio, amp, dec] of partials) osc("sine", f * ratio, t0, dec, out, vol * amp, 0.002);
  noise(t0, 0.02, out, vol * 0.25, "highpass", 6000); // úder paličky
}

/** potlesk publika — stovky náhodných tlesknutí, předpočítané do bufferu */
function applause(seconds: number, vol: number, t0 = 0) {
  const c = ctx!;
  const sr = c.sampleRate;
  const len = Math.floor(sr * seconds);
  const buf = c.createBuffer(2, len, sr);
  const density = 160; // tlesknutí za sekundu
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    const claps = Math.floor(density * seconds);
    for (let k = 0; k < claps; k++) {
      const at = Math.floor(Math.random() * len);
      const p = at / len;
      // náběh 0.3 s, pak drží, na konci doznívá
      const shape = Math.min(1, p * seconds / 0.3) * Math.min(1, (1 - p) * seconds / (seconds * 0.45));
      const amp = (0.25 + Math.random() * 0.75) * shape;
      const clapLen = Math.floor(sr * (0.006 + Math.random() * 0.01));
      for (let i = 0; i < clapLen && at + i < len; i++) {
        d[at + i] += (Math.random() * 2 - 1) * amp * Math.exp(-i / (clapLen / 4));
      }
    }
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1700;
  bp.Q.value = 0.55;
  const g = c.createGain();
  g.gain.value = vol;
  src.connect(bp).connect(g).connect(bus(1, 0.45));
  src.start(c.currentTime + t0);
}

/** hvízdnutí z publika */
function whistle(t0: number, vol: number) {
  const out = bus(0.7, 0.5, Math.random() * 1.2 - 0.6);
  const o = ctx!.createOscillator();
  const g = ctx!.createGain();
  const f0 = 1900 + Math.random() * 500;
  o.frequency.setValueAtTime(f0, t0);
  o.frequency.linearRampToValueAtTime(f0 * 1.35, t0 + 0.18);
  o.frequency.linearRampToValueAtTime(f0 * 1.15, t0 + 0.6);
  const lfo = ctx!.createOscillator();
  const lg = ctx!.createGain();
  lfo.frequency.value = 7;
  lg.gain.value = 25;
  lfo.connect(lg).connect(o.frequency);
  env(g, t0, vol, 0.05, 0.6);
  o.connect(g).connect(out);
  o.start(t0);
  lfo.start(t0);
  o.stop(t0 + 0.75);
  lfo.stop(t0 + 0.75);
}

/** správná odpověď: zvon + krátký potlesk */
function correct() {
  const t = ctx!.currentTime;
  const out = bus(0.9, 0.35);
  bell(t, 1046.5, 0.22, out);
  bell(t + 0.11, 1318.5, 0.2, out);
  applause(1.9, 0.9, 0.12);
}

/** chybový bzučák — tvrdý elektromechanický „EEEHH“ */
function wrong() {
  const c = ctx!;
  const t = c.currentTime;
  const dur = 0.95;
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * 3);
  }
  shaper.curve = curve;
  const pk = c.createBiquadFilter();
  pk.type = "peaking";
  pk.frequency.value = 1100;
  pk.gain.value = 9;
  pk.Q.value = 1.2;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3800;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32, t + 0.012);
  g.gain.setValueAtTime(0.32, t + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  // mechanické „drnčení“ (amplitudová modulace)
  const am = c.createGain();
  am.gain.value = 0.75;
  const lfo = c.createOscillator();
  const lg = c.createGain();
  lfo.frequency.value = 58;
  lg.gain.value = 0.25;
  lfo.connect(lg).connect(am.gain);
  shaper.connect(pk).connect(lp).connect(am).connect(g).connect(bus(1, 0.18));
  for (const [type, f] of [
    ["square", 147],
    ["square", 151.5],
    ["sawtooth", 73.8],
  ] as [OscillatorType, number][]) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = c.createGain();
    og.gain.value = 0.35;
    o.connect(og).connect(shaper);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

/** jeden úder na malý buben */
function snare(t0: number, vel: number, out: AudioNode) {
  noise(t0, 0.07 + vel * 0.05, out, 0.36 * vel, "bandpass", 3800, 0.7, 0.001);
  noise(t0, 0.04, out, 0.2 * vel, "highpass", 7000, 0.7, 0.001);
  osc("triangle", 205, t0, 0.045, out, 0.3 * vel, 0.001, 160);
}

/** vířivý buben s crescendem (~2.4 s) */
function drumroll(len = 2.4) {
  const t = ctx!.currentTime;
  const out = bus(0.85, 0.3);
  let at = 0;
  let hand = 0;
  while (at < len) {
    const p = at / len;
    const vel = (0.25 + p * p * 0.85) * (hand % 2 ? 0.86 : 1) * (0.9 + Math.random() * 0.2);
    snare(t + at, vel, out);
    at += 0.034 + (Math.random() - 0.5) * 0.008;
    hand++;
  }
}

/** činel + velký buben */
function crash() {
  const t = ctx!.currentTime;
  const out = bus(0.8, 0.5);
  // kovové neharmonické složky (jako u bicích automatů, ale delší)
  const hp = ctx!.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5500;
  const g = ctx!.createGain();
  env(g, t, 0.2, 0.003, 2.6);
  hp.connect(g).connect(out);
  for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) {
    const o = ctx!.createOscillator();
    o.type = "square";
    o.frequency.value = f * 2.2;
    o.connect(hp);
    o.start(t);
    o.stop(t + 2.7);
  }
  noise(t, 2.4, out, 0.3, "highpass", 4500, 0.5, 0.003);
  noise(t, 0.35, out, 0.18, "bandpass", 900, 0.8, 0.002);
  // velký buben
  osc("sine", 110, t, 0.6, out, 0.7, 0.002, 42);
  noise(t, 0.015, out, 0.2, "lowpass", 2500);
}

/** ohlášení otázky: „vžum“ přes stereo + úder */
function intro() {
  const c = ctx!;
  const t = c.currentTime;
  const pan = c.createStereoPanner();
  pan.pan.setValueAtTime(-0.8, t);
  pan.pan.linearRampToValueAtTime(0.8, t + 0.8);
  const out = bus(0.9, 0.35);
  pan.connect(out);
  const f = noise(t, 0.85, pan, 0.4, "bandpass", 400, 1.4, 0.35);
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(3500, t + 0.45);
  f.frequency.exponentialRampToValueAtTime(900, t + 0.9);
  // úder ve chvíli, kdy stěrač zakryje obrazovku
  const hit = t + 0.42;
  const out2 = bus(0.9, 0.45);
  osc("sine", 95, hit, 0.7, out2, 0.75, 0.002, 38);
  noise(hit, 0.25, out2, 0.25, "lowpass", 1800, 0.7, 0.002);
  noise(hit, 1.2, out2, 0.07, "highpass", 6000, 0.5, 0.004);
}

/** otočení karty bez bodů — tichý „fwip“ */
function softFlip() {
  const t = ctx!.currentTime;
  const out = bus(0.9, 0.25);
  const f = noise(t, 0.12, out, 0.7, "bandpass", 1200, 1.5, 0.01);
  f.frequency.setValueAtTime(900, t);
  f.frequency.exponentialRampToValueAtTime(4200, t + 0.12);
  osc("sine", 520, t + 0.05, 0.3, out, 0.22, 0.003);
  osc("triangle", 180, t + 0.04, 0.07, out, 0.4, 0.001);
}

/** tým se připojil — měkké „blup“ */
function pop() {
  const t = ctx!.currentTime;
  const out = bus(0.8, 0.2);
  osc("sine", 380, t, 0.14, out, 0.55, 0.003, 820);
  osc("sine", 760, t + 0.02, 0.09, out, 0.15, 0.003, 1300);
}

/** bzučák týmu — kvízový „dzing“ */
function buzz() {
  const t = ctx!.currentTime;
  const out = bus(0.9, 0.3);
  bell(t, 1567.98, 0.3, out);
  osc("square", 784, t, 0.32, out, 0.12, 0.004);
}

/** žesťový akord (filtr se otevírá jako u trubky) */
function brassChord(notes: number[], t0: number, dur: number, vol: number, out: AudioNode) {
  for (const f of notes) {
    for (const det of [-6, 0, 7]) {
      const o = ctx!.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      const lp = ctx!.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 1.5;
      lp.frequency.setValueAtTime(500, t0);
      lp.frequency.exponentialRampToValueAtTime(3200, t0 + 0.07);
      lp.frequency.exponentialRampToValueAtTime(1600, t0 + dur);
      const g = ctx!.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.04);
      g.gain.setValueAtTime(vol * 0.8, t0 + Math.max(0.06, dur - 0.15));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.2);
      const vib = ctx!.createOscillator();
      const vg = ctx!.createGain();
      vib.frequency.value = 5.5;
      vg.gain.value = dur > 0.5 ? 6 : 0;
      vib.connect(vg).connect(o.detune);
      o.connect(lp).connect(g).connect(out);
      o.start(t0);
      vib.start(t0);
      o.stop(t0 + dur + 0.3);
      vib.stop(t0 + dur + 0.3);
    }
  }
}

/** „ta-daaa“ + jásot publika */
function fanfare() {
  const t = ctx!.currentTime;
  const out = bus(0.75, 0.45);
  brassChord([392, 493.9, 587.3], t, 0.16, 0.035, out); // G dur — krátce
  brassChord([392, 493.9, 587.3], t + 0.2, 0.12, 0.035, out);
  brassChord([523.3, 659.3, 784, 1046.5], t + 0.36, 1.6, 0.04, out); // C dur — dlouze
  applause(5, 1.1, 0.3);
  for (let i = 0; i < 4; i++) whistle(t + 0.6 + Math.random() * 3, 0.05);
}

function tick() {
  const t = ctx!.currentTime;
  osc("triangle", 1400, t, 0.04, bus(0.8, 0.1), 0.25, 0.001);
}

export const sfx: Record<Exclude<SoundName, "suspense">, () => void> = {
  correct,
  wrong,
  intro,
  softFlip,
  pop,
  buzz,
  fanfare,
  tick,
  drumroll: () => drumroll(),
  crash,
  applause: () => applause(3, 1),
};

function playSample(name: string, loop = false) {
  const buf = samples.get(name);
  if (!buf || !ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = loop;
  const g = ctx.createGain();
  src.connect(g).connect(bus(1, 0.12));
  src.start();
  return { src, g };
}

export function play(name: Exclude<SoundName, "suspense">) {
  if (!ctx || muted) return;
  if (ctx.state === "suspended") void ctx.resume();
  if (playSample(name)) return;
  sfx[name]();
}

/**
 * Napětí během prodlevy: tlukot srdce, který postupně zrychluje.
 * Vrací funkci, která ho rychle ztlumí (přijde trefa nebo X).
 */
export function startSuspense(maxSec = 6) {
  if (!ctx || !master || muted) return () => {};
  const c = ctx;
  const sample = playSample("suspense", true);
  if (sample) {
    return () => {
      sample.g.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => sample.src.stop(), 400);
    };
  }
  const out = c.createGain();
  out.connect(bus(1, 0.2));
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 160;
  lp.connect(out);
  const t0 = c.currentTime + 0.05;
  let t = 0;
  let gap = 0.82;
  while (t < maxSec) {
    const p = t / maxSec;
    // „lub-dub“ — tupé údery jako přes stetoskop
    osc("sine", 95, t0 + t, 0.17, lp, 0.3 + p * 0.15, 0.006, 42);
    osc("sine", 85, t0 + t + 0.21, 0.14, lp, 0.18 + p * 0.12, 0.006, 40);
    t += gap;
    gap = Math.max(0.42, gap * 0.92);
  }
  return () => {
    out.gain.cancelScheduledValues(c.currentTime);
    out.gain.setTargetAtTime(0, c.currentTime, 0.04);
    setTimeout(() => out.disconnect(), 400);
  };
}

/** zvuková zkouška — přehraje vše po sobě (klávesa T na projektoru) */
export function soundCheck() {
  const seq: [Exclude<SoundName, "suspense">, number][] = [
    ["intro", 0],
    ["correct", 1800],
    ["wrong", 4200],
    ["softFlip", 6000],
    ["softFlip", 6650],
    ["buzz", 7800],
    ["drumroll", 9200],
    ["crash", 11600],
    ["fanfare", 11750],
  ];
  return seq.map(([name, at]) => setTimeout(() => play(name), at));
}

/** vyrenderuje zvuk offline a vrátí špičku/RMS — pro automatickou kontrolu hlasitosti */
export async function measure(name: SoundName, seconds = 6) {
  const saved = { ctx, master, reverbIn, muted };
  const off = new OfflineAudioContext(2, Math.floor(44100 * seconds), 44100);
  ctx = off as unknown as AudioContext;
  const g = buildGraph(off);
  master = g.m;
  reverbIn = g.rIn;
  muted = false;
  try {
    if (name === "suspense") startSuspense(seconds);
    else sfx[name]();
  } finally {
    ({ ctx, master, reverbIn, muted } = saved);
  }
  const buf = await off.startRendering();
  let peak = 0;
  let sum = 0;
  let last = 0;
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const v = Math.abs(d[i]);
    if (v > peak) peak = v;
    sum += v * v;
    if (v > 0.01) last = i;
  }
  return { name, peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), audibleSec: +(last / 44100).toFixed(2) };
}
