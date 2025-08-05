import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method === 'GET') return healthCheckResponse();

  try {
    const { message, conversation_state = {} } = await req.json();
    if (!message) throw new Error('Message is required');

    // Handle meeting flow
    if (isMeetingRequest(message) || conversation_state.meetingFlow) {
      return handleMeetingFlow(message, conversation_state);
    }

    return defaultResponse();

  } catch (error) {
    return errorResponse(error);
  }
});

async function handleMeetingFlow(message: string, state: any) {
  // Improved detail extraction that handles various formats
  const extracted = extractDetails(message);
  const meetingDetails = { ...state.meetingDetails, ...extracted };
  const missing = getMissingDetails(meetingDetails);

  // If we have all required details
  if (missing.length === 0) {
    return new Response(JSON.stringify({
      response: `📋 Please confirm:\n"${meetingDetails.title}"\n⏰ ${meetingDetails.time}\n📍 ${meetingDetails.location || 'No location'}\n👥 ${meetingDetails.participants?.join(', ') || 'No attendees'}\n\nReply "confirm" to schedule or provide corrections.`,
      state: { 
        meetingFlow: true,
        meetingDetails,
        readyToConfirm: true 
      }
    }), { headers: corsHeaders });
  }

  // If user confirms with all details
  if (message.toLowerCase().includes('confirm') && state.readyToConfirm) {
    try {
      const result = await scheduleMeeting(meetingDetails);
      return new Response(JSON.stringify({
        response: `✅ Meeting scheduled!\n"${meetingDetails.title}"\n⏰ ${meetingDetails.time}`,
        details: result,
        state: { meetingFlow: false } // Reset flow
      }), { headers: corsHeaders });
    } catch (error) {
      return new Response(JSON.stringify({
        response: "⚠️ Failed to schedule meeting. Please try again.",
        error: error.message,
        state: { meetingFlow: true, meetingDetails }
      }), { headers: corsHeaders });
    }
  }

  // Ask for missing details
  return new Response(JSON.stringify({
    response: `📅 To schedule this meeting, please provide:\n${missing.map(m => `• ${m.label} (${m.example})`).join('\n')}`,
    state: { 
      meetingFlow: true,
      meetingDetails 
    }
  }), { headers: corsHeaders });
}

// Improved detail extraction
function extractDetails(message: string) {
  const details: any = {};
  
  // Handle "title:... time:..." format
  const pairs = message.split(/(?:\s|^)(\w+)\s*:\s*/).filter(Boolean);
  for (let i = 0; i < pairs.length; i += 2) {
    const key = pairs[i].toLowerCase();
    const value = pairs[i+1]?.trim();
    if (key && value) {
      details[key] = value;
    }
  }

  // Extract time if not already found
  if (!details.time) {
    const timeMatch = message.match(/(\d{1,2}(:\d{2})?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2}(:\d{2})?\s*(am|pm)?/i);
    if (timeMatch) {
      details.time = `${timeMatch[1]}${timeMatch[2]||''}-${timeMatch[3]}${timeMatch[4]||''}`;
    }
  }

  return details;
}

function getMissingDetails(details: any) {
  const requirements = [
    { key: 'title', label: 'Meeting title', example: 'Sales Review' },
    { key: 'time', label: 'Date & time', example: 'Today 3-4pm' }
  ];
  return requirements.filter(req => !details[req.key]);
}

// Helper functions
function healthCheckResponse() {
  return new Response(JSON.stringify({
    status: 'healthy',
    version: '3.8 (Robust Meeting Flow)',
    timestamp: new Date().toISOString()
  }), { headers: corsHeaders });
}

function errorResponse(error: Error) {
  return new Response(JSON.stringify({ 
    error: error.message || 'Internal server error'
  }), {
    status: 500,
    headers: corsHeaders,
  });
}

function defaultResponse() {
  return new Response(JSON.stringify({
    response: "I'm your business assistant. How can I help you today?"
  }), { headers: corsHeaders });
}

function isMeetingRequest(message: string) {
  return /(schedule|add|create|meeting|appointment)/i.test(message);
}

async function scheduleMeeting(details: any) {
  // Implement your actual calendar integration here
  return {
    id: 'event_123',
    htmlLink: 'https://calendar.example.com/event/123',
    title: details.title,
    time: details.time
  };
}