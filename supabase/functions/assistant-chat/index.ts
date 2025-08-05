import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Assistant Chat Function v3.1 - DeepSeek + Calendar Actions ===');
  console.log('Deployment timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.1 (DeepSeek + Calendar)' 
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

    const bodyText = await req.text();
    const requestBody = JSON.parse(bodyText);
    const { message } = requestBody;

    if (!message) throw new Error('Message is required');

    // Detect intent for calendar actions
    const lowerMsg = message.toLowerCase();
    const isAdd = lowerMsg.includes("add a meeting") || lowerMsg.includes("create a meeting") || lowerMsg.includes("schedule a meeting");
    const isUpdate = lowerMsg.includes("update") || lowerMsg.includes("reschedule");
    const isDelete = lowerMsg.includes("delete") || lowerMsg.includes("remove meeting");

    if (isAdd || isUpdate || isDelete) {
      const calendarEndpoint = isAdd
        ? 'https://your-supabase-url/functions/v1/calendar-add'
        : isUpdate
        ? 'https://your-supabase-url/functions/v1/calendar-update'
        : 'https://your-supabase-url/functions/v1/calendar-delete';

      const calendarResponse = await fetch(calendarEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      if (!calendarResponse.ok) {
        const errorText = await calendarResponse.text();
        throw new Error(`Calendar function error (${calendarResponse.status}): ${errorText}`);
      }

      return new Response(JSON.stringify({ response: '✅ Calendar action completed.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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
