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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // ✅ Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // ✅ Get user's Google access token from profile
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('google_access_token')
      .eq('user_id', user.id)
      .single();

    if (!profile || !profile.google_access_token) {
      throw new Error('Google access token not found');
    }

    const accessToken = profile.google_access_token;
    const requestData: CalendarRequest = await req.json();

    switch (requestData.action) {
      case 'create_event': {
        if (!requestData.event) {
          throw new Error('Missing event data');
        }

        const eventPayload = {
          summary: requestData.event.title,
          description: requestData.event.description || '',
          start: {
            dateTime: requestData.event.start,
            timeZone: 'Africa/Harare',
          },
          end: {
            dateTime: requestData.event.end,
            timeZone: 'Africa/Harare',
          },
          attendees: (requestData.event.attendees || []).map(email => ({ email })),
        };

        const googleResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        });

        const responseData = await googleResponse.json();

        if (!googleResponse.ok) {
          throw new Error(responseData.error?.message || 'Failed to create Google Calendar event');
        }

        return new Response(JSON.stringify({
          message: 'Event created successfully',
          event: responseData,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unsupported action: ${requestData.action}`);
    }

  } catch (error) {
    console.error('Error in calendar-integration function:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal server error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
