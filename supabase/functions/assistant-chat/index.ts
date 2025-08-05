import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    // Health check endpoint
    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'healthy',
        version: '3.9 (Stable)',
        timestamp: new Date().toISOString(),
        environment: {
          OPENROUTER_API_KEY: !!Deno.env.get('OPENROUTER_API_KEY'),
          CALENDAR_FUNCTION_URL: !!Deno.env.get('CALENDAR_FUNCTION_URL')
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST requests for chat
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ 
        error: `Method ${req.method} not allowed`,
        allowed_methods: ['POST', 'GET', 'OPTIONS']
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate content type
    const contentType = req.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid content type',
        required_content_type: 'application/json'
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse and validate request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON body',
        details: e.message
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!requestBody.message) {
      return new Response(JSON.stringify({ 
        error: 'Message is required',
        example: { message: "Schedule a meeting", conversation_state: {} }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Process the message
    const response = await processMessage(
      requestBody.message,
      requestBody.conversation_state || {}
    );

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unhandled error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function processMessage(message: string, state: any) {
  // Initialize API key
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable not set');
  }

  // Handle meeting requests
  if (isMeetingRequest(message) || state.meetingContext) {
    return handleMeetingContext(message, state);
  }

  // Default assistant response
  return {
    response: "I'm your business assistant. How can I help you today?",
    state: {}
  };
}

async function handleMeetingContext(message: string, state: any) {
  // Extract and validate meeting details
  const details = extractMeetingDetails(message, state.meetingDetails || {});
  const missing = validateMeetingDetails(details);

  if (missing.length > 0) {
    return {
      response: `To schedule your meeting, please provide:\n${missing.map(m => `• ${m.label} (e.g. "${m.example}")`).join('\n')}`,
      state: {
        meetingContext: true,
        meetingDetails: details
      }
    };
  }

  // Confirm before scheduling
  if (!state.confirmed) {
    return {
      response: `Please confirm meeting details:\n` +
               `Title: ${details.title}\n` +
               `Time: ${details.time}\n` +
               `Attendees: ${details.participants?.join(', ') || 'None'}\n\n` +
               `Reply "confirm" to schedule or provide corrections.`,
      state: {
        meetingContext: true,
        meetingDetails: details,
        readyToConfirm: true
      }
    };
  }

  // Schedule the meeting
  try {
    const result = await scheduleCalendarEvent(details);
    return {
      response: `✅ Meeting scheduled: ${details.title} at ${details.time}`,
      details: result,
      state: {} // Reset context
    };
  } catch (error) {
    return {
      response: "⚠️ Failed to schedule meeting. Please try again.",
      error: error.message,
      state: {
        meetingContext: true,
        meetingDetails: details
      }
    };
  }
}

// Helper functions
function isMeetingRequest(message: string): boolean {
  return /(schedule|add|create|meeting|appointment)/i.test(message);
}

function extractMeetingDetails(message: string, currentDetails: any): any {
  const details = { ...currentDetails };

  // Extract key-value pairs (title:... time:...)
  const keyValuePairs = message.match(/(\w+)\s*:\s*([^,]+)/g);
  if (keyValuePairs) {
    keyValuePairs.forEach(pair => {
      const [key, value] = pair.split(':').map(s => s.trim());
      details[key.toLowerCase()] = value;
    });
  }

  // Extract time if not already set
  if (!details.time) {
    const timeMatch = message.match(/(\d{1,2}(:\d{2})?\s*(am|pm)?\s*(?:to|-)\s*\d{1,2}(:\d{2})?\s*(am|pm)?)/i);
    if (timeMatch) details.time = timeMatch[0];
  }

  return details;
}

function validateMeetingDetails(details: any): Array<{label: string, example: string}> {
  const required = [
    { key: 'title', label: 'Meeting title', example: 'Sales Review' },
    { key: 'time', label: 'Date and time', example: 'Tomorrow 2-3pm' }
  ];
  return required.filter(field => !details[field.key]);
}

async function scheduleCalendarEvent(details: any): Promise<any> {
  const calendarUrl = Deno.env.get('CALENDAR_FUNCTION_URL');
  if (!calendarUrl) {
    throw new Error('Calendar integration not configured');
  }

  const response = await fetch(calendarUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
    },
    body: JSON.stringify({
      action: 'create_event',
      event: {
        title: details.title,
        start: details.time.split(' to ')[0].trim(),
        end: details.time.split(' to ')[1]?.trim() || details.time.split(' to ')[0].trim(),
        description: details.description || '',
        attendees: details.participants || []
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to schedule event');
  }

  return await response.json();
}