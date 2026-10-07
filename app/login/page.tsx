"use client";

import { Suspense, useState, type FormEvent, type JSX } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Página de acceso al panel (ruta pública, protegida por throttle en API). */
export default function LoginPage(): JSX.Element {
  return (
    <main className="login-wrap">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}

function LoginForm(): JSX.Element {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "No se pudo ingresar");
        return;
      }
      router.push(search.get("next") ?? "/dashboard");
      router.refresh();
    } catch {
      setError("Error de conexión. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="login-card" onSubmit={submit} aria-label="Acceso al panel">
        <div className="login-logo" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="6" width="20" height="11" rx="2.5" fill="currentColor" opacity="0.9" />
            <circle cx="7.5" cy="17.5" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="16.5" cy="17.5" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
            <path d="M4 9.5 7 6.8h7.5L20 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <h1>Panel de la concesionaria</h1>
        <p>Ingresá la contraseña para ver tus leads.</p>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error && (
          <p role="alert" className="login-error">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
    </form>
  );
}
