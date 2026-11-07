import { useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Download, Calendar } from "lucide-react";
import { totalsBetween, trend, topProducts, valueByCategory, type Books } from "../lib/analytics";
import { DAY, startOfDay } from "../lib/engine";
import { kes, n0, when } from "../lib/format";
import type { StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { permissions, type Permission } from "../lib/permissions";
import { Badge, Card, Empty, btnGhost, btnPrimary } from "../components/ui";

const VIEW: Permission = "view.reports";

export default function Reports() {
  const { state } = useOutletContext<StockCtx>();
  const auth = useAuth();
  const canView = permissions.can(auth.role, VIEW);
  if (!state) return <p className="text-muted">Loading reports…</p>;
  if (!canView) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold sm:text-3xl">Business report</h1>
        <Card className="space-y-2"><p>Your role ({auth.role ?? "none"}) can't view reports. Reports are available to the Owner and Manager.</p></Card>
      </div>
    );
  }
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const now = Date.now();
  const t0 = startOfDay(now);
  const defaultFrom = new Date(t0 - (period - 1) * DAY).toISOString().slice(0, 10);
  const defaultTo = new Date(t0).toISOString().slice(0, 10);
  const f = from || defaultFrom;
  const t = to || defaultTo;
  const fromTs = new Date(f).setHours(0, 0, 0, 0);
  const toTs = new Date(t).setHours(23, 59, 59, 999);
  const books: Books = { P: state.P, CAT: state.CAT, M: state.M, S: state.S, SI: state.SI, C: state.C, SUP: state.SUP, PU: state.PU, PI: state.PI, RC: state.RC, RI: state.RI };
  const summary = totalsBetween(books, fromTs, toTs);
  const days = trend(books, period, new Date(t).getTime());
  const products = topProducts(books, period, new Date(t).getTime());
  const value = valueByCategory(books, new Date(t).getTime());
  const cash = state.SI.reduce((s, i) => { const sale = state.S.find((x) => x.id === i.saleId); if (sale && sale.status === "completed" && sale.payment === "cash" && sale.ts >= fromTs && sale.ts <= toTs) return s + i.qty * i.unitPrice; return s; }, 0);
  const mpesa = state.SI.reduce((s, i) => { const sale = state.S.find((x) => x.id === i.saleId); if (sale && sale.status === "completed" && sale.payment === "mpesa" && sale.ts >= fromTs && sale.ts <= toTs) return s + i.qty * i.unitPrice; return s; }, 0);
  const cogs = state.SI.reduce((s, i) => { const sale = state.S.find((x) => x.id === i.saleId); if (sale && sale.status === "completed" && sale.ts >= fromTs && sale.ts <= toTs) return s + i.qty * i.unitCost; return s; }, 0);
  const grossProfit = summary.sales - cogs;
  const txCount = state.S.filter((s) => s.status === "completed" && s.ts >= fromTs && s.ts <= toTs).length;
  const cancelled = state.S.filter((s) => s.status === "cancelled" && s.ts >= fromTs && s.ts <= toTs).length;
  const margin = summary.sales > 0 ? (grossProfit / summary.sales) * 100 : null;

  const exportCsv = () => {
    const lines: string[] = ["date,receipt,customer,payment,product,qty,unitPrice,unitCost,lineTotal"];
    const saleOf = new Map(state.S.map((s) => [s.id, s]));
    const nameOf = new Map(state.P.map((p) => [p.id, p.name]));
    const custOf = new Map(state.CUS.map((c) => [c.id, c.name]));
    for (const i of [...state.SI].sort((a, b) => (saleOf.get(a.saleId)?.ts ?? 0) - (saleOf.get(b.saleId)?.ts ?? 0))) {
      const s = saleOf.get(i.saleId);
      if (!s || s.status !== "completed" || s.ts < fromTs || s.ts > toTs) continue;
      const date = new Date(s.ts).toISOString().slice(0, 10);
      const row = [date, s.receiptNo, custOf.get(s.customerId ?? "") ?? "", s.payment, nameOf.get(i.productId) ?? "Unknown", i.qty, i.unitPrice, i.unitCost, i.qty * i.unitPrice];
      lines.push(row.map((v) => String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v)).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `stockly-sales-${f}-to-${t}.csv`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">Business report</h1>
          <p className="text-muted">{`${when(fromTs)} to ${when(toTs)}`} · {state.business.name}</p></div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="group" aria-label="Report range">
          <button onClick={() => { setPeriod(7); setFrom(""); setTo(""); }} className={`min-h-11 rounded-lg px-4 font-semibold ${period === 7 ? "bg-soft text-pdark" : "text-muted"}`}>7 days</button>
          <button onClick={() => { setPeriod(30); setFrom(""); setTo(""); }} className={`min-h-11 rounded-lg px-4 font-semibold ${period === 30 ? "bg-soft text-pdark" : "text-muted"}`}>30 days</button>
          <button onClick={() => { setPeriod(90); setFrom(""); setTo(""); }} className={`min-h-11 rounded-lg px-4 font-semibold ${period === 90 ? "bg-soft text-pdark" : "text-muted"}`}>90 days</button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4"><p className="text-sm text-muted">Total sales</p><p className="text-2xl font-bold">{kes(summary.sales)}</p><p className="text-xs text-muted">{txCount} {txCount === 1 ? "transaction" : "transactions"}{cancelled ? ` · ${cancelled} cancelled` : ""}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Cash</p><p className="text-2xl font-bold">{kes(cash)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">M-Pesa</p><p className="text-2xl font-bold">{kes(mpesa)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Units sold</p><p className="text-2xl font-bold">{n0(summary.units)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Cost of goods sold</p><p className="text-2xl font-bold">{kes(cogs)}</p></Card>
        <Card className="p-4"><p className="text-sm text-muted">Gross profit (estimated)</p><p className="text-2xl font-bold">{kes(grossProfit)}</p><p className="text-xs text-muted">{margin !== null ? margin.toFixed(0) + "% margin" : "—"}</p><p className="text-xs text-muted">Sales minus the cost recorded on each sale item. This is gross profit, not net profit — expenses such as rent, wages and transport must be subtracted before net profit can be worked out.</p></Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2 space-y-3">
          <h2 className="text-lg font-semibold">Sales by day</h2>
          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line"><th className="pb-3 text-muted">Day</th><th className="pb-3 text-muted text-right">Sales</th><th className="pb-3 text-muted text-right">Gross profit</th></tr></thead>
              <tbody>
                {days.points.map((p) => (
                  <tr key={p.ts} className="border-b border-line"><td className="py-3">{p.label}</td><td className="py-3 text-right font-semibold">{kes(p.sales)}</td><td className="py-3 text-right">{kes(p.profit)}</td></tr>
                ))}
                <tr className="font-semibold border-t border-line"><td className="pt-4 pb-3">Total</td><td className="pt-4 pb-3 text-right">{kes(days.totals.sales)}</td><td className="pt-4 pb-3 text-right">{kes(days.totals.profit)}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">Daily totals use each sale's recorded price; cancelled sales are excluded.</p>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-lg font-semibold">Top products</h2>
            <button onClick={() => void exportCsv()} className={btnGhost}><Download size={18} />Export sales CSV</button></div>
          {products.length === 0 ? <Empty title="No sales in this period" hint="Sales made in the selected date range will appear here." /> : (
            <div className="overflow-x-auto border border-line rounded-xl">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-line"><th className="pb-3 text-muted">Product</th><th className="pb-3 text-muted text-right">Units</th><th className="pb-3 text-muted text-right">Sales</th><th className="pb-3 text-muted text-right">Gross profit</th><th className="pb-3 text-muted text-right">Margin</th></tr></thead>
                <tbody>
                  {products.slice(0, 15).map((p) => (
                    <tr key={p.id} className="border-b border-line"><td className="py-3">{p.name}</td><td className="py-3 text-right">{n0(p.units)}</td><td className="py-3 text-right font-semibold">{kes(p.sales)}</td><td className="py-3 text-right">{kes(p.profit)}</td><td className="py-3 text-right">{p.margin !== null ? p.margin.toFixed(0) + "%" : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted">Best sellers by sales value in the period. Profit uses the cost recorded when each item was sold.</p>
        </Card>
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="lg:col-span-2 space-y-3">
          <h2 className="text-lg font-semibold">Stock valuation</h2>
          <p className="text-sm text-muted">Current stock valued at cost price. Stock is the sum of signed movements, so cancelled sales do not inflate it.</p>
          <div className="overflow-x-auto border border-line rounded-xl">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-line"><th className="pb-3 text-muted">Category</th><th className="pb-3 text-muted text-right">Products</th><th className="pb-3 text-muted text-right">Units</th><th className="pb-3 text-muted text-right">Value at cost</th></tr></thead>
              <tbody>
                {value.rows.map((r) => (
                  <tr key={r.name} className="border-b border-line"><td className="py-3">{r.name}</td><td className="py-3 text-right">{r.products}</td><td className="py-3 text-right">{n0(r.units)}</td><td className="py-3 text-right font-semibold">{kes(r.value)}</td></tr>
                ))}
                <tr className="font-semibold border-t border-line"><td className="pt-4 pb-3">Total</td><td className="pt-4 pb-3 text-right">{value.rows.reduce((a, r) => a + r.products, 0)}</td><td className="pt-4 pb-3 text-right">{n0(value.rows.reduce((a, r) => a + r.units, 0))}</td><td className="pt-4 pb-3 text-right">{kes(value.total)}</td></tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">How to read this report</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>Every figure covers <b>completed sales only</b> in the selected date range, for this business. Cancelled sales are excluded and return stock to inventory.</li>
          <li><b>Gross profit</b> is sales minus the cost of goods sold (the cost recorded on each sale item when it was sold). It is <b>not</b> net profit.</li>
          <li>Net profit = gross profit minus operating expenses (rent, wages, transport, packaging, etc.). Stockly does not track those expenses, so net profit cannot be calculated here.</li>
          <li>Cash and M-Pesa totals split completed sales by the payment method recorded at the till.</li>
          <li>Stock valuation uses current cost price per product multiplied by current on-hand stock.</li>
        </ul>
      </Card>
    </div>
  );
}
