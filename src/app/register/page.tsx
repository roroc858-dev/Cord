"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { CordMark } from "@/components/cord-mark";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    const form = new FormData(event.currentTarget);
    const payload = {
      email: String(form.get("email") ?? ""),
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    };

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setLoading(false);

    if (!response.ok) {
      setError(data.error ?? "Could not create account.");
      return;
    }

    setSuccess("Account created. You can now log in.");
    setTimeout(() => router.push("/login"), 800);
  }

  return (
    <div className="auth-page">
      <aside className="auth-aside">
        <div className="brand"><CordMark size={28} /><span>Cord</span></div>
        <div className="auth-aside-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> Build your circle</div>
          <h1>Start your next community.</h1>
          <p>Bring your friends, your crew, and your channels together in a modern home built for real conversation.</p>
        </div>
        <div className="auth-aside-foot">Secure, modern, and ready for your people.</div>
      </aside>

      <main className="auth-main">
        <div className="auth-card">
          <h2>Create an account</h2>
          <p>Join Cord and start building your space.</p>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              Email
              <input name="email" type="email" autoComplete="email" placeholder="jane@example.com" required />
            </label>
            <label>
              Username
              <input name="username" type="text" autoComplete="username" placeholder="jane_community" required />
            </label>
            <label>
              Password
              <input name="password" type="password" autoComplete="new-password" placeholder="At least 10 characters" required />
            </label>
            {error ? <div className="auth-error">{error}</div> : null}
            {success ? <div className="auth-success">{success}</div> : null}
            <button type="submit" disabled={loading}>{loading ? "Creating account…" : "Create account"}</button>
          </form>
          <div className="auth-switch">Already a member? <Link href="/login">Log in</Link></div>
        </div>
      </main>
    </div>
  );
}
