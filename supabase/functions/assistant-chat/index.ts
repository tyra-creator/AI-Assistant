import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('=== Assistant Chat Function v3.3 - Calendar Guided Setup ===');
  console.log('Deployment timestamp:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === 'GET') {
    return new Response(JSON.stringify({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '3.3 (Calendar Guided Setup)',
      capabilities: {
        calendar: Deno.env.get('CALENDAR_FUNCTION_URL') ? 'ready' : 'needs_setup'
      }
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

    const { message } = await req.json();
    if (!message) throw new Error('Message is required');

    // Check for meeting-related requests
    const meetingRegex = /(schedule|add|create|set up|book).*(meeting|event|appointment)/i;
    const isMeetingRequest = meetingRegex.test(message);
    const calendarFunctionURL = Deno.env.get('CALENDAR_FUNCTION_URL');

    if (isMeetingRequest) {
      if (!calendarFunctionURL) {
        // Provide detailed setup instructions
        return new Response(JSON.stringify({
          response: "I can help schedule meetings, but we need to set up your calendar integration first. Here's how:",
          action_required: "calendar_setup",
          instructions: [
            "1. Go to your Supabase Dashboard",
            "2. Navigate to the Functions section",
            "3. Find your assistant-chat function",
            "4. Add an environment variable named CALENDAR_FUNCTION_URL",
            "5. Set the value to your calendar function URL",
            "Need help? Contact support@yourapp.com"
          ],
          help_link: "https://your-docs.com/calendar-setup"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // If calendar is configured but request is vague
      if (message.toLowerCase().trim() === "can you add a meeting") {
        return new Response(JSON.stringify({
          response: "I'd be happy to schedule a meeting for you. Could you please provide:",
          questions: [
            "• What's the meeting about? (Title)",
            "• When should it occur? (Date & Time)",
            "• Who needs to attend? (Optional attendees)",
            "• Any other details? (Optional description)"
          ],
          example: "Example: 'Schedule a team meeting tomorrow at 2pm about Q3 planning with alice@example.com and bob@example.com'"
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Proceed with meeting extraction if we have details
      const extractPayload = {
        model: 'deepseek/deepseek-r1:free',
        messages: [
          { 
            role: 'system', 
            content: `Extract meeting details from this request. Respond in JSON format with:
            - title (string)
            - start (ISO datetime or natural language)
            - end (ISO datetime or natural language)
            - description (string or null)
            - attendees (array of emails or empty array)
            Return ONLY the JSON object. If info is missing, use null.` 
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
        
        // Check for missing critical information
        const missingInfo = [];
        if (!meetingDetails.title) missingInfo.push("meeting title");
        if (!meetingDetails.start) missingInfo.push("date/time");
        
        if (missingInfo.length > 0) {
          return new Response(JSON.stringify({
            response: `To schedule this meeting, I need more information. Please provide: ${missingInfo.join(" and ")}.`,
            missing_info: missingInfo,
            example: "Example: 'Schedule a budget meeting tomorrow at 3pm for 1 hour'"
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

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
              end: meetingDetails.end || meetingDetails.start,
              description: meetingDetails.description || '',
              attendees: meetingDetails.attendees || []
            }
          }),
        });

        const calendarResult = await calendarRes.json();
        
        if (calendarRes.ok) {
          return new Response(JSON.stringify({
            response: `✅ Success! I've scheduled "${meetingDetails.title}"`,
            details: {
              title: meetingDetails.title,
              time: meetingDetails.start,
              attendees: meetingDetails.attendees?.length || 0
            },
            success: true
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } else {
          return new Response(JSON.stringify({
            response: "⚠️ I couldn't schedule the meeting. The calendar service returned an error.",
            error: calendarResult.error || 'Unknown error',
            solution: "Please check your calendar connection or try again later."
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (parseError) {
        console.error('Error parsing meeting details:', parseError);
        // Fall through to regular chat response
      }
    }

    // Regular chat response
    const deepseekPayload = {
      model: 'deepseek/deepseek-r1:free',
      messages: [
        { 
          role: 'system', 
          content: `You are VirtuAI Assistant. Help with business tasks. For meetings:
          1. Check calendar setup
          2. Ask for missing details
          3. Guide through setup if needed
          Otherwise provide concise, helpful responses.` 
        },
        { role: 'user', content: message }
      ],
      temperature: 0.7,
      max_tokens: 1000
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

    return new Response(JSON.stringify({
      response: assistantMessage || "I couldn't generate a response. Please try again."
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Function error:', error);
    return new Response(JSON.stringify({ 
      response: "Sorry, I encountered an error processing your request.",
      error: error.message,
      support: "Please contact support@yourapp.com if this persists."
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});