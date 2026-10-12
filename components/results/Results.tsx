"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LogOut } from "lucide-react";
import { fold, SURVEY_CLASSES, SURVEY_QUESTIONS } from "@/lib/survey";
import type { SurveyRow } from "@/lib/server/surveyLive";

const POLL_MS = 10_000;
const YEARS = ["1", "2", "3", "4"];
type Filter = "all" | "ucitel" | (typeof YEARS)[number];

const yearOf = (r: SurveyRow) => (r.role === "ucitel" ? "ucitel" : (r.className?.split(".")[0] ?? "?"));
const time = (ms: number | null) =>
  ms ? new Date(ms).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const who = (r: SurveyRow) => `${r.firstName} ${r.lastName}`;
const where = (r: SurveyRow) => (r.role === "ucitel" ? "učitel" : r.className);

/** sečte odpovědi; ručně psané se slučují bez ohledu na velikost písmen a diakritiku */
function tally(rows: SurveyRow[], qid: string) {
  const map = new Map<string, { text: string; count: number }>();
  for (const r of rows) {
    const a = r.answers[qid]?.trim();
    if (!a) continue;
    const key = fold(a).replace(/\s+/g, " ");
    const e = map.get(key);
    if (e) e.count++;
    else map.set(key, { text: a, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, "cs"));
}

export function Results() {
  const [rows, setRows] = useState<SurveyRow[] | null>(null);
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<"questions" | "people">("questions");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState("");
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const res = await fetch("/api/vysledky", { cache: "no-store" });
        if (res.status === 401) return window.location.reload();
        const data = (await res.json()) as { ok: boolean; rows?: SurveyRow[]; error?: string };
        if (!data.ok || !data.rows) throw new Error(data.error);
        const ids = new Set(data.rows.map((r) => r.id));
        if (seen.current) {
          const added = data.rows.filter((r) => !seen.current!.has(r.id));
          if (added.length) {
            setFresh((f) => new Set([...f, ...added.map((r) => r.id)]));
            setToast(added.length === 1 ? `Nová odpověď: ${who(added[0])} (${where(added[0])})` : `${added.length} nové odpovědi`);
          }
        }
        seen.current = ids;
        setRows(data.rows);
        setError("");
        setUpdated(Date.now());
      } catch (e) {
        setError((e as Error).message || "Načtení selhalo.");
      }
      if (!stop) timer = setTimeout(load, POLL_MS);
    }
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const all = rows ?? [];
  const shown = useMemo(() => (filter === "all" ? all : all.filter((r) => yearOf(r) === filter)), [all, filter]);
  const byClass = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of all) if (r.className) m.set(r.className, (m.get(r.className) ?? 0) + 1);
    return m;
  }, [all]);
  const countYear = (y: string) => all.filter((r) => yearOf(r) === y).length;

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function logout() {
    await fetch("/api/vysledky/login", { method: "DELETE" });
    window.location.reload();
  }

  const filters: [Filter, string, number][] = [
    ["all", "Všichni", all.length],
    ...YEARS.map((y): [Filter, string, number] => [y, `${y}. ročník`, countYear(y)]),
    ["ucitel", "Učitelé", countYear("ucitel")],
  ];

  return (
    <main className="rs">
      <header className="rs-head">
        <div>
          <h1 className="sv-title">Výsledky dotazníku</h1>
          <p className="rs-live">
            <span className={`dot ${error ? "" : "on"}`} />
            {error ? `Chyba: ${error}` : updated ? `Živě · aktualizováno ${new Date(updated).toLocaleTimeString("cs-CZ")}` : "Načítám…"}
          </p>
        </div>
        <button className="rs-ghost" onClick={logout}>
          <LogOut aria-hidden /> Odhlásit
        </button>
      </header>

      <section className="rs-stats">
        <div className="rs-total">
          <span className="rs-total-num">{all.length}</span>
          <span className="rs-total-label">vyplněných dotazníků</span>
        </div>
        <div className="rs-years">
          {YEARS.map((y) => (
            <div key={y} className="rs-year">
              <div className="rs-year-head">
                <span>{y}. ročník</span>
                <strong>{countYear(y)}</strong>
              </div>
              <div className="rs-classes">
                {SURVEY_CLASSES.filter((c) => c.id.startsWith(`${y}.`)).map((c) => (
                  <span key={c.id} title={c.hint}>
                    {c.id.slice(2)} <b>{byClass.get(c.id) ?? 0}</b>
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="rs-year">
            <div className="rs-year-head">
              <span>Učitelé</span>
              <strong>{countYear("ucitel")}</strong>
            </div>
          </div>
        </div>
      </section>

      <nav className="rs-bar">
        <div className="rs-chips" role="group" aria-label="Filtr">
          {filters.map(([f, label, n]) => (
            <button key={f} className={`rs-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
              {label} <span>{n}</span>
            </button>
          ))}
        </div>
        <div className="rs-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "questions"} className={tab === "questions" ? "on" : ""} onClick={() => setTab("questions")}>
            Otázky
          </button>
          <button role="tab" aria-selected={tab === "people"} className={tab === "people" ? "on" : ""} onClick={() => setTab("people")}>
            Lidé
          </button>
        </div>
      </nav>

      {rows && shown.length === 0 && <p className="rs-empty">Zatím žádné odpovědi{filter === "all" ? "" : " v tomhle filtru"}.</p>}

      {tab === "questions" && shown.length > 0 && (
        <ol className="rs-list">
          {SURVEY_QUESTIONS.map((q, i) => {
            const t = tally(shown, q.id);
            const max = t[0]?.count ?? 1;
            const expanded = open.has(q.id);
            return (
              <li key={q.id} className="sv-card rs-q">
                <div className="sv-q-label">
                  <span className="sv-q-num">{i + 1}</span>
                  <span className="sv-q-text">{q.text}</span>
                </div>
                <ul className="rs-answers">
                  {(expanded ? t : t.slice(0, 6)).map((a, j) => (
                    <li key={a.text} className={j === 0 ? "top" : ""}>
                      <div className="rs-ans-row">
                        <span className="rs-ans-text">{a.text}</span>
                        <span className="rs-ans-num">
                          {a.count} <small>{Math.round((a.count / shown.length) * 100)} %</small>
                        </span>
                      </div>
                      <div className="rs-ans-bar">
                        <div style={{ width: `${(a.count / max) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
                {t.length > 6 && (
                  <button className="rs-more" onClick={() => toggle(q.id)}>
                    {expanded ? "Méně" : `Zobrazit všech ${t.length} různých odpovědí`}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {tab === "people" && shown.length > 0 && (
        <ul className="rs-people">
          {shown.map((r) => (
            <li key={r.id} className={`sv-card rs-person ${fresh.has(r.id) ? "fresh" : ""}`}>
              <button className="rs-person-head" onClick={() => toggle(r.id)} aria-expanded={open.has(r.id)}>
                <span className="rs-person-name">{who(r)}</span>
                <span className="rs-person-meta">
                  {where(r)} · {time(r.createdAt)}
                </span>
              </button>
              {open.has(r.id) && (
                <ol className="rs-person-answers">
                  {SURVEY_QUESTIONS.map((q, i) => (
                    <li key={q.id}>
                      <span>
                        {i + 1}. {q.text}
                      </span>
                      <strong>{r.answers[q.id] ?? "—"}</strong>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}

      {toast && (
        <div className="rs-toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
