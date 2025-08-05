import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Assistant Chat Function v3.5 - Stateful Meeting Flow ===');
  
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET') return healthCheckResponse();

  try {
    const { message, conversation_state = {} } = await req.json();
    if (!message) throw new Error('Message is required');

    const deepseekKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!deepseekKey) throw new Error('API key not configured');

    const calendarFunctionURL = Deno.env.get('CALENDAR_FUNCTION_URL');
    const isCalendarReady = Boolean(calendarFunctionURL);

    // Check if we're in a meeting scheduling flow
    if (isMeetingRequest(message) || conversation_state.meeting_in_progress) {
      return handleMeetingFlow(message, conversation_state, isCalendarReady);
    }

    // Regular chat response
    return await generateChatResponse(message);

  } catch (error) {
    console.error('Function error:', error);
    return errorResponse(error);
  }

  async function handleMeetingFlow(message: string, state: any, calendarReady: boolean) {
    // Update state with new meeting details from message
    const updatedState = extractMeetingDetails(message, state);
    
    if (!calendarReady) {
      return new Response(JSON.stringify({
        response: "🔌 Calendar integration needed:\n1. Go to Settings → Integrations\n2. Connect your calendar account",
        action_required: "connect_calendar",
        state: updatedState
      }), { headers: corsHeaders });
    }

    // Check if we have all required details
    const missingDetails = getMissingDetails(updatedState);
    if (missingDetails.length > 0 && !message.toLowerCase().includes('confirm')) {
      return new Response(JSON.stringify({
        response: `📅 Still need:\n${missingDetails.map(d => `• ${d.label} (${d.example})`).join('\n')}`,
        state: updatedState,
        missing_details: missingDetails
      }), { headers: corsHeaders });
    }

    // If user confirms or we have all details, schedule the meeting
    if (message.toLowerCase().includes('confirm') || 
        (missingDetails.length === 0 && updatedState.meeting_details)) {
      return await scheduleMeeting(updatedState.meeting_details);
    }

    // Default response with current state
    return new Response(JSON.stringify({
      response: `📋 Current meeting details:\n${formatMeetingDetails(updatedState.meeting_details)}\n\nReply with missing info or "confirm" to schedule.`,
      state: updatedState
    }), { headers: corsHeaders });
  }

  function extractMeetingDetails(message: string, state: any) {
    const newState = { ...state, meeting_in_progress: true };
    if (!newState.meeting_details) newState.meeting_details = {};
    
    // Extract from structured format (Title:... Time:...)
    const structuredMatch = message.match(/(title|time|participants|location|agenda):([^,]+)/gi);
    if (structuredMatch) {
      structuredMatch.forEach(item => {
        const [key, ...value] = item.split(':');
        newState.meeting_details[key.trim().toLowerCase()] = value.join(':').trim();
      });
      return newState;
    }

    // Extract from natural language
    if (message.match(/sales meeting/i)) {
      newState.meeting_details.title = newState.meeting_details.title || "Sales Meeting";
    }
    if (message.match(/(\d{1,2}(:\d{2})?\s*(am|pm)?)/i)) {
      newState.meeting_details.time = extractTimeFromMessage(message);
    }
    if (message.match(/no attendees|no participants/i)) {
      newState.meeting_details.participants = [];
    }

    return newState;
  }

  function getMissingDetails(state: any) {
    const required = [
      { key: 'title', label: 'Meeting title', example: 'Sales Review' },
      { key: 'time', label: 'Date & time', example: 'Today 3-4pm' }
    ];
    return required.filter(item => !state.meeting_details?.[item.key]);
  }

  async function scheduleMeeting(details: any) {
    try {
      const eventPayload = {
        action: 'create_event',
        event: {
          title: details.title,
          start: convertToISO(details.time.split('-')[0]),
          end: convertToISO(details.time.split('-')[1] || details.time),
          description: details.agenda || '',
          attendees: Array.isArray(details.participants) ? 
            details.participants : 
            (details.participants?.split(',') || [])
        }
      };

      const calendarRes = await fetch(Deno.env.get('CALENDAR_FUNCTION_URL')!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': req.headers.get('Authorization') || '',
        },
        body: JSON.stringify(eventPayload),
      });

      const result = await calendarRes.json();
      
      if (calendarRes.ok) {
        return new Response(JSON.stringify({
          response: `✅ Meeting scheduled!\n**${details.title}**\n⏰ ${details.time}\n📍 ${details.location || 'No location specified'}`,
          success: true,
          meeting_details: null, // Clear state
          meeting_in_progress: false,
          event_id: result.id
        }), { headers: corsHeaders });
      } else {
        throw new Error(result.error || 'Failed to create event');
      }
    } catch (error) {
      console.error('Scheduling error:', error);
      return errorResponse(error);
    }
  }

  // Helper functions remain the same as previous version
  function healthCheckResponse() { /* ... */ }
  function errorResponse(error: Error) { /* ... */ }
  function isMeetingRequest(message: string) { /* ... */ }
  function convertToISO(dateTimeStr: string) { /* ... */ }
  function formatMeetingDetails(details: any) { /* ... */ }
  function extractTimeFromMessage(message: string) { /* ... */ }
  async function generateChatResponse(message: string) { /* ... */ }
});