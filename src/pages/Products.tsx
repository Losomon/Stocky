import { useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { AlertTriangle, Check, Plus, Search } from "lucide-react";
import { inventory, type Category } from "../lib/engine";
import { kes } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Badge, Card, Empty, btnGhost, btnPrimary } from "../components/ui";

const STATUS = { ok: "In stock", low: "Low stock", out: "Out of stock" } as const;
const field = "min-h-12 rounded-xl border border-line bg-surface px-3";
const MANAGE: Permission = "manage.products";

export default function Products() {
  const ctx = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { state } = ctx;
  const canManage = permissions.can(auth.role, MANAGE);
  const [tab, setTab] = useState<"products" | "categories">("products");
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [status, setStatus] = useState(""), [archived, setArchived] = useState(false);
  const inv = useMemo(() => (state ? inventory(state.P, state.M, new Set(state.S.filter((s) => s.status === "cancelled").map((s) => s.id))) : []), [state]);
  if (!state) return <p className="text-muted">Loading products…</p>;
  const catName = new Map(state.CAT.map((c) => [c.id, c.name]));
  const rows = inv.filter((i) => i.archived === archived && (!cat || (cat === "none" ? !i.categoryId : i.categoryId === cat)) && (!status || (status === "slow" ? i.slow : i.status === status))
    && `${i.name} ${i.sku} ${i.barcode ?? ""}`.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold sm:text-3xl">Products</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Products view">
            {(["products", "categories"] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`min-h-11 rounded-lg px-4 font-semibold capitalize ${tab === t ? "bg-soft text-pdark" : "text-muted"}`}>{t}</button>)}
          </div>
          {canManage ? (
            <Link to="/products/new" className={btnPrimary}><Plus size={20} />Add product</Link>
          ) : (
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted disabled:opacity-50" disabled><Plus size={20} />Add product</button>
          )}
          {!canManage && <span className="text-xs text-muted">View only: product changes require the Manager or Owner role.</span>}
        </div>
      </div>

      {tab === "products" && <>
        <div className="flex flex-wrap gap-2">
          <label className="flex min-h-12 min-w-48 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><Search size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search products" placeholder="Search name, SKU or barcode" className="flex-1 bg-transparent text-ink outline-none" /></label>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category" className={field}><option value="">All categories</option><option value="none">No category</option>{state.CAT.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status" className={field}><option value="">Any status</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="slow">Slow-moving</option></select>
          <label className="flex min-h-12 items-center gap-2 px-1 text-sm"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} className="size-5" />Archived</label>
        </div>
        <Card>
          {rows.length === 0 ? <Empty title={state.P.length === 0 ? "No products yet" : "No products match"} hint={state.P.length === 0 ? "Add your first product to start tracking stock." : "Try a different search or filter."} /> : (
            <ul className="divide-y divide-line">
              {rows.map((i) => (
                <li key={i.id}>
                  <Link to={`/products/${i.id}`} className="flex min-h-16 items-center justify-between gap-3 py-3">
                    <span className="min-w-0"><span className="block truncate font-medium">{i.name}</span>
                      <span className="block truncate text-sm text-muted">{i.sku} · {i.categoryId ? catName.get(i.categoryId) : "No category"}</span>
                      <span className="block text-sm text-muted">{kes(i.price)} · cost {kes(i.cost)}</span></span>
                    <span className="shrink-0 text-right"><span className="block text-xl font-bold">{i.stock}</span><span className="text-xs text-muted">min {i.min}</span>
                      <span className="mt-1 block">{i.archived ? <Badge tone="muted">Archived</Badge> : i.status === "ok" ? <Badge tone="ok"><Check size={14} />{STATUS.ok}</Badge> : <Badge tone="bad"><AlertTriangle size={14} />{STATUS[i.status]}</Badge>}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </>}

      {tab === "categories" && <Categories ctx={ctx} cats={state.CAT} usage={state.P.reduce((m, p) => (p.categoryId ? m.set(p.categoryId, (m.get(p.categoryId) ?? 0) + 1) : m), new Map<string, number>())} />}
    </div>
  );
}

function Categories({ ctx, cats, usage }: { ctx: StockCtx; cats: Category[]; usage: Map<string, number> }) {
  const auth = useAuth();
  const canManage = permissions.can(fromBusinessRole(auth.role), MANAGE);
  const [name, setName] = useState(""), [edit, setEdit] = useState<string | null>(null), [draft, setDraft] = useState(""), [errors, setErrors] = useState<string[]>([]);
  const run = async (r: Promise<{ ok: boolean; errors?: string[] }>, after?: () => void) => { const x = await r; if (!x.ok) setErrors(x.errors ?? []); else { setErrors([]); after?.(); } };
  return (
    <Card>
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="New category name" placeholder="New category, e.g. Beverages" className={`${field} min-w-48 flex-1`} />
        {canManage ? (
          <button onClick={() => void run(ctx.createCategory(name), () => setName(""))} className={btnPrimary}>Add category</button>
        ) : (
          <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 font-semibold text-muted" disabled>Add category</button>
        )}
      </div>
      {!canManage && <p className="mt-2 text-xs text-muted">View only: category changes require the Manager or Owner role.</p>}
      {errors.length > 0 && <ul role="alert" className="mt-3 space-y-1 rounded-xl border border-bad p-3 text-sm text-bad">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {cats.length === 0 ? <Empty title="No categories yet" hint="Categories group your products. They are optional." /> : (
        <ul className="mt-3 divide-y divide-line">
          {[...cats].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
              {edit === c.id ? (
                <div className="flex flex-1 flex-wrap gap-2"><input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Rename ${c.name}`} className={`${field} flex-1`} />
                  <button onClick={() => void run(ctx.renameCategory(c.id, draft), () => setEdit(null))} className={btnPrimary}>Save</button><button onClick={() => { setEdit(null); setErrors([]); }} className={btnGhost}>Cancel</button></div>
              ) : <>
                <span><span className="font-medium">{c.name}</span> <span className="text-sm text-muted">· {usage.get(c.id) ?? 0} {(usage.get(c.id) ?? 0) === 1 ? "product" : "products"}</span></span>
                <span className="flex gap-2">{canManage ? (
                  <>
                    <button onClick={() => { setEdit(c.id); setDraft(c.name); setErrors([]); }} className={btnGhost}>Rename</button>
                    <button onClick={() => void run(ctx.deleteCategory(c.id))} className={btnGhost}>Delete</button>
                  </>
                ) : (
                  <span className="text-xs text-muted">View only</span>
                )}</span></>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
