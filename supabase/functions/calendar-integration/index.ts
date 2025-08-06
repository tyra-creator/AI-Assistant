import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      }
    );

    // Authenticate user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) throw new Error('Unauthorized');

    // Get user's calendar tokens
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

    // Parse and validate request body
    const body = await req.json();
    const action = body.action;

    if (!action) throw new Error('Missing action type');

    // Route handling
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

// GET EVENTS
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

// CREATE EVENT
async function createEvent(apiBase: string, token: string, isMicrosoft: boolean, event: any) {
  if (!event?.title || !event?.start || !event?.end) {
    throw new Error('Missing required fields: title, start, or end');
  }

  console.log(`Creating ${isMicrosoft ? 'Microsoft' : 'Google'} calendar event:`, event.title);

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

  console.log(`Calendar API response status: ${res.status}`);
  
  const data = await res.json();
  console.log('Calendar API response data:', data);

  // Check for successful creation - Google returns 200, Microsoft returns 201
  if (res.status === 200 || res.status === 201) {
    // Event was created successfully
    console.log('Event created successfully:', data.id || data.iCalUId);
    return new Response(JSON.stringify({ 
      message: 'Event created successfully', 
      event: data,
      success: true 
    }), { headers: corsHeaders });
  }

  // Handle different types of errors more gracefully
  if (res.status === 401) {
    console.error('Authentication error - token may be expired');
    throw new Error('Authentication failed. Please reconnect your calendar.');
  }

  if (res.status === 403) {
    console.error('Permission error');
    throw new Error('Permission denied. Please check your calendar permissions.');
  }

  // For other errors, log but don't necessarily fail
  console.error(`Calendar API error (${res.status}):`, data);
  
  // Check if the error is about an already existing event or similar non-critical issue
  const errorMessage = data.error?.message || data.message || 'Unknown error';
  if (errorMessage.toLowerCase().includes('already exists') || 
      errorMessage.toLowerCase().includes('duplicate')) {
    console.log('Event might already exist, treating as success');
    return new Response(JSON.stringify({ 
      message: 'Event created (or already exists)', 
      event: data,
      success: true 
    }), { headers: corsHeaders });
  }

  // Only throw for genuine creation failures
  throw new Error(errorMessage);
}

// UPDATE EVENT
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

// DELETE EVENT
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

// CHECK AVAILABILITY
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