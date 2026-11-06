import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { APP_NAME } from "../config";
import { useAuth } from "../context/AuthContext";
import { Card, Errors, btnPrimary, btnGhost, fieldCls } from "../components/ui";

/** Create a new Supabase account. After the account exists the owner creates
 * their business on the next screen. */
export default function SignUp() {
  const auth = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const invitation = searchParams.get("invite");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setErrors([]);
    setConfirmationRequired(false);
    setBusy(true);
    const r = await auth.signUp(email, password);
    setBusy(false);
    if (!r.ok) setErrors(r.error ? [r.error] : []);
    else if (r.confirmationRequired) setConfirmationRequired(true);
    else nav(invitation ? `/accept-invitation?token=${encodeURIComponent(invitation)}` : "/", { replace: true });
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
      <div><h1 className="text-3xl font-bold">Create your account</h1><p className="mt-1 text-muted">One account per person. You will create your business on the next screen.</p></div>
      <Card className="space-y-4">
        <Errors list={errors} />
        {confirmationRequired && <p role="status" className="rounded-xl border border-ok p-3 text-sm">Check your email to confirm your account, then sign in.{invitation && <> Once signed in, return to <a className="font-semibold text-pdark underline" href={`/accept-invitation?token=${encodeURIComponent(invitation)}`}>your invitation</a>.</>}</p>}
        <label className="block"><span className="mb-1 block text-sm font-medium">Email address</span><input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Password</span><input className={fieldCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /><span className="mt-1 block text-xs text-muted">At least 6 characters.</span></label>
        <button disabled={busy} onClick={go} className={`${btnPrimary} w-full`}>{busy ? "Creating account…" : "Create account"}</button>
      </Card>
      <p className="text-center text-sm text-muted">Already have an account? <a onClick={(e) => { e.preventDefault(); nav("/sign-in"); }} className="font-semibold text-pdark underline">Sign in</a></p>
    </main>
  );
}
