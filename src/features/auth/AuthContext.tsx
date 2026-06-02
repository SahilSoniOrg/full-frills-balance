import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { authService } from './AuthService';
import { accountBootstrapService } from './AccountBootstrapService';

export interface Profile {
  id: string;
  display_name?: string;
  email?: string;
}

interface AuthContextValue {
  isAuthenticated: boolean;
  userId: string | null;
  profile: Profile | null;
  isLoading: boolean;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Wait for the first onAuthStateChange to fire so we know if we have a session
    const {
      data: { subscription },
    } = authService.onAuthStateChanged((event, newSession) => {
      setSession(newSession);
      setIsLoading(false);

      if (newSession?.user && event === 'SIGNED_IN') {
        accountBootstrapService.bootstrapUser(newSession.user);
      } else if (newSession?.user && event === 'INITIAL_SESSION') {
        // Also run on startup just in case previous bootstrap failed
        accountBootstrapService.bootstrapUser(newSession.user);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user?.id || null;
  const profile: Profile | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        display_name: session.user.user_metadata?.full_name,
      }
    : null;

  const value: AuthContextValue = {
    isAuthenticated: !!session,
    userId,
    profile,
    isLoading,
    signOut: () => authService.signOut(),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
