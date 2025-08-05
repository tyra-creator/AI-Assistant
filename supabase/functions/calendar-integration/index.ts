import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CalendarRequest {
  action: "get_events" | "create_event" | "update_event" | "delete_event";
  date?: string;
  start_date?: string;
  end_date?: string;
  event_id?: string;
  event?: {
    title?: string;
    description?: string;
    start?: string;
    end?: string;
    attendees?: string[];
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error("Unauthorized");

    const requestData: CalendarRequest = await req.json();

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("google_access_token, google_refresh_token")
      .eq("user_id", user.id)
      .single();

    if (profileError) throw new Error("Could not fetch user profile");

    if (!profile?.google_access_token || !profile?.google_refresh_token) {
      throw new Error("Missing Google tokens");
    }

    let accessToken = profile.google_access_token;

    const fetchWithRetry = async (url: string, options: RequestInit, isRetry = false): Promise<Response> => {
      const res = await fetch(url, options);

      if (res.status === 401 && !isRetry) {
        const refreshed = await refreshAccessToken(profile.google_refresh_token);
        if (refreshed?.access_token) {
          accessToken = refreshed.access_token;

          await supabase
            .from("profiles")
            .update({ google_access_token: refreshed.access_token })
            .eq("user_id", user.id);

          options.headers = {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
          };
          return fetch(url, options);
        } else {
          throw new Error("Failed to refresh token");
        }
      }

      return res;
    };

    const calendarId = "primary";
    const apiBase = "https://www.googleapis.com/calendar/v3/calendars";

    switch (requestData.action) {
      case "get_events": {
        const timeMin = requestData.start_date || new Date().toISOString();
        const timeMax = requestData.end_date || new Date(Date.now() + 7 * 86400000).toISOString();

        const url = `${apiBase}/${calendarId}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

        const res = await fetchWithRetry(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) throw new Error("Failed to fetch events");
        const events = await res.json();

        return new Response(JSON.stringify({ events: events.items }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "create_event": {
        const event = {
          summary: requestData.event?.title,
          description: requestData.event?.description,
          start: { dateTime: requestData.event?.start },
          end: { dateTime: requestData.event?.end },
          attendees: requestData.event?.attendees?.map(email => ({ email })),
        };

        const res = await fetchWithRetry(`${apiBase}/${calendarId}/events`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(event),
        });

        if (!res.ok) throw new Error("Failed to create event");
        const data = await res.json();

        return new Response(JSON.stringify({ event: data, message: "Event created" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "update_event": {
        if (!requestData.event_id) throw new Error("Missing event ID");

        const updatePayload: any = {};
        if (requestData.event?.title) updatePayload.summary = requestData.event.title;
        if (requestData.event?.description) updatePayload.description = requestData.event.description;
        if (requestData.event?.start) updatePayload.start = { dateTime: requestData.event.start };
        if (requestData.event?.end) updatePayload.end = { dateTime: requestData.event.end };
        if (requestData.event?.attendees)
          updatePayload.attendees = requestData.event.attendees.map(email => ({ email }));

        const res = await fetchWithRetry(`${apiBase}/${calendarId}/events/${requestData.event_id}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        });

        if (!res.ok) throw new Error("Failed to update event");
        const updatedEvent = await res.json();

        return new Response(JSON.stringify({ event: updatedEvent, message: "Event updated" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "delete_event": {
        if (!requestData.event_id) throw new Error("Missing event ID");

        const res = await fetchWithRetry(`${apiBase}/${calendarId}/events/${requestData.event_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!res.ok) throw new Error("Failed to delete event");

        return new Response(JSON.stringify({ message: "Event deleted successfully" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      default:
        throw new Error("Unsupported action");
    }
  } catch (err) {
    console.error("Google Calendar error:", err);
    return new Response(JSON.stringify({ error: err.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Refresh token helper
async function refreshAccessToken(refresh_token: string) {
  const client_id = Deno.env.get("GOOGLE_CLIENT_ID")!;
  const client_secret = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id,
      client_secret,
      grant_type: "refresh_token",
      refresh_token,
    }),
  });

  if (!res.ok) {
    console.error("Failed to refresh token", await res.text());
    return null;
  }

  return await res.json();
}
