import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { AlertTriangle, Check } from "lucide-react";
import { hasHistory, inventory } from "../lib/engine";
import { MOVE_LABEL, kes, qtyText, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Badge, Card, Empty, btnGhost, btnPrimary } from "../components/ui";

const STATUS = { ok: "In stock", low: "Low stock", out: "Out of stock" } as const;
const MANAGE: Permission = "manage.products";

export default function ProductDetail() {
  const { state, setArchived, deleteProduct } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const canManage = permissions.can(auth.role, MANAGE);
  const [errors, setErrors] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);
  const p = state?.P.find((x) => x.id === id);
  const item = useMemo(() => (state && p ? inventory([p], state.M, new Set(state.S.filter((s) => s.status === "cancelled").map((s) => s.id)))[0] : null), [state, p]);
  if (!state) return <p className="text-muted">Loading…</p>;
  if (!p || !item) return <Card><Empty title="Product not found" hint="It may have been deleted." /><Link to="/products" className={btnGhost}>Back to products</Link></Card>;

  const cat = state.CAT.find((c) => c.id === p.categoryId)?.name ?? "No category";
  const moves = state.M.filter((m) => m.productId === p.id).sort((a, b) => b.ts - a.ts).slice(0, 10);
  const saleOf = new Map(state.S.map((s) => [s.id, s]));
  const sales = state.SI.filter((i) => i.productId === p.id).map((i) => ({ i, s: saleOf.get(i.saleId)! })).filter((x) => x.s).sort((a, b) => b.s.ts - a.s.ts).slice(0, 8);
  const history = hasHistory(p.id, state.M, state.SI, state.C);
  const stats: [string, string][] = [["Current stock", `${item.stock} ${p.unit}${item.stock === 1 ? "" : "s"}`], ["Stock value", kes(item.value)], ["Selling price", kes(p.price)], ["Cost price", kes(p.cost)], ["Minimum stock", String(p.min)], ["Margin per unit", kes(p.price - p.cost)]];
  const act = async (r: Promise<{ ok: boolean; errors?: string[] }>, then?: () => void) => { const x = await r; if (!x.ok) setErrors(x.errors ?? []); else { setErrors([]); then?.(); } };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><Link to="/products" className="text-sm font-semibold text-pdark">← Products</Link>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">{p.name}</h1>
          <p className="text-muted">{p.sku} · {cat}{p.barcode ? ` · ${p.barcode}` : ""}</p></div>
        {p.archived ? <Badge tone="muted">Archived</Badge> : item.status === "ok" ? <Badge tone="ok"><Check size={14} />{STATUS.ok}</Badge> : <Badge tone="bad"><AlertTriangle size={14} />{STATUS[item.status]}</Badge>}
      </div>
      {p.description && <p className="text-muted">{p.description}</p>}
      {errors.length > 0 && <ul role="alert" className="space-y-1 rounded-xl border border-bad p-3 text-sm text-bad">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {stats.map(([k, v]) => <div key={k} className="rounded-2xl border border-line bg-surface p-4"><p className="text-sm text-muted">{k}</p><p className="text-xl font-bold">{v}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-2">
        {canManage ? (
          <>
            <Link to={`/products/${p.id}/edit`} className={btnPrimary}>Edit</Link>
            <button onClick={() => void act(setArchived(p.id, !p.archived))} className={btnGhost}>{p.archived ? "Restore" : "Archive"}</button>
            {history ? <span className="self-center text-sm text-muted">Has history, so it can be archived but not deleted.</span>
              : confirm ? <><button onClick={() => void act(deleteProduct(p.id), () => nav("/products"))} className={btnPrimary}>Yes, delete</button><button onClick={() => setConfirm(false)} className={btnGhost}>Keep</button></>
              : <button onClick={() => setConfirm(true)} className={btnGhost}>Delete</button>}
          </>
        ) : (
          <>
            <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted">Edit</span>
            <span className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted">{p.archived ? "Restore" : "Archive"}</span>
            <span className="text-xs text-muted">Product changes require the Owner or Manager role.</span>
          </>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 text-lg font-semibold">Recent movements</h2>
          {moves.length === 0 ? <Empty title="No movements yet" hint="Stock changes will appear here." /> : <ul className="divide-y divide-line">{moves.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 py-3"><span><span className="block font-medium">{MOVE_LABEL[m.type]} {qtyText(m.type, m.qty)}</span><span className="text-sm text-muted">{m.staff} · {when(m.ts)}{m.reason ? ` · ${m.reason}` : ""}</span></span></li>))}</ul>}
        </Card>
        <Card><h2 className="mb-2 text-lg font-semibold">Recent sales</h2>
          {sales.length === 0 ? <Empty title="No sales yet" hint="Sales of this product will appear here." /> : <ul className="divide-y divide-line">{sales.map(({ i, s }) => (
            <li key={`${s.id}-${i.id}`} className="flex items-center justify-between gap-3 py-3"><span><span className="block font-medium">{s.receiptNo} {s.status === "cancelled" && <Badge tone="muted">Cancelled</Badge>}</span><span className="text-sm text-muted">{s.staff} · {when(s.ts)}</span></span>
              <span className="text-right text-sm">{i.qty} × {kes(i.unitPrice)}</span></li>))}</ul>}
        </Card>
      </div>
    </div>
  );
}
