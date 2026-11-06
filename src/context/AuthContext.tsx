// React context for the Supabase session and the active business.
// One instance holds identity for the whole app so pages don't prop-drill it.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  getSession,
  signOut,
  onAuthStateChange,
  signIn,
  signUp,
  type AuthUser,
} from "../lib/auth";
import { fetchBusiness, fetchMyBusinesses, type Business } from "../lib/business";
import { hasSupabase } from "../lib/supabase";
import { setBusinessId } from "../config";

interface AuthContextValue {
  user: AuthUser | null;
  businesses: Business[];
  businessId: string | null;
  business: Business | null;
  businessError: string | null;
  loading: boolean;
  configured: boolean;
  refreshBusinesses: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: boolean; error?: string; confirmationRequired?: boolean }>;
  signOut: () => Promise<void>;
  setActiveBusiness: (id: string) => Promise<void>;
}

const AuthCtx = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside an AuthProvider");
  return ctx;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessError, setBusinessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const selectBusiness = async (id: string) => {
    const result = await fetchBusiness(id);
    if (!result.ok) {
      setBusinessError(result.error);
      throw new Error(result.error);
    }
    setBusinesses((current) => current.some((item) => item.id === id) ? current : [...current, result.business]);
    setBusinessIdState(id);
    setBusinessId(id);
    setBusiness(result.business);
    setBusinessError(null);
    localStorage.setItem("stockly.active_business_id", id);
  };

  const loadBusinesses = async (u: AuthUser | null) => {
    setLoading(true);
    if (!u) {
      setBusinesses([]);
      setBusinessIdState(null);
      setBusinessId("");
      setBusiness(null);
      setBusinessError(null);
      localStorage.removeItem("stockly.active_business_id");
      setLoading(false);
      return;
    }
    const result = await fetchMyBusinesses();
    if (!result.ok) {
      setBusinesses([]);
      setBusinessIdState(null);
      setBusinessId("");
      setBusiness(null);
      setBusinessError(result.error);
      setLoading(false);
      return;
    }
    setBusinesses(result.businesses);
    setBusinessError(null);
    const stored = localStorage.getItem("stockly.active_business_id");
    const selected = result.businesses.find((item) => item.id === stored)
      ?? (result.businesses.length === 1 ? result.businesses[0] : null);
    if (selected) {
      setBusinessIdState(selected.id);
      setBusinessId(selected.id);
      setBusiness(selected);
      localStorage.setItem("stockly.active_business_id", selected.id);
    } else {
      setBusinessIdState(null);
      setBusinessId("");
      setBusiness(null);
      localStorage.removeItem("stockly.active_business_id");
    }
    setLoading(false);
  };

  const refreshBusinesses = async () => loadBusinesses(user);

  const loadSession = async () => {
    if (!hasSupabase) { setLoading(false); return; }
    const u = await getSession();
    setUser(u);
    await loadBusinesses(u);
    setLoading(false);
  };

  useEffect(() => {
    void loadSession();
    const sub = onAuthStateChange((event, u) => {
      setUser(u);
      if (event === "SIGNED_OUT") {
        void loadBusinesses(null);
      } else if (u && event === "SIGNED_IN") {
        void loadBusinesses(u);
      }
    });
    return () => {
      if (typeof sub === "function") sub();
      else void sub.data.subscription.unsubscribe();
    };
  }, []);

  const doSignIn = async (email: string, password: string) => {
    const r = await signIn(email, password);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.user) { setUser(r.user); void loadBusinesses(r.user); }
    return { ok: true };
  };

  const doSignUp = async (email: string, password: string) => {
    const r = await signUp(email, password);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.user) { setUser(r.user); void loadBusinesses(r.user); }
    return { ok: true, confirmationRequired: r.confirmationRequired };
  };

  const doSignOut = async () => {
    const result = await signOut();
    if (!result.ok) throw new Error(result.error ?? "Could not sign out.");
    setUser(null);
    await loadBusinesses(null);
  };

  const doSetActiveBusiness = async (id: string) => { await selectBusiness(id); };

  const value: AuthContextValue = {
    user,
    businesses,
    businessId,
    business,
    businessError,
    loading,
    configured: hasSupabase,
    refreshBusinesses,
    signIn: doSignIn,
    signUp: doSignUp,
    signOut: doSignOut,
    setActiveBusiness: doSetActiveBusiness,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
