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
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../config/firebase";
import FirebaseService from "../services/FirebaseService";
import type { User } from "../models/User";

export type RedirectIntent = {
  routeName: string;
  params?: Record<string, unknown>;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    userType: "user" | "club_owner" | "admin"
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

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track whether we've completed the initial auth resolution
  const initializedRef = useRef(false);

  useEffect(() => {
    console.log("AuthContext: Setting up auth state listener");

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // Authenticated: load profile and set user
          console.log("AuthContext: Firebase user detected, loading profile...");
          const userProfile = await FirebaseService.getUserProfile(firebaseUser.uid);
          console.log("AuthContext: User profile loaded:", userProfile?.email);
          setUser(userProfile);
        } else {
          // No firebase user
          if (!initializedRef.current) {
            // First time: don't clear user state yet, just mark initialized.
            // This avoids briefly showing signed-out UI while we resolve initial state.
            console.log("AuthContext: No Firebase user on initial check — deferring clearing user until initialized.");
          } else {
            // After initial load, a null firebaseUser means the user is signed out.
            console.log("AuthContext: Firebase user is null after initialization — clearing user.");
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
        console.log("AuthContext: Auth state resolved. isLoading = false");
      }
    });

    return () => {
      console.log("AuthContext: Cleaning up auth listener");
      unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      await FirebaseService.signIn(email, password);
      console.log("AuthContext: Sign in successful");
      // onAuthStateChanged will populate user
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
    userType: "user" | "club_owner" | "admin"
  ) => {
    setIsLoading(true);
    try {
      await FirebaseService.signUp(email, password, userType);
      console.log("AuthContext: Sign up successful");
      // onAuthStateChanged will populate user
    } catch (error) {
      console.error("AuthContext: Sign up failed:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * signOut
   *
   * - Performs sign out via FirebaseService.
   * - Clears local user state here so the app can render the unauthenticated main screen.
   * - Does NOT perform any navigation; navigation decisions should be handled by the caller.
   */
  const signOut = async () => {
    setIsLoading(true);
    try {
      console.log("AuthContext: Signing out...");
      await FirebaseService.signOut();
      // Clear local user state explicitly so UI can immediately reflect unauthenticated state.
      setUser(null);
      console.log("AuthContext: Signed out successfully and local user cleared");
    } catch (error) {
      console.error("AuthContext: Sign out error:", error);
      // Ensure local state is cleared even if signOut failed at the service level
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const updateProfile = async (data: { displayName?: string; photoURL?: string }) => {
    if (!user) throw new Error("No user logged in");
    await FirebaseService.updateUserProfile(user.id, data);
    setUser({ ...user, ...data });
  };

  // --- Soft-auth redirect intent helpers ---
  const setRedirectIntent = (intent: RedirectIntent) => {
    try {
      sessionStorage.setItem(REDIRECT_INTENT_KEY, JSON.stringify(intent));
      console.log("AuthContext: Redirect intent saved", intent);
    } catch (err) {
      console.warn("AuthContext: Failed to save redirect intent", err);
    }
  };

  const consumeRedirectIntent = (): RedirectIntent | null => {
    try {
      const raw = sessionStorage.getItem(REDIRECT_INTENT_KEY);
      if (!raw) return null;
      sessionStorage.removeItem(REDIRECT_INTENT_KEY);
      const parsed = JSON.parse(raw) as RedirectIntent;
      console.log("AuthContext: Redirect intent consumed", parsed);
      return parsed;
    } catch (err) {
      console.warn("AuthContext: Failed to consume redirect intent", err);
      return null;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    signIn,
    signUp,
    signOut,
    updateProfile,
    setRedirectIntent,
    consumeRedirectIntent,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
