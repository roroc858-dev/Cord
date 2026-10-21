"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CordMark } from "@/components/cord-mark";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Could not log in.");
        return;
      }

      router.push("/app");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="brand"><CordMark size={28} /><span>Cord</span></div>
        <div className="auth-aside-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Your people. Your space.</div>
          <h1>Better conversations start here.</h1>
          <p>Keep your communities close, your messages organized, and your voice ready for the people who matter.</p>
        </div>
        <div className="auth-aside-foot">Better. Faster. Together.</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h2>Welcome back</h2>
          <p>Sign in to continue to Cord.</p>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="current-password" placeholder="••••••••••" required />
            </label>
            {error ? <div className="auth-error" role="alert">{error}</div> : null}
            <button type="submit" disabled={loading}>{loading ? "Signing in…" : "Log in"}</button>
          </form>
          <div className="auth-switch">Need an account? <Link href="/register">Create one</Link></div>
        </div>
      </main>
    </div>
  );
}
