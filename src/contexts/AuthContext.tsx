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
import { Platform, Dimensions } from "react-native";

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
const AUTH_PROFILE_TIMEOUT_MS = 25000;

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track whether we've completed the initial auth resolution
  const initializedRef = useRef(false);
  
  // Track analytics session
  const sessionIdRef = useRef<string | null>(null);

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
    console.log("AuthContext: Setting up auth state listener");

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("AuthContext: Auth state changed, event:", event, "session:", !!session);
        try {
          if (session?.user) {
            // Authenticated: load profile and set user
            console.log("AuthContext: User authenticated, loading profile for UID:", session.user.id);
            try {
              // Use ensureUserProfile so that a missing row in public.users is automatically created.
              // This prevents the endless loading issue after signup or when resuming a session.
              const userProfile = await withTimeout(
                SupabaseService.ensureUserProfile(session.user),
                AUTH_PROFILE_TIMEOUT_MS,
                `Auth profile resolution timed out after ${AUTH_PROFILE_TIMEOUT_MS}ms`
              );
              console.log("AuthContext: User profile ensured/loaded:", userProfile?.email);
              setUser(userProfile);
            } catch (profileError) {
              console.error("AuthContext: Failed to ensure user profile:", profileError);

              const isTimeout = profileError instanceof Error && profileError.message?.includes('timed out');

              if (isTimeout) {
                console.warn("AuthContext: Profile resolution timed out — retrying once before giving up");
                try {
                  const retriedProfile = await withTimeout(
                    SupabaseService.ensureUserProfile(session.user),
                    AUTH_PROFILE_TIMEOUT_MS,
                    `Auth profile resolution timed out after ${AUTH_PROFILE_TIMEOUT_MS}ms (retry)`
                  );
                  console.log("AuthContext: Retry succeeded, profile loaded:", retriedProfile?.email);
                  setUser(retriedProfile);
                  return;
                } catch (retryError) {
                  console.error("AuthContext: Retry also failed — treating as genuine failure:", retryError);
                }
              }

              // If user_type is missing, the user should be logged out and treated as viber
              // Clear user state entirely - don't fall back to a profile
              setUser(null);
            }
          } else {
            // No session
            console.log("AuthContext: No session (signed out)");
            if (!initializedRef.current) {
              // First time: don't clear user state yet, just mark initialized.
              console.log("AuthContext: No session on initial check — deferring clearing user until initialized.");
            } else {
              // After initial load, a null session means the user is signed out.
              console.log("AuthContext: Session is null after initialization — clearing user.");
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

  // Track analytics session
  useEffect(() => {
    // Only track sessions on web platform
    if (Platform.OS !== 'web') return;

    const startSession = async () => {
      try {
        const sessionId = await AnalyticsService.startSession(
          user?.id || null,
          'web'
        );
        sessionIdRef.current = sessionId;
        // console.log('Analytics: Session started for', user ? 'authenticated user' : 'guest');
      } catch (error) {
        // console.error('Analytics: Failed to start session', error);
      }
    };

    const endSession = async () => {
      if (sessionIdRef.current) {
        try {
          await AnalyticsService.endSession(sessionIdRef.current);
          // console.log('Analytics: Session ended');
        } catch (error) {
          // console.error('Analytics: Failed to end session', error);
        }
      }
    };

    // Start session when component mounts or user changes
    startSession();

    // End session on unmount or before starting a new one
    return () => {
      endSession();
    };
  }, [user?.id]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    console.log("AuthContext: Starting sign in for:", email);
    try {
      await SupabaseService.signIn(email, password);
      console.log("AuthContext: Sign in successful");
      // onAuthStateChange will populate user - wait a moment for the listener to fire
      console.log("AuthContext: Waiting for onAuthStateChange to fire...");
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
    signOut,
    updateProfile,
    setRedirectIntent,
    consumeRedirectIntent,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
