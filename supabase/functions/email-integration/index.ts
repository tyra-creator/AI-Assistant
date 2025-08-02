import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRequest {
  action: 'compose' | 'send' | 'get_emails' | 'reply';
  to?: string;
  subject?: string;
  body?: string;
  emailId?: string;
  folder?: 'inbox' | 'sent' | 'drafts';
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

    const requestData: EmailRequest = await req.json();

    // Get user's OAuth tokens from profiles
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!profile) {
      throw new Error('User profile not found');
    }

    // For now, we'll implement a basic email service
    // In a real implementation, you would use the OAuth tokens to call
    // Gmail API or Microsoft Graph API for Outlook

    switch (requestData.action) {
      case 'get_emails':
        // Mock emails - in real implementation, fetch from actual email APIs
        const mockEmails = [
          {
            id: '1',
            from: 'colleague@company.com',
            to: profile.email,
            subject: 'Project Update',
            body: 'Here is the latest update on our project...',
            date: '2024-01-15T09:00:00Z',
            read: true
          },
          {
            id: '2',
            from: 'client@external.com',
            to: profile.email,
            subject: 'Meeting Request',
            body: 'Could we schedule a meeting to discuss...',
            date: '2024-01-15T08:30:00Z',
            read: false
          }
        ];

        return new Response(JSON.stringify({
          emails: mockEmails,
          message: `Found ${mockEmails.length} emails`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'compose':
      case 'send':
        // Mock email composition/sending
        const emailData = {
          id: Date.now().toString(),
          from: profile.email,
          to: requestData.to,
          subject: requestData.subject,
          body: requestData.body,
          date: new Date().toISOString(),
          status: requestData.action === 'send' ? 'sent' : 'draft'
        };

        // In real implementation, you would:
        // 1. Use OAuth tokens to authenticate with email provider
        // 2. Call Gmail API or Microsoft Graph API to send/save email
        // 3. Handle errors and retry logic

        return new Response(JSON.stringify({
          email: emailData,
          message: `Email ${requestData.action === 'send' ? 'sent' : 'saved as draft'} successfully`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      case 'reply':
        // Mock email reply
        const replyData = {
          id: Date.now().toString(),
          from: profile.email,
          to: requestData.to,
          subject: `Re: ${requestData.subject}`,
          body: requestData.body,
          date: new Date().toISOString(),
          status: 'sent',
          replyTo: requestData.emailId
        };

        return new Response(JSON.stringify({
          email: replyData,
          message: 'Reply sent successfully'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

      default:
        throw new Error(`Unsupported action: ${requestData.action}`);
    }

  } catch (error) {
    console.error('Error in email-integration function:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});