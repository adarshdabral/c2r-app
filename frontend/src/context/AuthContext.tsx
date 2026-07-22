import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { router } from "expo-router";
import {
  clearSession,
  getRole,
  getToken,
  getUserType,
  hydrateAuth,
  setSession as persistSession,
  setUserType as persistUserType,
} from "@/lib/auth";
import { registerUnauthorizedHandler } from "@/lib/api";

export type Session = {
  token: string | null;
  role: string | null;
  userType: string | null;
};

type AuthContextValue = {
  /** True until the persisted session has been read from storage. */
  loading: boolean;
  token: string | null;
  role: string | null;
  userType: string | null;
  isAuthenticated: boolean;
  /** Persist a session and route to the correct home for the role/user_type. */
  signIn: (session: {
    token: string;
    role: string;
    user_type?: string | null;
  }) => Promise<void>;
  /** Clear the session and return to /login. */
  signOut: () => Promise<void>;
  setUserType: (userType: string) => Promise<void>;
  /** The landing route for the current session's role/user_type. */
  homeRoute: () => string;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Concrete landing route per role. Users always land on /dashboard, which
// adapts its copy to user_type internally (the web's per-type dashboard pages
// were consolidated into one adaptive tab). Recycler/admin are real segments.
export function homeRouteFor(role: string | null, _userType: string | null): string {
  if (role === "admin") return "/admin";
  if (role === "recycler") return "/recycler";
  return "/dashboard";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSessionState] = useState<Session>({
    token: null,
    role: null,
    userType: null,
  });

  // Boot: hydrate persisted session into the in-memory cache + context state.
  useEffect(() => {
    let mounted = true;
    hydrateAuth().then(() => {
      if (!mounted) return;
      setSessionState({
        token: getToken(),
        role: getRole(),
        userType: getUserType(),
      });
      setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Wire the axios 401 handler to sign out + redirect.
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      clearSession().finally(() => {
        setSessionState({ token: null, role: null, userType: null });
        router.replace("/login");
      });
    });
    return () => registerUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      token: session.token,
      role: session.role,
      userType: session.userType,
      isAuthenticated: Boolean(session.token),
      homeRoute: () => homeRouteFor(session.role, session.userType),
      signIn: async (s) => {
        await persistSession(s);
        setSessionState({
          token: s.token,
          role: s.role,
          userType: s.user_type ?? null,
        });
        router.replace(homeRouteFor(s.role, s.user_type ?? null) as any);
      },
      signOut: async () => {
        await clearSession();
        setSessionState({ token: null, role: null, userType: null });
        router.replace("/login");
      },
      setUserType: async (userType: string) => {
        await persistUserType(userType);
        setSessionState((prev) => ({ ...prev, userType }));
      },
    }),
    [loading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
