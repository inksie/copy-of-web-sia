'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  updateProfile,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';

type AppRole = 'instructor';

interface AppUser {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
  user_metadata?: Record<string, unknown>;
  displayName?: string;
  role: AppRole;
}

interface AppSession {
  access_token: string;
  expires_in: number;
  token_type: string;
  user: AppUser;
}

interface AuthContextType {
  user: AppUser | null;
  session: AppSession | null;
  loading: boolean;
  userRole: AppRole | null;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  firebaseUser: FirebaseUser | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(false); // Start as false for faster initial load
  const [userRole, setUserRole] = useState<AppRole | null>(null);

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // User is signed in - set basic user info immediately
          setFirebaseUser(firebaseUser);
          
          // Create basic app user from Firebase data immediately
          const basicAppUser: AppUser = {
            id: firebaseUser.uid,
            email: firebaseUser.email || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            user_metadata: {
              full_name: firebaseUser.displayName || '',
            },
            displayName: firebaseUser.displayName || '',
            role: 'instructor',
          };
          
          setUser(basicAppUser);
          setUserRole('instructor');
          
          const token = await firebaseUser.getIdToken();
          const appSession: AppSession = {
            access_token: token,
            expires_in: 3600,
            token_type: 'bearer',
            user: basicAppUser,
          };
          setSession(appSession);
          
          // Then fetch additional data from Firestore in background (non-blocking)
          // Wrap in try-catch to silently handle offline/permission errors
          try {
            getDoc(doc(db, 'users', firebaseUser.uid))
              .then((userDoc) => {
                const userData = userDoc.data();
                if (userData) {
                  setUser((prev) =>
                    prev
                      ? {
                          ...prev,
                          created_at: userData?.createdAt?.toDate?.().toISOString() || prev.created_at,
                          updated_at: userData?.updatedAt?.toDate?.().toISOString() || prev.updated_at,
                          user_metadata: {
                            full_name: userData?.fullName || prev.displayName || '',
                          },
                          displayName: userData?.fullName || prev.displayName || '',
                        }
                      : prev
                  );
                }
              })
              .catch(() => {
                // Silently fail - user is already logged in with basic Firebase data
              });
          } catch {
            // Ignore errors - not critical
          }
        } else {
          // User is signed out
          setFirebaseUser(null);
          setUser(null);
          setSession(null);
          setUserRole(null);
        }
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Sign up with Firebase
  const signUp = async (email: string, password: string, fullName: string) => {
    try {
      // Validate inputs
      if (!email.trim()) {
        return { error: new Error('Email is required') };
      }

      if (!password || password.length < 6) {
        return { error: new Error('Password must be at least 6 characters') };
      }

      if (!fullName.trim()) {
        return { error: new Error('Full name is required') };
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { error: new Error('Please enter a valid email address') };
      }

      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Update display name
      await updateProfile(firebaseUser, {
        displayName: fullName,
      });

      // Create user document in Firestore
      try {
        await setDoc(doc(db, 'users', firebaseUser.uid), {
          email: email,
          fullName: fullName,
          role: 'instructor', // All users are instructors
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (firestoreError: any) {
        console.warn('Could not save user to Firestore:', firestoreError?.message);
        // Continue even if Firestore write fails - user is created in Auth
      }

      return { error: null };
    } catch (error: any) {
      console.error('Sign up error:', error);

      // Map Firebase error codes to user-friendly messages
      let userMessage = 'Failed to create account. Please try again.';

      if (error.code === 'auth/email-already-in-use') {
        userMessage = 'An account with this email already exists';
      } else if (error.code === 'auth/invalid-email') {
        userMessage = 'Invalid email address';
      } else if (error.code === 'auth/weak-password') {
        userMessage = 'Password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/operation-not-allowed') {
        userMessage = 'Account creation is currently disabled';
      } else if (error.message) {
        userMessage = error.message;
      }

      return { error: new Error(userMessage) };
    }
  };

  // Sign in with Firebase
  const signIn = async (email: string, password: string) => {
    try {
      // Validate inputs
      if (!email.trim()) {
        const error = new Error('Email is required');
        return { error };
      }

      if (!password) {
        const error = new Error('Password is required');
        return { error };
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        const error = new Error('Please enter a valid email address');
        return { error };
      }

      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      console.error('Sign in error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);

      // Map Firebase error codes to user-friendly messages
      let userMessage = 'Failed to sign in. Please check your credentials.';

      if (error.code === 'auth/user-not-found') {
        userMessage = 'No account found with this email address. Please sign up first.';
      } else if (error.code === 'auth/wrong-password') {
        userMessage = 'Incorrect password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        userMessage = 'Invalid email address';
      } else if (error.code === 'auth/invalid-credential') {
        userMessage = 'Invalid email or password. Please check and try again.';
      } else if (error.code === 'auth/user-disabled') {
        userMessage = 'This account has been disabled';
      } else if (error.code === 'auth/too-many-requests') {
        userMessage = 'Too many failed login attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        userMessage = 'Network error. Please check your internet connection.';
      } else if (error.code === 'auth/internal-error') {
        userMessage = 'Firebase authentication error. Please check your Firebase configuration.';
      } else if (error.message?.includes('PERMISSION_DENIED')) {
        userMessage = 'Firebase authentication is not properly configured. Contact administrator.';
      } else if (error.message) {
        userMessage = error.message;
      }

      return { error: new Error(userMessage) };
    }
  };

  // Sign out from Firebase
  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <AuthContext.Provider 
      value={{ 
        user, 
        session, 
        loading, 
        userRole, 
        signUp, 
        signIn, 
        signOut,
        firebaseUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
