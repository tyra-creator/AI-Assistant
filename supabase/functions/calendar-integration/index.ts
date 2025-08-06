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
    title: string;import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      }
    );

    // ✅ Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    // ✅ Get user's calendar tokens
    const { data: profile } = await supabase
      .from('profiles')
      .select('google_access_token, microsoft_access_token')
      .eq('user_id', user.id)
      .single();

    if (!profile) throw new Error('User profile not found');
    const accessToken = profile.google_access_token || profile.microsoft_access_token;
    const isMicrosoft = !!profile.microsoft_access_token;
    const apiBase = isMicrosoft ? 'https://graph.microsoft.com/v1.0/me' : 'https://www.googleapis.com/calendar/v3';

    if (!accessToken) {
      return new Response(JSON.stringify({
        error: 'Missing OAuth token',
        needsAuth: true,
        message: 'Connect your Google or Microsoft account to use calendar features.'
      }), { status: 401, headers: corsHeaders });
    }

    // ✅ Parse and validate request body
    const body = await req.json();
    const action = body.action;

    if (!action) throw new Error('Missing action type');

    // ✅ ROUTE HANDLING
    switch (action) {
      case 'get_events': return await getEvents(apiBase, accessToken, isMicrosoft, body);
      case 'create_event': return await createEvent(apiBase, accessToken, isMicrosoft, body.event);
      case 'update_event': return await updateEvent(apiBase, accessToken, isMicrosoft, body.event_id || body.eventId, body.updates);
      case 'delete_event': return await deleteEvent(apiBase, accessToken, isMicrosoft, body.event_id || body.eventId);
      case 'check_availability': return await checkAvailability(apiBase, accessToken, isMicrosoft, body);
      default: throw new Error(`Unsupported action: ${action}`);
    }

  } catch (error) {
    const isAuth = String(error.message).toLowerCase().includes('unauthorized');
    console.error('Calendar function error:', error);
    return new Response(JSON.stringify({
      error: error.message || 'Internal error',
      events: [],
      needsAuth: isAuth
    }), { status: isAuth ? 401 : 500, headers: corsHeaders });
  }
});

// 🎯 GET EVENTS
async function getEvents(apiBase: string, token: string, isMicrosoft: boolean, body: any) {
  let url = isMicrosoft
    ? `${apiBase}/calendar/events?$select=subject,start,end,location,attendees&$orderby=start/dateTime`
    : `${apiBase}/calendars/primary/events?singleEvents=true&orderBy=startTime`;

  if (body.timeMin) url += isMicrosoft
    ? `&$filter=start/dateTime ge '${body.timeMin}'`
    : `&timeMin=${encodeURIComponent(body.timeMin)}`;

  if (body.timeMax) url += isMicrosoft
    ? ` and end/dateTime le '${body.timeMax}'`
    : `&timeMax=${encodeURIComponent(body.timeMax)}`;

  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Failed to get events');

  return new Response(JSON.stringify({
    events: isMicrosoft ? data.value : data.items,
    needsAuth: false,
    error: null
  }), { headers: corsHeaders });
}

// 🎯 CREATE EVENT
async function createEvent(apiBase: string, token: string, isMicrosoft: boolean, event: any) {
  if (!event?.title || !event?.start || !event?.end) {
    throw new Error('Missing required fields: title, start, or end');
  }

  const payload = isMicrosoft ? {
    subject: event.title,
    body: { contentType: 'HTML', content: event.description || '' },
    start: { dateTime: event.start, timeZone: 'UTC' },
    end: { dateTime: event.end, timeZone: 'UTC' },
    location: { displayName: event.location || '' },
    attendees: (event.attendees || []).map(email => ({ emailAddress: { address: email }, type: 'required' })),
  } : {
    summary: event.title,
    description: event.description || '',
    start: { dateTime: event.start, timeZone: 'UTC' },
    end: { dateTime: event.end, timeZone: 'UTC' },
    attendees: (event.attendees || []).map(email => ({ email })),
    location: event.location || '',
    conferenceData: event.conferenceData,
  };

  const endpoint = isMicrosoft ? `${apiBase}/calendar/events` : `${apiBase}/calendars/primary/events`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Failed to create event');

  return new Response(JSON.stringify({ message: 'Event created', event: data }), { headers: corsHeaders });
}

// 🎯 UPDATE EVENT
async function updateEvent(apiBase: string, token: string, isMicrosoft: boolean, eventId: string, updates: any) {
  if (!eventId || !updates) throw new Error('Missing event ID or updates');

  const payload = { ...updates };
  if (updates.title) {
    payload[isMicrosoft ? 'subject' : 'summary'] = updates.title;
    delete payload.title;
  }
  if (updates.start) {
    payload.start = isMicrosoft ? { dateTime: updates.start, timeZone: 'UTC' } : { dateTime: updates.start, timeZone: 'UTC' };
  }
  if (updates.end) {
    payload.end = isMicrosoft ? { dateTime: updates.end, timeZone: 'UTC' } : { dateTime: updates.end, timeZone: 'UTC' };
  }

  const endpoint = isMicrosoft
    ? `${apiBase}/calendar/events/${eventId}`
    : `${apiBase}/calendars/primary/events/${eventId}`;

  const res = await fetch(endpoint, {
    method: isMicrosoft ? 'PATCH' : 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'Failed to update event');

  return new Response(JSON.stringify({ message: 'Event updated', event: data }), { headers: corsHeaders });
}

// 🎯 DELETE EVENT
async function deleteEvent(apiBase: string, token: string, isMicrosoft: boolean, eventId: string) {
  if (!eventId) throw new Error('Missing event ID');

  const endpoint = isMicrosoft
    ? `${apiBase}/calendar/events/${eventId}`
    : `${apiBase}/calendars/primary/events/${eventId}`;

  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || 'Failed to delete event');
  }

  return new Response(JSON.stringify({ message: 'Event deleted' }), { headers: corsHeaders });
}

