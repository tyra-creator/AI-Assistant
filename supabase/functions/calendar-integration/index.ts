import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Timeout utility to prevent hanging on external API calls
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 15000) {
  console.log(`Making request to: ${url} with ${timeoutMs}ms timeout`);
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    console.log(`Request completed with status: ${response.status}`);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      console.error(`Request timed out after ${timeoutMs}ms for: ${url}`);
      throw new Error(`Request timeout after ${timeoutMs / 1000} seconds`);
    }
    console.error(`Request failed for: ${url}`, error);
    throw error;
  }
}

// Timeout utility for database operations
async function withDatabaseTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`Database operation timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

// Overall edge function timeout wrapper
async function withFunctionTimeout<T>(promise: Promise<T>, timeoutMs: number = 25000): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`Function timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

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
  console.log('=== Calendar Integration Function Called ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Wrap entire function execution in timeout protection
    return await withFunctionTimeout(async () => {
    console.log('Initializing Supabase client...');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_ANON_KEY') || '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
      }
    );

    // Authenticate user - enhanced debugging
    console.log('Authenticating user...');
    console.log('Authorization header:', req.headers.get('Authorization') ? 'Present' : 'Missing');
    
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    console.log('Auth result:', { 
      hasUser: !!user, 
      userId: user?.id,
      error: userError?.message,
      errorCode: userError?.status
    });
    
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return new Response(
        JSON.stringify({ 
          error: 'Authentication required',
          needsAuth: true,
          details: userError?.message || 'No user found',
          authHeaderPresent: !!req.headers.get('Authorization')
        }),
        { status: 401, headers: corsHeaders }
      );
    }

    // Get user's calendar tokens with expiration info
    console.log('Fetching user profile and tokens...');
    const { data: profile, error: profileError } = await withDatabaseTimeout(
      supabase
        .from('profiles')
        .select('google_access_token, microsoft_access_token, google_refresh_token, microsoft_refresh_token, google_expires_at, microsoft_expires_at')
        .eq('user_id', user.id)
        .single()
    );

    console.log('Profile query result:', { 
      hasProfile: !!profile, 
      error: profileError?.message,
      hasGoogleToken: !!profile?.google_access_token,
      hasMicrosoftToken: !!profile?.microsoft_access_token,
      googleExpiresAt: profile?.google_expires_at
    });

    if (!profile) throw new Error('User profile not found');
    
    let accessToken = profile.google_access_token || profile.microsoft_access_token;
    const isMicrosoft = !!profile.microsoft_access_token;
    const apiBase = isMicrosoft ? 'https://graph.microsoft.com/v1.0/me' : 'https://www.googleapis.com/calendar/v3';
    
    // Check token expiration and refresh if needed
    if (!isMicrosoft && profile.google_expires_at) {
      const expiryTime = new Date(profile.google_expires_at);
      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000); // Check 1 hour ahead
      
      console.log('Token expiry check:', {
        expiryTime: expiryTime.toISOString(),
        now: now.toISOString(),
        oneHourFromNow: oneHourFromNow.toISOString(),
        isExpired: expiryTime <= now,
        willExpireSoon: expiryTime <= oneHourFromNow,
        hasRefreshToken: !!profile.google_refresh_token
      });
      
      if (expiryTime <= oneHourFromNow && profile.google_refresh_token) {
        console.log('Google token expired or expiring soon, refreshing...');
        try {
          accessToken = await refreshGoogleToken(supabase, user.id, profile.google_refresh_token);
          console.log('Token refresh successful, new token acquired');
        } catch (refreshError) {
          console.error('Token refresh failed:', refreshError);
          const isTimeoutError = refreshError.message.includes('timeout') || refreshError.message.includes('timed out');
          const isNetworkError = refreshError.message.includes('network') || refreshError.message.includes('connection');
          
          console.error('Token refresh failed - returning auth error immediately');
          return new Response(JSON.stringify({
            error: isTimeoutError || isNetworkError
              ? 'Connection timeout while refreshing your Google Calendar. Please reconnect your calendar or try again later.'
              : 'Your Google Calendar connection expired. Please reconnect your calendar.',
            needsAuth: true,
            events: [],
            details: refreshError.message,
            isTimeout: isTimeoutError || isNetworkError
          }), { status: 401, headers: corsHeaders });
        }
      }
    }

    if (!accessToken) {
      return new Response(JSON.stringify({
        error: 'Missing OAuth token',
        needsAuth: true,
        message: 'Connect your Google or Microsoft account to use calendar features.'
      }), { status: 401, headers: corsHeaders });
    }

    // Parse and validate request body with safe JSON parsing
    let body;
    try {
      const requestText = await req.text();
      console.log('Raw request text:', requestText.length > 0 ? 'Present' : 'Empty');
      console.log('Request text preview:', requestText.substring(0, 200));
      
      if (!requestText || requestText.trim().length === 0) {
        throw new Error('Request body is empty');
      }
      
      body = JSON.parse(requestText);
      console.log('Request body parsed successfully:', JSON.stringify(body, null, 2));
    } catch (parseError) {
      console.error('JSON parse error:', parseError.message);
      return new Response(JSON.stringify({
        error: 'Invalid request body: ' + parseError.message,
        details: 'Request body must be valid JSON'
      }), { status: 400, headers: corsHeaders });
    }
    
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
    }, 35000); // 35 second overall function timeout to accommodate 30s calendar API timeout

  } catch (error) {
    const isAuth = String(error.message).toLowerCase().includes('unauthorized');
    const isTimeout = String(error.message).toLowerCase().includes('timeout');
    console.error('Calendar function error:', error);
    
    if (isTimeout) {
      return new Response(JSON.stringify({
        error: 'Request timed out. Please try again or check your internet connection.',
        events: [],
        needsAuth: false,
        isTimeout: true
      }), { status: 408, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({
      error: error.message || 'Internal error',
      events: [],
      needsAuth: isAuth
    }), { status: isAuth ? 401 : 500, headers: corsHeaders });
  }
});

