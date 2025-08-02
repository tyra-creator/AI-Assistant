import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AssistantRequest {
  message: string;
  conversationId?: string;
}

serve(async (req) => {
  console.log('=== Assistant Chat Function Started ===');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate OpenAI API key first
    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    console.log('OpenAI API Key available:', !!openaiKey);
    if (!openaiKey) {
      console.error('OPENAI_API_KEY not found in environment');
      throw new Error('OpenAI API key not configured');
    }

    console.log('Creating Supabase client...');
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    // Get user from JWT
    console.log('Getting user from JWT...');
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError) {
      console.error('User auth error:', userError);
      throw new Error(`Authentication failed: ${userError.message}`);
    }
    if (!user) {
      console.error('No user found in JWT');
      throw new Error('Unauthorized - no user');
    }
    console.log('User authenticated:', user.id);

    // Parse request body with validation
    console.log('Parsing request body...');
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      throw new Error('Invalid JSON in request body');
    }

    const { message, conversationId }: AssistantRequest = requestBody;
    console.log('Request data:', { message: message?.substring(0, 50), conversationId });

    // Get user preferences with error handling
    console.log('Fetching user preferences...');
    let preferences = null;
    try {
      const { data, error: prefsError } = await supabaseClient
        .from('user_preferences')
        .select('ai_settings')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (prefsError) {
        console.error('Preferences fetch error:', prefsError);
      } else {
        preferences = data;
        console.log('User preferences loaded:', !!preferences);
      }
    } catch (prefsError) {
      console.error('Preferences query failed:', prefsError);
    }

    // SIMPLIFIED VERSION - Skip conversation history for now
    console.log('Building messages for OpenAI...');
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant. Be concise and helpful.'
      },
      { role: 'user', content: message }
    ];

    // SIMPLIFIED OpenAI call - no tools for debugging
    console.log('Calling OpenAI API...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500
      }),
    });

    console.log('OpenAI response status:', openaiResponse.status);
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error response:', errorText);
      console.error('OpenAI API status:', openaiResponse.status);
      throw new Error(`OpenAI API error (${openaiResponse.status}): ${errorText}`);
    }

    console.log('Parsing OpenAI response...');
    const aiResponse = await openaiResponse.json();
    console.log('OpenAI response parsed successfully');
    
    const assistantMessage = aiResponse.choices?.[0]?.message;
    if (!assistantMessage || !assistantMessage.content) {
      console.error('Invalid assistant message response:', aiResponse);
      throw new Error('Invalid response from OpenAI');
    }

    console.log('Assistant response received:', assistantMessage.content?.substring(0, 100));

    // SIMPLIFIED - Skip conversation saving for debugging
    console.log('Returning successful response...');
    return new Response(JSON.stringify({
      response: assistantMessage.content,
      conversationId: null // Skip conversation ID for now
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