import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Assistant Chat Function Started ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', Object.fromEntries(req.headers.entries()));
  
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    console.error('Invalid request method:', req.method);
    return new Response(JSON.stringify({ 
      error: `Method ${req.method} not allowed. Use POST.` 
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    console.log('Processing POST request...');
    
    // Validate OpenAI API key first
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    console.log('OpenAI API Key available:', !!openaiKey);
    console.log('OpenAI API Key first 8 chars:', openaiKey ? openaiKey.substring(0, 8) + '...' : 'NONE');
    if (!openaiKey) {
      console.error('OPENAI_API_KEY not found in environment');
      throw new Error('OpenAI API key not configured');
    }

    // Parse request body
    console.log('Parsing request body...');
    let requestBody;
    try {
      const bodyText = await req.text();
      console.log('Raw body:', bodyText);
      requestBody = JSON.parse(bodyText);
      console.log('Parsed body:', requestBody);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('Invalid JSON in request body');
    }

    const { message } = requestBody;
    console.log('Message:', message);

    if (!message) {
      throw new Error('Message is required');
    }

    // MINIMAL OpenAI call
    console.log('Calling OpenAI API with key ending in:', openaiKey.slice(-4));
    const openaiPayload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful AI assistant. Be concise.' },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 150
    };
    console.log('OpenAI payload:', JSON.stringify(openaiPayload, null, 2));
    
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openaiPayload),
    });

    console.log('OpenAI response status:', openaiResponse.status);
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error response:', errorText);
      throw new Error(`OpenAI API error (${openaiResponse.status}): ${errorText}`);
    }

    console.log('Parsing OpenAI response...');
    const aiResponse = await openaiResponse.json();
    console.log('AI Response received');
    
    const assistantMessage = aiResponse.choices?.[0]?.message?.content;
    if (!assistantMessage) {
      console.error('Invalid assistant message response');
      throw new Error('Invalid response from OpenAI');
    }

    console.log('Returning successful response...');
    return new Response(JSON.stringify({
      response: assistantMessage
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in assistant-chat function:', error);
    console.error('Error stack:', error.stack);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});