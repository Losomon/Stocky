import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { hasPurchases, purchaseStatus, purchaseTotal, supplierStats } from "../lib/engine";
import { kes, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Badge, Card, Empty, Errors, PurchaseBadge, btnGhost, btnPrimary } from "../components/ui";

const MANAGE: Permission = "manage.purchases";

export default function SupplierDetail() {
  const { state, setSupplierArchived, deleteSupplier } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const canManage = permissions.can(fromBusinessRole(auth.role), MANAGE);
  const [errors, setErrors] = useState<string[]>([]), [confirm, setConfirm] = useState(false);
  if (!state) return <p className="text-muted">Loading…</p>;
  const s = state.SUP.find((x) => x.id === id);
  if (!s) return <Card><Empty title="Supplier not found" hint="It may have been deleted." /><Link to="/purchases" className={btnGhost}>Back to purchases</Link></Card>;
  const stats = supplierStats(s.id, state.PU, state.PI, state.RC, state.RI);
  const mine = state.PU.filter((p) => p.supplierId === s.id).sort((a, b) => b.ts - a.ts);
  const history = hasPurchases(s.id, state.PU);
  const act = async (r: Promise<{ ok: boolean; errors?: string[] }>, then?: () => void) => { const x = await r; if (!x.ok) setErrors(x.errors ?? []); else { setErrors([]); then?.(); } };
  const info: [string, string | undefined][] = [["Contact", s.contact], ["Phone", s.phone], ["Email", s.email], ["Location", s.location]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link to="/purchases" className="text-sm font-semibold text-pdark">← Purchases</Link><h1 className="mt-1 text-2xl font-bold sm:text-3xl">{s.name}</h1></div>
        {s.archived && <Badge tone="muted">Archived</Badge>}
      </div>
      <Errors list={errors} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[["Purchases", String(stats.count)], ["Total ordered", kes(stats.ordered)], ["Total received", kes(stats.received)]].map(([k, v]) => <div key={k} className="rounded-2xl border border-line bg-surface p-4"><p className="text-sm text-muted">{k}</p><p className="text-xl font-bold">{v}</p></div>)}
      </div>
      <Card>
        <dl className="grid gap-3 sm:grid-cols-2">{info.map(([k, v]) => <div key={k}><dt className="text-sm text-muted">{k}</dt><dd>{v || "—"}</dd></div>)}</dl>
        {s.notes && <p className="mt-3 text-sm text-muted">{s.notes}</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        {!s.archived && canManage && <Link to={`/purchases/new?supplier=${s.id}`} className={btnPrimary}>New purchase</Link>}
        {canManage ? (
          <>
            <Link to={`/purchases/suppliers/${s.id}/edit`} className={btnGhost}>Edit</Link>
            <button onClick={() => void act(setSupplierArchived(s.id, !s.archived))} className={btnGhost}>{s.archived ? "Restore" : "Archive"}</button>
            {history ? <span className="self-center text-sm text-muted">Has purchase history, so it can be archived but not deleted.</span>
              : confirm ? <><button onClick={() => void act(deleteSupplier(s.id), () => nav("/purchases"))} className={btnPrimary}>Yes, delete</button><button onClick={() => setConfirm(false)} className={btnGhost}>Keep</button></>
              : <button onClick={() => setConfirm(true)} className={btnGhost}>Delete</button>}
          </>
        ) : (
          <>
            <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted">Edit</span>
            <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted">{s.archived ? "Restore" : "Archive"}</span>
            <span className="text-xs text-muted">Supplier changes require the Owner or Manager role.</span>
          </>
        )}
      </div>
      <Card><h2 className="mb-2 text-lg font-semibold">Purchase history</h2>
        {mine.length === 0 ? <Empty title="No purchases yet" hint="Purchases from this supplier will appear here." /> : (
          <ul className="divide-y divide-line">{mine.map((p) => (
            <li key={p.id}><Link to={`/purchases/${p.id}`} className="flex min-h-14 items-center justify-between gap-3 py-3"><span><span className="block font-semibold">{p.ref}</span><span className="text-sm text-muted">{when(p.ts)}</span></span>
              <span className="text-right"><span className="block font-semibold">{kes(purchaseTotal(state.PI.filter((i) => i.purchaseId === p.id)))}</span><PurchaseBadge status={purchaseStatus(p, state.PI, state.RC, state.RI)} /></span></Link></li>))}</ul>)}
      </Card>
    </div>
  );
}
