import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface CalendarRequest {
  action: "get_events" | "create_event" | "update_event" | "delete_event";
  date?: string;
  start_date?: string;
  end_date?: string;
  event?: {
    title: string;
    description?: string;
    start: string;
    end: string;
    attendees?: string[];
  };
  eventId?: string;
}

async function refreshGoogleToken(supabaseClient: any, userId: string, refreshToken: string): Promise<string> {
  // Use Google refresh token to get new access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error(`Failed to refresh Google token: ${await tokenResponse.text()}`);
  }

  const tokens = await tokenResponse.json();

  if (tokens.access_token) {
    // Update new access token in Supabase profile
    await supabaseClient
      .from("profiles")
      .update({ google_access_token: tokens.access_token })
      .eq("user_id", userId);
  }

  return tokens.access_token;
}

async function refreshMicrosoftToken(supabaseClient: any, userId: string, refreshToken: string): Promise<string> {
  // Use Microsoft refresh token to get new access token
  const tokenResponse = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: Deno.env.get("MICROSOFT_CLIENT_ID") || "",
        client_secret: Deno.env.get("MICROSOFT_CLIENT_SECRET") || "",
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope:
          "https://graph.microsoft.com/user.read https://graph.microsoft.com/calendars.readwrite offline_access",
      }),
    }
  );

  if (!tokenResponse.ok) {
    throw new Error(`Failed to refresh Microsoft token: ${await tokenResponse.text()}`);
  }

  const tokens = await tokenResponse.json();

  if (tokens.access_token) {
    // Update new access token in Supabase profile
    await supabaseClient
      .from("profiles")
      .update({ microsoft_access_token: tokens.access_token })
      .eq("user_id", userId);
  }

  return tokens.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") || "" },
        },
      }
    );

    // Get user from JWT
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const requestData: CalendarRequest = await req.json();

    // Get user's OAuth tokens and provider from profiles
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single();

    if (!profile) {
      throw new Error("User profile not found");
    }

    let accessToken: string | null = null;
    let provider: "google" | "microsoft" | null = null;

    if (profile.google_access_token && profile.google_refresh_token) {
      provider = "google";

      // Optionally: check if access token is expired here, else refresh anyway
      accessToken = await refreshGoogleToken(
        supabaseClient,
        user.id,
        profile.google_refresh_token
      );
    } else if (profile.microsoft_access_token && profile.microsoft_refresh_token) {
      provider = "microsoft";

      accessToken = await refreshMicrosoftToken(
        supabaseClient,
        user.id,
        profile.microsoft_refresh_token
      );
    } else {
      throw new Error("No OAuth tokens found for user");
    }

    // Now call the appropriate calendar API based on provider
    if (provider === "google") {
      const calendarBaseUrl = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

      if (requestData.action === "get_events") {
        // Build query params for date filtering
        let url = calendarBaseUrl;
        if (requestData.date) {
          const dayStart = new Date(requestData.date).toISOString();
          const dayEnd = new Date(new Date(requestData.date).getTime() + 24 * 60 * 60 * 1000).toISOString();
          url += `?timeMin=${encodeURIComponent(dayStart)}&timeMax=${encodeURIComponent(dayEnd)}`;
        } else if (requestData.start_date && requestData.end_date) {
          url += `?timeMin=${encodeURIComponent(new Date(requestData.start_date).toISOString())}&timeMax=${encodeURIComponent(new Date(requestData.end_date).toISOString())}`;
        }

        const eventsResponse = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!eventsResponse.ok) {
          throw new Error(`Google Calendar API error: ${await eventsResponse.text()}`);
        }

        const eventsData = await eventsResponse.json();

        return new Response(
          JSON.stringify({
            events: eventsData.items,
            message: `Found ${eventsData.items.length} events`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (requestData.action === "create_event") {
        if (!requestData.event) throw new Error("Event details required");

        // Prepare event body for Google Calendar API
        const eventBody = {
          summary: requestData.event.title,
          description: requestData.event.description || "",
          start: { dateTime: requestData.event.start },
          end: { dateTime: requestData.event.end },
          attendees: requestData.event.attendees?.map((email) => ({ email })) || [],
        };

        const createResponse = await fetch(calendarBaseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        });

        if (!createResponse.ok) {
          throw new Error(`Google Calendar API error: ${await createResponse.text()}`);
        }

        const createdEvent = await createResponse.json();

        return new Response(
          JSON.stringify({
            event: createdEvent,
            message: "Event created successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(`Unsupported action for Google provider: ${requestData.action}`);
      }
    } else if (provider === "microsoft") {
      const msGraphBaseUrl = "https://graph.microsoft.com/v1.0/me/events";

      if (requestData.action === "get_events") {
        // Build query params for date filtering using Microsoft Graph OData
        let filter = "";
        if (requestData.date) {
          const dayStart = new Date(requestData.date).toISOString();
          const dayEnd = new Date(new Date(requestData.date).getTime() + 24 * 60 * 60 * 1000).toISOString();
          filter = `?startDateTime=${encodeURIComponent(dayStart)}&endDateTime=${encodeURIComponent(dayEnd)}`;
        } else if (requestData.start_date && requestData.end_date) {
          filter = `?startDateTime=${encodeURIComponent(new Date(requestData.start_date).toISOString())}&endDateTime=${encodeURIComponent(new Date(requestData.end_date).toISOString())}`;
        }

        const eventsResponse = await fetch(`${msGraphBaseUrl}${filter}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!eventsResponse.ok) {
          throw new Error(`Microsoft Graph API error: ${await eventsResponse.text()}`);
        }

        const eventsData = await eventsResponse.json();

        return new Response(
          JSON.stringify({
            events: eventsData.value,
            message: `Found ${eventsData.value.length} events`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else if (requestData.action === "create_event") {
        if (!requestData.event) throw new Error("Event details required");

        // Prepare event body for Microsoft Graph API
        const eventBody = {
          subject: requestData.event.title,
          body: {
            contentType: "HTML",
            content: requestData.event.description || "",
          },
          start: {
            dateTime: requestData.event.start,
            timeZone: "UTC",
          },
          end: {
            dateTime: requestData.event.end,
            timeZone: "UTC",
          },
          attendees: requestData.event.attendees?.map((email) => ({
            emailAddress: { address: email, name: email },
            type: "required",
          })) || [],
        };

        const createResponse = await fetch(msGraphBaseUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        });

        if (!createResponse.ok) {
          throw new Error(`Microsoft Graph API error: ${await createResponse.text()}`);
        }

        const createdEvent = await createResponse.json();

        return new Response(
          JSON.stringify({
            event: createdEvent,
            message: "Event created successfully",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        throw new Error(`Unsupported action for Microsoft provider: ${requestData.action}`);
      }
    } else {
      throw new Error("No supported OAuth provider found");
    }
  } catch (error) {
    console.error("Error in calendar-integration function:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Internal server error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
