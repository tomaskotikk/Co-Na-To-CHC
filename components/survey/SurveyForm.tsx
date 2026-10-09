"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  SURVEY_ALIASES,
  SURVEY_CHOICES,
  SURVEY_CLASSES,
  SURVEY_LIMITS,
  SURVEY_QUESTIONS,
  type SurveyKind,
  type SurveyRole,
} from "@/lib/survey";
import { Picker, type PickerOption } from "./Picker";

const DONE_KEY = "chc-dotaznik-odeslano";
const DRAFT_KEY = "chc-dotaznik-koncept";
const DEVICE_KEY = "chc-dotaznik-zarizeni";

const PLACEHOLDERS: Record<Exclude<SurveyKind, "text">, string> = {
  teacher: "Vyber učitele",
  room: "Vyber učebnu",
  subject: "Vyber předmět",
};
const SEARCH_PLACEHOLDERS: Record<Exclude<SurveyKind, "text">, string> = {
  teacher: "Napiš jméno nebo příjmení…",
  room: "Napiš název učebny…",
  subject: "Napiš předmět, třeba „matika“…",
};
const OPTIONS = Object.fromEntries(
  Object.entries(SURVEY_CHOICES).map(([kind, list]) => [kind, list.map((v) => ({ value: v, label: v, keywords: SURVEY_ALIASES[v] }))]),
) as Record<Exclude<SurveyKind, "text">, PickerOption[]>;
const CLASS_OPTIONS = SURVEY_CLASSES.map((c) => ({ value: c.id, label: c.label, hint: c.hint }));

type Draft = {
  firstName: string;
  lastName: string;
  role: SurveyRole | "";
  className: string;
  answers: string[];
  startedAt: number;
};

const emptyDraft = (): Draft => ({
  firstName: "",
  lastName: "",
  role: "",
  className: "",
  answers: SURVEY_QUESTIONS.map(() => ""),
  startedAt: Date.now(),
});

// localStorage může v soukromém okně chybět nebo házet — formulář musí jet i bez něj
function lsGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

function deviceId() {
  let v = lsGet(DEVICE_KEY);
  if (!v) {
    // getRandomValues jde i přes http v lokální síti (randomUUID ne)
    v = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join("");
    lsSet(DEVICE_KEY, v);
  }
  return v;
}

