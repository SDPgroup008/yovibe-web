"use client";

import type React from "react";
import { createContext, useState, useEffect, useContext, useCallback } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, isFirebaseConfigured } from "../config/firebase";
import FirebaseService from "../services/FirebaseService";
import type { User, UserType } from "../models/User";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, userType: UserType) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "yovibe_user_data";

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUserState = useCallback(async (newUser: User | null) => {
    console.log("AuthContext: Updating user state:", newUser ? newUser.email : "null");
    setUser(newUser ? { ...newUser } : null);
    try {
      if (newUser) {
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(newUser));
      } else {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    } catch (error) {
      console.error("AuthContext: Error updating storage:", error);
    }
    console.log("AuthContext: User state updated successfully");
  }, []);

  useEffect(() => {
    const loadStoredUser = () => {
      try {
        console.log("AuthContext: Loading stored user...");
        const storedUser = localStorage.getItem(USER_STORAGE_KEY);
        if (storedUser) {
          const parsedUser = JSON.parse(storedUser);
          parsedUser.createdAt = new Date(parsedUser.createdAt);
          parsedUser.lastLoginAt = new Date(parsedUser.lastLoginAt);
          console.log("AuthContext: Loaded stored user:", parsedUser.email);
          setUser(parsedUser);
        } else {
          console.log("AuthContext: No stored user found");
        }
      } catch (error) {
        console.error("AuthContext: Error loading stored user:", error);
      }
    };

    loadStoredUser();
  }, []);

  useEffect(() => {
    console.log("AuthContext: Setting up auth state listener");
    if (!isFirebaseConfigured) {
      console.log("AuthContext: Firebase not configured - skipping auth state listener");
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      console.log("AuthContext: Auth state changed:", firebaseUser ? firebaseUser.email : "No user");
      if (firebaseUser) {
        try {
          console.log("AuthContext: Getting user profile for:", firebaseUser.email);
          const userProfile = await FirebaseService.getUserProfile(firebaseUser.uid);
          console.log("AuthContext: User profile loaded successfully:", userProfile.email);
          await updateUserState(userProfile);
        } catch (error) {
          console.error("AuthContext: Error loading user profile:", error);
          await updateUserState(null);
        }
      } else {
        console.log("AuthContext: No Firebase user, clearing state");
        await updateUserState(null);
      }
      setLoading(false);
    });

    return () => {
      console.log("AuthContext: Cleaning up auth state listener");
      unsubscribe();
    };
  }, [updateUserState]);

  const signIn = async (email: string, password: string) => {
    console.log("AuthContext: Attempting to sign in:", email);
    try {
      if (!isFirebaseConfigured) {
        console.log("AuthContext: Development mode signin");
        const mockUser = {
          id: "dev-user-id",
          uid: "dev-uid",
          email: email,
          userType: "user" as UserType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        };
        await updateUserState(mockUser);
        console.log("AuthContext: Development signin successful");
        return;
      }
      await FirebaseService.signIn(email, password);
      console.log("AuthContext: Firebase signin successful");
    } catch (error) {
      console.error("AuthContext: Error signing in:", error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, userType: UserType) => {
    console.log("AuthContext: Attempting to sign up:", email, "as", userType);
    try {
      if (!isFirebaseConfigured) {
        console.log("AuthContext: Development mode signup");
        const mockUser = {
          id: "dev-user-id",
          uid: "dev-uid",
          email: email,
          userType: userType,
          createdAt: new Date(),
          lastLoginAt: new Date(),
        };
        await updateUserState(mockUser);
        console.log("AuthContext: Development signup successful");
        return;
      }
      await FirebaseService.signUp(email, password, userType);
      console.log("AuthContext: Firebase signup successful");
    } catch (error) {
      console.error("AuthContext: Error signing up:", error);
      throw error;
    }
  };

  const signOut = async () => {
    console.log("AuthContext: Attempting to sign out");
    setLoading(true);
    try {
      if (!isFirebaseConfigured) {
        console.log("AuthContext: Development mode signout");
        await updateUserState(null);
        localStorage.removeItem(USER_STORAGE_KEY); // Clear storage
        console.log("AuthContext: Development signout successful");
        return;
      }
      await FirebaseService.signOut();
      await updateUserState(null);
      localStorage.removeItem(USER_STORAGE_KEY); // Clear storage
      console.log("AuthContext: Firebase signout successful");
    } catch (error) {
      console.error("AuthContext: Error signing out:", error);
      await updateUserState(null);
      localStorage.removeItem(USER_STORAGE_KEY); // Clear storage
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    if (!user) {
      throw new Error("No user logged in");
    }
    console.log("AuthContext: Updating user profile:", data);
    try {
      if (!isFirebaseConfigured) {
        console.log("AuthContext: Development mode profile update");
        const updatedUser = { ...user, ...data };
        await updateUserState(updatedUser);
        console.log("AuthContext: Development profile update successful");
        return;
      }
      await FirebaseService.updateUserProfile(user.id, data);
      const updatedUser = { ...user, ...data };
      await updateUserState(updatedUser);
      console.log("AuthContext: Profile update successful");
    } catch (error) {
      console.error("AuthContext: Error updating profile:", error);
      throw error;
    }
  };

  useEffect(() => {
    console.log("AuthContext: State update:", {
      hasUser: !!user,
      userEmail: user?.email,
      userType: user?.userType,
      loading,
      timestamp: new Date().toISOString(),
    });
  }, [user, loading]);

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};