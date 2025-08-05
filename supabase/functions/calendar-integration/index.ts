import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarRequest {
  action: 'get_events' | 'create_event' | 'update_event' | 'delete_event';
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

async function refreshGoogleAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
    client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to refresh Google token: ${errText}`);
  }

  const data = await res.json();
  return data; // contains access_token, expires_in, etc
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      }
    );

    // Authenticate user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    const requestData: CalendarRequest = await req.json();

    // Fetch user OAuth tokens and expiry
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('google_access_token, google_refresh_token, google_token_expires_at')
      .eq('user_id', user.id)
      .single();

    if (profileError || !profile) throw new Error('User profile or OAuth tokens not found');

    let accessToken = profile.google_access_token;
    const refreshToken = profile.google_refresh_token;
    const expiresAt = profile.google_token_expires_at;

    // If token expired or about to expire (within 1 minute), refresh it
    const now = Math.floor(Date.now() / 1000);
    if (!accessToken || !expiresAt || expiresAt - now < 60) {
      if (!refreshToken) throw new Error('No refresh token available, please re-authenticate');

      const refreshedTokens = await refreshGoogleAccessToken(refreshToken);
      accessToken = refreshedTokens.access_token;

      const newExpiresAt = refreshedTokens.expires_in
        ? now + refreshedTokens.expires_in
        : null;

      // Update tokens in DB
      await supabaseClient
        .from('profiles')
        .update({
          google_access_token: refreshedTokens.access_token,
          google_token_expires_at: newExpiresAt,
          // Note: Google usually doesn't return new refresh token here, keep old one
        })
        .eq('user_id', user.id);
    }

    const calendarApiBase = 'https://www.googleapis.com/calendar/v3';

    switch (requestData.action) {
      case 'get_events': {
        let url = `${calendarApiBase}/calendars/primary/events?orderBy=startTime&singleEvents=true`;
        if (requestData.date) {
          const start = new Date(requestData.date);
          const end = new Date(start);
          end.setDate(end.getDate() + 1);
          url += `&timeMin=${start.toISOString()}&timeMax=${end.toISOString()}`;
        } else if (requestData.start_date && requestData.end_date) {
          url += `&timeMin=${new Date(requestData.start_date).toISOString()}`;
          url += `&timeMax=${new Date(requestData.end_date).toISOString()}`;
        } else {
          const nowDate = new Date();
          url += `&timeMin=${nowDate.toISOString()}`;
          const nextWeek = new Date();
          nextWeek.setDate(nextWeek.getDate() + 7);
          url += `&timeMax=${nextWeek.toISOString()}`;
        }

        const eventsRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });

        if (!eventsRes.ok) {
          const errText = await eventsRes.text();
          throw new Error(`Google Calendar API error (${eventsRes.status}): ${errText}`);
        }

        const eventsData = await eventsRes.json();

        return new Response(JSON.stringify({
          events: eventsData.items,
          message: `Found ${eventsData.items.length} events`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'create_event': {
        if (!requestData.event) throw new Error('Event data is required for creation');

        const newEventPayload = {
          summary: requestData.event.title,
          description: requestData.event.description || '',
          start: { dateTime: requestData.event.start },
          end: { dateTime: requestData.event.end },
          attendees: (requestData.event.attendees || []).map(email => ({ email })),
        };

        const createRes = await fetch(`${calendarApiBase}/calendars/primary/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(newEventPayload),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Google Calendar API error (${createRes.status}): ${errText}`);
        }

        const createdEvent = await createRes.json();

        return new Response(JSON.stringify({
          event: createdEvent,
          message: 'Event created successfully'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'update_event': {
        if (!requestData.eventId || !requestData.event) throw new Error('eventId and event data are required for update');

        const updatePayload = {
          summary: requestData.event.title,
          description: requestData.event.description || '',
          start: { dateTime: requestData.event.start },
          end: { dateTime: requestData.event.end },
          attendees: (requestData.event.attendees || []).map(email => ({ email })),
        };

        const updateRes = await fetch(`${calendarApiBase}/calendars/primary/events/${requestData.eventId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });

        if (!updateRes.ok) {
          const errText = await updateRes.text();
          throw new Error(`Google Calendar API error (${updateRes.status}): ${errText}`);
        }

        const updatedEvent = await updateRes.json();

        return new Response(JSON.stringify({
          event: updatedEvent,
          message: 'Event updated successfully'
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'delete_event': {
        if (!requestData.eventId) throw new Error('eventId is required for delete');

        const deleteRes = await fetch(`${calendarApiBase}/calendars/primary/events/${requestData.eventId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!deleteRes.ok) {
          const errText = await deleteRes.text();
          throw new Error(`Google Calendar API error (${deleteRes.status}): ${errText}`);
        }

        return new Response(JSON.stringify({
          message: `Event with id ${requestData.eventId} deleted successfully`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      default:
        throw new Error(`Unsupported action: ${requestData.action}`);
    }

  } catch (error) {
    console.error('Error in calendar-integration function:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
