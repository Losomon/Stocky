import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { trend } from "../../lib/analytics";
import { kes } from "../../lib/format";
import { Card } from "../ui";
import { Toggle, type Period } from "./ChartControls";
const Stat = ({ k, v }: { k: string; v: string }) => <div className="rounded-xl bg-bg p-3"><p className="text-xs text-muted">{k}</p><p className="whitespace-nowrap text-base font-bold sm:text-lg">{v}</p></div>;

export default function Trends({ days, setDays, data, losses }: { days: Period; setDays: (d: Period) => void; data: ReturnType<typeof trend>; losses: { units: number; value: number } }) {
  const t = data.totals;
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Sales and profit</h2><Toggle days={days} set={setDays} /></div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat k={`Sales, ${days} days`} v={kes(t.sales)} />
        <Stat k="Est. gross profit" v={kes(t.profit)} />
        <Stat k="Margin" v={t.margin == null ? "–" : `${t.margin.toFixed(0)}%`} />
        <Stat k="Stock losses" v={kes(losses.value)} />
      </div>
      <div className="h-56" role="img" aria-label={`Sales and estimated gross profit for the last ${days} days. Sales ${kes(t.sales)}, gross profit ${kes(t.profit)}.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={days === 7 ? 4 : 28} />
            <YAxis width={44} tick={{ fill: "var(--muted)", fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}K` : String(v))} />
            <Tooltip formatter={(v: number | string, name: string) => [kes(Number(v)), name === "sales" ? "Sales" : "Gross profit"]} />
            <Area isAnimationActive={false} type="monotone" dataKey="sales" stroke="var(--primary)" strokeWidth={3} fill="var(--primary)" fillOpacity={0.14} />
            <Area isAnimationActive={false} type="monotone" dataKey="profit" stroke="var(--success)" strokeWidth={2.5} strokeDasharray="6 4" fill="none" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-muted"><span><b className="text-primary">━</b> Sales</span><span><b className="text-ok">╍</b> Estimated gross profit</span></p>
      <p className="mt-2 text-xs text-muted">Estimated gross profit is sales minus the cost price saved on each sale. It leaves out rent, wages and other expenses. Stock losses are stock removed by counts, adjustments and damage, valued at cost{losses.units ? ` (${losses.units} ${losses.units === 1 ? "unit" : "units"})` : ""}.</p>
    </Card>
  );
}
