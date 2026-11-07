import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Calendar, Filter, Search, User } from "lucide-react";
import { when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { fromBusinessRole } from "../lib/permissions";
import { Badge, Card, Empty, btnGhost } from "../components/ui";

const ACTION_LABEL: Record<string, string> = {
  "sale.created": "Sale recorded",
  "sale.cancelled": "Sale cancelled",
  "stock.counted": "Stock counted",
  "product.created": "Product added",
  "product.updated": "Product edited",
  "product.price_changed": "Price changed",
  "product.cost_changed": "Cost changed",
  "product.archived": "Product archived",
  "product.restored": "Product restored",
  "product.deleted": "Product deleted",
  "category.created": "Category added",
  "category.renamed": "Category renamed",
  "category.deleted": "Category deleted",
  "supplier.created": "Supplier added",
  "supplier.updated": "Supplier edited",
  "supplier.archived": "Supplier archived",
  "supplier.restored": "Supplier restored",
  "supplier.deleted": "Supplier deleted",
  "customer.created": "Customer added",
  "customer.updated": "Customer edited",
  "customer.archived": "Customer archived",
  "customer.restored": "Customer restored",
  "customer.deleted": "Customer deleted",
  "staff.added": "Person added",
  "staff.archived": "Person archived",
  "staff.restored": "Person restored",
  "staff.deleted": "Person deleted",
  "device.user_changed": "Device user switched",
  "business.created": "Business set up",
  "business.updated": "Business details changed",
  "purchase.drafted": "Purchase drafted",
  "purchase.ordered": "Purchase ordered",
  "purchase.edited": "Purchase edited",
  "purchase.received": "Stock received",
  "purchase.cancelled": "Purchase cancelled",
};

export default function AuditLog() {
  const { state } = useOutletContext<StockCtx>();
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  if (!state) return <p className="text-muted">Loading activity…</p>;
  const auth = useAuth();
  if (!["owner", "manager"].includes(fromBusinessRole(auth.role) ?? "worker")) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Audit log</h1>
        <Card className="space-y-2"><p>Your role ({auth.role ?? "none"}) can't view the audit log. It is available to the Owner and Manager.</p></Card>
      </div>
    );
  }
  const start = from ? new Date(from).setHours(0, 0, 0, 0) : null;
  const end = to ? new Date(to).setHours(23, 59, 59, 999) : null;
  const actors = [...new Map([...state.audit].map((e) => [e.staff, e.staff])).keys()].sort();
  const rows = state.audit
    .slice()
    .sort((a, b) => b.ts - a.ts)
    .filter((e) => {
      if (q && `${e.action} ${e.entity} ${e.entityId}`.toLowerCase().includes(q.trim().toLowerCase()) === false) return false;
      if (actor && e.staff !== actor) return false;
      if (start && e.ts < start) return false;
      if (end && e.ts > end) return false;
      return true;
    });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">Audit log</h1>
          <p className="text-muted">Who did what, and when. Records cannot be edited or deleted.</p></div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Audit log filters"><Filter size={20} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search audit log" placeholder="Search action, entity or staff" className="flex-1 bg-transparent text-ink outline-none" /></label>
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><User size={18} /><input value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter by staff" placeholder="Staff member" className="flex-1 bg-transparent text-ink outline-none" /></label>
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><Calendar size={18} /><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className="flex-1 bg-transparent text-ink outline-none" /></label>
        <label className="flex min-h-12 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-muted"><Calendar size={18} /><input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className="flex-1 bg-transparent text-ink outline-none" /></label>
      </div>
      <p className="text-sm text-muted">{rows.length} entry{rows.length === 1 ? "" : "s"} shown</p>
      {rows.length === 0 ? <Empty title="No activity yet" hint="Actions taken here will appear in the audit log." /> : (
        <ul className="divide-y divide-line">
          {rows.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-full bg-soft font-bold text-pdark" aria-hidden>{e.staff.slice(0, 2).toUpperCase()}</span>
                <span className="font-medium">{e.staff}</span></p>
                <p className="text-sm text-muted">{ACTION_LABEL[e.action] ?? e.action}</p></div>
              <div className="text-right text-sm"><p className="font-semibold text-ink">{when(e.ts)}</p><p className="text-xs text-muted">{e.entity} · {e.entityId}</p>{e.oldValue !== undefined || e.newValue !== undefined ? <p className="text-xs text-muted mt-1">{e.oldValue !== undefined ? `before: ${e.oldValue}` : ""}{e.oldValue !== undefined && e.newValue !== undefined ? " → " : ""}{e.newValue !== undefined ? `after: ${e.newValue}` : ""}</p> : null}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
