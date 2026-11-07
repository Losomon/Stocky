import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { UNITS, validateProduct, type ProductInput } from "../lib/engine";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Card, Empty, btnGhost, btnPrimary } from "../components/ui";

const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const input = "min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base";
const MANAGE: Permission = "manage.products";
const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) =>
  <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}</label>;

export default function ProductForm({ mode }: { mode: "new" | "edit" }) {
  const { state, createProduct, updateProduct } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const canManage = permissions.can(auth.role, MANAGE);
  const existing = mode === "edit" ? state?.P.find((p) => p.id === id) : undefined;
  if (!state) return <p className="text-muted">Loading…</p>;
  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{mode === "new" ? "Add product" : `Edit ${existing?.name ?? "product"}`}</h1>
        <Card className="space-y-2"><p>Your role ({auth.role ?? "none"}) can't create or change products. Product management is limited to the Owner and Manager.</p>
          <Link to="/products" className={btnGhost}>Back to products</Link></Card>
      </div>
    );
  }
  if (mode === "edit" && !existing) return <Card><Empty title="Product not found" hint="It may have been deleted." /><Link to="/products" className={btnGhost}>Back to products</Link></Card>;
  const [f, setF] = useState(() => ({
    name: existing?.name ?? "", sku: existing?.sku ?? "", categoryId: existing?.categoryId ?? "", unit: existing?.unit ?? "piece",
    cost: existing ? String(existing.cost) : "", price: existing ? String(existing.price) : "", min: existing ? String(existing.min) : "0",
    opening: "", barcode: existing?.barcode ?? "", description: existing?.description ?? "",
  }));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  const parsed: ProductInput = { name: f.name, sku: f.sku, categoryId: f.categoryId || undefined, unit: f.unit, cost: num(f.cost), price: num(f.price), min: num(f.min), barcode: f.barcode, description: f.description, openingStock: mode === "new" && f.opening.trim() !== "" ? num(f.opening) : undefined };
  const warnings = validateProduct(parsed, state.P, state.CAT, existing?.id, mode === "new").warnings;
  const submit = async () => {
    setBusy(true);
    const r = mode === "new" ? await createProduct(parsed) : await updateProduct(existing!.id, parsed);
    setBusy(false);
    if (!r.ok) { setErrors(r.errors); window.scrollTo({ top: 0 }); return; }
    nav(`/products/${r.value.product.id}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{mode === "new" ? "Add product" : `Edit ${existing!.name}`}</h1>
      {errors.length > 0 && <ul role="alert" className="space-y-1 rounded-xl border border-bad p-3 text-sm text-bad">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <Card className="space-y-4">
        <Field label="Product name"><input className={input} value={f.name} onChange={set("name")} placeholder="Coca-Cola 500ml" autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SKU" hint="A short code, unique to this product."><input className={input} value={f.sku} onChange={set("sku")} placeholder="COKE500" /></Field>
          <Field label="Barcode (optional)"><input className={input} value={f.barcode} onChange={set("barcode")} inputMode="numeric" /></Field>
          <Field label="Category (optional)"><select className={input} value={f.categoryId} onChange={set("categoryId")}><option value="">No category</option>{state.CAT.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Unit" hint="Sold in whole units only."><select className={input} value={f.unit} onChange={set("unit")}>{UNITS.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}</select></Field>
          <Field label="Cost price (KES)"><input className={input} value={f.cost} onChange={set("cost")} inputMode="decimal" placeholder="45" /></Field>
          <Field label="Selling price (KES)"><input className={input} value={f.price} onChange={set("price")} inputMode="decimal" placeholder="60" /></Field>
          <Field label="Minimum stock" hint="You'll be warned at or below this."><input className={input} value={f.min} onChange={set("min")} inputMode="numeric" /></Field>
          {mode === "new" && <Field label="Opening stock (optional)" hint="What is on the shelf now."><input className={input} value={f.opening} onChange={set("opening")} inputMode="numeric" placeholder="0" /></Field>}
        </div>
        <Field label="Description (optional)"><textarea className={`${input} min-h-24 py-2`} value={f.description} onChange={set("description")} /></Field>
        {warnings.map((w) => <p key={w} role="status" className="rounded-xl border border-warn p-3 text-sm text-warn">{w}</p>)}
        {mode === "edit" && <p className="text-sm text-muted">Changing the price only affects future sales. Past sales keep the price they were made at. To change stock, use a stock count.</p>}
      </Card>
      <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void submit()} className={btnPrimary}>{busy ? "Saving…" : mode === "new" ? "Save product" : "Save changes"}</button>
        <Link to={existing ? `/products/${existing.id}` : "/products"} className={btnGhost}>Cancel</Link>
      </div>
    </div>
  );
}
