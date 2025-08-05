import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Your Supabase calendar function URL - update accordingly
const CALENDAR_FUNCTION_URL = 'https://xqnqssvypvwnedpaylwz.supabase.co/functions/v1/calendar-integration';

serve(async (req) => {
  console.log('=== Assistant Chat Function v3.0 - DeepSeek Edition ===');
  console.log('Deployment timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.0 (DeepSeek)' 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ 
      error: `Method ${req.method} not allowed. Use POST for chat or GET for health check.` 
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const deepseekKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!deepseekKey) throw new Error('DeepSeek API key not configured');

    const authHeader = req.headers.get('Authorization') ?? '';

    const bodyText = await req.text();
    const requestBody = JSON.parse(bodyText);
    const { message } = requestBody;

    if (!message) throw new Error('Message is required');

    // Basic keyword-based detection for calendar actions (you can improve with NLP)
    // This is just a simple example; adapt or expand as needed.
    const lowerMsg = message.toLowerCase();
    let calendarAction = null;
    let calendarEvent = null;

    if (lowerMsg.includes('add meeting') || lowerMsg.includes('create event') || lowerMsg.includes('new event')) {
      calendarAction = 'create_event';
      // You might want to parse details from the message or get them from a follow-up dialog.
      // Here is a placeholder event for demonstration.
      calendarEvent = {
        title: 'Meeting',
        description: 'Scheduled via VirtuAI assistant',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 60*60*1000).toISOString(), // +1 hour
      };
    } else if (lowerMsg.includes('update event') || lowerMsg.includes('edit event')) {
      calendarAction = 'update_event';
      // You'd get eventId and updated fields from dialog context in real case
    } else if (lowerMsg.includes('delete event') || lowerMsg.includes('remove event')) {
      calendarAction = 'delete_event';
      // You'd get eventId from dialog context in real case
    } else if (lowerMsg.includes('show events') || lowerMsg.includes('my calendar') || lowerMsg.includes('upcoming events')) {
      calendarAction = 'get_events';
    }

    // If calendar action detected, call calendar function
    if (calendarAction) {
      const calendarPayload: any = { action: calendarAction };
      if (calendarEvent) calendarPayload.event = calendarEvent;

      // Call your single calendar integration function
      const calendarResponseRaw = await fetch(CALENDAR_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(calendarPayload),
      });

      if (!calendarResponseRaw.ok) {
        const errorText = await calendarResponseRaw.text();
        throw new Error(`Calendar function error (${calendarResponseRaw.status}): ${errorText}`);
      }

      const calendarResponse = await calendarResponseRaw.json();

      // Respond directly with calendar function result
      return new Response(JSON.stringify({
        response: `✅ Calendar action completed: ${calendarResponse.message || JSON.stringify(calendarResponse)}`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Otherwise, handle as normal DeepSeek chat request
    const deepseekPayload = {
      model: 'deepseek/deepseek-r1:free',
      messages: [
        { role: 'system', content: 'You are VirtuAI Assistant, built by the VirtuAI developer\'s team. Your job is to help business owners and executives manage their day efficiently. Provide helpful and context-aware answers.' },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 2000
    };

    const deepseekResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${deepseekKey}`,
        'Content-Type': 'application/json',
        // Optional but recommended:
        'HTTP-Referer': 'yourdomain.com',
      },
      body: JSON.stringify(deepseekPayload),
    });

    if (!deepseekResponse.ok) {
      const errorText = await deepseekResponse.text();
      throw new Error(`DeepSeek API error (${deepseekResponse.status}): ${errorText}`);
    }

    const aiResponse = await deepseekResponse.json();
    const assistantMessage = aiResponse.choices?.[0]?.message?.content;

    if (!assistantMessage) throw new Error('Invalid response from DeepSeek');

    return new Response(JSON.stringify({
      response: assistantMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in assistant-chat function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

