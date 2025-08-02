import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OAuthCallbackRequest {
  provider: 'google' | 'microsoft';
  code: string;
  state?: string;
  user_id: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const requestData: OAuthCallbackRequest = await req.json();

    // Exchange authorization code for access token
    let tokenResponse;
    let userInfo;

    if (requestData.provider === 'google') {
      // Exchange code for Google OAuth tokens
      tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
          code: requestData.code,
          grant_type: 'authorization_code',
          redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.access_token) {
        // Get user info from Google
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        });
        userInfo = await userResponse.json();

        // Store tokens and user info in profile
        await supabaseClient
          .from('profiles')
          .update({
            google_access_token: tokens.access_token,
            google_refresh_token: tokens.refresh_token,
            google_user_info: userInfo
          })
          .eq('user_id', requestData.user_id);
      }

    } else if (requestData.provider === 'microsoft') {
      // Exchange code for Microsoft OAuth tokens
      tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: Deno.env.get('MICROSOFT_CLIENT_ID') ?? '',
          client_secret: Deno.env.get('MICROSOFT_CLIENT_SECRET') ?? '',
          code: requestData.code,
          grant_type: 'authorization_code',
          redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/oauth-callback`,
          scope: 'https://graph.microsoft.com/user.read https://graph.microsoft.com/calendars.read https://graph.microsoft.com/mail.read'
        }),
      });

      const tokens = await tokenResponse.json();

      if (tokens.access_token) {
        // Get user info from Microsoft Graph
        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`
          }
        });
        userInfo = await userResponse.json();

        // Store tokens and user info in profile
        await supabaseClient
          .from('profiles')
          .update({
            microsoft_access_token: tokens.access_token,
            microsoft_refresh_token: tokens.refresh_token,
            microsoft_user_info: userInfo
          })
          .eq('user_id', requestData.user_id);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `${requestData.provider} OAuth integration successful`,
      user_info: userInfo
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in oauth-callback function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'OAuth integration failed' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});