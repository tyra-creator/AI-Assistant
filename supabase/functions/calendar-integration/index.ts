import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

// Timeout utility for external API calls
async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number = 10000) {
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
async function withDatabaseTimeout<T>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`Database operation timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}

// Simple in-memory cache for calendar responses
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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
    // 15 second overall timeout for better user experience
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => reject(new Error('Function timeout after 15 seconds')), 15000);
    });

    const mainPromise = (async () => {
      console.log('Initializing Supabase client...');
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') || '',
        Deno.env.get('SUPABASE_ANON_KEY') || '',
        {
          global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
        }
      );

      // Authenticate user
      console.log('Authenticating user...');
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      console.log('Auth result:', { 
        hasUser: !!user, 
        userId: user?.id,
        error: userError?.message
      });
      
      if (userError || !user) {
        console.error('Authentication failed:', userError);
        return new Response(
          JSON.stringify({ 
            error: 'Authentication required',
            needsAuth: true,
            details: userError?.message || 'No user found'
          }),
          { status: 401, headers: corsHeaders }
        );
      }

      // Get user's calendar tokens
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
      
      // Simplified token expiration check for Google
      if (!isMicrosoft && profile.google_expires_at) {
        const expiryTime = new Date(profile.google_expires_at);
        const now = new Date();
        const minutesUntilExpiry = (expiryTime.getTime() - now.getTime()) / (1000 * 60);
        
        console.log('Token expiry check:', {
          expiryTime: expiryTime.toISOString(),
          now: now.toISOString(),
          minutesUntilExpiry: Math.round(minutesUntilExpiry),
          hasRefreshToken: !!profile.google_refresh_token
        });
        
        // If token expires within 15 minutes and we have a refresh token, refresh it
        if (minutesUntilExpiry <= 15 && profile.google_refresh_token) {
          console.log('Token expires soon, attempting refresh...');
          
          try {
            const refreshResult = await refreshGoogleToken(supabase, user.id, profile.google_refresh_token);
            accessToken = refreshResult.accessToken;
            console.log('Token refresh successful');
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            
            // If current token is still valid for more than 5 minutes, continue with it
            if (minutesUntilExpiry > 5) {
              console.log(`Token refresh failed, but current token still valid for ${Math.round(minutesUntilExpiry)} minutes`);
            } else {
              return new Response(JSON.stringify({
                error: 'Your Google Calendar connection expired. Please reconnect your calendar.',
                needsAuth: true,
                events: [],
                details: refreshError.message
              }), { status: 401, headers: corsHeaders });
            }
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

      // Parse request body
      let body;
      try {
        const requestText = await req.text();
        console.log('Raw request text:', requestText.length > 0 ? 'Present' : 'Empty');
        console.log('Request text content:', requestText);
        
        if (!requestText || requestText.trim().length === 0) {
          // If no body provided, check if this is a GET request or similar
          console.log('No request body provided, checking URL params...');
          const url = new URL(req.url);
          const action = url.searchParams.get('action');
          if (action) {
            body = { action };
            console.log('Using URL parameters for action:', action);
          } else {
            throw new Error('Request body is empty and no action parameter found');
          }
        } else {
          body = JSON.parse(requestText);
          console.log('Request body parsed successfully:', JSON.stringify(body));
        }
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
    })();

    return await Promise.race([mainPromise, timeoutPromise]);

  } catch (error) {
    const isAuth = String(error.message).toLowerCase().includes('unauthorized') || 
                   String(error.message).toLowerCase().includes('authorization') ||
                   String(error.message).toLowerCase().includes('expired');
    const isTimeout = String(error.message).toLowerCase().includes('timeout');
    console.error('Calendar function error:', error);
    
    if (isTimeout) {
      return new Response(JSON.stringify({
        error: 'Request timed out. Please try again.',
        events: [],
        needsAuth: false,
        isTimeout: true
      }), { status: 408, headers: corsHeaders });
    }
    
    return new Response(JSON.stringify({
      error: error.message || 'Internal error',
      events: [],
      needsAuth: isAuth,
      details: error.stack
    }), { status: isAuth ? 401 : 500, headers: corsHeaders });
  }
});

// GET EVENTS
async function getEvents(apiBase: string, token: string, isMicrosoft: boolean, body: any) {
  console.log('=== Getting Calendar Events ===');
  console.log('Provider:', isMicrosoft ? 'Microsoft' : 'Google');
  console.log('Request params:', { timeMin: body.timeMin, timeMax: body.timeMax });

  // Check cache first
  const cacheKey = `${isMicrosoft ? 'ms' : 'google'}-${body.timeMin}-${body.timeMax}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log('Returning cached calendar response');
    return new Response(JSON.stringify({
      events: cached.data,
      needsAuth: false,
      cached: true
    }), { headers: corsHeaders });
  }

  // Normalize time range - cap at 30 days maximum
  const now = new Date();
  const parsedMin = body.timeMin ? new Date(body.timeMin) : now;
  const parsedMax = body.timeMax ? new Date(body.timeMax) : new Date(parsedMin.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Cap range to 30 days max
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const boundedMax = (parsedMax.getTime() - parsedMin.getTime() > thirtyDaysMs)
    ? new Date(parsedMin.getTime() + thirtyDaysMs)
    : parsedMax;

  console.log('Fetching calendar events');
  
  try {
    const events = await fetchEventsForRange(apiBase, token, isMicrosoft, parsedMin, boundedMax);
    
    // Cache successful response
    if (events && Array.isArray(events)) {
      responseCache.set(cacheKey, { data: events, timestamp: Date.now() });
    }
    
    return new Response(JSON.stringify({
      events: events || [],
      needsAuth: false
    }), { headers: corsHeaders });
    
  } catch (error) {
    console.error('Calendar fetch error:', error);
    return new Response(JSON.stringify({
      events: [],
      needsAuth: false,
      error: error.message,
      isTimeout: error.message.includes('timeout')
    }), { headers: corsHeaders });
  }
}

