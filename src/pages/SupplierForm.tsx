import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Card, Empty, Errors, btnGhost, btnPrimary, fieldCls } from "../components/ui";

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}</label>;
const MANAGE: Permission = "manage.purchases";

export default function SupplierForm({ mode }: { mode: "new" | "edit" }) {
  const { state, createSupplier, updateSupplier } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const { id } = useParams();
  const nav = useNavigate();
  const canManage = permissions.can(auth.role, MANAGE);
  const sup = mode === "edit" ? state?.SUP.find((s) => s.id === id) : undefined;
  const [f, setF] = useState({ name: sup?.name ?? "", contact: sup?.contact ?? "", phone: sup?.phone ?? "", email: sup?.email ?? "", location: sup?.location ?? "", notes: sup?.notes ?? "" });
  const [errors, setErrors] = useState<string[]>([]);
  if (!state) return <p className="text-muted">Loading…</p>;
  if (!canManage) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold sm:text-3xl">{mode === "new" ? "Add supplier" : `Edit ${sup?.name ?? "supplier"}`}</h1>
        <Card className="space-y-2"><p>Your role ({auth.role ?? "none"}) can't create or change suppliers. Suppliers are limited to the Owner and Manager.</p>
          <Link to="/purchases" className={btnGhost}>Back to purchases</Link></Card>
      </div>
    );
  }
  if (mode === "edit" && !sup) return <Card><Empty title="Supplier not found" hint="It may have been deleted." /><Link to="/purchases" className={btnGhost}>Back to purchases</Link></Card>;
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    const r = mode === "new" ? await createSupplier(f) : await updateSupplier(sup!.id, f);
    if (!r.ok) { setErrors(r.errors); return; }
    nav(`/purchases/suppliers/${r.value.supplier.id}`);
  };
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{mode === "new" ? "Add supplier" : `Edit ${sup!.name}`}</h1>
      <Errors list={errors} />
      <Card className="space-y-4">
        <Field label="Supplier name"><input className={fieldCls} value={f.name} onChange={set("name")} autoFocus /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact person (optional)"><input className={fieldCls} value={f.contact} onChange={set("contact")} /></Field>
          <Field label="Phone (optional)"><input className={fieldCls} value={f.phone} onChange={set("phone")} inputMode="tel" /></Field>
          <Field label="Email (optional)"><input className={fieldCls} value={f.email} onChange={set("email")} inputMode="email" /></Field>
          <Field label="Location (optional)"><input className={fieldCls} value={f.location} onChange={set("location")} /></Field>
        </div>
        <Field label="Notes (optional)"><textarea className={`${fieldCls} min-h-24 py-2`} value={f.notes} onChange={set("notes")} /></Field>
      </Card>
      <div className="flex gap-2"><button onClick={() => void save()} className={btnPrimary}>{mode === "new" ? "Save supplier" : "Save changes"}</button>
        <Link to={sup ? `/purchases/suppliers/${sup.id}` : "/purchases"} className={btnGhost}>Cancel</Link></div>
    </div>
  );
}
