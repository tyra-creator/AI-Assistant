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

  // Enhanced intent recognition using DeepSeek via OPENROUTER
  const intent = await recognizeIntent(message, apiKey);
  
  // Handle calendar-related intents
  if (intent.type === 'calendar' || state.calendarContext) {
    return handleCalendarContext(message, state, intent);
  }

  // Handle meeting requests (backward compatibility)
  if (isMeetingRequest(message) || state.meetingContext) {
    return handleMeetingContext(message, state);
  }

  // Default assistant response using DeepSeek
  const response = await generateResponse(message, apiKey);
  return {
    response: response || "I'm your business assistant. How can I help you today?",
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

  // Extract time if not already set - Fixed regex
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

// Enhanced intent recognition using DeepSeek
async function recognizeIntent(message: string, apiKey: string) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            content: `You are an intent recognition system. Analyze the user message and classify it into one of these categories:
            
            Calendar intents:
            - create: Schedule, add, book, plan meetings/events
            - edit: Change, modify, update, move existing events
            - delete: Cancel, remove, delete events
            - query: Check, view, list, what's on calendar
            
            Return only valid JSON: {"type": "calendar|other", "action": "create|edit|delete|query|none", "confidence": 0.8, "entities": {"title": "...", "time": "...", "attendees": [...]}}`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.1,
        max_tokens: 200
      })
    });

    const data = await response.json();
    const result = data.choices[0]?.message?.content;
    
    try {
      return JSON.parse(result);
    } catch {
      return { type: 'other', action: 'none', confidence: 0 };
    }
  } catch (error) {
    console.error('Intent recognition error:', error);
    return { type: 'other', action: 'none', confidence: 0 };
  }
}

// Generate intelligent response using DeepSeek
async function generateResponse(message: string, apiKey: string) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
            content: 'You are a helpful business assistant. Provide concise, professional responses to user queries about scheduling, productivity, and business tasks.'
          },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 300
      })
    });

    const data = await response.json();
    return data.choices[0]?.message?.content;
  } catch (error) {
    console.error('Response generation error:', error);
    return null;
  }
}

// Handle calendar-related requests
async function handleCalendarContext(message: string, state: any, intent: any) {
  const calendarUrl = Deno.env.get('CALENDAR_FUNCTION_URL');
  if (!calendarUrl) {
    return {
      response: "Calendar integration is not configured. Please contact support.",
      state: {}
    };
  }

  // Handle different calendar actions
  switch (intent.action) {
    case 'create':
      return handleCreateEvent(message, state, intent, calendarUrl);
    case 'edit':
      return handleEditEvent(message, state, intent, calendarUrl);
    case 'delete':
      return handleDeleteEvent(message, state, intent, calendarUrl);
    case 'query':
      return handleQueryEvents(message, state, intent, calendarUrl);
    default:
      return {
        response: "I can help you create, edit, delete, or check your calendar events. What would you like to do?",
        state: { calendarContext: true }
      };
  }
}

// Handle event creation
async function handleCreateEvent(message: string, state: any, intent: any, calendarUrl: string) {
  const details = extractEventDetails(message, state.eventDetails || {}, intent.entities);
  const missing = validateEventDetails(details);

  if (missing.length > 0) {
    return {
      response: `To create your event, please provide:\n${missing.map(m => `• ${m.label} (e.g. "${m.example}")`).join('\n')}`,
      state: {
        calendarContext: true,
        action: 'create',
        eventDetails: details
      }
    };
  }

  if (!state.confirmed) {
    return {
      response: `Please confirm event details:\n` +
               `Title: ${details.title}\n` +
               `Time: ${details.start} to ${details.end}\n` +
               `Description: ${details.description || 'None'}\n\n` +
               `Reply "confirm" to create or provide corrections.`,
      state: {
        calendarContext: true,
        action: 'create',
        eventDetails: details,
        readyToConfirm: true
      }
    };
  }

  try {
    const result = await callCalendarFunction(calendarUrl, 'create_event', { event: details });
    return {
      response: `✅ Event created: ${details.title} on ${details.start}`,
      details: result,
      state: {}
    };
  } catch (error) {
    return {
      response: "⚠️ Failed to create event. Please try again.",
      error: error.message,
      state: { calendarContext: true, action: 'create', eventDetails: details }
    };
  }
}