// Helper function to fetch events for a specific time range
async function fetchEventsForRange(
  apiBase: string, 
  token: string, 
  isMicrosoft: boolean, 
  startTime: Date, 
  endTime: Date
) {
  let url = isMicrosoft
    ? `${apiBase}/calendar/events?$select=subject,start,end,location,attendees&$orderby=start/dateTime&$top=100`
    : `${apiBase}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=100`;

  // Cap range to 30 days max
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const boundedEndTime = (endTime.getTime() - startTime.getTime() > thirtyDaysMs)
    ? new Date(startTime.getTime() + thirtyDaysMs)
    : endTime;

  const timeMin = startTime.toISOString();
  const timeMax = boundedEndTime.toISOString();
  console.log('Fetching events for time window:', { timeMin, timeMax });

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
    }, 10000); // 10s timeout for calendar API
  } catch (timeoutError) {
    console.error('Calendar API request timed out:', timeoutError);
    throw new Error('Calendar request timed out. Please try again.');
  }

  console.log('Calendar API response status:', res.status);

  const responseText = await res.text();
  console.log('Calendar API response text length:', responseText.length);

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse calendar response:', e);
    console.error('Response text:', responseText.substring(0, 500));
    throw new Error('Invalid calendar response format');
  }

  if (!res.ok) {
    console.error('Calendar API error:', res.status, data);
    
    if (res.status === 401) {
      throw new Error('Calendar authorization expired. Please reconnect your account.');
    } else if (res.status === 403) {
      throw new Error('Calendar access denied. Please check permissions.');
    } else if (res.status === 429) {
      throw new Error('Too many requests. Please try again later.');
    } else {
      throw new Error(`Calendar API error: ${res.status} ${data?.error?.message || 'Unknown error'}`);
    }
  }

  const items = isMicrosoft ? data?.value || [] : data?.items || [];
  console.log('Successfully fetched events count:', items.length);

  // Normalize event format
  const events = items.map((item: any) => {
    if (isMicrosoft) {
      return {
        id: item.id,
        summary: item.subject,
        start: item.start,
        end: item.end,
        location: item.location?.displayName,
        attendees: item.attendees?.map((a: any) => ({ email: a.emailAddress?.address }))
      };
    } else {
      return {
        id: item.id,
        summary: item.summary,
        start: item.start,
        end: item.end,
        location: item.location,
        attendees: item.attendees
      };
    }
  });

  return events;
}

