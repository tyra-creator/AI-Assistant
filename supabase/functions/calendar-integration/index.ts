// Updated calendar-integration function
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CalendarRequest {
  action: 'get_events' | 'create_event' | 'update_event' | 'delete_event' | 'check_availability';
  date?: string;
  start_date?: string;
  end_date?: string;
  timeMin?: string;
  timeMax?: string;
  event?: {
    title: string;
    description?: string;
    start: string;
    end: string;
    attendees?: string[];
    location?: string;
    conferenceData?: {
      createRequest?: {
        requestId: string;
        conferenceSolutionKey: { type: string };
      };
    };
  };
  eventId?: string;
  attendeeEmails?: string[];
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

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's OAuth token
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('google_access_token, microsoft_access_token')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      throw new Error('User profile not found');
    }

    const accessToken = profile.google_access_token || profile.microsoft_access_token;
    if (!accessToken) {
      throw new Error('No valid OAuth token found');
    }

    const requestData: CalendarRequest = await req.json();
    const apiBase = profile.microsoft_access_token ? 
      'https://graph.microsoft.com/v1.0/me' : 
      'https://www.googleapis.com/calendar/v3';

    switch (requestData.action) {
      case 'get_events': {
        let url = '';
        if (profile.microsoft_access_token) {
          url = `${apiBase}/calendar/events?$select=subject,body,start,end,location,attendees&$orderby=start/dateTime`;
          if (requestData.timeMin) url += `&$filter=start/dateTime ge '${requestData.timeMin}'`;
          if (requestData.timeMax) url += ` and end/dateTime le '${requestData.timeMax}'`;
        } else {
          url = `${apiBase}/calendars/primary/events?singleEvents=true&orderBy=startTime`;
          if (requestData.timeMin) url += `&timeMin=${encodeURIComponent(requestData.timeMin)}`;
          if (requestData.timeMax) url += `&timeMax=${encodeURIComponent(requestData.timeMax)}`;
        }

        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to fetch events');

        return new Response(JSON.stringify({
          events: profile.microsoft_access_token ? data.value : data.items,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'create_event': {
        if (!requestData.event) throw new Error('Missing event data');

        let eventPayload: any;
        if (profile.microsoft_access_token) {
          eventPayload = {
            subject: requestData.event.title,
            body: {
              contentType: 'HTML',
              content: requestData.event.description || '',
            },
            start: {
              dateTime: requestData.event.start,
              timeZone: 'UTC',
            },
            end: {
              dateTime: requestData.event.end,
              timeZone: 'UTC',
            },
            location: {
              displayName: requestData.event.location || '',
            },
            attendees: (requestData.event.attendees || []).map(email => ({
              emailAddress: { address: email },
              type: 'required',
            })),
          };
        } else {
          eventPayload = {
            summary: requestData.event.title,
            description: requestData.event.description || '',
            start: { dateTime: requestData.event.start, timeZone: 'UTC' },
            end: { dateTime: requestData.event.end, timeZone: 'UTC' },
            attendees: (requestData.event.attendees || []).map(email => ({ email })),
            location: requestData.event.location || '',
            conferenceData: requestData.event.conferenceData,
          };
        }

        const endpoint = profile.microsoft_access_token ?
          `${apiBase}/calendar/events` :
          `${apiBase}/calendars/primary/events`;

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(eventPayload),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to create event');

        return new Response(JSON.stringify({
          message: 'Event created successfully',
          event: data,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'check_availability': {
        if (!requestData.attendeeEmails || !requestData.start_date || !requestData.end_date) {
          throw new Error('Missing required parameters for availability check');
        }

        if (profile.microsoft_access_token) {
          const availabilityPayload = {
            attendees: requestData.attendeeEmails.map(email => ({
              emailAddress: { address: email },
              type: 'required',
            })),
            timeConstraint: {
              timeslots: [{
                start: { dateTime: requestData.start_date, timeZone: 'UTC' },
                end: { dateTime: requestData.end_date, timeZone: 'UTC' },
              }],
            },
            meetingDuration: 'PT30M',
          };

          const response = await fetch(`${apiBase}/findMeetingTimes`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(availabilityPayload),
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'Failed to check availability');

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          // Google Calendar availability check implementation would go here
          throw new Error('Availability check not implemented for Google Calendar');
        }
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