"use client";

import { useEffect, useRef, useState } from "react";
import type { AdminCmd, AdminState, Question } from "@/lib/types";

type Cmd = (c: AdminCmd) => Promise<boolean>;

const newId = () => Math.random().toString(36).slice(2, 10);
const blank = (): Question => ({
  id: newId(),
  text: "",
  multiplier: 1,
  answers: Array.from({ length: 6 }, () => ({ text: "", points: 0 })),
});

export function QuestionsTab({ st, cmd, onPlay }: { st: AdminState; cmd: Cmd; onPlay: () => void }) {
  const [draft, setDraft] = useState<Question[]>(() => structuredClone(st.questions));
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const lastServer = useRef(st.questions);

  // změny ze serveru převzít, pokud zrovna nic needituju
  useEffect(() => {
    if (st.questions !== lastServer.current) {
      lastServer.current = st.questions;
      if (!dirty) setDraft(structuredClone(st.questions));
    }
  }, [st.questions, dirty]);

  const update = (fn: (d: Question[]) => void) => {
    setDraft((prev) => {
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    if (await cmd({ type: "saveQuestions", questions: draft })) setDirty(false);
  };

  return (
    <div className="adm-body">
      <section className="card-a">
        <p className="mute small">
          Karta č. 1 = nejčastější odpověď. Po uložení se odpovědi samy seřadí podle počtu hlasů. Prázdné odpovědi se zahodí.
        </p>
        <div className="row-btns">
          <button
            className="btn btn-y"
            onClick={() => {
              const q = blank();
              update((d) => d.push(q));
              setOpen(q.id);
            }}
          >
            + Nová otázka
          </button>
          <button className="btn" onClick={() => setJson(json === null ? JSON.stringify(draft, null, 2) : null)}>
            {json === null ? "JSON import/export" : "Zavřít JSON"}
          </button>
        </div>
        {json !== null && (
          <div className="json-box">
            <textarea className="input mono" rows={10} value={json} onChange={(e) => setJson(e.target.value)} />
            <button
              className="btn btn-block"
              onClick={() => {
                try {
                  const parsed = JSON.parse(json);
                  if (!Array.isArray(parsed)) throw new Error();
                  setDraft(parsed.map((q: Question) => ({ ...blank(), ...q, id: q.id || newId() })));
                  setDirty(true);
                  setJson(null);
                } catch {
                  alert("Neplatný JSON.");
                }
              }}
            >
              Načíst z JSONu
            </button>
          </div>
        )}
      </section>

      {draft.map((q, qi) => {
        const isOpen = open === q.id;
        const live = st.round?.questionId === q.id;
        return (
          <section className={`card-a qedit ${isOpen ? "open" : ""}`} key={q.id}>
            <button className="qedit-head" onClick={() => setOpen(isOpen ? null : q.id)}>
              <span className="qedit-n">{qi + 1}</span>
              <span className="qedit-t">{q.text || <i className="mute">Bez textu</i>}</span>
              {live && <span className="tag live">●</span>}
              {q.multiplier > 1 && <span className="mult">×{q.multiplier}</span>}
              <span className="chev">{isOpen ? "▴" : "▾"}</span>
            </button>

            {isOpen && (
              <div className="qedit-body">
                <textarea
                  className="input"
                  rows={2}
                  value={q.text}
                  placeholder="Text otázky…"
                  onChange={(e) => update((d) => (d[qi].text = e.target.value))}
                />
                <div className="mult-row">
                  <span className="mute small">Body ×</span>
                  {[1, 2, 3].map((m) => (
                    <button
                      key={m}
                      className={`seg-btn ${q.multiplier === m ? "on" : ""}`}
                      onClick={() => update((d) => (d[qi].multiplier = m))}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <div className="ans-edit">
                  {q.answers.map((a, ai) => (
                    <div className="ans-edit-row" key={ai}>
                      <span className="ans-n">{ai + 1}</span>
                      <input
                        className="input"
                        value={a.text}
                        placeholder="Odpověď"
                        maxLength={60}
                        onChange={(e) => update((d) => (d[qi].answers[ai].text = e.target.value))}
                      />
                      <input
                        className="input pts"
                        inputMode="numeric"
                        value={a.points || ""}
                        placeholder="0"
                        onChange={(e) =>
                          update((d) => (d[qi].answers[ai].points = Number(e.target.value.replace(/\D/g, "")) || 0))
                        }
                      />
                      <button
                        className="icon-btn sm"
                        aria-label="Smazat odpověď"
                        onClick={() => update((d) => d[qi].answers.splice(ai, 1))}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {q.answers.length < 8 && (
                    <button className="btn btn-sm" onClick={() => update((d) => d[qi].answers.push({ text: "", points: 0 }))}>
                      + odpověď
                    </button>
                  )}
                </div>
                <div className="row-btns">
                  <button
                    className="btn btn-sm"
                    disabled={qi === 0}
                    onClick={() => update((d) => d.splice(qi - 1, 0, ...d.splice(qi, 1)))}
                  >
                    ↑
                  </button>
                  <button
                    className="btn btn-sm"
                    disabled={qi === draft.length - 1}
                    onClick={() => update((d) => d.splice(qi + 1, 0, ...d.splice(qi, 1)))}
                  >
                    ↓
                  </button>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => confirm("Smazat otázku?") && update((d) => d.splice(qi, 1))}
                  >
                    Smazat
                  </button>
                  <button
                    className="btn btn-sm btn-y"
                    disabled={dirty}
                    title={dirty ? "Nejdřív ulož" : ""}
                    onClick={async () => {
                      const idx = st.questions.findIndex((x) => x.id === q.id);
                      if (idx >= 0 && (await cmd({ type: "goto", index: idx }))) onPlay();
                    }}
                  >
                    ▶ Hrát
                  </button>
                </div>
              </div>
            )}
          </section>
        );
      })}

      <div className="spacer" />
      {dirty && (
        <div className="savebar">
          <button
            className="btn btn-ghost"
            onClick={() => {
              setDraft(structuredClone(st.questions));
              setDirty(false);
            }}
          >
            Zahodit
          </button>
          <button className="btn btn-y" onClick={save}>
            Uložit otázky
          </button>
        </div>
      )}
    </div>
  );
}
