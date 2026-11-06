import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProductSales } from "../../lib/analytics";
import { n0 } from "../../lib/format";
import { Card, Empty } from "../ui";
import { Toggle, type Period } from "./ChartControls";

const KEYS = [["sales", "By sales"], ["profit", "By profit"], ["units", "By units"]] as const;
type Key = (typeof KEYS)[number][0];

export default function TopProducts({ rows, days, setDays }: { rows: ProductSales[]; days: Period; setDays: (d: Period) => void }) {
  const [key, setKey] = useState<Key>("sales");
  const top = [...rows].sort((a, b) => b[key] - a[key]).slice(0, 6), max = Math.max(1, ...top.map((r) => r[key]));
  const thin = [...top].filter((r) => r.margin != null).sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0))[0];
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Top products</h2><Toggle days={days} set={setDays} /></div>
      <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Rank by">
        {KEYS.map(([k, label]) => <button key={k} aria-pressed={key === k} onClick={() => setKey(k)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${key === k ? "border-pdark bg-soft text-pdark" : "border-line text-muted"}`}>{label}</button>)}
      </div>
      {top.length === 0 ? <Empty title="No sales in this period" hint="Top products appear once you record sales." /> : <>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <caption className="sr-only">Top products over the last {days} days</caption>
          <thead><tr className="text-left text-muted"><th className="py-2 font-medium">Product</th><th className="py-2 text-right font-medium">Units</th><th className="py-2 pl-1 text-right font-medium">Sales (KES)</th><th className="py-2 pl-1 text-right font-medium">Profit (KES)</th><th className="py-2 pl-2 text-right font-medium">Margin</th></tr></thead>
          <tbody>{top.map((r) => (
            <tr key={r.id} className="border-t border-line align-top">
              <td className="py-3 pr-2"><Link to={`/products/${r.id}`} className="font-medium">{r.name}</Link>
                <span className="mt-1 block h-1.5 rounded-full bg-soft" aria-hidden><span className="block h-1.5 rounded-full bg-primary" style={{ width: `${(r[key] / max) * 100}%` }} /></span></td>
              <td className="py-3 text-right tabular-nums">{r.units}</td><td className="py-3 pl-1 text-right tabular-nums">{n0(r.sales)}</td><td className="py-3 pl-1 text-right tabular-nums">{n0(r.profit)}</td>
              <td className="py-3 pl-2 text-right tabular-nums">{r.margin == null ? "–" : `${r.margin.toFixed(0)}%`}</td>
            </tr>))}</tbody>
        </table></div>
        {thin && top.length > 1 && <p className="mt-2 text-sm text-muted">Lowest margin here: <b className="text-ink">{thin.name}</b> ({thin.margin!.toFixed(0)}%).</p>}
      </>}
    </Card>
  );
}
