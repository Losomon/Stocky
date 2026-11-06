import { lazy, Suspense, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Plus } from "lucide-react";
import { activityFeed, attention, restockPlan, stockLosses, topProducts, totalsBetween, trend, valueByCategory } from "../lib/analytics";
import { DAY, dashboard, startOfDay } from "../lib/engine";
import { deviceStaffName, type StockCtx } from "../lib/store";
import ActivityFeed from "../components/dashboard/ActivityFeed";
import Attention from "../components/dashboard/Attention";
import StockAnalysis from "../components/dashboard/StockAnalysis";
import Summary from "../components/dashboard/Summary";
import TopProducts from "../components/dashboard/TopProducts";
import type { Period } from "../components/dashboard/ChartControls";

const Trends = lazy(() => import("../components/dashboard/Trends"));

export default function Dashboard() {
  const { state } = useOutletContext<StockCtx>();
  const nav = useNavigate();
  const [days, setDays] = useState<Period>(7);
  const a = useMemo(() => {
    if (!state) return null;
    const now = Date.now(), t0 = startOfDay(now);
    return { d: dashboard(state.P, state.M, state.S, state.SI, state.C, { PU: state.PU, PI: state.PI, RC: state.RC, RI: state.RI }, now),
      today: totalsBetween(state, t0, t0 + DAY), attention: attention(state, now), restock: restockPlan(state, now), value: valueByCategory(state, now), feed: activityFeed(state) };
  }, [state]);
  const period = useMemo(() => (state ? { trend: trend(state, days), top: topProducts(state, days), losses: stockLosses(state, days) } : null), [state, days]);
  if (!state || !a || !period) return <p className="text-muted">Loading your shop…</p>;
  const { d } = a, h = new Date().getHours(), greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold sm:text-3xl">{greeting}, {deviceStaffName(state).split(" ")[0]}</h1><p className="text-muted">Here's what's happening at {state.business.name} today.</p></div>
        <button onClick={() => nav("/sales")} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-pdark px-5 font-semibold text-onp"><Plus size={20} />New sale</button>
      </div>
      <Summary today={a.today.sales} delta={d.delta} profit={a.today.profit} margin={a.today.margin} stockValue={d.stockValue} productCount={d.productCount} lowCount={d.low.length} outCount={d.low.filter((i) => i.status === "out").length} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0 xl:order-last"><Attention items={a.attention} /></div>
        <div className="min-w-0 xl:col-span-2"><Suspense fallback={<div className="min-h-64 animate-pulse rounded-2xl bg-soft" aria-label="Loading sales chart" />}><Trends days={days} setDays={setDays} data={period.trend} losses={period.losses} /></Suspense></div>
      </div>
      <TopProducts rows={period.top} days={days} setDays={setDays} />
      <StockAnalysis restock={a.restock} slow={d.slow} value={a.value} />
      <ActivityFeed events={a.feed} />
    </div>
  );
}
