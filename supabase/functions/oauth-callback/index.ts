// Updated oauth-callback function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OAuthCallbackRequest {
  provider: "google" | "microsoft";
  code: string;
  state?: string;
  user_id: string;
  redirect_uri?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const requestData: OAuthCallbackRequest = await req.json();
    const redirectUri = requestData.redirect_uri || 
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/oauth-callback`;

    let tokenResponse;
    let userInfo;
    let updateData: any = {};

    if (requestData.provider === "google") {
      tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
          code: requestData.code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokens = await tokenResponse.json();
      if (!tokens.access_token) throw new Error("Google OAuth failed");

      // Get user info and verify email scope
      const userResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );
      userInfo = await userResponse.json();

      updateData = {
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_expires_at: Date.now() + (tokens.expires_in * 1000),
        google_user_info: userInfo,
        email: userInfo.email,
      };

    } else if (requestData.provider === "microsoft") {
      tokenResponse = await fetch(
        "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: Deno.env.get("MICROSOFT_CLIENT_ID") || "",
            client_secret: Deno.env.get("MICROSOFT_CLIENT_SECRET") || "",
            code: requestData.code,
            grant_type: "authorization_code",
            redirect_uri: redirectUri,
            scope: "openid email profile Calendars.ReadWrite Mail.Send offline_access",
          }),
        }
      );

      const tokens = await tokenResponse.json();
      if (!tokens.access_token) throw new Error("Microsoft OAuth failed");

      // Get user info
      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      userInfo = await userResponse.json();

      // Get user email
      const emailResponse = await fetch("https://graph.microsoft.com/v1.0/me/mailboxSettings", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const emailData = await emailResponse.json();

      updateData = {
        microsoft_access_token: tokens.access_token,
        microsoft_refresh_token: tokens.refresh_token,
        microsoft_expires_at: Date.now() + (tokens.expires_in * 1000),
        microsoft_user_info: userInfo,
        email: emailData.userEmailAddress || userInfo.mail || userInfo.userPrincipalName,
      };
    }

    // Update user profile with OAuth data
    const { error } = await supabaseClient
      .from("profiles")
      .upsert({
        user_id: requestData.user_id,
        ...updateData,
        updated_at: new Date().toISOString(),
      });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        message: `${requestData.provider} OAuth integration successful`,
        user_info: userInfo,
        email: updateData.email,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in oauth-callback function:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "OAuth integration failed",
        details: error.stack,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});