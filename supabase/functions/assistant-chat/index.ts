import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Assistant Chat Function v3.4 - Complete Meeting Flow ===');
  
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET') return healthCheckResponse();

  try {
    const { message, conversation_context = [] } = await req.json();
    if (!message) throw new Error('Message is required');

    const deepseekKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!deepseekKey) throw new Error('API key not configured');

    const calendarFunctionURL = Deno.env.get('CALENDAR_FUNCTION_URL');
    const isCalendarReady = Boolean(calendarFunctionURL);

    // Handle meeting scheduling flow
    if (isMeetingRequest(message, conversation_context)) {
      return handleMeetingFlow(message, conversation_context, isCalendarReady);
    }

    // Regular chat response
    return await generateChatResponse(message);

  } catch (error) {
    console.error('Function error:', error);
    return errorResponse(error);
  }

  // Helper functions
  async function handleMeetingFlow(message: string, context: any[], calendarReady: boolean) {
    if (!calendarReady) {
      return new Response(JSON.stringify({
        response: "🔌 Calendar integration needed:\n1. Go to Settings → Integrations\n2. Connect your Google/Microsoft account\n3. Grant calendar permissions",
        action_required: "connect_calendar",
        help_link: "https://support.example.com/calendar-setup"
      }), { headers: corsHeaders });
    }

    // Extract meeting details from conversation context
    const meetingDetails = extractDetailsFromContext(message, context);
    
    if (!meetingDetails.title || !meetingDetails.time) {
      return new Response(JSON.stringify({
        response: "📅 Let's schedule your meeting. Please provide:\n• Title/purpose\n• Date & time\n• Duration\n• Attendees (if any)",
        missing_info: {
          needs_title: !meetingDetails.title,
          needs_time: !meetingDetails.time
        },
        example: "Example: 'Team sync every Monday 10-11am'"
      }), { headers: corsHeaders });
    }

    // If we have all details, schedule the meeting
    if (message.toLowerCase().includes('confirm') || message.toLowerCase().includes('set the meeting')) {
      const eventPayload = {
        action: 'create_event',
        event: {
          title: meetingDetails.title,
          start: convertToISO(meetingDetails.time.split(' to ')[0]),
          end: convertToISO(meetingDetails.time.split(' to ')[1] || meetingDetails.time),
          description: meetingDetails.agenda || '',
          attendees: meetingDetails.participants ? meetingDetails.participants.split(',') : []
        }
      };

      const calendarRes = await fetch(calendarFunctionURL!, {
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
          response: `✅ Meeting scheduled!\n**${meetingDetails.title}**\n📅 ${formatDateTime(meetingDetails.time)}\n📍 ${meetingDetails.location || 'No location'}`,
          event_id: result.id,
          calendar_link: result.htmlLink
        }), { headers: corsHeaders });
      } else {
        throw new Error(result.error || 'Failed to create event');
      }
    }

    // Show confirmation before scheduling
    return new Response(JSON.stringify({
      response: `📋 Please confirm:\n**${meetingDetails.title}**\n⏰ ${meetingDetails.time}\n👥 ${meetingDetails.participants || 'No attendees'}\n\nReply "confirm" to schedule or provide corrections.`,
      confirmation_required: true,
      meeting_details: meetingDetails
    }), { headers: corsHeaders });
  }

  function extractDetailsFromContext(message: string, context: any[]) {
    // Extract from structured message like "title:... time:..."
    const structuredMatch = message.match(/(title|time|participants|location|agenda):([^,]+)/gi);
    if (structuredMatch) {
      return Object.fromEntries(
        structuredMatch.map(x => {
          const [key, ...val] = x.split(':');
          return [key.trim(), val.join(':').trim()];
        })
      );
    }
    
    // Or extract from natural language using context
    return {
      title: context.find(m => m.role === 'user' && m.content.includes('meeting'))?.content,
      time: context.find(m => m.content.match(/\d{1,2}(:\d{2})?\s*(am|pm)?/i))?.content
    };
  }

  function healthCheckResponse() {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      version: '3.4',
      capabilities: {
        calendar: Boolean(Deno.env.get('CALENDAR_FUNCTION_URL'))
      }
    }), { headers: corsHeaders });
  }

  function errorResponse(error: Error) {
    return new Response(JSON.stringify({ 
      response: "⚠️ Action couldn't be completed",
      error: error.message,
      solution: "Please check your inputs or try again later"
    }), { 
      status: 500,
      headers: corsHeaders 
    });
  }

  function isMeetingRequest(message: string, context: any[]) {
    const meetingTriggers = ['meeting', 'event', 'schedule', 'appointment'];
    return meetingTriggers.some(t => message.toLowerCase().includes(t)) ||
           context.some(m => meetingTriggers.some(t => m.content.toLowerCase().includes(t)));
  }

  function convertToISO(dateTimeStr: string) {
    // Simple conversion - in a real app use a proper date library
    return new Date(dateTimeStr).toISOString();
  }

  function formatDateTime(dateTimeStr: string) {
    // Simple formatting - enhance as needed
    return new Date(dateTimeStr).toLocaleString();
  }

  async function generateChatResponse(message: string) {
    const payload = {
      model: 'deepseek/deepseek-r1:free',
      messages: [{
        role: 'system',
        content: 'You are a business assistant. For meetings:\n1. Request missing details\n2. Confirm before scheduling\n3. Handle errors gracefully'
      }, {
        role: 'user',
        content: message
      }],
      temperature: 0.7
    };

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    return new Response(JSON.stringify({
      response: data.choices?.[0]?.message?.content || "I couldn't generate a response"
    }), { headers: corsHeaders });
  }
});