import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface UserProfile {
  id: string;
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  google_expires_at: string | null;
  google_user_info: any;
  microsoft_access_token: string | null;
  microsoft_refresh_token: string | null;
  microsoft_expires_at: string | null;
  microsoft_user_info: any;
  created_at: string;
  updated_at: string;
}

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('=== Auth State Change ===');
        console.log('Event:', event);
        console.log('Session exists:', !!session);
        console.log('User ID:', session?.user?.id);
        console.log('Access token exists:', !!session?.access_token);
        console.log('Refresh token exists:', !!session?.refresh_token);
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch user profile when user is authenticated
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('user_id', session.user.id)
            .single();
          
          setProfile(profileData);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('=== Initial Session Check ===');
      console.log('Session exists:', !!session);
      console.log('Session error:', error);
      console.log('User ID:', session?.user?.id);
      console.log('Access token exists:', !!session?.access_token);
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Fetch user profile for existing session
        supabase
          .from('profiles')
          .select('*')
          .eq('user_id', session.user.id)
          .single()
          .then(({ data: profileData, error: profileError }) => {
            console.log('Profile data:', profileData);
            console.log('Profile error:', profileError);
            setProfile(profileData);
            setLoading(false);
          });
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setSession(null);
      setProfile(null);
    }
    return { error };
  };

  const getDisplayName = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    if (profile?.first_name) {
      return profile.first_name;
    }
    if (user?.email) {
      return user.email.split('@')[0];
    }
    return 'User';
  };

  const getInitials = () => {
    if (profile?.first_name && profile?.last_name) {
      return `${profile.first_name[0]}${profile.last_name[0]}`.toUpperCase();
    }
    if (profile?.first_name) {
      return profile.first_name[0].toUpperCase();
    }
    if (user?.email) {
      return user.email[0].toUpperCase();
    }
    return 'U';
  };

  const refreshSession = async () => {
    console.log('=== Manual Session Refresh ===');
    const { data, error } = await supabase.auth.refreshSession();
    console.log('Refresh result:', { data: !!data.session, error });
    return { data, error };
  };

  return {
    user,
    session,
    profile,
    loading,
    signOut,
    refreshSession,
    getDisplayName,
    getInitials,
    isAuthenticated: !!user,
  };
};