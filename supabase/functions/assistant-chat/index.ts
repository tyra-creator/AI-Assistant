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

    // Pass the authorization header for calendar integration
    const authHeader = req.headers.get('Authorization');
    const reply = await processMessage(body.message, body.conversation_state || {}, body.session_id || null, authHeader);
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

async function processMessage(message: string, state: any, sessionId: string | null = null, authHeader?: string | null) {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) throw new Error('OPENROUTER_API_KEY environment variable not set');

  console.log('Processing message:', message);
  console.log('Current state:', JSON.stringify(state, null, 2));

  // Extract proper state structure - handle both frontend and backend formats
  const currentState = state || {};
  const loopCount = currentState.loopCount || 0;
  
  // Loop prevention - break circular conversations
  if (loopCount > 3) {
    console.log('Breaking loop at count:', loopCount);
    return {
      response: "Let me help you start fresh. Please tell me what kind of meeting you'd like to schedule.",
      state: {}
    };
  }

  // Improved confirmation detection - exact word matching
  const isConfirmation = /\b(confirm|yes|ok|correct)\b/i.test(message.trim());
  if (isConfirmation && currentState.readyToConfirm) {
    console.log('Processing confirmation...');
    return await handleConfirmation(currentState, authHeader);
  }

  // Check if this is a meeting request
  if (isMeetingRequest(message) || currentState.meetingContext) {
    console.log('Handling meeting context...');
    return await handleMeetingFlow(message, { ...currentState, loopCount: loopCount + 1 });
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

// Enhanced time patterns with better range and timezone support
  const timePatterns = [
    // Time ranges with timezone
    /\b(\d{1,2})(:\d{2})?\s*(am|pm)\s*[-–]\s*(\d{1,2})(:\d{2})?\s*(am|pm)\s*(CAT|EST|PST|GMT|UTC)?\b/gi,
    // Time ranges without timezone  
    /\b(\d{1,2})(:\d{2})?\s*[-–]\s*(\d{1,2})(:\d{2})?\s*(am|pm)\b/gi,
    // Day + time patterns
    /\b(today|tomorrow)\s+at\s+(\d{1,2})(:\d{2})?\s*(am|pm)\s*(CAT|EST|PST|GMT|UTC)?\b/gi,
    /\b(\d{1,2})(:\d{2})?\s*(am|pm)\s+(today|tomorrow)\s*(CAT|EST|PST|GMT|UTC)?\b/gi,
    // Basic time patterns
    /\bat\s+(\d{1,2})(:\d{2})?\s*(am|pm)\s*(CAT|EST|PST|GMT|UTC)?\b/gi,
    /\b(\d{1,2})(:\d{2})?\s*(am|pm)\s*(CAT|EST|PST|GMT|UTC)?\b/gi
  ];

  // Extract time if not already found
  if (!details.time) {
    for (const pattern of timePatterns) {
      const timeMatch = message.match(pattern);
      if (timeMatch) {
        details.time = timeMatch[0].trim();
        console.log('Found time:', details.time);
        break;
      }
    }
  }

  // Clean message for title extraction
  let cleanMessage = message;
  
  // Remove command words and time
  const wordsToRemove = ['add', 'schedule', 'set', 'create', 'book', 'a', 'an', 'the', 'meeting', 'appointment'];
  cleanMessage = cleanMessage.replace(new RegExp(`\\b(${wordsToRemove.join('|')})\\b`, 'gi'), '').trim();
  
  if (details.time) {
    cleanMessage = cleanMessage.replace(new RegExp(details.time.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();
  }

  // Improved title extraction patterns
  const titlePatterns = [
    /titles?:\s*(.+?)(?:\s+(?:at|on|for|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*)?$/i,
    /(?:meeting|appointment)\s+(?:for|about|regarding)?\s*(.+?)(?:\s+(?:at|on|for|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*)?$/i,
    /^(.+?)(?:\s+(?:meeting|appointment|at|on|for|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday).*)?$/i
  ];

  // Extract title if not already found
  if (!details.title) {
    for (const pattern of titlePatterns) {
      const titleMatch = cleanMessage.match(pattern);
      if (titleMatch && titleMatch[1] && titleMatch[1].trim()) {
        let extractedTitle = titleMatch[1].trim();
        
        // Clean up extracted title
        extractedTitle = extractedTitle.replace(/^(to|my|calendar|on|for)\s+/i, '');
        extractedTitle = extractedTitle.replace(/\s+(meeting|appointment)$/i, '');
        
        if (extractedTitle.length > 2) {
          details.title = extractedTitle;
          console.log('Found title via pattern:', details.title);
          break;
        }
      }
    }
  }

  // Use existing title if still missing
  if (!details.title && existing.title) {
    details.title = existing.title;
    console.log('Using existing title:', details.title);
  }

  // Final validation and cleanup
  if (details.title) {
    details.title = details.title.replace(/^[^a-zA-Z0-9]*|[^a-zA-Z0-9]*$/g, '').trim();
    if (details.title.length < 2) {
      details.title = null;
    }
  }

  console.log('Final extracted details:', details);
  return details;
}

async function handleConfirmation(state: any, authHeader?: string | null) {
  console.log('Handling confirmation with state:', state);
  
  if (!state.meetingDetails) {
    return {
      response: "I don't have meeting details to confirm. Please start over with your meeting request.",
      state: {}
    };
  }

  const { title, time } = state.meetingDetails;
  
  try {
    // Convert time to proper ISO format for calendar API
    const startTime = convertToISODateTime(time);
    const endTime = addOneHour(startTime);
    
    console.log(`Creating calendar event: ${title} from ${startTime} to ${endTime}`);
    
    // Call the calendar integration function with user's auth header
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Use user's auth header if available, otherwise fall back to service role
    if (authHeader) {
      headers['Authorization'] = authHeader;
    } else {
      headers['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
      console.log('Warning: No user auth header available, using service role');
    }
    
    console.log('Calling calendar integration with headers:', Object.keys(headers));
    
    const calendarResponse = await fetch('https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/calendar-integration', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action: 'create_event',
        event: {
          title: title,
          description: `Meeting created via AI assistant`,
          start: startTime,
          end: endTime,
          location: 'TBD'
        }
      }),
    });

    console.log('Calendar response status:', calendarResponse.status);
    
    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error('Calendar integration failed:', errorText);
      
      // Check if it's an authentication error
      if (calendarResponse.status === 401 || errorText.includes('Unauthorized') || errorText.includes('invalid claim')) {
        return {
          response: `❌ Please log in to your account first to create calendar events. Once logged in, you can schedule meetings directly from this chat.`,
          state: {}
        };
      }
      
      return {
        response: `❌ Sorry, I couldn't create the calendar event. Error: ${errorText}\n\nPlease try again or check your calendar connection.`,
        state: {}
      };
    }

    const calendarResult = await calendarResponse.json();
    console.log('Calendar event created:', calendarResult);
    
    return {
      response: `✅ Meeting scheduled successfully!\n\nTitle: ${title}\nTime: ${time}\n\nYour meeting has been added to your calendar.`,
      state: {}
    };
    
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return {
      response: `❌ Sorry, I couldn't create the calendar event due to an error: ${error.message}\n\nPlease try again or check your calendar connection.`,
      state: {}
    };
  }
}

// Helper function to convert time strings to ISO format with enhanced parsing
function convertToISODateTime(timeString: string): string {
  const now = new Date();
  const today = now.toISOString().split('T')[0]; // Get YYYY-MM-DD
  
  // Enhanced parsing for time ranges - take the first time
  let processedTimeString = timeString;
  
  // Handle time ranges by extracting the start time
  const rangeMatch = timeString.match(/(\d{1,2})(:\d{2})?\s*(am|pm)\s*[-–]/i);
  if (rangeMatch) {
    processedTimeString = rangeMatch[0].replace(/[-–]$/, '').trim();
  }
  
  // Parse time from various formats
  const timeMatch = processedTimeString.match(/(\d{1,2})(:\d{2})?\s*(am|pm)/i);
  if (!timeMatch) {
    // Default to current time + 1 hour if parsing fails
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);
    return oneHourLater.toISOString();
  }
  
  let hour = parseInt(timeMatch[1]);
  const minute = timeMatch[2] ? parseInt(timeMatch[2].substring(1)) : 0;
  const ampm = timeMatch[3].toLowerCase();
  
  // Convert to 24-hour format
  if (ampm === 'pm' && hour !== 12) hour += 12;
  if (ampm === 'am' && hour === 12) hour = 0;
  
  // Check if time mentions "today" or "tomorrow"
  let targetDate = today;
  if (timeString.toLowerCase().includes('tomorrow')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    targetDate = tomorrow.toISOString().split('T')[0];
  }
  
  // Handle timezone offsets (basic support for CAT = UTC+2)
  let offsetHours = 0;
  if (timeString.includes('CAT')) {
    offsetHours = -2; // CAT is UTC+2, so we subtract 2 to get UTC
  }
  
  const finalHour = Math.max(0, Math.min(23, hour + offsetHours));
  
  return `${targetDate}T${finalHour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
}

// Helper function to add one hour to a datetime string
function addOneHour(isoString: string): string {
  const date = new Date(isoString);
  date.setHours(date.getHours() + 1);
  return date.toISOString();
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