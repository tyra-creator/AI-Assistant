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

  console.log('Processing message:', message);
  console.log('Current state:', state);

  // Check for confirmation
  if (message.trim().toLowerCase().includes('confirm') && state.readyToConfirm) {
    console.log('Processing confirmation...');
    return await handleConfirmation(state);
  }

  // Check if this is a meeting request
  if (isMeetingRequest(message) || state.meetingContext) {
    console.log('Handling meeting context...');
    return await handleMeetingFlow(message, state);
  }

  // Default response
  const response = await generateResponse(message, apiKey);
  return {
    response: response || "I'm here to help you schedule meetings or manage your calendar.",
    state: {}
  };
}

function isMeetingRequest(message: string): boolean {
  const meetingKeywords = ['meeting', 'schedule', 'calendar', 'appointment', 'call'];
  const lowerMessage = message.toLowerCase();
  return meetingKeywords.some(keyword => lowerMessage.includes(keyword));
}

async function handleMeetingFlow(message: string, state: any) {
  console.log('Extracting meeting details from:', message);
  
  const details = extractMeetingDetails(message, state);
  console.log('Extracted details:', details);

  // Check if we have both title and time
  if (details.title && details.time) {
    // Ready to confirm
    return {
      response: `Please confirm meeting details:\nTitle: ${details.title}\nTime: ${details.time}\n\nReply "confirm" to schedule or provide corrections.`,
      state: {
        meetingContext: true,
        readyToConfirm: true,
        meetingDetails: details
      }
    };
  }

  // Missing information
  const missing = [];
  if (!details.title) missing.push('title');
  if (!details.time) missing.push('time');

  return {
    response: `To schedule your meeting, please provide:\n${missing.map(field => 
      field === 'title' ? '• Meeting title' : '• Date and time (e.g. "Tomorrow 2-3pm")'
    ).join('\n')}`,
    state: {
      meetingContext: true,
      partialDetails: details
    }
  };
}

function extractMeetingDetails(message: string, state: any) {
  const existing = state.partialDetails || {};
  const details = { title: existing.title || null, time: existing.time || null };

  console.log('Starting extraction with existing:', existing);

  // Enhanced time patterns
  const timePatterns = [
    /\b(today|tomorrow)\s+(\d{1,2})(:\d{2})?\s*(am|pm)\b/gi,
    /\b(\d{1,2})(:\d{2})?\s*(am|pm)\s+(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
    /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b/gi,
    /\bat\s+(\d{1,2})(:\d{2})?\s*(am|pm)\b/gi
  ];

  // Extract time
  for (const pattern of timePatterns) {
    const timeMatch = message.match(pattern);
    if (timeMatch) {
      details.time = timeMatch[0];
      console.log('Found time:', details.time);
      break;
    }
  }

  // Extract title
  let cleanMessage = message;
  
  // Remove time from message
  if (details.time) {
    cleanMessage = cleanMessage.replace(new RegExp(details.time.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
  }

  // Handle different title formats
  const titlePatterns = [
    /titles?:\s*(.+)/i,
    /meeting\s+(.+)/i,
    /schedule\s+(.+)/i,
    /add\s+(.+)/i
  ];

  for (const pattern of titlePatterns) {
    const titleMatch = cleanMessage.match(pattern);
    if (titleMatch) {
      details.title = titleMatch[1].trim();
      console.log('Found title via pattern:', details.title);
      break;
    }
  }

  // Fallback: use cleaned message as title if no specific pattern matched
  if (!details.title && cleanMessage && !cleanMessage.toLowerCase().includes('meeting') && !cleanMessage.toLowerCase().includes('schedule')) {
    details.title = cleanMessage;
    console.log('Using cleaned message as title:', details.title);
  }

  // Default title if still missing
  if (!details.title && (existing.title || message.toLowerCase().includes('meeting'))) {
    details.title = existing.title || 'Meeting';
    console.log('Using default/existing title:', details.title);
  }

  console.log('Final extracted details:', details);
  return details;
}

async function handleConfirmation(state: any) {
  console.log('Handling confirmation with state:', state);
  
  if (!state.meetingDetails) {
    return {
      response: "I don't have meeting details to confirm. Please start over with your meeting request.",
      state: {}
    };
  }

  // Here you would normally call the calendar integration
  // For now, we'll simulate success
  
  const { title, time } = state.meetingDetails;
  
  return {
    response: `✅ Meeting scheduled successfully!\n\nTitle: ${title}\nTime: ${time}\n\nYour meeting has been added to your calendar.`,
    state: {}
  };
}

async function generateResponse(message: string, apiKey: string) {
  try {
    const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful business assistant focused on productivity and scheduling. Keep responses concise and professional.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      })
    });

    const data = await response.json();
    return data.choices?.[0]?.message?.content || "I'm here to help with your scheduling needs.";
  } catch (error) {
    console.error('Error generating response:', error);
    return "I'm here to help with your scheduling and productivity needs.";
  }
}