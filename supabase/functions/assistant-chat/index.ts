import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Uniform CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization,x-client-info,apikey,content-type',
  'Access-Control-Allow-Methods': 'OPTIONS,GET,POST',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json',
};

// Helper to wrap fetch with timeout
async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  const resp = await fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(id));
  return resp;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method === 'GET') {
      return healthCheck();
    }

    if (req.method !== 'POST') {
      return errorResponse(`Method ${req.method} not allowed`, 405, { allowed_methods: ['POST', 'GET', 'OPTIONS'] });
    }

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return errorResponse('Invalid content type', 400, { required_content_type: 'application/json' });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      return errorResponse('Invalid JSON body', 400, { details: e.message });
    }

    if (!body.message) {
      return errorResponse('Message is required', 400, {
        example: { message: "Schedule a meeting", conversation_state: {} }
      });
    }

    const reply = await processMessage(body.message, body.conversation_state || {}, body.session_id || null);
    return new Response(JSON.stringify(reply), { headers: corsHeaders });

  } catch (err) {
    console.error('Unhandled:', err);
    return errorResponse('Internal server error', 500, {
      request_id: crypto.randomUUID(),
      timestamp: new Date().toISOString()
    });
  }
});

function healthCheck() {
  return new Response(JSON.stringify({
    status: 'healthy',
    version: '3.9 (Stable)',
    timestamp: new Date().toISOString(),
    environment: {
      OPENROUTER_API_KEY: !!Deno.env.get('OPENROUTER_API_KEY'),
      CALENDAR_FUNCTION_URL: !!Deno.env.get('CALENDAR_FUNCTION_URL')
    }
  }), { headers: corsHeaders });
}

function errorResponse(error: string, status = 400, details: any = {}) {
  return new Response(JSON.stringify({ error, ...details }), { status, headers: corsHeaders });
}

async function processMessage(message: string, state: any, sessionId: string | null = null) {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY environment variable not set');

  console.log('Incoming:', message, 'State:', state);

  // Loop-breaker logic
  if (state.lastMessage === message && (state.retryCount || 0) >= 2) {
    return {
      response: "🔄 I'm having trouble understanding—can you try rephrasing or specifying time and title clearly?",
      state: {}
    };
  }
  state.lastMessage = message;
  state.retryCount = (state.retryCount || 0) + 1;

  if (message.trim().toLowerCase().includes('confirm') && state.readyToConfirm) {
    state.confirmed = true;
    if (state.meetingContext) return handleMeetingContext(message, state, apiKey);
    if (state.calendarContext) return handleCalendarContext(message, state, apiKey);
  }

  const intent = await recognizeIntent(message, apiKey);
  console.log('Intent:', intent);

  if (!intent || !intent.type || intent.confidence < 0.5) {
    return {
      response: "🤔 I’m not sure what you mean—can you clarify your request or try again?",
      state: {}
    };
  }

  if (intent.type === 'calendar' || state.calendarContext) {
    return handleCalendarContext(message, state, apiKey, intent);
  }

  if (isMeetingRequest(message) || state.meetingContext) {
    return handleMeetingContext(message, state, apiKey);
  }

  const response = await generateResponse(message, apiKey);
  return {
    response: response || "I'm here to help you schedule meetings or manage your calendar.",
    state: {}
  };
}
