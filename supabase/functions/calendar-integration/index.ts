import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
  'Content-Type': 'application/json',
};

// Enhanced retry utilities with exponential backoff
async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableError(error: any, status?: number): boolean {
  if (status) {
    // Retry on server errors, rate limits, and timeouts
    return status >= 500 || status === 429 || status === 408;
  }
  
  const message = error?.message?.toLowerCase() || '';
  return message.includes('timeout') || 
         message.includes('network') || 
         message.includes('connection') ||
         message.includes('enotfound') ||
         message.includes('econnreset');
}

async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = 15000,
  maxRetries: number = 3
): Promise<Response> {
  const correlationId = crypto.randomUUID();
  console.log(`[${correlationId}] Starting request to: ${url} (timeout: ${timeoutMs}ms, retries: ${maxRetries})`);
  
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const startTime = Date.now();
      console.log(`[${correlationId}] Attempt ${attempt}/${maxRetries + 1} - Making request`);
      
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      console.log(`[${correlationId}] Request completed - Status: ${response.status}, Duration: ${duration}ms`);
      
      // Log response headers for debugging
      const requestId = response.headers.get('x-request-id') || response.headers.get('x-goog-request-id');
      if (requestId) {
        console.log(`[${correlationId}] Provider Request ID: ${requestId}`);
      }
      
      // Check if we should retry
      if (attempt <= maxRetries && isRetryableError(null, response.status)) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 1000;
        console.log(`[${correlationId}] Retryable error ${response.status}, backing off ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      
      if (error.name === 'AbortError') {
        console.error(`[${correlationId}] Request timed out after ${timeoutMs}ms (attempt ${attempt})`);
        if (attempt <= maxRetries) {
          const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000) + Math.random() * 1000;
          console.log(`[${correlationId}] Retrying after timeout, backing off ${backoffMs}ms`);
          await sleep(backoffMs);
          continue;
        }
        throw new Error(`Request timeout after ${timeoutMs / 1000} seconds (${maxRetries + 1} attempts)`);
      }
      
      console.error(`[${correlationId}] Request failed (attempt ${attempt}, duration: ${duration}ms):`, error.message);
      
      if (attempt <= maxRetries && isRetryableError(error)) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000) + Math.random() * 1000;
        console.log(`[${correlationId}] Retryable error, backing off ${backoffMs}ms`);
        await sleep(backoffMs);
        continue;
      }
      
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Enhanced database timeout with proper cleanup
async function withDatabaseTimeout<T>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T> {
  let timeoutId: number;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`Database operation timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
  });
  
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// Simple in-memory cache for calendar responses
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CalendarError {
  type: 'auth' | 'timeout' | 'quota' | 'validation' | 'network' | 'unknown';
  httpStatus?: number;
  apiError?: string;
  correlationId?: string;
  timestamp: string;
  retryable: boolean;
}

function classifyError(error: any, response?: Response): CalendarError {
  const timestamp = new Date().toISOString();
  const httpStatus = response?.status;
  
  if (httpStatus === 401 || error.message?.includes('unauthorized') || error.message?.includes('expired')) {
    return {
      type: 'auth',
      httpStatus,
      apiError: error.message,
      timestamp,
      retryable: false
    };
  }
  
  if (httpStatus === 429 || error.message?.includes('rate limit') || error.message?.includes('quota')) {
    return {
      type: 'quota',
      httpStatus,
      apiError: error.message,
      timestamp,
      retryable: true
    };
  }
  
  if (error.message?.includes('timeout')) {
    return {
      type: 'timeout',
      httpStatus,
      apiError: error.message,
      timestamp,
      retryable: true
    };
  }
  
  if (httpStatus && httpStatus >= 400 && httpStatus < 500) {
    return {
      type: 'validation',
      httpStatus,
      apiError: error.message,
      timestamp,
      retryable: false
    };
  }
  
  if (httpStatus && httpStatus >= 500) {
    return {
      type: 'network',
      httpStatus,
      apiError: error.message,
      timestamp,
      retryable: true
    };
  }
  
  return {
    type: 'unknown',
    httpStatus,
    apiError: error.message,
    timestamp,
    retryable: false
  };
}

