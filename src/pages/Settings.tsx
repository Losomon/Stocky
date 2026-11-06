import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { AlertTriangle, Check, Copy, Download, HardDrive, Mail, Plus, Share2, Users } from "lucide-react";
import { APP_NAME } from "../config";
import { backupFileName } from "../lib/backup";
import { APP_VERSION } from "../lib/version";
import { daysAgo } from "../lib/format";
import { hasSupabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { fetchMembers, inviteMember, invitationLink, removeMember, setMemberRole, type BusinessMember, type BusinessRole } from "../lib/business";
import RestoreBackup from "../components/RestoreBackup";
import { staffInUse } from "../lib/people";
import { deviceStaffName, type StockCtx } from "../lib/store";
import { Badge, Card, Errors, btnGhost, btnPrimary, fieldCls } from "../components/ui";

export default function Settings() {
  const ctx = useOutletContext<StockCtx>();
  const auth = useAuth();
  const nav = useNavigate(), loc = useLocation();
  const { state, updateBusiness, createStaff, setStaffArchived, deleteStaff, setDeviceStaff, eraseAll, exportBackup, markBackedUp } = ctx;
  const [biz, setBiz] = useState<{ name: string; phone: string; location: string } | null>(null);
  const [saved, setSaved] = useState(false), [bizErr, setBizErr] = useState<string[]>([]);
  const [newName, setNewName] = useState(""), [staffErr, setStaffErr] = useState<string[]>([]);
  const [persisted, setPersisted] = useState<boolean | null>(null), [confirm, setConfirm] = useState(false), [typed, setTyped] = useState("");
  const [bk, setBk] = useState<{ ok?: string; err?: string }>({});
  const canShare = useMemo(() => typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [new File(["x"], "x.json", { type: "application/json" })] }), []);
  useEffect(() => { if (state && loc.hash === "#backup") document.getElementById("backup")?.scrollIntoView(); }, [state, loc.hash]);
  useEffect(() => { void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null)); }, []);
  useEffect(() => { if (state && !biz) setBiz({ name: state.business.name, phone: state.business.phone ?? "", location: state.business.location ?? "" }); }, [state, biz]);

  /* ---------------- cloud team members ---------------- */
  const [members, setMembers] = useState<BusinessMember[]>([]);
  const [membersErr, setMembersErr] = useState<string[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<BusinessRole, "owner">>("cashier");
  const [inviteErr, setInviteErr] = useState<string[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [roleBusy, setRoleBusy] = useState<Set<string>>(new Set());
  const [removeBusy, setRemoveBusy] = useState<Set<string>>(new Set());
  const myMembership = auth.user ? members.find((m) => m.user_id === auth.user!.id) : undefined;
  const canManage = myMembership ? ["owner", "admin"].includes(myMembership.role) : false;
  const amOwner = myMembership?.role === "owner";
  const loadMembers = async () => {
    if (!hasSupabase || !auth.businessId) return;
    const r = await fetchMembers(auth.businessId);
    if (!r.ok) setMembersErr([r.error]);
    else setMembers(r.members);
  };
  useEffect(() => { void loadMembers(); }, [hasSupabase, auth.businessId, state]);
  const roleOf = (userId: string) => members.find((m) => m.user_id === userId)?.role;
  const handleInvite = async () => {
    setInviteErr([]);
    if (!auth.businessId) return;
    setInviteBusy(true);
    const r = await inviteMember(auth.businessId, inviteEmail, inviteRole);
    setInviteBusy(false);
    if (!r.ok) { setInviteErr([r.error]); return; }
    setInviteErr([]);
    setInviteLink(invitationLink(r.token));
    setInviteCopied(false);
    setInviteEmail("");
    setInviteRole("cashier");
    await loadMembers();
  };
  const handleRoleChange = async (userId: string, role: Exclude<BusinessRole, "owner">) => {
    if (!auth.businessId || userId === auth.user?.id || roleOf(userId) === "owner") return;
    setRoleBusy((s) => new Set([...s, userId]));
    const r = await setMemberRole(auth.businessId, userId, role);
    setRoleBusy((s) => { const n = new Set(s); n.delete(userId); return n; });
    if (!r.ok) { setMembersErr([r.error]); return; }
    await loadMembers();
  };
  const handleRemove = async (userId: string) => {
    if (!auth.businessId || userId === auth.user?.id || roleOf(userId) === "owner") return;
    if (!window.confirm("Remove this person from the business? They will lose access to its data.")) return;
    setRemoveBusy((s) => new Set([...s, userId]));
    const r = await removeMember(auth.businessId, userId);
    setRemoveBusy((s) => { const n = new Set(s); n.delete(userId); return n; });
    if (!r.ok) { setMembersErr([r.error]); return; }
    await loadMembers();
  };
  if (!state || !biz) return <p className="text-muted">Loading settings…</p>;
  const memory = state.mode === "memory", deviceMe = deviceStaffName(state);
  const staff = [...state.STAFF].sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name));
  const saveFile = async () => {
    const text = JSON.stringify(await exportBackup()), url = URL.createObjectURL(new Blob([text], { type: "application/json" })), a = document.createElement("a");
    a.href = url; a.download = backupFileName(state.business.name); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    await markBackedUp(); setBk({ ok: `Backup saved as ${a.download}. Keep it somewhere safe, such as your Downloads folder, WhatsApp to yourself, or email.` });
  };
  const shareFile = async () => {
    const f = new File([JSON.stringify(await exportBackup())], backupFileName(state.business.name), { type: "application/json" });
    try { await navigator.share({ files: [f], title: `${state.business.name} backup` }); await markBackedUp(); setBk({ ok: "Backup shared." }); }
    catch (e) { if ((e as Error).name !== "AbortError") setBk({ err: "Sharing didn't work. Use Download instead." }); }
  };
  const run = async (r: Promise<{ ok: boolean; errors?: string[] }>, fail: (e: string[]) => void, ok?: () => void) => { const x = await r; if (!x.ok) fail(x.errors ?? []); else { fail([]); ok?.(); } };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">Settings</h1>

      {auth.businesses.length > 1 && <Card className="space-y-2">
        <h2 className="text-lg font-semibold">Switch business</h2>
        {auth.businesses.map((item) => <button key={item.id} onClick={() => void auth.setActiveBusiness(item.id).then(() => nav("/", { replace: true })).catch((e: unknown) => setBizErr([e instanceof Error ? e.message : "Could not switch business."]))} className={`${btnGhost} w-full justify-start`}>
          {item.name}{item.id === auth.businessId ? " (current)" : ""}
        </button>)}
      </Card>}

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Your business</h2>
        <Errors list={bizErr} />
        <label className="block"><span className="mb-1 block text-sm font-medium">Business name</span><input className={fieldCls} value={biz.name} onChange={(e) => { setBiz({ ...biz, name: e.target.value }); setSaved(false); }} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1 block text-sm font-medium">Phone (optional)</span><input className={fieldCls} inputMode="tel" value={biz.phone} onChange={(e) => { setBiz({ ...biz, phone: e.target.value }); setSaved(false); }} /></label>
          <label className="block"><span className="mb-1 block text-sm font-medium">Location (optional)</span><input className={fieldCls} value={biz.location} onChange={(e) => { setBiz({ ...biz, location: e.target.value }); setSaved(false); }} /></label>
        </div>
        <div className="flex items-center gap-3"><button onClick={() => void run(updateBusiness(biz), setBizErr, () => setSaved(true))} className={btnPrimary}>Save business details</button>
          {saved && <span role="status" className="flex items-center gap-1 text-sm font-medium text-ok"><Check size={16} />Saved</span>}</div>
        <p className="text-sm text-muted">Currency is Kenya shillings (KES).</p>
        {hasSupabase && <p className="text-sm text-muted">These profile edits are stored on this device only; the business profile is not yet synchronized to Supabase.</p>}
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">Staff</h2>
        <p className="text-sm text-muted">Sales, deliveries and stock counts on this device are recorded under <b className="text-ink">{deviceMe}</b>. Pick who is using it. There are no passwords yet, so anyone using the app can switch.</p>
        <Errors list={staffErr} />
        <ul className="divide-y divide-line">
          {staff.map((p) => {
            const isMe = p.id === state.deviceStaffId, used = staffInUse(p.name, { M: state.M, S: state.S, C: state.C, receiptStaff: state.RC.map((r) => r.staff) });
            return (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-full bg-soft font-bold text-pdark" aria-hidden>{p.name[0]}</span>
                  <span className="font-medium">{p.name}</span>{isMe && <Badge tone="ok"><Check size={14} />This device</Badge>}{p.archived && <Badge tone="muted">Archived</Badge>}</span>
                <span className="flex flex-wrap gap-2">
                  {!isMe && !p.archived && <button onClick={() => void run(setDeviceStaff(p.id), setStaffErr)} className={btnGhost}>Use this device as {p.name}</button>}
                  <button onClick={() => void run(setStaffArchived(p.id, !p.archived), setStaffErr)} className={btnGhost}>{p.archived ? "Restore" : "Archive"}</button>
                  {!used && !isMe && <button onClick={() => void run(deleteStaff(p.id), setStaffErr)} className={btnGhost}>Delete</button>}
                </span>
              </li>);
          })}
        </ul>
        <div className="flex flex-wrap gap-2">
          <input className={`${fieldCls} flex-1`} placeholder="Add a person, e.g. Wanjiku" aria-label="New staff name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button onClick={() => void run(createStaff(newName), setStaffErr, () => setNewName(""))} className={btnPrimary}>Add person</button>
        </div>
        <p className="text-sm text-muted">Names can't be changed, because past records keep the name they were made under. Archive someone who leaves.</p>
      </Card>

      {hasSupabase && auth.businessId && (
        <Card className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Users size={20} />Team members</h2>
          <p className="text-sm text-muted">People who can sign in to this business and their assigned account role. Membership and cloud-table reads are scoped by database policies, but role restrictions are not yet applied to local sales and inventory actions. Product, sales and inventory records are not synced to the server; they remain on this device.</p>
          {membersErr.length > 0 && <Errors list={membersErr} />}
          <ul className="divide-y divide-line">
            {members.length === 0 ? <li className="py-3 text-sm text-muted">No members yet.</li> :
              members.map((m) => {
                const isMe = m.user_id === auth.user?.id;
                return (
                  <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="flex items-center gap-2"><span className="grid size-10 place-items-center rounded-full bg-soft font-bold text-pdark" aria-hidden>{(m.staff_name ?? m.user_id).slice(0, 2).toUpperCase()}</span>
                      <span className="font-medium">{m.staff_name || (isMe ? "You" : m.user_id.slice(0, 8))}</span>{isMe && <Badge tone="ok">You</Badge>}{m.role === "owner" && <Badge tone="muted">Owner</Badge>}</span>
                    <span className="flex flex-wrap gap-2">
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-muted">
                        <span className="font-semibold">{m.role}</span>
                        {canManage && m.role !== "owner" && !isMe && (
                          <select value={m.role} onChange={(e) => void handleRoleChange(m.user_id, e.target.value as Exclude<BusinessRole, "owner">)} disabled={roleBusy.has(m.user_id)} className="text-sm border border-line rounded-md px-2 py-1 bg-surface">
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                            <option value="cashier">Cashier</option>
                          </select>
                        )}
                      </span>
                      {canManage && m.role !== "owner" && !isMe && (
                        <button disabled={removeBusy.has(m.user_id)} onClick={() => void handleRemove(m.user_id)} className={btnGhost}>Remove</button>
                      )}
                    </span>
                  </li>
                );
              })
            }
          </ul>
          {canManage && (
            <div className="pt-2">
              <h3 className="text-sm font-semibold mb-2">Invite a worker</h3>
              <Errors list={inviteErr} />
              <div className="grid gap-3 sm:grid-cols-3 items-end">
                <input className={fieldCls} type="email" placeholder="worker@example.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} />
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Exclude<BusinessRole, "owner">)} className={fieldCls}>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="cashier">Cashier</option>
                </select>
                <button disabled={inviteBusy} onClick={handleInvite} className={btnPrimary}>Invite</button>
              </div>
              <p className="text-sm text-muted">The invitation link is shown after you invite. Copy it and send it to the worker through a trusted channel (WhatsApp, SMS, email). They sign in with their own account and join only this business.</p>
              {inviteBusy && <p className="text-sm text-muted">Sending invitation…</p>}
              {inviteLink && <div className="space-y-2 rounded-xl border border-line p-3">
                <label className="block"><span className="mb-1 block text-sm font-medium">Invitation link (valid for 7 days)</span><input className={fieldCls} readOnly value={inviteLink} onFocus={(e) => e.currentTarget.select()} /></label>
                <button onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => setInviteCopied(true)).catch(() => setInviteErr(["Could not copy the link. Select it above and copy it manually."]))} className={btnGhost}><Copy size={18} />{inviteCopied ? "Copied" : "Copy invitation link"}</button>
                <p className="text-xs text-muted">Send this link only to the invited person. It grants access to this business after they sign in with the invited email.</p>
              </div>}
            </div>
          )}
          {!canManage && <p className="text-sm text-muted">Your role ({myMembership?.role}) does not allow inviting or managing team members.</p>}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">{memory ? <AlertTriangle size={20} className="text-bad" /> : <HardDrive size={20} className="text-muted" />}Where your data is</h2>
        {memory
          ? <p className="font-medium text-bad">This browser is blocking storage, so nothing you enter is being kept. It will be gone when you close or reload the page. Try another browser, or leave private browsing.</p>
          : <p className="font-medium">Everything you enter is saved on this device only.</p>}
        <ul className="list-disc space-y-1 pl-5 text-sm">
          <li>Product, sales and inventory data is <b>not synced</b> to a server and <b>not backed up</b>. There is no online copy.</li>
          <li>Other phones and computers <b>can't see it</b>. Each device has its own separate data.</li>
          <li>It works without internet. Sales, deliveries and counts save normally while you are offline.</li>
          <li>Clearing this site's data, clearing the browser's history and storage, or uninstalling the app <b>erases it for good</b>.</li>
          <li>Storage protection from automatic clearing: <b>{persisted === null ? "unknown on this browser" : persisted ? "on" : "off (the browser may clear it if the phone runs low on space)"}</b>.</li>
        </ul>
        {state.demo ? <p className="text-sm text-muted">This is demo data for trying the workflow. Please don't enter real business records until you erase it and set up your shop.</p> : <p className="text-sm text-muted">Sign-in and business memberships do not synchronize your records yet. Make a backup file regularly, and before you change phones.</p>}
      </Card>

      <Card className="space-y-3">
        <h2 id="backup" className="scroll-mt-24 text-lg font-semibold">Back up your data</h2>
        <p className="text-sm">Last backup: <b>{state.lastBackupAt ? `${daysAgo(state.lastBackupAt)} (${new Date(state.lastBackupAt).toLocaleDateString("en-KE", { dateStyle: "medium" })})` : "never"}</b></p>
        <p className="text-sm text-muted">A backup is one file with all your products, stock, sales, purchases, customers and staff. If this phone is lost, broken or cleared, restoring the file brings everything back. The file includes your customers' names and phone numbers, so keep it private.</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void saveFile()} className={btnPrimary}><Download size={20} />Download backup</button>
          {canShare && <button onClick={() => void shareFile()} className={btnGhost}><Share2 size={20} />Share backup</button>}
        </div>
        {bk.ok && <p role="status" className="rounded-xl border border-ok p-3 text-sm font-medium text-ok">{bk.ok}</p>}
        {bk.err && <p role="alert" className="rounded-xl border border-bad p-3 text-sm text-bad">{bk.err}</p>}
        <h3 className="pt-2 font-semibold">Restore from a backup</h3>
        <RestoreBackup ctx={ctx} hasData={state.P.length > 0 || state.S.length > 0} onRestored={() => nav("/", { replace: true })} />
      </Card>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{state.demo ? "Reset demo data" : "Erase all data"}</h2>
        {state.demo
          ? <><p className="text-sm text-muted">Deletes the demo data on this device and takes you back to setting up your shop. This can't be undone.</p>
              {confirm ? <div className="flex flex-wrap gap-2"><button onClick={() => void eraseAll().then(() => nav("/", { replace: true }))} className={btnPrimary}>Yes, delete everything on this device</button><button onClick={() => setConfirm(false)} className={btnGhost}>Keep my data</button></div>
                : <button onClick={() => setConfirm(true)} className={btnGhost}>Reset demo data</button>}</>
          : <><p className="text-sm text-muted">Deletes <b>everything</b> on this device: products, stock, sales, customers and staff. There is no online copy, so only a backup file can bring it back. This can't be undone.</p>
              {confirm ? <div className="space-y-2"><label className="block"><span className="mb-1 block text-sm font-medium">Type DELETE to confirm</span><input className={fieldCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
                  <div className="flex flex-wrap gap-2"><button disabled={typed !== "DELETE"} onClick={() => void eraseAll().then(() => { setConfirm(false); setTyped(""); nav("/", { replace: true }); })} className={btnPrimary}>Erase everything</button><button onClick={() => { setConfirm(false); setTyped(""); }} className={btnGhost}>Keep my data</button></div></div>
                : <button onClick={() => setConfirm(true)} className={btnGhost}>Erase all data</button>}</>}
      </Card>

      <Card className="space-y-2 text-sm">
        <h2 className="text-lg font-semibold">About</h2>
        <p>{APP_NAME} version {APP_VERSION}</p>
        <p><a href="/privacy.html" target="_blank" rel="noopener" className="font-semibold text-pdark underline">Privacy policy</a></p>
      </Card>
    </div>
  );
}
