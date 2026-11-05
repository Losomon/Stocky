import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Check, Download, LogOut, Settings as Cog, ShieldCheck } from "lucide-react";
import { deviceStaffName, type StockCtx } from "../lib/store";
import { useAuth } from "../context/AuthContext";
import { hasSupabase } from "../lib/supabase";

/** The round avatar in the header. Opens a menu: who is using this phone, switch person, settings, back up, privacy. */
export default function AvatarMenu({ stock }: { stock: StockCtx }) {
  const { state, setDeviceStaff } = stock;
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), loc = useLocation();
  const who = state ? deviceStaffName(state) : "";
  const close = (focus = false) => { setOpen(false); if (focus) button.current?.focus(); };

  useEffect(() => { setOpen(false); }, [loc.pathname, loc.hash]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    document.addEventListener("pointerdown", away); document.addEventListener("keydown", key);
    box.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"], [role="menuitem"]')?.focus();
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  if (!state) return null;
  const people = state.STAFF.filter((p) => !p.archived).sort((a, b) => a.name.localeCompare(b.name));
  const item = "flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-medium hover:bg-soft";
  return (
    <div ref={box} className="relative">
      <button ref={button} onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open} aria-label={`Account menu, recording as ${who}`}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-soft font-bold text-pdark">{who[0] ?? "?"}</button>
      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-surface p-2 shadow-lg">
          <div className="px-3 pb-2 pt-1"><p className="font-semibold">{who}</p><p className="text-sm text-muted">Recording on this phone · {state.business.name}</p></div>
          {people.length > 1 && <>
            <p className="px-3 pt-1 text-xs font-semibold uppercase tracking-wide text-muted">Switch person</p>
            {people.map((p) => { const me = p.id === state.deviceStaffId; return (
              <button key={p.id} role="menuitemradio" aria-checked={me} onClick={() => { void setDeviceStaff(p.id).then(() => close(true)); }} className={item}>
                <span className="grid size-8 place-items-center rounded-full bg-soft text-sm font-bold text-pdark" aria-hidden>{p.name[0]}</span><span className="flex-1">{p.name}</span>{me && <Check size={18} className="text-ok" aria-hidden />}
              </button>); })}
          </>}
          <div className="my-1 border-t border-line" />
          <Link to="/settings" role="menuitem" onClick={() => close()} className={item}><Cog size={20} aria-hidden />Settings</Link>
          <Link to="/settings#backup" role="menuitem" onClick={() => close()} className={item}><Download size={20} aria-hidden />Back up your data</Link>
          <a href="/privacy.html" target="_blank" rel="noopener" role="menuitem" onClick={() => close()} className={item}><ShieldCheck size={20} aria-hidden />Privacy policy</a>
          {hasSupabase && auth.user && (
            <>
              <div className="my-1 border-t border-line" />
              <button role="menuitem" onClick={async () => { await auth.signOut(); close(); }} className={`${item} text-bad`}><LogOut size={20} aria-hidden />Sign out</button>
            </>
          )}
          <p className="px-3 py-2 text-xs text-muted">There are no passwords yet, so anyone using this phone can switch person.</p>
        </div>
      )}
    </div>
  );
}