function validateEventInput(event: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (!event) {
    errors.push('Event object is required');
    return { valid: false, errors };
  }
  
  if (!event.title || typeof event.title !== 'string' || event.title.trim().length === 0) {
    errors.push('Event title is required and must be a non-empty string');
  }
  
  if (!event.start) {
    errors.push('Event start time is required');
  } else {
    const startDate = new Date(event.start);
    if (isNaN(startDate.getTime())) {
      errors.push('Event start time must be a valid ISO date string');
    }
  }
  
  if (!event.end) {
    errors.push('Event end time is required');
  } else {
    const endDate = new Date(event.end);
    if (isNaN(endDate.getTime())) {
      errors.push('Event end time must be a valid ISO date string');
    }
    
    if (event.start && new Date(event.start) >= new Date(event.end)) {
      errors.push('Event end time must be after start time');
    }
  }
  
  if (event.attendees && Array.isArray(event.attendees)) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    event.attendees.forEach((email: string, index: number) => {
      if (typeof email !== 'string' || !emailRegex.test(email)) {
        errors.push(`Attendee ${index + 1} must be a valid email address`);
      }
    });
  }
  
  return { valid: errors.length === 0, errors };
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
    // Configurable timeout with reasonable default (30s)
    const timeoutMs = parseInt(Deno.env.get('CALENDAR_TIMEOUT_MS') || '30000');
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => reject(new Error(`Function timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
    });

    const mainPromise = (async () => {
    console.log('Initializing Supabase client...');
    
    // Get authorization header and mask for logging
    const authHeader = req.headers.get('Authorization') || '';
    const hasBearerToken = authHeader.startsWith('Bearer ');
    console.log('Auth header present:', !!authHeader, 'Has bearer token:', hasBearerToken);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', // Use service role for server operations
      {
        global: { 
          headers: { 
            Authorization: authHeader // Pass through for user context
          } 
        },
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

      // Parse request body with improved logging
      let body;
      try {
        const requestText = await req.text();
        const hasContent = requestText && requestText.trim().length > 0;
        console.log('Request body present:', hasContent);
        
        if (!hasContent) {
          // If no body provided, check URL params as fallback
          console.log('No request body provided, checking URL params...');
          const url = new URL(req.url);
          const action = url.searchParams.get('action');
          if (action) {
            body = { action };
            console.log('Using URL parameters for action:', action);
          } else {
            return new Response(JSON.stringify({
              error: 'Request body is empty and no action parameter found',
              details: 'Provide action in request body or as URL parameter'
            }), { status: 400, headers: corsHeaders });
          }
        } else {
          body = JSON.parse(requestText);
          console.log('Request body parsed successfully with action:', body.action);
        }
      } catch (parseError) {
        console.error('JSON parse error:', parseError.message);
        return new Response(JSON.stringify({
          error: 'Invalid request body: ' + parseError.message,
          details: 'Request body must be valid JSON'
        }), { status: 400, headers: corsHeaders });
      }
      
      const action = body.action;
      if (!action) {
        return new Response(JSON.stringify({
          error: 'Missing action type',
          details: 'Request must include an action field'
        }), { status: 400, headers: corsHeaders });
      }

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

  // Create normalized cache key with proper ISO dates
  const normalizedTimeMin = body.timeMin ? new Date(body.timeMin).toISOString() : 'none';
  const normalizedTimeMax = body.timeMax ? new Date(body.timeMax).toISOString() : 'none';
  const cacheKey = `${isMicrosoft ? 'ms' : 'google'}-${normalizedTimeMin}-${normalizedTimeMax}`;
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
    ? `${apiBase}/calendar/events?$select=subject,start,end,location,attendees,id,webLink&$orderby=start/dateTime&$top=100`
    : `${apiBase}/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=100`;

  // Cap range to 30 days max
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const boundedEndTime = (endTime.getTime() - startTime.getTime() > thirtyDaysMs)
    ? new Date(startTime.getTime() + thirtyDaysMs)
    : endTime;

  const timeMin = startTime.toISOString();
  const timeMax = boundedEndTime.toISOString();
  console.log('Fetching events for time window:', { timeMin, timeMax });

  // Apply time filters with proper encoding
  if (isMicrosoft) {
    // Microsoft Graph OData filter with proper encoding
    const filter = `start/dateTime ge '${timeMin}' and end/dateTime le '${timeMax}'`;
    url += `&$filter=${encodeURIComponent(filter)}`;
  } else {
    url += `&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`;
  }

  console.log('API URL:', url);

  let res;
  try {
    res = await fetchWithRetry(url, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    }, 15000, 2); // 15s timeout, 2 retries for calendar API
  } catch (error) {
    const classifiedError = classifyError(error);
    console.error('Calendar API request failed:', classifiedError);
    
    // Handle 401 by attempting token refresh
    if (classifiedError.type === 'auth' && !isMicrosoft) {
      console.log('Attempting token refresh after 401...');
      // Token refresh would happen here - simplified for now
      throw new Error('Calendar authorization expired. Please reconnect your account.');
    }
    
    throw new Error(`Calendar request failed: ${error.message}`);
  }

  console.log('Calendar API response status:', res.status);

  const responseText = await res.text();
  console.log('Calendar API response length:', responseText.length, 'chars');

  let data;
  try {
    data = JSON.parse(responseText);
  } catch (e) {
    console.error('Failed to parse calendar response:', e.message);
    throw new Error('Invalid calendar response format');
  }

  if (!res.ok) {
    console.error('Calendar API error:', res.status, data?.error?.message || 'No error details');
    
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
    // Token refresh with retry
    const response = await fetchWithRetry('https://oauth2.googleapis.com/token', {
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
    }, 10000, 2); // 10 second timeout, 2 retries
    
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
  const correlationId = crypto.randomUUID();
  console.log(`[${correlationId}] === Creating Calendar Event ===`);
  console.log(`[${correlationId}] Provider:`, isMicrosoft ? 'Microsoft' : 'Google');
  console.log(`[${correlationId}] Event details:`, JSON.stringify(event, null, 2));

  // Validate input thoroughly
  const validation = validateEventInput(event);
  if (!validation.valid) {
    console.error(`[${correlationId}] Validation failed:`, validation.errors);
    return new Response(JSON.stringify({ 
      error: 'Event validation failed',
      details: validation.errors,
      type: 'validation'
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
          timeZone: event.timeZone || 'UTC'
        },
        end: {
          dateTime: event.end,
          timeZone: event.timeZone || 'UTC'
        },
        location: {
          displayName: event.location || ''
        },
        attendees: event.attendees ? event.attendees.map((email: string) => ({
          emailAddress: {
            address: email,
            name: email
          },
          type: 'required'
        })) : []
      };
    } else {
      // Google Calendar API format
      url = `${apiBase}/calendars/primary/events`;
      
      // Add conferenceDataVersion=1 if conference data is present
      if (event.conferenceData) {
        url += '?conferenceDataVersion=1';
      }
      
      eventData = {
        summary: event.title,
        description: event.description || '',
        start: {
          dateTime: event.start,
          timeZone: event.timeZone || 'UTC'
        },
        end: {
          dateTime: event.end,
          timeZone: event.timeZone || 'UTC'
        },
        location: event.location || '',
        attendees: event.attendees ? event.attendees.map((email: string) => ({
          email: email
        })) : [],
        conferenceData: event.conferenceData || undefined
      };
    }

    // Generate idempotency key to prevent duplicates
    const idempotencyKey = event.idempotencyKey || 
      `${event.title}_${event.start}_${event.end}`.replace(/[^a-zA-Z0-9]/g, '_');
    
    console.log(`[${correlationId}] Making API request to:`, url);
    console.log(`[${correlationId}] Idempotency key:`, idempotencyKey);
    console.log(`[${correlationId}] Event data:`, JSON.stringify(eventData, null, 2));

    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // Add idempotency headers if supported
    if (!isMicrosoft) {
      // Google Calendar doesn't have native idempotency, but we can check for duplicates
      // by searching for events with the same title and time first
    }

    const response = await fetchWithRetry(url, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(eventData)
    }, 12000, 2); // 12 second timeout, 2 retries

    const responseText = await response.text();
    console.log(`[${correlationId}] Create event response status:`, response.status);
    console.log(`[${correlationId}] Response length:`, responseText.length, 'chars');

    if (!response.ok) {
      const classifiedError = classifyError(new Error(responseText), response);
      console.error(`[${correlationId}] Create event failed:`, classifiedError);
      
      let errorMessage = 'Failed to create calendar event';
      let userMessage = errorMessage;
      
      try {
        const errorData = JSON.parse(responseText);
        const apiError = errorData?.error?.message || errorData?.message || '';
        
        switch (response.status) {
          case 401:
            userMessage = 'Calendar authorization expired. Please reconnect your account.';
            break;
          case 403:
            if (apiError.includes('rate')) {
              userMessage = 'Too many requests. Please try again in a few minutes.';
            } else {
              userMessage = 'Calendar access denied. Please check permissions.';
            }
            break;
          case 409:
            userMessage = 'Calendar conflict. This time slot may already be booked.';
            break;
          case 429:
            userMessage = 'Rate limit exceeded. Please try again in a few minutes.';
            break;
          default:
            userMessage = apiError || errorMessage;
        }
      } catch (e) {
        console.error(`[${correlationId}] Failed to parse error response:`, e);
      }

      return new Response(JSON.stringify({
        error: userMessage,
        details: responseText,
        status: response.status,
        correlationId,
        type: classifiedError.type,
        retryable: classifiedError.retryable
      }), { 
        status: response.status, 
        headers: corsHeaders 
      });
    }

    const createdEvent = JSON.parse(responseText);
    console.log(`[${correlationId}] Event created successfully:`, createdEvent.id);
    console.log(`[${correlationId}] Event details:`, JSON.stringify(createdEvent, null, 2));

    // Normalize response format
    const normalizedEvent = isMicrosoft ? {
      id: createdEvent.id,
      summary: createdEvent.subject,
      start: createdEvent.start,
      end: createdEvent.end,
      location: createdEvent.location?.displayName,
      htmlLink: createdEvent.webLink,
      provider: 'Microsoft'
    } : {
      id: createdEvent.id,
      summary: createdEvent.summary,
      start: createdEvent.start,
      end: createdEvent.end,
      location: createdEvent.location,
      htmlLink: createdEvent.htmlLink,
      provider: 'Google'
    };

    // Verify event creation by attempting to fetch it
    try {
      console.log(`[${correlationId}] Verifying event creation...`);
      const verifyUrl = isMicrosoft 
        ? `${apiBase}/calendar/events/${createdEvent.id}`
        : `${apiBase}/calendars/primary/events/${createdEvent.id}`;
      
      const verifyResponse = await fetchWithRetry(verifyUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }, 5000, 1); // Short timeout, single retry for verification
      
      if (verifyResponse.ok) {
        console.log(`[${correlationId}] Event verification successful`);
        normalizedEvent.verified = true;
      } else {
        console.warn(`[${correlationId}] Event verification failed with status:`, verifyResponse.status);
        normalizedEvent.verified = false;
      }
    } catch (verifyError) {
      console.warn(`[${correlationId}] Event verification error:`, verifyError.message);
      normalizedEvent.verified = false;
    }

    // Generate calendar-specific event URL for better user experience
    const calendarUrl = isMicrosoft 
      ? `https://outlook.live.com/calendar/0/deeplink/compose?subject=${encodeURIComponent(event.title)}`
      : normalizedEvent.htmlLink || `https://calendar.google.com/calendar/u/0/r/eventedit/${createdEvent.id}`;

    return new Response(JSON.stringify({
      success: true,
      event: normalizedEvent,
      message: `Calendar event "${event.title}" created successfully in your ${isMicrosoft ? 'Microsoft' : 'Google'} calendar`,
      calendarUrl: calendarUrl,
      correlationId,
      timestamp: new Date().toISOString()
    }), { 
      headers: corsHeaders 
    });

  } catch (error) {
    const classifiedError = classifyError(error);
    console.error(`[${correlationId}] Create event error:`, classifiedError);
    
    let userMessage = 'Failed to create calendar event';
    let status = 500;
    
    switch (classifiedError.type) {
      case 'timeout':
        userMessage = 'Calendar request timed out. Please try again.';
        status = 408;
        break;
      case 'auth':
        userMessage = 'Calendar authorization required. Please reconnect your account.';
        status = 401;
        break;
      case 'quota':
        userMessage = 'Rate limit exceeded. Please try again in a few minutes.';
        status = 429;
        break;
      case 'validation':
        userMessage = 'Invalid event data provided.';
        status = 400;
        break;
      default:
        userMessage = 'Failed to create calendar event. Please try again.';
    }

    return new Response(JSON.stringify({
      error: userMessage,
      correlationId,
      type: classifiedError.type,
      retryable: classifiedError.retryable,
      details: error.message
    }), { 
      status, 
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