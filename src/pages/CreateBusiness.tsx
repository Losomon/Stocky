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
  const [name, setName] = useState(auth.business?.name ?? "");
  const [you, setYou] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pendingBusinessId, setPendingBusinessId] = useState<string | null>(null);
  const [deviceSetupDone, setDeviceSetupDone] = useState(false);

  const go = async () => {
    setErrors([]);
    setBusy(true);
    const targetBusinessId = auth.businessId ?? pendingBusinessId;
    if (targetBusinessId) {
      setBusinessId(targetBusinessId);
      if (!deviceSetupDone) {
        const setup = await stock.completeSetup(name, you);
        if (!setup.ok) { setBusy(false); setErrors(setup.errors); return; }
        setDeviceSetupDone(true);
      }
      if (!auth.businessId) {
        try { await auth.setActiveBusiness(targetBusinessId); }
        catch (e) { setBusy(false); setErrors([e instanceof Error ? `Business created, but it could not be selected: ${e.message}` : "Business created, but it could not be selected."]); return; }
      }
      nav("/", { replace: true });
      return;
    }
    const created = await createBusiness(name);
    if (!created.ok) { setBusy(false); setErrors([created.error]); return; }
    setPendingBusinessId(created.businessId);
    setBusinessId(created.businessId);
    const setup = await stock.completeSetup(name, you);
    if (!setup.ok) {
      setBusy(false);
      setErrors(["Your business account was created, but this device could not finish local setup.", ...setup.errors]);
      return;
    }
    setDeviceSetupDone(true);
    try { await auth.setActiveBusiness(created.businessId); }
    catch (e) {
      setBusy(false);
      setErrors([e instanceof Error ? `Business created, but it could not be selected: ${e.message}` : "Business created, but it could not be selected."]);
      return;
    }
    nav("/", { replace: true });
    setBusy(false);
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg space-y-4 px-4 py-8 pt-[max(2rem,env(safe-area-inset-top))]">
      <p className="text-xl font-extrabold"><span className="text-primary">✦</span> {APP_NAME}</p>
      <div><h1 className="text-3xl font-bold">{auth.businessId ? "Set up this device" : "Create your business"}</h1><p className="mt-1 text-muted">{auth.businessId ? "Business records are still stored locally on this device. Set up the local workspace to continue." : "Your business and your owner account are created together. Staff you invite later join this business only."}</p></div>
      <Card className="space-y-4">
        <Errors list={errors} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Business name</span><input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} autoFocus autoComplete="off" placeholder="e.g. Mama Njeri's Duka" /></label>
        <label className="block"><span className="mb-1 block text-sm font-medium">Your name</span><input className={fieldCls} value={you} onChange={(e) => setYou(e.target.value)} autoComplete="off" placeholder="e.g. Njeri" /><span className="mt-1 block text-xs text-muted">Sales and counts on this phone are recorded under this name.</span></label>
        <button disabled={busy} onClick={go} className={`${btnPrimary} w-full`}>{busy ? "Saving…" : auth.businessId ? "Finish device setup" : "Create business"}</button>
      </Card>
      <p className="text-center text-sm text-muted">Have an account already? <a onClick={(e) => { e.preventDefault(); nav("/sign-in"); }} className="font-semibold text-pdark underline">Sign in</a></p>
    </main>
  );
}
