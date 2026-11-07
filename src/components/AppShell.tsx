import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { AlertTriangle, HardDrive, Layers, LayoutDashboard, MoreHorizontal, Package, Receipt, Search, ShoppingCart, WifiOff, SlidersHorizontal, Users, BarChart3, BookOpen, type LucideIcon } from "lucide-react";
import { APP_NAME } from "../config";
import AvatarMenu from "./AvatarMenu";
import { daysAgo } from "../lib/format";
import type { StockCtx } from "../lib/store";

const NAV: { to: string; label: string; icon: LucideIcon }[] = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard }, { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/products", label: "Products", icon: Package }, { to: "/inventory", label: "Inventory", icon: Layers },
  { to: "/purchases", label: "Purchases", icon: Receipt }, { to: "/customers", label: "Customers", icon: Users },
  { to: "/reports", label: "Reports", icon: BarChart3 }, { to: "/audit-log", label: "Audit log", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: SlidersHorizontal },
];
const link = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-12 items-center gap-3 rounded-xl px-3 font-medium ${isActive ? "bg-soft text-pdark" : "text-ink hover:bg-soft"}`;
const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium ${isActive ? "text-pdark" : "text-muted"}`;

function useOnline() {
  const [on, setOn] = useState(() => navigator.onLine);
  useEffect(() => { const up = () => setOn(true), down = () => setOn(false); window.addEventListener("online", up); window.addEventListener("offline", down); return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); }; }, []);
  return on;
}

export default function AppShell({ stock }: { stock: StockCtx }) {
  const [more, setMore] = useState(false);
  const online = useOnline();
  const mode = stock.state?.mode;
  return (
    <div className="min-h-screen pt-[env(safe-area-inset-top)]">
      <aside className="fixed inset-y-0 left-0 hidden w-[250px] flex-col gap-1 border-r border-line bg-surface p-4 lg:flex">
        <div className="mb-2 flex items-center gap-2 px-3 py-3 text-xl font-extrabold"><span className="text-primary">✦</span>{APP_NAME.toUpperCase()}</div>
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={link}><Icon size={20} />{label}</NavLink>
        ))}
      </aside>
      <div className="pb-24 lg:ml-[250px] lg:pb-8">
        <header className="sticky top-[env(safe-area-inset-top)] z-10 flex items-center gap-3 border-b border-line bg-surface px-4 py-3 sm:px-6">
          <span className="shrink-0 whitespace-nowrap font-extrabold lg:hidden"><span className="text-primary">✦</span> {APP_NAME}</span>
          <label className="hidden min-h-11 max-w-md flex-1 items-center gap-2 rounded-xl border border-line bg-bg px-3 text-muted sm:flex">
            <Search size={18} /><input aria-label="Search" placeholder="Search products, sales, customers…" className="flex-1 bg-transparent text-ink outline-none" />
          </label>
          {mode === "memory"
            ? <span role="status" className="ml-auto inline-flex items-center gap-1.5 text-right text-xs font-semibold leading-tight text-bad"><AlertTriangle size={16} className="shrink-0" />Not saved: storage is blocked</span>
            : <span role="status" className="ml-auto inline-flex min-w-0 items-center gap-1.5 text-right text-xs leading-tight">
                {online ? <HardDrive size={16} className="shrink-0 text-muted" /> : <WifiOff size={16} className="shrink-0 text-warn" />}
                <span className="flex min-w-0 flex-col"><span className="font-semibold text-ink">{online ? "Saved on this device only" : "Offline"}</span>{!online && <span className="text-muted">Saved on this device only</span>}</span></span>}
          <AvatarMenu stock={stock} />
        </header>
        <div role="note" className="bg-soft px-4 py-2 text-sm text-ink sm:px-6">
          {mode === "memory" ? <><b>Not saved.</b> Storage is blocked, so nothing you enter will be kept once you close this page.</>
            : stock.state?.demo ? <><b>Demo data.</b> Data stays on this device only: not synced, not backed up, invisible to other phones. Don't enter real business records.</>
            : <><b>Saved on this device only</b>, not synced or backed up automatically. {!stock.state?.lastBackupAt ? <b>No backup yet.</b> : Date.now() - stock.state.lastBackupAt > 7 * 864e5 ? <b>Last backup {daysAgo(stock.state.lastBackupAt)}.</b> : <>Last backup {daysAgo(stock.state.lastBackupAt)}.</>}</>}{" "}
          <NavLink to="/settings" className="font-semibold text-pdark underline">{stock.state?.demo || mode === "memory" ? "Details" : "Back up"}</NavLink>
        </div>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          <Outlet context={stock} />
        </main>
      </div>
      {more && (
        <div className="fixed inset-x-0 bottom-16 z-20 mx-3 rounded-2xl border border-line bg-surface p-2 shadow-lg lg:hidden">
          {NAV.slice(4).map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} onClick={() => setMore(false)} className={link}><Icon size={20} />{label}</NavLink>
          ))}
        </div>
      )}
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.slice(0, 4).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === "/"} className={tab}><Icon size={20} />{label}</NavLink>
        ))}
        <button onClick={() => setMore(!more)} className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted"><MoreHorizontal size={20} />More</button>
      </nav>
    </div>
  );
}