// Simplified token refresh utility
async function refreshGoogleToken(supabase: any, userId: string, refreshToken: string) {
  console.log('=== GOOGLE TOKEN REFRESH START ===');
  console.log('User ID:', userId);
  
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Missing Google OAuth credentials');
  }
  
  try {
    // Single attempt with reasonable timeout
    const response = await fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    }, 8000); // 8 second timeout
    
    console.log('Token refresh response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Token refresh failed:', response.status, errorText);
      
      if (response.status === 400) {
        throw new Error('Invalid refresh token. Please reconnect your Google account.');
      }
      
      throw new Error(`Token refresh failed: HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Token refresh successful, updating database...');
    
    const newExpiresAt = new Date(Date.now() + (data.expires_in * 1000)).toISOString();
    
    // Update the user's tokens in the database
    const { error: updateError } = await withDatabaseTimeout(
      supabase
        .from('profiles')
        .update({
          google_access_token: data.access_token,
          google_expires_at: newExpiresAt,
          ...(data.refresh_token && { google_refresh_token: data.refresh_token })
        })
        .eq('user_id', userId)
    );
    
    if (updateError) {
      console.error('Database update failed:', updateError);
      throw new Error(`Database update failed: ${updateError.message}`);
    }
    
    console.log('Token refresh completed successfully');
    return {
      accessToken: data.access_token,
      expiresAt: newExpiresAt,
      refreshToken: data.refresh_token || refreshToken
    };
    
  } catch (error) {
    console.error('Token refresh failed:', error.message);
    throw error;
  }
}

// Calendar operations
async function createEvent(apiBase: string, token: string, isMicrosoft: boolean, event: any) {
  console.log('=== Creating Calendar Event ===');
  console.log('Provider:', isMicrosoft ? 'Microsoft' : 'Google');
  console.log('Event details:', JSON.stringify(event, null, 2));

  if (!event || !event.title || !event.start || !event.end) {
    return new Response(JSON.stringify({ 
      error: 'Missing required event fields: title, start, end',
      required: ['title', 'start', 'end']
    }), { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  try {
    let eventData;
    let url;

    if (isMicrosoft) {
      // Microsoft Graph API format
      url = `${apiBase}/calendar/events`;
      eventData = {
        subject: event.title,
        body: {
          contentType: 'HTML',
          content: event.description || ''
        },
        start: {
          dateTime: event.start,
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC'
        },
        location: {
          displayName: event.location || ''
        },
        attendees: event.attendees ? event.attendees.map((email: string) => ({
          emailAddress: {
            address: email,
            name: email
          }
        })) : []
      };
    } else {
      // Google Calendar API format
      url = `${apiBase}/calendars/primary/events`;
      eventData = {
        summary: event.title,
        description: event.description || '',
        start: {
          dateTime: event.start,
          timeZone: 'UTC'
        },
        end: {
          dateTime: event.end,
          timeZone: 'UTC'
        },
        location: event.location || '',
        attendees: event.attendees ? event.attendees.map((email: string) => ({
          email: email
        })) : [],
        conferenceData: event.conferenceData || undefined
      };
    }

    console.log('Making API request to:', url);
    console.log('Event data:', JSON.stringify(eventData, null, 2));

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventData)
    }, 8000); // 8 second timeout

    const responseText = await response.text();
    console.log('Create event response status:', response.status);
    console.log('Create event response:', responseText.substring(0, 500));

    if (!response.ok) {
      let errorMessage = 'Failed to create calendar event';
      
      try {
        const errorData = JSON.parse(responseText);
        if (response.status === 401) {
          errorMessage = 'Calendar authorization expired. Please reconnect your account.';
        } else if (response.status === 403) {
          errorMessage = 'Calendar access denied. Please check permissions.';
        } else if (response.status === 409) {
          errorMessage = 'Calendar conflict. This time slot may already be booked.';
        } else {
          errorMessage = errorData?.error?.message || errorData?.message || errorMessage;
        }
      } catch (e) {
        // Use generic error message
      }

      return new Response(JSON.stringify({
        error: errorMessage,
        details: responseText,
        status: response.status
      }), { 
        status: response.status, 
        headers: corsHeaders 
      });
    }

    const createdEvent = JSON.parse(responseText);
    console.log('Event created successfully:', createdEvent.id);

    // Normalize response format
    const normalizedEvent = isMicrosoft ? {
      id: createdEvent.id,
      summary: createdEvent.subject,
      start: createdEvent.start,
      end: createdEvent.end,
      location: createdEvent.location?.displayName,
      htmlLink: createdEvent.webLink
    } : {
      id: createdEvent.id,
      summary: createdEvent.summary,
      start: createdEvent.start,
      end: createdEvent.end,
      location: createdEvent.location,
      htmlLink: createdEvent.htmlLink
    };

    return new Response(JSON.stringify({
      success: true,
      event: normalizedEvent,
      message: 'Calendar event created successfully'
    }), { 
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('Create event error:', error);
    
    if (error.message.includes('timeout')) {
      return new Response(JSON.stringify({
        error: 'Calendar request timed out. Please try again.',
        isTimeout: true
      }), { 
        status: 408, 
        headers: corsHeaders 
      });
    }

    return new Response(JSON.stringify({
      error: 'Failed to create calendar event: ' + error.message,
      details: error.stack
    }), { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

async function updateEvent(apiBase: string, token: string, isMicrosoft: boolean, eventId: string, updates: any) {
  return new Response(JSON.stringify({ error: 'Update event not implemented' }), { 
    status: 501, 
    headers: corsHeaders 
  });
}

async function deleteEvent(apiBase: string, token: string, isMicrosoft: boolean, eventId: string) {
  return new Response(JSON.stringify({ error: 'Delete event not implemented' }), { 
    status: 501, 
    headers: corsHeaders 
  });
}

async function checkAvailability(apiBase: string, token: string, isMicrosoft: boolean, body: any) {
  return new Response(JSON.stringify({ error: 'Check availability not implemented' }), { 
    status: 501, 
    headers: corsHeaders 
  });
}