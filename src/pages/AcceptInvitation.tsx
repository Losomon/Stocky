import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { APP_NAME } from "../config";
import { useAuth } from "../context/AuthContext";
import { claimInvitation } from "../lib/business";
import { Card, Errors, btnPrimary, btnGhost, fieldCls } from "../components/ui";

/** A worker taps the invitation link their owner sent, signs in as the
 * invited email, and joins only that business through claim_member_invitation. */
export default function AcceptInvitation() {
  const auth = useAuth();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const claiming = useRef(false);

  const claim = async () => {
    if (claimed || claiming.current) return;
    claiming.current = true;
    setErrors([]);
    setBusy(true);
    try {
      const r = await claimInvitation(token);
      if (!r.ok) { setErrors([r.error]); return; }
      setBusinessId(r.businessId);
      setClaimed(true);
    } finally {
      claiming.current = false;
      setBusy(false);
    }
  };

  const signInAndClaim = async () => {
    setErrors([]);
    setBusy(true);
    const r = await auth.signIn(email, password);
    setBusy(false);
    if (!r.ok) setErrors([r.error ?? ""]);
  };

  const openApp = () => {
    if (!businessId) return;
    void auth.setActiveBusiness(businessId).then(() => nav("/", { replace: true }))
      .catch((e: unknown) => setErrors([e instanceof Error ? e.message : "Could not open this business."]));
  };

  useEffect(() => {
    if (!token || claimed || !auth.user) return;
    void claim();
  }, [claimed, token, auth.user]);

  if (!token) {
    return (
      <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
        <Card className="space-y-3"><Errors list={errors} /><p>No invitation token in this link. Ask your business owner to invite you.</p></Card>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
        <div><h1 className="text-3xl font-bold">Sign in to join the business</h1><p className="mt-1 text-muted">Sign in with the account the invitation was sent to.</p></div>
        <Card className="space-y-4">
          <Errors list={errors} />
          <label className="block"><span className="mb-1 block text-sm font-medium">Email address</span><input className={fieldCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="email" /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Password</span><input className={fieldCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          <button disabled={busy} onClick={signInAndClaim} className={`${btnPrimary} w-full`}>{busy ? "Signing in…" : "Sign in and join"}</button>
        </Card>
        <p className="text-center text-sm text-muted">Don't have an account? <a onClick={(e) => { e.preventDefault(); nav(`/sign-up?invite=${encodeURIComponent(token)}`); }} className="font-semibold text-pdark underline">Create one</a>, then return here to join.</p>
      </main>
    );
  }

  if (!claimed || !businessId) {
    return (
      <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
        <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
        <Card className="space-y-3">
          <Errors list={errors} />
          {busy ? <p className="text-sm text-muted">Joining…</p> : <button onClick={() => void claim()} className={`${btnPrimary} w-full`}>Join the business</button>}
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
      <div><h1 className="text-3xl font-bold">Joined the business</h1><p className="mt-1 text-muted">You are now a member of this business. Open the app to see its stock, sales and purchases.</p></div>
      <Card className="space-y-3"><button onClick={openApp} className={`${btnPrimary} w-full`}>Open Stockly</button></Card>
    </main>
  );
}