// 🎯 CHECK AVAILABILITY
async function checkAvailability(apiBase: string, token: string, isMicrosoft: boolean, body: any) {
  const { attendeeEmails, start_date, end_date } = body;
  if (!attendeeEmails?.length || !start_date || !end_date) {
    throw new Error('Missing attendees, start_date, or end_date');
  }

  if (isMicrosoft) {
    const payload = {
      attendees: attendeeEmails.map(email => ({
        emailAddress: { address: email },
        type: 'required',
      })),
      timeConstraint: {
        timeslots: [{ start: { dateTime: start_date, timeZone: 'UTC' }, end: { dateTime: end_date, timeZone: 'UTC' } }]
      },
      meetingDuration: 'PT30M'
    };

    const res = await fetch(`${apiBase}/findMeetingTimes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to check availability');
    return new Response(JSON.stringify(data), { headers: corsHeaders });

  } else {
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: start_date,
        timeMax: end_date,
        items: attendeeEmails.map(email => ({ id: email }))
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to check availability');

    const available = Object.values(data.calendars).every((c: any) => c.busy.length === 0);
    return new Response(JSON.stringify({ available, details: data.calendars }), { headers: corsHeaders });
  }
}

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
  event_id?: string;
  eventId?: string;
  updates?: any;
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
      return new Response(JSON.stringify({
        error: 'No valid OAuth token found',
        needsAuth: true,
        message: 'Please connect your Google or Microsoft account in the app settings to use calendar features.'
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
          events: profile.microsoft_access_token ? (data.value || []) : (data.items || []),
          needsAuth: false,
          error: null
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

      case 'update_event': {
        const eventId = requestData.event_id || requestData.eventId;
        if (!eventId || !requestData.updates) {
          throw new Error('Missing event ID or updates for event modification');
        }

        let updatePayload: any = requestData.updates;
        
        // Transform updates for Microsoft Graph API format
        if (profile.microsoft_access_token) {
          if (updatePayload.title) {
            updatePayload.subject = updatePayload.title;
            delete updatePayload.title;
          }
          if (updatePayload.start) {
            updatePayload.start = { dateTime: updatePayload.start, timeZone: 'UTC' };
          }
          if (updatePayload.end) {
            updatePayload.end = { dateTime: updatePayload.end, timeZone: 'UTC' };
          }
        } else {
          // Transform for Google Calendar API
          if (updatePayload.title) {
            updatePayload.summary = updatePayload.title;
            delete updatePayload.title;
          }
        }

        const endpoint = profile.microsoft_access_token ?
          `${apiBase}/calendar/events/${eventId}` :
          `${apiBase}/calendars/primary/events/${eventId}`;

        const response = await fetch(endpoint, {
          method: profile.microsoft_access_token ? 'PATCH' : 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updatePayload),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || 'Failed to update event');

        return new Response(JSON.stringify({
          message: 'Event updated successfully',
          event: data,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'delete_event': {
        const eventId = requestData.event_id || requestData.eventId;
        if (!eventId) {
          throw new Error('Missing event ID for deletion');
        }

        const endpoint = profile.microsoft_access_token ?
          `${apiBase}/calendar/events/${eventId}` :
          `${apiBase}/calendars/primary/events/${eventId}`;

        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error?.message || 'Failed to delete event');
        }

        return new Response(JSON.stringify({
          message: 'Event deleted successfully',
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
          // Google Calendar availability check implementation
          const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              timeMin: requestData.start_date,
              timeMax: requestData.end_date,
              items: requestData.attendeeEmails.map(email => ({ id: email })),
            }),
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error?.message || 'Failed to check availability');

          return new Response(JSON.stringify({
            available: Object.values(data.calendars).every((cal: any) => cal.busy.length === 0),
            details: data.calendars
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      }

      default:
        throw new Error(`Unsupported action: ${requestData.action}`);
    }

  } catch (error) {
    console.error('Error in calendar-integration function:', error);
    
    // Check if it's an auth-related error
    const isAuthError = error.message?.includes('Unauthorized') || 
                       error.message?.includes('token') ||
                       error.message?.includes('auth');
    
    return new Response(JSON.stringify({
      events: [],
      needsAuth: isAuthError,
      error: error.message || 'Internal server error',
    }), {
      status: isAuthError ? 401 : 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});