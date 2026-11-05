import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../config";
import { useAuth } from "../context/AuthContext";
import { Card, Errors, btnPrimary, btnGhost, fieldCls } from "../components/ui";

/** Sign in to an existing Supabase account. */
export default function SignIn() {
  const auth = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setErrors([]);
    setBusy(true);
    const r = await auth.signIn(email, password);
    setBusy(false);
    if (!r.ok) setErrors(r.error ? [r.error] : []);
    else nav("/", { replace: true });
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
      <div><h1 className="text-3xl font-bold">Sign in</h1><p className="mt-1 text-muted">Enter your Stockly account to reach your business.</p></div>
      <Card className="space-y-4">
        <Errors list={errors} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Email address</span><input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Password</span><input className={fieldCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button disabled={busy} onClick={go} className={`${btnPrimary} w-full`}>{busy ? "Signing in…" : "Sign in"}</button>
      </Card>
      <p className="text-center text-sm text-muted">Don't have an account yet? <a onClick={(e) => { e.preventDefault(); nav("/sign-up"); }} className="font-semibold text-pdark underline">Create one</a></p>
    </main>
  );
}
