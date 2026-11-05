// Supabase Auth helpers. Identity is the source of truth for who a person is;
// every business action is then checked against their membership in a business.
import { type User } from "@supabase/supabase-js";
import { supabase, hasSupabase } from "./supabase";

export interface AuthUser {
  id: string;
  email: string | null;
}

export const toAuthUser = (u: User | null): AuthUser | null =>
  u ? { id: u.id, email: u.email ?? null } : null;

export const isSupabaseConfigured = () => hasSupabase;

export const getSession = async (): Promise<AuthUser | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return toAuthUser(data.session?.user ?? null);
};

export const currentUser = async (): Promise<AuthUser | null> => {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return toAuthUser(data.user ?? null);
};

export const signUp = async (email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: toAuthUser(data.user) ?? { id: "", email: null } };
};

export const signIn = async (email: string, password: string): Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY." };
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, user: toAuthUser(data.user) ?? { id: "", email: null } };
};

export const signOut = async (): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: true };
  const { error } = await supabase.auth.signOut();
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

export type AuthStateChange = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | "PASSWORD_RECOVERY" | "MFA_CHALLENGE_VERIFIED";

export const onAuthStateChange = (callback: (event: AuthStateChange, user: AuthUser | null) => void) => {
  if (!supabase) return () => {};
  return supabase.auth.onAuthStateChange((event, session) => callback(event as AuthStateChange, toAuthUser(session?.user ?? null)));
};

export const resetPasswordEmail = async (email: string): Promise<{ ok: boolean; error?: string }> => {
  if (!supabase) return { ok: false, error: "Supabase is not configured." };
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
};
