import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Health check
    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'healthy',
        version: '3.7 (Full Meeting Flow)',
        timestamp: new Date().toISOString()
      }), { headers: corsHeaders });
    }

    // Parse request
    const { message, conversation_state = {} } = await req.json();
    if (!message) throw new Error('Message is required');

    // Handle meeting flow
    if (isMeetingRequest(message) || conversation_state.meetingFlow) {
      return handleMeetingFlow(message, conversation_state);
    }

    // Default response
    return new Response(JSON.stringify({
      response: "I'm your business assistant. How can I help you today?"
    }), { headers: corsHeaders });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});

// Improved meeting flow handler
async function handleMeetingFlow(message: string, state: any) {
  const meetingDetails = extractMeetingDetails(message, state.meetingDetails || {});
  const missing = getMissingDetails(meetingDetails);

  // If user confirms or we have all details
  if (message.toLowerCase().includes('confirm') || missing.length === 0) {
    try {
      const result = await scheduleMeeting(meetingDetails);
      return new Response(JSON.stringify({
        response: `✅ Meeting scheduled: ${meetingDetails.title} at ${meetingDetails.time}`,
        details: result,
        state: { meetingFlow: false } // Reset flow
      }), { headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({
        response: "Failed to schedule meeting. Please try again.",
        error: error.message,
        state: { meetingFlow: true, meetingDetails }
      }), { headers: corsHeaders });
    }
  }

  // Ask for missing details
  return new Response(JSON.stringify({
    response: `To schedule this meeting, please provide:${missing.map(m => `\n• ${m}`).join('')}`,
    example: "Example: 'Team sync tomorrow 2-3pm with alice@example.com'",
    state: { 
      meetingFlow: true,
      meetingDetails 
    }
  }), { headers: corsHeaders });
}

// Helper functions
function isMeetingRequest(message: string) {
  return /(schedule|add|create|meeting|appointment)/i.test(message);
}

function extractMeetingDetails(message: string, currentDetails: any) {
  const details = { ...currentDetails };
  
  // Extract from structured format (Title:... Time:...)
  const structuredMatch = message.match(/(title|time|participants|location|agenda):([^,]+)/gi);
  if (structuredMatch) {
    structuredMatch.forEach(item => {
      const [key, ...value] = item.split(':');
      details[key.trim().toLowerCase()] = value.join(':').trim();
    });
    return details;
  }

  // Extract from natural language
  if (/sales meeting/i.test(message)) details.title = details.title || "Sales Meeting";
  const timeMatch = message.match(/(\d{1,2}(:\d{2})?\s*(am|pm)?)/i);
  if (timeMatch) details.time = timeMatch[0];
  if (/no attendees/i.test(message)) details.participants = [];

  return details;
}

function getMissingDetails(details: any) {
  const missing = [];
  if (!details.title) missing.push("Meeting title");
  if (!details.time) missing.push("Date and time");
  return missing;
}

async function scheduleMeeting(details: any) {
  // Implement your actual calendar integration here
  // This is just a mock implementation
  return {
    id: 'event_123',
    htmlLink: 'https://calendar.example.com/event/123',
    title: details.title,
    time: details.time
  };
}