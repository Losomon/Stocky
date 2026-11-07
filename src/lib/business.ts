// Business-layer calls to Supabase. Direct table writes are revoked by RLS:
// every mutation goes through a security-definer RPC. Reads use the generated
// REST API, which Row Level Security scopes to the caller's own business.
import { supabase, hasSupabase } from "./supabase";
import type { AuthUser } from "./auth";
import type { BusinessRole } from "./permissions";

export type { BusinessRole } from "./permissions";

export interface Business {
  id: string;
  name: string;
  phone?: string;
  location?: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessMember {
  business_id: string;
  user_id: string;
  role: BusinessRole;
  status: "active" | "suspended";
  created_at: string;
  staff_name?: string;
}

type RpcError = { ok: false; error: string };

const rpc = async (fn: string, params?: Record<string, unknown>): Promise<{ ok: true; data: unknown } | RpcError> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
  const { data, error } = await supabase.rpc(fn, params ?? {});
  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
};

export const fetchProfile = async (): Promise<{ ok: true; user: AuthUser } | RpcError> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { data, error } = await supabase.auth.getUser();
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: { id: data.user?.id ?? "", email: data.user?.email ?? null } };
};

export const createBusiness = async (name: string, timezone = "Africa/Nairobi"): Promise<{ ok: true; businessId: string } | RpcError> => {
  const result = await rpc("create_business", { p_name: name, p_timezone: timezone });
  if (!result.ok) return result;
  return { ok: true, businessId: String(result.data) };
};

export const inviteMember = async (
  businessId: string,
  email: string,
  role: Exclude<BusinessRole, "owner">,
): Promise<{ ok: true; invitationId: string; token: string } | RpcError> => {
  const result = await rpc("create_member_invitation", { p_business_id: businessId, p_email: email, p_role: role });
  if (!result.ok) return result;
  const row = (result.data as { invitation_id: string; invitation_token: string }[])?.[0] ?? result.data as { invitation_id: string; invitation_token: string };
  return { ok: true, invitationId: row.invitation_id, token: row.invitation_token };
};

export const claimInvitation = async (token: string): Promise<{ ok: true; businessId: string } | RpcError> => {
  const result = await rpc("claim_member_invitation", { p_token: token });
  if (!result.ok) return result;
  return { ok: true, businessId: String(result.data) };
};

export const setMemberRole = async (businessId: string, userId: string, role: Exclude<BusinessRole, "owner">): Promise<{ ok: true } | RpcError> => {
  return rpc("set_business_member_role", { p_business_id: businessId, p_user_id: userId, p_role: role }).then((r) => (r.ok ? { ok: true } : r));
};

export const removeMember = async (businessId: string, userId: string): Promise<{ ok: true } | RpcError> => {
  return rpc("remove_business_member", { p_business_id: businessId, p_user_id: userId }).then((r) => (r.ok ? { ok: true } : r));
};

export const fetchBusiness = async (businessId: string): Promise<{ ok: true; business: Business } | RpcError> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { data, error } = await supabase.from("businesses").select("*").eq("id", businessId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Business not found." };
  return { ok: true, business: data as unknown as Business };
};

export const fetchMyBusinesses = async (): Promise<{ ok: true; businesses: Business[] } | RpcError> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { data, error } = await supabase.from("businesses").select("*").order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, businesses: (data ?? []) as unknown as Business[] };
};

export const fetchMembers = async (businessId: string): Promise<{ ok: true; members: BusinessMember[] } | RpcError> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, user_id, role, status, created_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, error: error.message };
  const rows = (data ?? []) as unknown as BusinessMember[];
  // Attach staff roster names so the team list shows names, not user ids.
  const { data: staff } = await supabase
    .from("staff_members")
    .select("member_user_id, name")
    .eq("business_id", businessId);
  const byUser = new Map((staff ?? []).map((s: { member_user_id: string; name: string }) => [s.member_user_id, s.name]));
  return { ok: true, members: rows.map((m) => ({ ...m, staff_name: byUser.get(m.user_id) })) };
};

export const fetchMyMembership = async (businessId: string): Promise<{ ok: true; membership: BusinessMember } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, user_id, role, status, created_at")
    .eq("business_id", businessId)
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "You are not a member of this business." };
  return { ok: true, membership: data as unknown as BusinessMember };
};

export const invitationLink = (token: string): string => {
  const url = new URL(window.location.origin);
  url.pathname = "/accept-invitation";
  url.searchParams.set("token", token);
  return url.toString();
};
