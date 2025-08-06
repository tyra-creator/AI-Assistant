import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useOAuthTokens = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const handleOAuthCallback = async () => {
      // Check if we're on the app page after OAuth redirect
      if (location.pathname === '/app') {
        try {
          // Get the current session
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          
          if (sessionError || !session?.user) {
            console.error('No session found after OAuth redirect');
            return;
          }

          // Check if this is an OAuth login (provider_token exists)
          if (session.provider_token || session.provider_refresh_token) {
            console.log('OAuth session detected, extracting tokens...');
            
            // Extract OAuth provider info
            const provider = session.user.app_metadata?.provider;
            const providerToken = session.provider_token;
            const providerRefreshToken = session.provider_refresh_token;
            
            if (!provider || !providerToken) {
              console.error('Missing provider or token information');
              return;
            }

            // Prepare user info based on provider
            let userInfo = {};
            if (provider === 'google') {
              userInfo = {
                email: session.user.email,
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                picture: session.user.user_metadata?.avatar_url,
                id: session.user.user_metadata?.sub,
              };
            } else if (provider === 'azure') {
              userInfo = {
                email: session.user.email,
                name: session.user.user_metadata?.full_name || session.user.user_metadata?.name,
                picture: session.user.user_metadata?.avatar_url,
                id: session.user.user_metadata?.sub,
              };
            }

            // Calculate token expiry (usually 1 hour from now)
            const expiresAt = new Date(Date.now() + 3600000).toISOString();

            // Update profile with OAuth tokens
            const updateData: any = {
              email: session.user.email,
              first_name: session.user.user_metadata?.first_name || session.user.user_metadata?.given_name,
              last_name: session.user.user_metadata?.last_name || session.user.user_metadata?.family_name,
            };

            if (provider === 'google') {
              updateData.google_access_token = providerToken;
              updateData.google_refresh_token = providerRefreshToken;
              updateData.google_expires_at = expiresAt;
              updateData.google_user_info = userInfo;
            } else if (provider === 'azure') {
              updateData.microsoft_access_token = providerToken;
              updateData.microsoft_refresh_token = providerRefreshToken;
              updateData.microsoft_expires_at = expiresAt;
              updateData.microsoft_user_info = userInfo;
            }

            // Upsert the profile
            const { error: profileError } = await supabase
              .from('profiles')
              .upsert(
                {
                  user_id: session.user.id,
                  ...updateData,
                },
                {
                  onConflict: 'user_id',
                }
              );

            if (profileError) {
              console.error('Error saving OAuth tokens:', profileError);
              toast({
                title: "Connection Warning",
                description: "OAuth tokens saved, but there was an issue storing your profile. Please try reconnecting if calendar features don't work.",
                variant: "destructive",
              });
            } else {
              console.log('OAuth tokens successfully saved to profile');
              toast({
                title: "Account Connected",
                description: `Your ${provider === 'azure' ? 'Microsoft' : 'Google'} account has been connected successfully!`,
              });
            }
          }
        } catch (error) {
          console.error('Error processing OAuth callback:', error);
          toast({
            title: "Connection Error",
            description: "There was an issue connecting your account. Please try again.",
            variant: "destructive",
          });
        }
      }
    };

    // Run the callback handler
    handleOAuthCallback();
  }, [location.pathname, toast]);

  return null;
};