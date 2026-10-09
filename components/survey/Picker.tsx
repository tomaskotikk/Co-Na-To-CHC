"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { fold } from "@/lib/survey";

/** keywords = skryté výrazy jen pro hledání (zkratky, hovorové názvy) */
export type PickerOption = { value: string; label: string; hint?: string; keywords?: string };

/** Rozbalovací výběr s vyhledáváním — na mobilu panel přes obrazovku, na PC okno. */
export function Picker({
  id,
  title,
  placeholder,
  options,
  value,
  onChange,
  searchable = false,
  searchPlaceholder = "Začni psát…",
}: {
  id: string;
  title: string;
  placeholder: string;
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  // každé napsané slovo musí sedět na začátek některého slova („pes“ → Pešák, Pešáková; „prog jav“ → Programovací jazyk Java)
  const filtered = useMemo(() => {
    const words = fold(query).split(/\s+/).filter(Boolean);
    if (!words.length) return options;
    return options.filter((o) => {
      const parts = fold(`${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`).split(/[\s.,()-]+/);
      return words.every((w) => parts.some((p) => p.startsWith(w)));
    });
  }, [query, options]);

  useEffect(() => {
    if (!open) return;
    (searchable ? search.current : sheet.current)?.focus();
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [open, searchable]);

  useEffect(() => {
    if (open) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function show() {
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function pick(v: string) {
    onChange(v);
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => Math.min(filtered.length - 1, Math.max(0, a + step)));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active].value);
    }
  }

  return (
    <div className="sv-picker">
      <button
        ref={trigger}
        type="button"
        id={id}
        className={`sv-input sv-picker-btn ${selected ? "" : "is-empty"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={show}
      >
        <span className="sv-picker-value">{selected ? selected.label : placeholder}</span>
        {selected?.hint && <span className="sv-picker-hint">{selected.hint}</span>}
        <ChevronDown className="sv-picker-chev" aria-hidden />
      </button>
      {/* neviditelné povinné pole — prohlížeč díky němu nepustí odeslání bez výběru */}
      <input className="sv-picker-proxy" tabIndex={-1} aria-hidden required value={value} onChange={() => {}} />

      {open && (
        <div className="sv-sheet-wrap" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div ref={sheet} className="sv-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={onKey}>
            <div className="sv-sheet-head">
              <p className="sv-sheet-title">{title}</p>
              <button type="button" className="sv-sheet-x" onClick={close} aria-label="Zavřít">
                <X />
              </button>
            </div>

            {searchable && (
              <label className="sv-search">
                <Search aria-hidden />
                <input
                  ref={search}
                  value={query}
                  placeholder={searchPlaceholder}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                  role="combobox"
                  aria-expanded
                  aria-controls={listId}
                  aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                />
              </label>
            )}

            <ul ref={list} id={listId} role="listbox" className="sv-options">
              {filtered.map((o, i) => (
                <li
                  key={o.value}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={o.value === value}
                  className={`sv-opt ${i === active ? "is-active" : ""} ${o.value === value ? "is-sel" : ""}`}
                  onClick={() => pick(o.value)}
                  onMouseMove={() => i !== active && setActive(i)}
                >
                  <span className="sv-opt-label">{o.label}</span>
                  {o.hint && <span className="sv-opt-hint">{o.hint}</span>}
                  {o.value === value && <Check className="sv-opt-check" aria-hidden />}
                </li>
              ))}
              {filtered.length === 0 && <li className="sv-opt-empty">Nic takového tu není — zkus jiná písmena.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