// GET EVENTS
async function getEvents(apiBase: string, token: string, isMicrosoft: boolean, body: any) {
  console.log('=== Getting Calendar Events ===');
  console.log('Provider:', isMicrosoft ? 'Microsoft' : 'Google');
  console.log('Request params:', { timeMin: body.timeMin, timeMax: body.timeMax });

  // Normalize time range
  const now = new Date();
  const parsedMin = body.timeMin ? new Date(body.timeMin) : now;
  const parsedMax = body.timeMax ? new Date(body.timeMax) : new Date(parsedMin.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Try progressive loading: start with smaller chunks if the range is large
  const rangeMs = parsedMax.getTime() - parsedMin.getTime();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  
  // If requesting more than 14 days, try smaller chunks first for faster response
  const shouldUseProgressiveLoading = rangeMs > 14 * 24 * 60 * 60 * 1000;
  
  if (shouldUseProgressiveLoading) {
    console.log('Large date range detected, using progressive loading');
    try {
      // First try with a 7-day window from the start date
      const smallerMax = new Date(parsedMin.getTime() + sevenDaysMs);
      const partialEvents = await fetchEventsForRange(apiBase, token, isMicrosoft, parsedMin, smallerMax);
      
      // If successful, try to get the remaining events
      if (partialEvents.length > 0 || rangeMs <= sevenDaysMs) {
        console.log(`Got ${partialEvents.length} events from first 7 days, fetching remaining...`);
        
        // Try to get remaining events with shorter timeout
        try {
          const remainingEvents = await fetchEventsForRange(
            apiBase, token, isMicrosoft, smallerMax, parsedMax, 15000 // 15s timeout for remaining
          );
          const allEvents = [...partialEvents, ...remainingEvents];
          console.log(`Progressive loading complete: ${allEvents.length} total events`);
          
          return new Response(JSON.stringify({
            events: allEvents,
            needsAuth: false,
            error: null
          }), { headers: corsHeaders });
        } catch (remainingError) {
          console.log('Failed to fetch remaining events, returning partial results');
          return new Response(JSON.stringify({
            events: partialEvents,
            needsAuth: false,
            error: null,
            partial: true,
            message: 'Showing partial results due to slow response'
          }), { headers: corsHeaders });
        }
      }
    } catch (firstChunkError) {
      console.log('Progressive loading failed, falling back to full range');
      // Fall through to regular fetch
    }
  }

  // Regular fetch for normal ranges or if progressive loading failed
  return await fetchEventsForRange(apiBase, token, isMicrosoft, parsedMin, parsedMax, 30000); // 30s timeout
}

// Helper function to fetch events for a specific time range
async function fetchEventsForRange(
  apiBase: string, 
  token: string, 
  isMicrosoft: boolean, 
  startTime: Date, 
  endTime: Date,
  timeoutMs: number = 30000
) {
  let url = isMicrosoft
    ? `${apiBase}/calendar/events?$select=subject,start,end,location,attendees&$orderby=start/dateTime&$top=100`
    : `${apiBase}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=100`;

  // Cap range to 60 days max to prevent huge result sets
  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  const boundedEndTime = (endTime.getTime() - startTime.getTime() > sixtyDaysMs)
    ? new Date(startTime.getTime() + sixtyDaysMs)
    : endTime;

  const timeMin = startTime.toISOString();
  const timeMax = boundedEndTime.toISOString();
  console.log('Fetching events for time window:', { timeMin, timeMax, timeoutMs });

  // Always apply both bounds
  if (isMicrosoft) {
    url += `&$filter=start/dateTime ge '${timeMin}' and end/dateTime le '${timeMax}'`;
  } else {
    url += `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  }

  console.log('API URL:', url);

  let res;
  try {
    res = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, timeoutMs);
  } catch (timeoutError) {
    console.error(`Calendar API request timed out after ${timeoutMs}ms:`, timeoutError);
    
    // If this was a long timeout, throw to trigger fallback
    if (timeoutMs >= 30000) {
      return new Response(JSON.stringify({
        events: [],
        needsAuth: false,
        error: 'Calendar request timed out. Please try again or check your internet connection.',
        isTimeout: true
      }), { headers: corsHeaders });
    }
    
    // For shorter timeouts, just throw to let caller handle
    throw timeoutError;
  }

  console.log('Calendar API response status:', res.status);

  const responseText = await res.text();
  console.log('Calendar API response text length:', responseText.length);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse calendar response:', e);
    throw new Error('Invalid response from calendar API');
  }

  if (!res.ok) {
    console.error('Calendar API error:', data);
    throw new Error(data.error?.message || `Calendar API error: ${res.status}`);
  }

  const events = isMicrosoft ? data.value : data.items;
  console.log('Parsed events count:', events?.length || 0);
  
  return events || [];
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

  let res;
  try {
    res = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 15000); // 15 second timeout for create event
  } catch (timeoutError) {
    console.error('Create event request timed out:', timeoutError);
    return new Response(JSON.stringify({
      error: 'Event creation timed out. Please try again.',
      success: false,
      isTimeout: true
    }), { status: 408, headers: corsHeaders });
  }

  console.log(`Calendar API response status: ${res.status}`);
  
  // Safe JSON parsing to handle non-JSON responses
  let data;
  try {
    const responseText = await res.text();
    console.log('Calendar API response text:', responseText);
    
    if (responseText.trim()) {
      data = JSON.parse(responseText);
    } else {
      data = { message: 'Empty response from calendar API' };
    }
  } catch (jsonError) {
    console.error('Failed to parse JSON response:', jsonError);
    data = { 
      error: { 
        message: `Invalid JSON response from calendar API (Status: ${res.status})`,
        statusText: res.statusText 
      } 
    };
  }
  
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
    return new Response(JSON.stringify({
      error: 'Authentication failed. Please reconnect your calendar.',
      needsAuth: true,
      success: false
    }), { status: 401, headers: corsHeaders });
  }

  if (res.status === 403) {
    console.error('Permission error');
    return new Response(JSON.stringify({
      error: 'Permission denied. Please check your calendar permissions.',
      needsAuth: false,
      success: false
    }), { status: 403, headers: corsHeaders });
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

  const res = await fetchWithTimeout(endpoint, {
    method: isMicrosoft ? 'PATCH' : 'PUT',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }, 15000);

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

  const res = await fetchWithTimeout(endpoint, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${token}` }
  }, 15000);

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

    const res = await fetchWithTimeout(`${apiBase}/findMeetingTimes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, 15000);

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to check availability');
    return new Response(JSON.stringify(data), { headers: corsHeaders });

  } else {
    const res = await fetchWithTimeout('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: start_date,
        timeMax: end_date,
        items: attendeeEmails.map(email => ({ id: email }))
      })
    }, 15000);

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || 'Failed to check availability');

    const available = Object.values(data.calendars).every((c: any) => c.busy.length === 0);
  return new Response(JSON.stringify({ available, details: data.calendars }), { headers: corsHeaders });
  }
}

// Token refresh utility function
async function refreshGoogleToken(supabase: any, userId: string, refreshToken: string): Promise<string> {
  try {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
    
    console.log('OAuth credentials check:', { 
      hasClientId: !!clientId, 
      hasClientSecret: !!clientSecret,
      clientIdLength: clientId?.length || 0
    });
    
    if (!clientId || !clientSecret) {
      console.error('Missing Google OAuth credentials - Client ID or Secret not configured');
      throw new Error('OAuth credentials not configured. Please check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET secrets.');
    }

    console.log('Attempting to refresh Google token...');
    const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    }, 5000); // Reduced to 5 second timeout for faster failure

    const responseText = await response.text();
    console.log('Token refresh response status:', response.status);
    console.log('Token refresh response:', responseText);

    if (!response.ok) {
      console.error('Failed to refresh Google token:', responseText);
      
      // Parse error for better handling
      let errorMessage = 'Token refresh failed';
      try {
        const errorData = JSON.parse(responseText);
        if (errorData.error === 'invalid_grant') {
          errorMessage = 'Refresh token expired. Please reconnect your Google account.';
        } else if (errorData.error === 'invalid_client') {
          errorMessage = 'OAuth client configuration error. Please check your Google OAuth setup.';
        } else {
          errorMessage = `Token refresh failed: ${errorData.error_description || errorData.error}`;
        }
      } catch (e) {
        // Use default error message if JSON parsing fails
      }
      
      throw new Error(errorMessage);
    }

    const data = JSON.parse(responseText);
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600; // Default to 1 hour
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    console.log('Token refreshed, updating database...');
    
    // Update the database with new token using timeout protection
    await withDatabaseTimeout(
      supabase
        .from('profiles')
        .update({
          google_access_token: newAccessToken,
          google_expires_at: expiresAt.toISOString(),
        })
        .eq('user_id', userId),
      10000 // 10 second timeout for database update
    );

    console.log('Google token refreshed successfully');
    return newAccessToken;
  } catch (error) {
    console.error('Error refreshing Google token:', error);
    throw error; // Preserve the original error message
  }
}