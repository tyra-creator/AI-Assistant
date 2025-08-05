import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  console.log("=== Assistant Chat Function v3.1 - Tool Call Support ===");
  console.log("Deployment timestamp:", new Date().toISOString());

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method === "GET") {
    return new Response(JSON.stringify({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "3.1 (Tool Call Support)"
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({
      error: `Method ${req.method} not allowed. Use POST for chat or GET for health check.`
    }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured");

    const calendarFunctionURL = Deno.env.get("CALENDAR_FUNCTION_URL");
    if (!calendarFunctionURL) throw new Error("CALENDAR_FUNCTION_URL is not configured");

    const { message } = await req.json();
    if (!message) throw new Error("Message is required");

    // Initial AI call to detect tool usage
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are VirtuAI Assistant, helping users manage calendar events and productivity tasks."
          },
          {
            role: "user",
            content: message,
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "calendar_function",
              description: "Manages user's calendar.",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: ["get_events", "create_event", "update_event", "delete_event"],
                  },
                  date: { type: "string", format: "date-time" },
                  start_date: { type: "string", format: "date-time" },
                  end_date: { type: "string", format: "date-time" },
                  event: {
                    type: "object",
                    properties: {
                      title: { type: "string" },
                      description: { type: "string" },
                      start: { type: "string", format: "date-time" },
                      end: { type: "string", format: "date-time" },
                      attendees: {
                        type: "array",
                        items: { type: "string", format: "email" },
                      },
                    },
                    required: ["title", "start", "end"],
                  },
                  eventId: { type: "string" },
                },
                required: ["action"],
              },
            },
          }
        ],
        tool_choice: "auto",
      }),
    });

    const json = await openaiRes.json();

    // Handle tool call if present
    const toolCall = json.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall) {
      const args = JSON.parse(toolCall.function.arguments);
      console.log("Calling calendar_function with:", args);

      const calendarRes = await fetch(calendarFunctionURL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.get("Authorization") || "",
        },
        body: JSON.stringify(args),
      });

      const calendarResult = await calendarRes.json();
      return new Response(JSON.stringify({
        response: calendarResult.message || "Event processed.",
        raw: calendarResult,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If no tool call, just return the assistant message
    const responseText = json.choices?.[0]?.message?.content || "No response.";
    return new Response(JSON.stringify({ response: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Assistant Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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

    const bodyText = await req.text();
    const requestBody = JSON.parse(bodyText);
    const { message } = requestBody;

    if (!message) throw new Error('Message is required');

    const deepseekPayload = {
      model: 'deepseek/deepseek-r1:free',
      messages: [
        { role: 'system', content: '{ 
  role: 'system', 
  content: `You are VirtuAI Assistant, built by the VirtuAI developer's team. Your job is to help business owners and executives manage their day efficiently. Provide helpful and context-aware answers.` 
}
' },
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
        // Optional but recommended by OpenRouter for analytics:
        'HTTP-Referer': 'yourdomain.com', // replace with your domain if hosted
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
