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
import { fetchBusiness, type Business } from "../lib/business";
import { hasSupabase } from "../lib/supabase";
import { setBusinessId } from "../config";

interface AuthContextValue {
  user: AuthUser | null;
  businessId: string | null;
  business: Business | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
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
  const [businessId, setBusinessIdState] = useState<string | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const selectBusiness = async (id: string) => {
    setBusinessIdState(id);
    setBusinessId(id);
    localStorage.setItem("stockly.active_business_id", id);
    const b = await fetchBusiness(id).then((r) => (r.ok ? r.business : null));
    setBusiness(b);
  };

  const loadSession = async () => {
    if (!hasSupabase) { setLoading(false); return; }
    const u = await getSession();
    setUser(u);
    if (u) {
      const stored = localStorage.getItem("stockly.active_business_id");
      if (stored) await selectBusiness(stored);
    }
    setLoading(false);
  };

  useEffect(() => {
    void loadSession();
    const sub = onAuthStateChange((event, u) => {
      setUser(u);
      if (event === "SIGNED_OUT") {
        setBusinessIdState(null);
        setBusinessId("");
        setBusiness(null);
        localStorage.removeItem("stockly.active_business_id");
      } else if (u && event === "SIGNED_IN") {
        void loadSession();
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
    if (r.user) { setUser(r.user); void loadSession(); }
    return { ok: true };
  };

  const doSignUp = async (email: string, password: string) => {
    const r = await signUp(email, password);
    if (!r.ok) return { ok: false, error: r.error };
    if (r.user) { setUser(r.user); void loadSession(); }
    return { ok: true };
  };

  const doSignOut = async () => {
    await signOut();
    setUser(null);
    setBusinessIdState(null);
    setBusinessId("");
    setBusiness(null);
    localStorage.removeItem("stockly.active_business_id");
  };

  const doSetActiveBusiness = async (id: string) => { await selectBusiness(id); };

  const value: AuthContextValue = {
    user,
    businessId,
    business,
    loading,
    configured: hasSupabase,
    signIn: doSignIn,
    signUp: doSignUp,
    signOut: doSignOut,
    setActiveBusiness: doSetActiveBusiness,
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