// Handle event editing
async function handleEditEvent(message: string, state: any, intent: any, calendarUrl: string) {
  // First, get existing events to find the one to edit
  try {
    const events = await callCalendarFunction(calendarUrl, 'get_events', {});
    const eventToEdit = findEventToEdit(message, events, intent.entities);
    
    if (!eventToEdit) {
      return {
        response: "I couldn't find the specific event you want to edit. Please be more specific about which event to modify.",
        state: { calendarContext: true, action: 'edit' }
      };
    }

    const updates = extractEventUpdates(message, intent.entities);
    
    if (!state.confirmed) {
      return {
        response: `Found event: "${eventToEdit.title}" on ${eventToEdit.start}\n` +
                 `Proposed changes: ${Object.entries(updates).map(([k,v]) => `${k}: ${v}`).join(', ')}\n\n` +
                 `Reply "confirm" to update or provide different changes.`,
        state: {
          calendarContext: true,
          action: 'edit',
          eventId: eventToEdit.id,
          updates: updates,
          readyToConfirm: true
        }
      };
    }

    const result = await callCalendarFunction(calendarUrl, 'update_event', { 
      event_id: state.eventId, 
      updates: state.updates 
    });
    
    return {
      response: `✅ Event updated successfully`,
      details: result,
      state: {}
    };
  } catch (error) {
    return {
      response: "⚠️ Failed to edit event. Please try again.",
      error: error.message,
      state: { calendarContext: true, action: 'edit' }
    };
  }
}

// Handle event deletion
async function handleDeleteEvent(message: string, state: any, intent: any, calendarUrl: string) {
  try {
    const events = await callCalendarFunction(calendarUrl, 'get_events', {});
    const eventToDelete = findEventToEdit(message, events, intent.entities);
    
    if (!eventToDelete) {
      return {
        response: "I couldn't find the specific event you want to delete. Please be more specific.",
        state: { calendarContext: true, action: 'delete' }
      };
    }

    if (!state.confirmed) {
      return {
        response: `Are you sure you want to delete: "${eventToDelete.title}" on ${eventToDelete.start}?\n\nReply "confirm" to delete.`,
        state: {
          calendarContext: true,
          action: 'delete',
          eventId: eventToDelete.id,
          readyToConfirm: true
        }
      };
    }

    const result = await callCalendarFunction(calendarUrl, 'delete_event', { event_id: state.eventId });
    
    return {
      response: `✅ Event deleted successfully`,
      state: {}
    };
  } catch (error) {
    return {
      response: "⚠️ Failed to delete event. Please try again.",
      error: error.message,
      state: { calendarContext: true, action: 'delete' }
    };
  }
}

// Handle calendar queries
async function handleQueryEvents(message: string, state: any, intent: any, calendarUrl: string) {
  try {
    const queryParams = extractQueryParameters(message, intent.entities);
    const events = await callCalendarFunction(calendarUrl, 'get_events', queryParams);
    
    if (events.length === 0) {
      return {
        response: "No events found for your query.",
        state: {}
      };
    }

    const eventList = events.slice(0, 5).map(event => 
      `• ${event.title} - ${event.start}${event.attendees?.length ? ` (${event.attendees.length} attendees)` : ''}`
    ).join('\n');

    return {
      response: `Here are your upcoming events:\n${eventList}${events.length > 5 ? `\n...and ${events.length - 5} more` : ''}`,
      state: {}
    };
  } catch (error) {
    return {
      response: "⚠️ Failed to fetch calendar events. Please try again.",
      error: error.message,
      state: {}
    };
  }
}

// Helper functions
function extractEventDetails(message: string, currentDetails: any, entities: any = {}) {
  const details = { ...currentDetails, ...entities };
  
  // Extract title if not set
  if (!details.title) {
    const titleMatch = message.match(/(?:schedule|create|add|book)\s+(?:a\s+)?(?:meeting\s+)?(?:for\s+)?([^,.]+)/i);
    if (titleMatch) details.title = titleMatch[1].trim();
  }
  
  return details;
}

function validateEventDetails(details: any) {
  const required = [
    { key: 'title', label: 'Event title', example: 'Team Meeting' },
    { key: 'start', label: 'Start time', example: 'Tomorrow 2pm' }
  ];
  return required.filter(field => !details[field.key]);
}

function findEventToEdit(message: string, events: any[], entities: any = {}) {
  // Simple matching logic - can be enhanced
  const searchTerm = entities.title || message.toLowerCase();
  return events.find(event => 
    event.title.toLowerCase().includes(searchTerm) ||
    searchTerm.includes(event.title.toLowerCase())
  );
}

function extractEventUpdates(message: string, entities: any = {}) {
  const updates: any = {};
  
  if (entities.time) updates.start = entities.time;
  if (entities.title) updates.title = entities.title;
  
  return updates;
}

function extractQueryParameters(message: string, entities: any = {}) {
  const params: any = {};
  
  if (message.includes('today')) {
    params.start_date = new Date().toISOString().split('T')[0];
  } else if (message.includes('tomorrow')) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    params.start_date = tomorrow.toISOString().split('T')[0];
  }
  
  return params;
}

async function callCalendarFunction(url: string, action: string, data: any) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`
    },
    body: JSON.stringify({ action, ...data })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Calendar operation failed');
  }

  return await response.json();
}