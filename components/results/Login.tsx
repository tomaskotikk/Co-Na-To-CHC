"use client";

import { useState, type FormEvent } from "react";
import { Lock } from "lucide-react";
import { Logo } from "@/components/Logo";

export function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/vysledky/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (data?.ok) return window.location.reload();
      setError(data?.error ?? "Přihlášení se nepovedlo.");
    } catch {
      setError("Nepodařilo se spojit se serverem.");
    }
    setSending(false);
  }

  return (
    <main className="sv sv-end">
      <Logo className="sv-logo" />
      <div className="sv-check">
        <Lock strokeWidth={2.5} />
      </div>
      <h1 className="sv-title">Výsledky</h1>
      <form onSubmit={submit} className="rs-login">
        <label className="sv-field">
          <span>Heslo</span>
          <input
            className="sv-input"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="sv-err" role="alert">
            {error}
          </p>
        )}
        <button className="sv-btn" disabled={sending}>
          {sending ? "Ověřuji…" : "Vstoupit"}
        </button>
      </form>
    </main>
  );
}
