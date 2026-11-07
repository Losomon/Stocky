import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { purchaseTotal } from "../lib/engine";
import { kes } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Card, Empty, Errors, btnGhost, btnPrimary, fieldCls } from "../components/ui";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
interface L { productId: string; qty: string; cost: string }
const MANAGE: Permission = "manage.purchases";

export default function PurchaseForm({ mode }: { mode: "new" | "edit" }) {
  const { state, createPurchase, updatePurchase, createSupplier } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const canManage = permissions.can(fromBusinessRole(auth.role), MANAGE);
  const existing = mode === "edit" ? state?.PU.find((p) => p.id === id) : undefined;
  if (!state) return <p className="text-muted">Loading…</p>;
  if (!canManage) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{mode === "new" ? "New purchase" : `Edit ${existing?.ref ?? "purchase"}`}</h1>
        <Card className="space-y-2"><p>Your role ({auth.role ?? "none"}) can't create or change purchases. Purchasing is limited to the Owner and Manager.</p>
          <Link to="/purchases" className={btnGhost}>Back to purchases</Link></Card>
      </div>
    );
  }
  if (mode === "edit" && (!existing || existing.status !== "draft" || state.RC.some((r) => r.purchaseId === existing.id)))
    return <Card><Empty title="This purchase can't be edited" hint="Only a draft purchase can be changed." /><Link to={existing ? `/purchases/${existing.id}` : "/purchases"} className={btnGhost}>Back</Link></Card>;

  const [supplierId, setSupplierId] = useState(existing?.supplierId ?? params.get("supplier") ?? "");
  const [lines, setLines] = useState<L[]>(() => existing && state ? state.PI.filter((i) => i.purchaseId === existing.id).map((i) => ({ productId: i.productId, qty: String(i.qty), cost: String(i.unitCost) })) : []);
  const [note, setNote] = useState(existing?.note ?? "");
  const [errors, setErrors] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false), [ns, setNs] = useState({ name: "", phone: "" });

  const name = new Map(state.P.map((p) => [p.id, p.name]));
  const setLine = (pid: string, k: "qty" | "cost", v: string) => setLines((ls) => ls.map((l) => (l.productId === pid ? { ...l, [k]: v } : l)));
  const available = state.P.filter((p) => !p.archived && !lines.some((l) => l.productId === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const total = purchaseTotal(lines.map((l) => ({ qty: num(l.qty) || 0, unitCost: num(l.cost) || 0 })));

  const addSupplier = async () => {
    const r = await createSupplier({ name: ns.name, phone: ns.phone });
    if (!r.ok) { setErrors(r.errors); return; }
    setSupplierId(r.value.supplier.id); setAdding(false); setNs({ name: "", phone: "" }); setErrors([]);
  };
  const save = async (status: "draft" | "ordered") => {
    setBusy(true);
    const input = { supplierId, note, lines: lines.map((l) => ({ productId: l.productId, qty: num(l.qty), unitCost: num(l.cost) })) };
    const r = mode === "new" ? await createPurchase(input, status) : await updatePurchase(existing!.id, input, status);
    setBusy(false);
    if (!r.ok) { setErrors(r.errors); window.scrollTo({ top: 0 }); return; }
    nav(`/purchases/${r.value.purchase.id}`);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{mode === "new" ? "New purchase" : `Edit ${existing!.ref}`}</h1>
      <Errors list={errors} />
      <Card className="space-y-3">
        <label className="block"><span className="mb-1 block text-sm font-medium">Supplier</span>
          <select className={fieldCls} value={supplierId} onChange={(e) => setSupplierId(e.target.value)}><option value="">Choose a supplier</option>
            {state.SUP.filter((s) => !s.archived).sort((a, b) => a.name.localeCompare(b.name)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {adding ? (
          <div className="flex flex-wrap gap-2 rounded-xl bg-bg p-3">
            <input className={`${fieldCls} flex-1`} placeholder="Supplier name" aria-label="New supplier name" value={ns.name} onChange={(e) => setNs({ ...ns, name: e.target.value })} />
            <input className={`${fieldCls} flex-1`} placeholder="Phone (optional)" aria-label="New supplier phone" inputMode="tel" value={ns.phone} onChange={(e) => setNs({ ...ns, phone: e.target.value })} />
            <button onClick={() => void addSupplier()} className={btnPrimary}>Add</button><button onClick={() => setAdding(false)} className={btnGhost}>Cancel</button>
          </div>
        ) : (
          canManage ? (
            <button onClick={() => setAdding(true)} className="min-h-11 text-sm font-semibold text-pdark">+ New supplier</button>
          ) : (
            <span className="min-h-11 inline-flex items-center text-sm font-semibold text-muted">Suppliers: Owner or Manager role required</span>
          )
        )}
      </Card>
      <Card>
        <h2 className="mb-2 text-lg font-semibold">Products</h2>
        {lines.length === 0 ? <p className="text-sm text-muted">Add the products you are buying.</p> : (
          <ul className="divide-y divide-line">
            {lines.map((l) => (
              <li key={l.productId} className="grid grid-cols-[1fr_auto] gap-2 py-3">
                <p className="font-medium">{name.get(l.productId)}</p>
                <button aria-label={`Remove ${name.get(l.productId)}`} onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))} className="grid size-11 place-items-center rounded-xl border border-line"><Trash2 size={18} /></button>
                <div className="col-span-2 flex flex-wrap items-end gap-2">
                  <label className="w-24"><span className="text-xs text-muted">Quantity</span><input className={fieldCls} inputMode="numeric" value={l.qty} onChange={(e) => setLine(l.productId, "qty", e.target.value)} /></label>
                  <label className="w-32"><span className="text-xs text-muted">Unit cost (KES)</span><input className={fieldCls} inputMode="decimal" value={l.cost} onChange={(e) => setLine(l.productId, "cost", e.target.value)} /></label>
                  <p className="ml-auto pb-3 font-semibold">{kes((num(l.qty) || 0) * (num(l.cost) || 0))}</p>
                </div>
              </li>))}
          </ul>)}
        <select className={`${fieldCls} mt-3`} aria-label="Add a product" value="" onChange={(e) => { const p = state.P.find((x) => x.id === e.target.value); if (p) setLines((ls) => [...ls, { productId: p.id, qty: "1", cost: String(p.cost) }]); }}>
          <option value="">+ Add a product</option>{available.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <p className="mt-4 flex justify-between text-xl font-bold"><span>Total</span><span>{kes(total)}</span></p>
      </Card>
      <label className="block"><span className="mb-1 block text-sm font-medium">Note (optional)</span><textarea className={`${fieldCls} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <p className="text-sm text-muted">Saving a purchase does not change your stock. Stock goes up when you record what was actually delivered.</p>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void save("ordered")} className={btnPrimary}>Save and mark as ordered</button>
        <button disabled={busy} onClick={() => void save("draft")} className={btnGhost}>Save as draft</button>
        <Link to={existing ? `/purchases/${existing.id}` : "/purchases"} className={btnGhost}>Cancel</Link>
      </div>
    </div>
  );
}
