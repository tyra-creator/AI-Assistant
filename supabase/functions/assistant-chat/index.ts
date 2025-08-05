import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Assistant Chat Function v3.1 - DeepSeek with Calendar Integration ===');
  console.log('Deployment timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.1 (DeepSeek with Calendar)' 
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

    const calendarFunctionURL = Deno.env.get('CALENDAR_FUNCTION_URL');
    if (!calendarFunctionURL) throw new Error('CALENDAR_FUNCTION_URL not configured');

    const { message } = await req.json();
    if (!message) throw new Error('Message is required');

    // First check if this is a meeting creation request
    const meetingRegex = /(schedule|add|create|set up).*(meeting|event|appointment)/i;
    if (meetingRegex.test(message)) {
      // Extract meeting details using AI
      const extractPayload = {
        model: 'deepseek/deepseek-r1:free',
        messages: [
          { 
            role: 'system', 
            content: `Extract meeting details from this request in JSON format with:
            - title (string)
            - start (ISO datetime)
            - end (ISO datetime)
            - description (string or null)
            - attendees (array of emails or empty array)
            Return ONLY the JSON object, nothing else.` 
          },
          { role: 'user', content: message }
        ],
        temperature: 0.3,
        max_tokens: 500
      };

      const extractResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${deepseekKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(extractPayload),
      });

      const extractData = await extractResponse.json();
      const extractedJson = extractData.choices?.[0]?.message?.content;
      
      try {
        const meetingDetails = JSON.parse(extractedJson);
        
        // Call calendar function
        const calendarRes = await fetch(calendarFunctionURL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || '',
          },
          body: JSON.stringify({
            action: 'create_event',
            event: {
              title: meetingDetails.title,
              start: meetingDetails.start,
              end: meetingDetails.end,
              description: meetingDetails.description || '',
              attendees: meetingDetails.attendees || []
            }
          }),
        });

        const calendarResult = await calendarRes.json();
        
        if (calendarRes.ok) {
          return new Response(JSON.stringify({
            response: `Meeting "${meetingDetails.title}" has been successfully scheduled!`,
            details: calendarResult
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          throw new Error(calendarResult.error || 'Failed to create calendar event');
        }
      } catch (parseError) {
        console.error('Error parsing meeting details:', parseError);
        // Fall through to regular chat response
      }
    }

    // Regular chat response for non-meeting requests or if extraction failed
    const deepseekPayload = {
      model: 'deepseek/deepseek-r1:free',
      messages: [
        { 
          role: 'system', 
          content: `You are VirtuAI Assistant. When users ask to schedule meetings:
          1. Ask for any missing details (time, title, attendees)
          2. Confirm before scheduling
          3. For calendar access issues, explain how to connect their calendar
          Otherwise, provide helpful business advice.` 
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
      },
      body: JSON.stringify(deepseekPayload),
    });

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
      error: error.message || 'Internal server error',
      suggestion: 'Please make sure your calendar is connected and try again.'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});