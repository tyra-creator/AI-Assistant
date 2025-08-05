import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
    const calendarUrl = Deno.env.get('CALENDAR_FUNCTION_URL'); // e.g., https://your.supabase.co/functions/v1/calendar-integration

    if (!deepseekKey) throw new Error('DeepSeek API key not configured');
    if (!calendarUrl) throw new Error('Calendar function URL not configured');

    const bodyText = await req.text();
    const requestBody = JSON.parse(bodyText);
    const { message } = requestBody;

    if (!message) throw new Error('Message is required');

    // Step 1: Send user message to DeepSeek
    const deepseekPayload = {
      model: 'deepseek/deepseek-r1:free',
      messages: [
        {
          role: 'system',
          content: `You are VirtuAI Assistant, built by the VirtuAI developer's team. Your job is to help business owners and executives manage their day efficiently. Provide helpful and context-aware answers.`
        },
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
        'HTTP-Referer': 'yourdomain.com', // Replace with your actual domain
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

    // Step 2 (optional): Check if the message includes a calendar-related intent
    const calendarKeywords = ['calendar', 'meeting', 'schedule', 'appointment'];
    const isCalendarRequest = calendarKeywords.some(word =>
      message.toLowerCase().includes(word)
    );

    let calendarResponse = null;
    if (isCalendarRequest) {
      const calendarResult = await fetch(calendarUrl, {
        method: 'POST',
        headers: {
          'Authorization': req.headers.get('Authorization') || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_event',
          event: {
            title: 'Meeting from AI Assistant',
            description: 'Auto-scheduled event from assistant',
            start: new Date(Date.now() + 3600000).toISOString(),  // 1 hour later
            end: new Date(Date.now() + 7200000).toISOString(),    // 2 hours later
            attendees: [],
          },
        }),
      });

      if (calendarResult.ok) {
        calendarResponse = await calendarResult.json();
      } else {
        const calendarError = await calendarResult.text();
        console.warn('Calendar API error:', calendarError);
        calendarResponse = { error: 'Failed to schedule calendar event' };
      }
    }

    return new Response(JSON.stringify({
      response: assistantMessage,
      ...(calendarResponse ? { calendar: calendarResponse } : {})
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

