"use client";

import type React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { supabase } from "../config/supabase";
import SupabaseService from "../services/SupabaseService";
import AnalyticsService from "../services/AnalyticsService";
import type { User } from "../models/User";
import { AppState, Platform, Dimensions } from "react-native";

// Responsive context enhancements
const { width: screenWidth } = Dimensions.get('window');
const isSmallDevice = screenWidth < 380;
const isTablet = screenWidth >= 768;

export type RedirectIntent = {
  routeName: string;
  params?: Record<string, unknown>;
};

interface AuthContextType {
  user: User | null;
  /** legacy name kept for existing consumers */
  isLoading: boolean;
  /** new/alternate name some consumers expect */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    userType: "regular_user" | "club_owner" | "admin"
  ) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: { displayName?: string; photoURL?: string }) => Promise<void>;
  setRedirectIntent: (intent: RedirectIntent) => void;
  consumeRedirectIntent: () => RedirectIntent | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

const REDIRECT_INTENT_KEY = "yovibe_redirect_intent_v1";
// Allow normal mobile and concurrent-page latency without falsely degrading an
// authenticated user into guest state. Supabase requests can legitimately take
// more than 1.5 seconds during a cold start or a bounded load test.
const AUTH_PROFILE_TIMEOUT_MS = 8000;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const userRef = useRef<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Keep userRef in sync with state
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Track whether we've completed the initial auth resolution
  const initializedRef = useRef(false);
  
  // Track analytics session
  const sessionIdRef = useRef<string | null>(null);
  const analyticsIdentityRef = useRef<string | null>(null);

  // Prevent overlapping concurrent fetches for the same UID
  const profileFetchInFlightRef = useRef<string | null>(null);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  };

  useEffect(() => {
    /* console.log("AuthContext: Setting up auth state listener"); */

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        /* console.log("AuthContext: Auth state changed, event:", event, "session:", !!session); */
        try {
          if (session?.user) {
            // Skip re-fetching when the profile for this exact UID is already loaded
            if (userRef.current && userRef.current.uid === session.user.id) {
              /* console.log("AuthContext: Profile already loaded for this UID — skipping redundant fetch"); */
              if (!initializedRef.current) initializedRef.current = true;
              setIsLoading(false);
              return;
            }

            // Prevent overlapping concurrent fetches for the same UID
            if (profileFetchInFlightRef.current === session.user.id) {
              /* console.log("AuthContext: Fetch already in flight for this UID — skipping duplicate request"); */
              return;
            }

            profileFetchInFlightRef.current = session.user.id;

            try {
              // Authenticated: load profile and set user
              /* console.log("AuthContext: User authenticated, loading profile for UID:", session.user.id); */
              // Use ensureUserProfile so that a missing row in public.users is automatically created.
              // This prevents the endless loading issue after signup or when resuming a session.
              const userProfile = await withTimeout(
                SupabaseService.ensureUserProfile(session.user),
                AUTH_PROFILE_TIMEOUT_MS,
                `Auth profile resolution timed out after ${AUTH_PROFILE_TIMEOUT_MS}ms`
              );
              /* console.log("AuthContext: User profile ensured/loaded:", userProfile?.email); */
              setUser(userProfile);
            } catch (profileError) {
              console.error("AuthContext: Failed to ensure user profile:", profileError);
              // If user_type is missing, the user should be logged out and treated as viber
              // Clear user state entirely - don't fall back to a profile
              setUser(null);
            } finally {
              profileFetchInFlightRef.current = null;
            }
          } else {
            // No session
            /* console.log("AuthContext: No session (signed out)"); */
            if (!initializedRef.current) {
              // First time: don't clear user state yet, just mark initialized.
              /* console.log("AuthContext: No session on initial check — deferring clearing user until initialized."); */
            } else {
              // After initial load, a null session means the user is signed out.
              /* console.log("AuthContext: Session is null after initialization — clearing user."); */
              setUser(null);
            }
          }
        } catch (error) {
          console.error("AuthContext: Error while handling auth state change:", error);
          // On error, be conservative: clear user so UI doesn't assume stale data
          setUser(null);
        } finally {
          // Mark that initial resolution has completed at least once
          if (!initializedRef.current) {
            initializedRef.current = true;
          }
          setIsLoading(false);
        }
      }
    );

    return () => {
      // console.log("AuthContext: Cleaning up auth listener");
      subscription?.unsubscribe();
    };
  }, []);

  // Start only after the initial auth state is resolved. This prevents the
  // historical guest-then-account duplicate created during application boot.
  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    const platform = Platform.OS === 'web' ? 'web' : 'mobile';
    const synchronize = async () => {
      try {
        if (!sessionIdRef.current) {
          sessionIdRef.current = await AnalyticsService.startSession(user?.id || null, platform);
        } else if (user?.id && !analyticsIdentityRef.current) {
          sessionIdRef.current = await AnalyticsService.promoteSession(sessionIdRef.current);
        }
        if (!cancelled) analyticsIdentityRef.current = user?.id || null;
      } catch {
        // Analytics is best-effort and must never block authentication.
      }
    };
    synchronize();
    return () => { cancelled = true; };
  }, [isLoading, user?.id]);

  useEffect(() => {
    const platform = Platform.OS === 'web' ? 'web' : 'mobile';
    let lastTouch = 0;
    const touch = () => {
      if (!sessionIdRef.current || Date.now() - lastTouch < 60000) return;
      lastTouch = Date.now();
      AnalyticsService.touchSession(sessionIdRef.current, platform)
        .then((sessionId) => { sessionIdRef.current = sessionId; })
        .catch(() => undefined);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const events = ['pointerdown', 'keydown', 'scroll', 'focus'];
      events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
      const onVisibility = () => { if (document.visibilityState === 'visible') touch(); };
      document.addEventListener('visibilitychange', onVisibility);
      return () => { events.forEach((name) => window.removeEventListener(name, touch)); document.removeEventListener('visibilitychange', onVisibility); };
    }
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') touch(); });
    return () => subscription.remove();
  }, []);

  useEffect(() => () => {
    if (sessionIdRef.current) AnalyticsService.endSession(sessionIdRef.current).catch(() => undefined);
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    /* console.log("AuthContext: Starting sign in for:", email); */
    try {
      await SupabaseService.signIn(email, password);
      /* console.log("AuthContext: Sign in successful"); */
      // onAuthStateChange will populate user - wait a moment for the listener to fire
      /* console.log("AuthContext: Waiting for onAuthStateChange to fire..."); */
    } catch (error) {
      console.error("AuthContext: Sign in failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    userType: "regular_user" | "club_owner" | "admin"
  ) => {
    if (!userType) {
      throw new Error("User type is required. Please select a user type during signup.")
    }
    setIsLoading(true);
    try {
      await SupabaseService.signUp(email, password, userType);
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
      });
      if (error) throw error;
    } catch (error) {
      console.error("AuthContext: Google sign-in failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * signOut
   *
   * - Performs sign out via SupabaseService.
   * - Clears local user state here so the app can render the unauthenticated main screen.
   * - Does NOT perform any navigation; navigation decisions should be handled by the caller.
   */
  const signOut = async () => {
    setIsLoading(true);
    try {
      // console.log("AuthContext: Signing out...");
      if (sessionIdRef.current) {
        await AnalyticsService.endSession(sessionIdRef.current);
        sessionIdRef.current = null;
      }
      AnalyticsService.rotateGuestVisitorId();
      analyticsIdentityRef.current = null;
      await SupabaseService.signOut();
      // Clear local user state explicitly so UI can immediately reflect unauthenticated state.
      setUser(null);
      // console.log("AuthContext: Signed out successfully and local user cleared");
    } catch (error) {
      // console.error("AuthContext: Sign out error:", error);
      // Ensure local state is cleared even if signOut failed at the service level
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (!user) throw new Error("No user logged in");
    await SupabaseService.updateUserProfile(user.id, data);
    setUser({ ...user, ...data });
  };

  // --- Soft-auth redirect intent helpers ---
  const setRedirectIntent = (intent: RedirectIntent) => {
    try {
      sessionStorage.setItem(REDIRECT_INTENT_KEY, JSON.stringify(intent));
      // console.log("AuthContext: Redirect intent saved", intent);
    } catch (err) {
      // console.warn("AuthContext: Failed to save redirect intent", err);
    }
  };

  const consumeRedirectIntent = (): RedirectIntent | null => {
    try {
      const raw = sessionStorage.getItem(REDIRECT_INTENT_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(REDIRECT_INTENT_KEY);
      const parsed = JSON.parse(raw) as RedirectIntent;
      // console.log("AuthContext: Redirect intent consumed", parsed);
      return parsed;
    } catch (err) {
      // console.warn("AuthContext: Failed to consume redirect intent", err);
      return null;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    // Provide the alternate property name expected elsewhere
    loading: isLoading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    updateProfile,
    setRedirectIntent,
    consumeRedirectIntent,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
