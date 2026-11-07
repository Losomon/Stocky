import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { DAY, purchaseStatus, purchaseTotal, supplierStats, type PurchaseStatus } from "../lib/engine";
import { kes, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Badge, Card, Empty, PurchaseBadge, btnPrimary, fieldCls } from "../components/ui";

const MANAGE: Permission = "manage.purchases";

export default function Purchases() {
  const { state } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const canManage = permissions.can(auth.role, MANAGE);
  const [tab, setTab] = useState<"purchases" | "suppliers">("purchases");
  const [q, setQ] = useState(""), [status, setStatus] = useState(""), [range, setRange] = useState(""), [archived, setArchived] = useState(false);
  const rows = useMemo(() => {
    if (!state) return [];
    const sup = new Map(state.SUP.map((s) => [s.id, s]));
    const now = Date.now();
    return [...state.PU].sort((a, b) => b.ts - a.ts).map((p) => ({
      p, supplier: sup.get(p.supplierId), st: purchaseStatus(p, state.PI, state.RC, state.RI),
      total: purchaseTotal(state.PI.filter((i) => i.purchaseId === p.id)),
    })).filter((r) => (!status || r.st === (status as PurchaseStatus)) && (!range || now - r.p.ts <= Number(range) * DAY)
      && `${r.p.ref} ${r.supplier?.name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  }, [state, q, status, range]);
  if (!state) return <p className="text-muted">Loading purchases…</p>;
  const sups = state.SUP.filter((s) => s.archived === archived && s.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Purchases</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Purchases view">
            {(["purchases", "suppliers"] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-lg px-4 font-semibold capitalize ${tab === t ? "bg-soft text-pdark" : "text-muted"}`}>{t}</button>)}
          </div>
          {canManage ? (
            <Link to={tab === "purchases" ? "/purchases/new" : "/purchases/suppliers/new"} className={btnPrimary}><Plus size={20} />{tab === "purchases" ? "New purchase" : "Add supplier"}</Link>
          ) : (
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted" disabled><Plus size={20} />{tab === "purchases" ? "New purchase" : "Add supplier"}</button>
          )}
          {!canManage && <span className="text-xs text-muted">View only: purchases require the Owner or Manager role.</span>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-12 min-w-48 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" placeholder={tab === "purchases" ? "Search reference or supplier" : "Search suppliers"} className="flex-1 bg-transparent text-ink outline-none" /></label>
        {tab === "purchases" ? <>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={`${fieldCls} w-auto`}><option value="">Any status</option><option value="draft">Draft</option><option value="ordered">Ordered</option><option value="partial">Partially received</option><option value="received">Received</option><option value="cancelled">Cancelled</option></select>
          <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date" className={`${fieldCls} w-auto`}><option value="">Any date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
        </> : <label className="flex min-h-12 items-center gap-2 px-1 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5" />Archived</label>}
      </div>

      {tab === "purchases" && <Card>
        {rows.length === 0 ? <Empty title={state.PU.length === 0 ? "No purchases yet" : "No purchases match"} hint={state.PU.length === 0 ? "Create a purchase to order stock from a supplier." : "Try a different search or filter."} /> : (
          <ul className="divide-y divide-line">
            {rows.map(({ p, supplier, st, total }) => (
              <li key={p.id}><Link to={`/purchases/${p.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                <span className="min-w-0"><span className="block font-semibold">{p.ref}</span>
                  <span className="block truncate text-sm text-muted">{supplier?.name ?? "Unknown supplier"}{supplier?.archived ? " (archived)" : ""} · {when(p.ts)}</span></span>
                <span className="shrink-0 text-right"><span className="block font-semibold">{kes(total)}</span><span className="mt-1 block"><PurchaseBadge status={st} /></span></span>
              </Link></li>
            ))}
          </ul>)}
      </Card>}

      {tab === "suppliers" && <Card>
        {sups.length === 0 ? <Empty title={state.SUP.length === 0 ? "No suppliers yet" : "No suppliers match"} hint="Suppliers are the people you buy stock from." /> : (
          <ul className="divide-y divide-line">
            {sups.map((s) => { const st = supplierStats(s.id, state.PU, state.PI, state.RC, state.RI); return (
              <li key={s.id}><Link to={`/purchases/suppliers/${s.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                <span className="min-w-0"><span className="block truncate font-medium">{s.name}</span><span className="block truncate text-sm text-muted">{[s.contact, s.phone].filter(Boolean).join(" · ") || "No contact details"}</span></span>
                <span className="shrink-0 text-right">{s.archived && <Badge tone="muted">Archived</Badge>}<span className="block text-sm text-muted">{st.count} {st.count === 1 ? "purchase" : "purchases"}</span><span className="block font-semibold">{kes(st.received)}</span></span>
              </Link></li>); })}
          </ul>)}
      </Card>}
    </div>
  );
}