export function SurveyForm({ alreadyDone }: { alreadyDone: boolean }) {
  const [phase, setPhase] = useState<"form" | "done" | "already">(alreadyDone ? "already" : "form");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loaded, setLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const honeypot = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lsGet(DONE_KEY)) setPhase("already");
    try {
      const saved = JSON.parse(lsGet(DRAFT_KEY) ?? "null") as Draft | null;
      if (saved && Array.isArray(saved.answers)) {
        // starý koncept mohl mít učitele / učebnu / předmět / třídu psané ručně — co není v seznamu, zahodit
        const answers = SURVEY_QUESTIONS.map((q, i) => {
          const a = String(saved.answers[i] ?? "");
          return q.kind !== "text" && !SURVEY_CHOICES[q.kind].includes(a) ? "" : a;
        });
        const className = SURVEY_CLASSES.some((c) => c.id === saved.className) ? saved.className : "";
        setDraft({ ...emptyDraft(), ...saved, answers, className });
      }
    } catch {}
    setLoaded(true);
  }, []);

  // rozepsané odpovědi přežijí zavření prohlížeče
  useEffect(() => {
    if (loaded && phase === "form") lsSet(DRAFT_KEY, JSON.stringify(draft));
  }, [draft, loaded, phase]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setAnswer = (i: number, v: string) => setDraft((d) => ({ ...d, answers: d.answers.map((a, j) => (j === i ? v : a)) }));

  const answered = draft.answers.filter((a) => a.trim()).length;
  const total = SURVEY_QUESTIONS.length;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setError("");
    setSending(true);
    try {
      const res = await fetch("/api/dotaznik", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, deviceId: deviceId(), web: honeypot.current?.value ?? "" }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (res.ok && data?.ok) {
        lsSet(DONE_KEY, "1");
        lsSet(DRAFT_KEY, null);
        setPhase("done");
        window.scrollTo(0, 0);
        return;
      }
      setError(data?.error ?? "Odeslání se nepovedlo. Zkus to prosím znovu.");
    } catch {
      setError("Nepodařilo se spojit se serverem. Zkontroluj internet a zkus to znovu.");
    } finally {
      setSending(false);
    }
  }

  if (phase !== "form") {
    return (
      <main className="sv sv-end">
        <Logo className="sv-logo" />
        <div className="sv-check">
          <Check strokeWidth={3} />
        </div>
        <h1 className="sv-title">{phase === "done" ? "Díky, máme to!" : "Už máš odesláno"}</h1>
        <p className="sv-lead">
          {phase === "done"
            ? "Tvoje odpovědi jsme uložili. Uvidíš je na stužkovací v show Co na to CHC?"
            : "Z tohohle zařízení už dotazník odešel. Každý může odpovídat jen jednou."}
        </p>
      </main>
    );
  }

  return (
    <main className="sv">
      <div className="sv-progress" aria-hidden>
        <div className="sv-progress-bar" style={{ width: `${(answered / total) * 100}%` }} />
      </div>

      <header className="sv-head">
        <Logo className="sv-logo" />
        <h1 className="sv-title">Dotazník</h1>
        <p className="sv-lead">
          Odpovědi použijeme ve stužkovací show. Piš krátce, ideálně jedním až dvěma slovy, a první, co tě napadne.
          Odpovídat jde jen jednou.
        </p>
      </header>

      <form onSubmit={submit} className="sv-form">
        <section className="sv-card">
          <h2 className="sv-h2">O tobě</h2>
          <div className="sv-row">
            <label className="sv-field">
              <span>Jméno</span>
              <input
                className="sv-input"
                required
                maxLength={SURVEY_LIMITS.name}
                autoComplete="given-name"
                value={draft.firstName}
                onChange={(e) => set("firstName", e.target.value)}
              />
            </label>
            <label className="sv-field">
              <span>Příjmení</span>
              <input
                className="sv-input"
                required
                maxLength={SURVEY_LIMITS.name}
                autoComplete="family-name"
                value={draft.lastName}
                onChange={(e) => set("lastName", e.target.value)}
              />
            </label>
          </div>

          <fieldset className="sv-field">
            <span>Jsem</span>
            <div className="sv-seg">
              {(
                [
                  ["zak", "Žák"],
                  ["ucitel", "Učitel"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="sv-seg-opt">
                  <input
                    type="radio"
                    name="role"
                    required
                    value={value}
                    checked={draft.role === value}
                    onChange={() => set("role", value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {draft.role === "zak" && (
            <div className="sv-field">
              <label htmlFor="className">Třída</label>
              <Picker
                id="className"
                title="Tvoje třída"
                placeholder="Vyber třídu"
                options={CLASS_OPTIONS}
                value={draft.className}
                onChange={(v) => set("className", v)}
              />
            </div>
          )}
        </section>

        {/* past na boty — člověk ji nevidí ani na ni neskočí tabulátorem */}
        <div className="sv-hp" aria-hidden>
          <input ref={honeypot} name="web" tabIndex={-1} autoComplete="off" />
        </div>

        <ol className="sv-list">
          {SURVEY_QUESTIONS.map((q, i) => (
            <li key={q.id} className={`sv-card sv-q ${draft.answers[i].trim() ? "is-done" : ""}`}>
              <label className="sv-q-label" htmlFor={q.id}>
                <span className="sv-q-num">{i + 1}</span>
                <span className="sv-q-text">{q.text}</span>
              </label>
              {q.kind !== "text" ? (
                <Picker
                  id={q.id}
                  title={q.text}
                  placeholder={PLACEHOLDERS[q.kind]}
                  options={OPTIONS[q.kind]}
                  value={draft.answers[i]}
                  onChange={(v) => setAnswer(i, v)}
                  searchable
                  searchPlaceholder={SEARCH_PLACEHOLDERS[q.kind]}
                />
              ) : (
                  <input
                    id={q.id}
                    className="sv-input"
                    required
                    maxLength={SURVEY_LIMITS.answer}
                    autoComplete="off"
                    enterKeyHint={i < total - 1 ? "next" : "done"}
                    value={draft.answers[i]}
                    onChange={(e) => setAnswer(i, e.target.value)}
                    onKeyDown={(e) => {
                      // Enter na mobilu = další otázka, ne odeslání
                      if (e.key === "Enter" && i < total - 1) {
                        e.preventDefault();
                        document.getElementById(SURVEY_QUESTIONS[i + 1].id)?.focus();
                      }
                    }}
                  />
              )}
            </li>
          ))}
        </ol>

        <div className="sv-submit">
          <p className="sv-count">
            Vyplněno {answered} / {total}
          </p>
          {error && (
            <p className="sv-err" role="alert">
              {error}
            </p>
          )}
          <button className="sv-btn" disabled={sending}>
            {sending ? "Odesílám…" : "Odeslat odpovědi"}
          </button>
        </div>
      </form>
    </main>
  );
}
