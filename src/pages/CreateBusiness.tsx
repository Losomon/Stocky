import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { APP_NAME } from "../config";
import { useAuth } from "../context/AuthContext";
import { createBusiness } from "../lib/business";
import { setBusinessId } from "../config";
import type { StockCtx } from "../lib/store";
import { Card, Errors, btnPrimary, fieldCls } from "../components/ui";

/** Owner registration: create the business in Supabase (owner membership is
 * created atomically by the create_business RPC), then stamp this device with
 * that business so all local records carry the real business_id. */
export default function CreateBusiness({ stock }: { stock: StockCtx }) {
  const auth = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [you, setYou] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const go = async () => {
    setErrors([]);
    setBusy(true);
    const created = await createBusiness(name);
    if (!created.ok) { setBusy(false); setErrors([created.error]); return; }
    setBusinessId(created.businessId);
    await auth.setActiveBusiness(created.businessId);
    if (stock) await stock.completeSetup(name, you).catch(() => {});
    nav("/", { replace: true });
    setBusy(false);
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
      <div><h1 className="text-3xl font-bold">Create your business</h1><p className="mt-1 text-muted">Your business and your owner account are created together. Staff you invite later join this business only.</p></div>
      <Card className="space-y-4">
        <Errors list={errors} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Business name</span><input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" placeholder="e.g. Mama Njeri's Duka" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Your name</span><input className={fieldCls} value={you} onChange={(e) => setYou(e.target.value)} autoComplete="off" placeholder="e.g. Njeri" /><span className="mt-1 block text-xs text-muted">Sales and counts on this phone are recorded under this name.</span></label>
        <button disabled={busy} onClick={go} className={`${btnPrimary} w-full`}>{busy ? "Creating business…" : "Create business"}</button>
      </Card>
      <p className="text-center text-sm text-muted">Have an account already? <a onClick={(e) => { e.preventDefault(); nav("/sign-in"); }} className="font-semibold text-pdark underline">Sign in</a></p>
    </main>
  );
}
