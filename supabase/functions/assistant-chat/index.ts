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
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    const { message, conversationId }: AssistantRequest = await req.json();

    // Get user preferences
    const { data: preferences } = await supabaseClient
      .from('user_preferences')
      .select('ai_settings')
      .eq('user_id', user.id)
      .single();

    // Get conversation history if conversationId provided
    let conversationHistory: ChatMessage[] = [];
    let currentConversationId = conversationId;

    if (conversationId) {
      const { data: conversation } = await supabaseClient
        .from('conversations')
        .select('messages, title')
        .eq('id', conversationId)
        .eq('user_id', user.id)
        .single();

      if (conversation) {
        conversationHistory = conversation.messages as ChatMessage[] || [];
      }
    }

    // Build messages for OpenAI
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: `You are an intelligent personal assistant. You can help with:
        - Checking and managing calendar events
        - Writing and managing emails
        - General queries and conversations
        
        When users ask about calendar or email functions, let them know you can help and ask for specific details.
        Be helpful, concise, and professional.`
      },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    // Call OpenAI
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // Use explicit model name
        messages: messages,
        temperature: preferences?.ai_settings?.temperature || 0.7,
        max_tokens: 1000,
        tools: [
          {
            type: "function",
            name: "check_calendar",
            description: "Check user's calendar events for a specific date or date range",
            parameters: {
              type: "object",
              properties: {
                date: { type: "string", description: "Date to check (YYYY-MM-DD format)" },
                start_date: { type: "string", description: "Start date for range (YYYY-MM-DD)" },
                end_date: { type: "string", description: "End date for range (YYYY-MM-DD)" }
              }
            }
          },
          {
            type: "function",
            name: "write_email",
            description: "Help compose or send an email",
            parameters: {
              type: "object",
              properties: {
                to: { type: "string", description: "Recipient email address" },
                subject: { type: "string", description: "Email subject" },
                body: { type: "string", description: "Email body content" },
                action: { type: "string", enum: ["draft", "send"], description: "Whether to create a draft or send the email" }
              },
              required: ["subject", "body"]
            }
          }
        ],
        tool_choice: "auto"
      }),
    });

    if (!openaiResponse.ok) {
      const error = await openaiResponse.text();
      console.error('OpenAI API error:', error);
      throw new Error('Failed to get AI response');
    }

    const aiResponse = await openaiResponse.json();
    const assistantMessage = aiResponse.choices[0].message;

    // Handle function calls
    if (assistantMessage.tool_calls) {
      for (const toolCall of assistantMessage.tool_calls) {
        const { name, arguments: args } = toolCall.function;
        
        if (name === 'check_calendar') {
          // Call calendar integration
          const calendarResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-integration`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.get('Authorization')!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'get_events', ...JSON.parse(args) }),
          });
          
          const calendarData = await calendarResponse.json();
          assistantMessage.content += `\n\nI found the following calendar events: ${JSON.stringify(calendarData)}`;
        } else if (name === 'write_email') {
          // Call email integration
          const emailResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/email-integration`, {
            method: 'POST',
            headers: {
              'Authorization': req.headers.get('Authorization')!,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'compose', ...JSON.parse(args) }),
          });
          
          const emailData = await emailResponse.json();
          assistantMessage.content += `\n\nEmail ${JSON.parse(args).action === 'send' ? 'sent' : 'drafted'} successfully.`;
        }
      }
    }

    // Update conversation history
    const updatedMessages = [...conversationHistory, 
      { role: 'user', content: message },
      { role: 'assistant', content: assistantMessage.content }
    ];

    // Save or update conversation
    if (currentConversationId) {
      await supabaseClient
        .from('conversations')
        .update({ 
          messages: updatedMessages,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentConversationId)
        .eq('user_id', user.id);
    } else {
      const { data: newConversation } = await supabaseClient
        .from('conversations')
        .insert({
          user_id: user.id,
          title: message.substring(0, 50) + '...',
          messages: updatedMessages
        })
        .select()
        .single();
      
      currentConversationId = newConversation?.id;
    }

    return new Response(JSON.stringify({
      response: assistantMessage.content,
      conversationId: currentConversationId
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