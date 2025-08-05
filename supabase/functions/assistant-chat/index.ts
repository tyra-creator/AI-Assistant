import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Enhanced CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400', // 24 hours
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    console.log('=== Assistant Chat Function ===');
    
    // Health check endpoint
    if (req.method === 'GET') {
      return new Response(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '3.6 (CORS Fixed)'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only allow POST requests for chat
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ 
        error: `Method ${req.method} not allowed` 
      }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { message } = await req.json();
    if (!message) {
      return new Response(JSON.stringify({ 
        error: 'Message is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Your actual function logic here
    const response = await handleAssistantRequest(message);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleAssistantRequest(message: string) {
  // Your existing assistant logic goes here
  // Make sure to properly handle errors within this function
  
  // Example implementation:
  if (message.toLowerCase().includes('add a meeting')) {
    return {
      response: "I can help schedule meetings. Please provide:",
      details: {
        required: ["title", "time"],
        example: "Team meeting today at 3pm for 1 hour"
      }
    };
  }
  
  return {
    response: "I'm your business assistant. How can I help you today?"
  };
}