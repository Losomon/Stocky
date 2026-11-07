import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { Check } from "lucide-react";
import { purchaseLines, purchaseStatus, purchaseTotal } from "../lib/engine";
import { kes, when } from "../lib/format";
import { uid, type StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Card, Empty, Errors, PurchaseBadge, btnGhost, btnPrimary, fieldCls } from "../components/ui";

const MANAGE: Permission = "manage.purchases";

export default function PurchaseDetail() {
  const { state, orderPurchase, cancelPurchase, receivePurchase } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { id } = useParams();
  const canManage = permissions.can(auth.role, MANAGE);
  const [errors, setErrors] = useState<string[]>([]), [msg, setMsg] = useState("");
  const [recv, setRecv] = useState(false), [qtys, setQtys] = useState<Record<string, string>>({}), [rid, setRid] = useState(uid), [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (!state) return <p className="text-muted">Loading…</p>;
  const p = state.PU.find((x) => x.id === id);
  if (!p) return <Card><Empty title="Purchase not found" hint="It may not exist on this device." /><Link to="/purchases" className={btnGhost}>Back to purchases</Link></Card>;

  const sup = state.SUP.find((s) => s.id === p.supplierId);
  const name = new Map(state.P.map((x) => [x.id, x.name]));
  const status = purchaseStatus(p, state.PI, state.RC, state.RI);
  const lines = purchaseLines(p, state.PI, state.RC, state.RI);
  const open = lines.filter((l) => l.outstanding > 0);
  const deliveries = state.RC.filter((r) => r.purchaseId === p.id).sort((a, b) => b.ts - a.ts);
  const canReceive = (status === "draft" || status === "ordered" || status === "partial") && open.length > 0;
  const act = async (r: Promise<{ ok: boolean; errors?: string[] }>, ok?: string) => { const x = await r; if (!x.ok) { setErrors(x.errors ?? []); setMsg(""); } else { setErrors([]); setMsg(ok ?? ""); } };

  const confirm = async () => {
    setBusy(true);
    const got = open.map((l) => ({ productId: l.productId, qty: (qtys[l.productId] ?? "").trim() === "" ? 0 : Number(qtys[l.productId]) }));
    const r = await receivePurchase(p.id, rid, got);
    setBusy(false);
    if (!r.ok) { setErrors(r.errors); setMsg(""); return; }
    setErrors([]); setMsg(`Stock received: ${got.reduce((s, g) => s + g.qty, 0)} units added.`); setRecv(false); setQtys({}); setRid(uid());
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link to="/purchases" className="text-sm font-semibold text-pdark">← Purchases</Link>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{p.ref}</h1>
          <p className="text-muted">{sup ? <Link to={`/purchases/suppliers/${sup.id}`} className="font-semibold text-pdark">{sup.name}</Link> : "Unknown supplier"}{sup?.archived ? " (archived)" : ""} · {when(p.ts)} · {p.staff}</p></div>
        <PurchaseBadge status={status} />
      </div>
      {msg && <p role="status" className="flex items-center gap-2 rounded-xl border border-ok p-3 font-medium text-ok"><Check size={18} />{msg}</p>}
      <Errors list={errors} />
      {p.note && <p className="text-muted">{p.note}</p>}
      <Card>
        <ul className="divide-y divide-line">
          {lines.map((l) => (
            <li key={l.productId} className="flex items-center justify-between gap-3 py-3">
              <span className="min-w-0"><span className="block font-medium">{name.get(l.productId)}</span><span className="text-sm text-muted">{l.ordered} ordered · {l.received} received · {l.outstanding} outstanding</span></span>
              <span className="shrink-0 text-right text-sm"><span className="block font-semibold">{kes(l.ordered * l.unitCost)}</span><span className="text-muted">{l.ordered} × {kes(l.unitCost)}</span></span>
            </li>))}
        </ul>
        <p className="mt-3 flex justify-between text-xl font-bold"><span>Total</span><span>{kes(purchaseTotal(lines.map((l) => ({ qty: l.ordered, unitCost: l.unitCost }))))}</span></p>
      </Card>

      {recv && canReceive && canManage && (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Record delivery</h2>
            <button onClick={() => setQtys(Object.fromEntries(open.map((l) => [l.productId, String(l.outstanding)])))} className="min-h-11 text-sm font-semibold text-pdark">Fill all outstanding</button></div>
          <p className="text-sm text-muted">Enter what actually arrived. Leave blank for items that didn't.</p>
          <ul className="divide-y divide-line">
            {open.map((l) => (
              <li key={l.productId} className="flex items-center justify-between gap-3 py-3"><span className="min-w-0"><span className="block font-medium">{name.get(l.productId)}</span><span className="text-sm text-muted">{l.outstanding} outstanding</span></span>
                <input className={`${fieldCls} w-24 text-center`} inputMode="numeric" aria-label={`Received quantity for ${name.get(l.productId)}`} placeholder="0" value={qtys[l.productId] ?? ""} onChange={(e) => setQtys({ ...qtys, [l.productId]: e.target.value })} /></li>))}
          </ul>
          <div className="flex gap-2"><button disabled={busy} onClick={() => void confirm()} className={btnPrimary}>{busy ? "Saving…" : "Confirm delivery"}</button><button onClick={() => { setRecv(false); setErrors([]); }} className={btnGhost}>Cancel</button></div>
        </Card>)}

      <div className="flex flex-wrap items-center gap-2">
        {canReceive && !recv && canManage && <button onClick={() => { setRecv(true); setMsg(""); }} className={btnPrimary}>Receive stock</button>}
        {canReceive && !recv && !canManage && <span className="text-xs text-muted">Receiving stock requires the Owner or Manager role.</span>}
        {status === "draft" && canManage && <><Link to={`/purchases/${p.id}/edit`} className={btnGhost}>Edit draft</Link><button onClick={() => void act(orderPurchase(p.id), "Marked as ordered.")} className={btnGhost}>Mark as ordered</button></>}
        {status === "draft" && !canManage && <span className="text-xs text-muted">Purchase changes require the Owner or Manager role.</span>}
        {(status === "draft" || status === "ordered") && canManage && (confirmCancel
          ? <><button onClick={() => void act(cancelPurchase(p.id), "Purchase cancelled.").then(() => setConfirmCancel(false))} className={btnPrimary}>Yes, cancel purchase</button><button onClick={() => setConfirmCancel(false)} className={btnGhost}>Keep</button></>
          : <button onClick={() => setConfirmCancel(true)} className={btnGhost}>Cancel purchase</button>)}
        {(status === "draft" || status === "ordered") && !canManage && <span className="text-xs text-muted">Cancelling a purchase requires the Owner or Manager role.</span>}
        {status === "partial" && <span className="text-sm text-muted">Part of this purchase has been received, so it can't be cancelled.</span>}
      </div>

      <Card><h2 className="mb-2 text-lg font-semibold">Deliveries</h2>
        {deliveries.length === 0 ? <Empty title="Nothing received yet" hint="Each delivery you record will be listed here." /> : (
          <ul className="divide-y divide-line">{deliveries.map((r) => (
            <li key={r.id} className="py-3"><p className="font-medium">{when(r.ts)} · {r.staff}</p>
              <p className="text-sm text-muted">{state.RI.filter((i) => i.receiptId === r.id).map((i) => `${name.get(i.productId)} × ${i.qty}`).join(", ")}</p></li>))}</ul>)}
      </Card>
    </div>
  );
}
