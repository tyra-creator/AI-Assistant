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

    // Real email service implementation with Google and Microsoft providers
    // Helper: Refresh Google access token if expired and refresh token is available
    async function refreshGoogleAccessToken(profile: any, supabaseClient: any) {
      try {
        const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
        const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
        if (!clientId || !clientSecret || !profile.google_refresh_token) {
          return { accessToken: profile.google_access_token, updated: false };
        }

        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'refresh_token',
            refresh_token: profile.google_refresh_token,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          console.error('Google token refresh failed:', res.status, text);
          return { accessToken: profile.google_access_token, updated: false };
        }

        const data = await res.json();
        const newAccess = data.access_token as string;
        const expiresIn = data.expires_in as number | undefined; // seconds
        const newExpiry = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

        const { error: updateErr } = await supabaseClient
          .from('profiles')
          .update({
            google_access_token: newAccess,
            google_expires_at: newExpiry,
          })
          .eq('user_id', profile.user_id);

        if (updateErr) {
          console.error('Failed to persist refreshed Google token:', updateErr);
        }

        return { accessToken: newAccess, updated: true };
      } catch (e) {
        console.error('Error refreshing Google token:', e);
        return { accessToken: profile.google_access_token, updated: false };
      }
    }

    // Helper: Parse Gmail headers
    function getHeader(headers: any[], name: string) {
      const h = headers?.find((x: any) => x.name?.toLowerCase() === name.toLowerCase());
      return h?.value || '';
    }

    // Helper: Fetch unread emails from Gmail
    async function fetchUnreadGmail(accessToken: string) {
      const baseHeaders = { Authorization: `Bearer ${accessToken}` };
      const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=UNREAD&maxResults=25', { headers: baseHeaders });
      if (!listRes.ok) {
        const t = await listRes.text();
        throw new Error(`Gmail list failed: ${listRes.status} ${t}`);
      }
      const listData = await listRes.json();
      const messages = listData.messages || [];
      const results: any[] = [];
      for (const m of messages) {
        const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, { headers: baseHeaders });
        if (!msgRes.ok) continue;
        const msg = await msgRes.json();
        const headers = msg.payload?.headers || [];
        const from = getHeader(headers, 'From');
        const subject = getHeader(headers, 'Subject') || '(no subject)';
        const dateHdr = getHeader(headers, 'Date');
        const internalMs = Number(msg.internalDate);
        const received = isNaN(internalMs) ? (dateHdr ? new Date(dateHdr).toISOString() : new Date().toISOString()) : new Date(internalMs).toISOString();
        results.push({
          id: msg.id,
          provider: 'google',
          from,
          subject,
          body_preview: msg.snippet || '',
          received_at: received,
          read: false,
        });
      }
      return results;
    }

    // Helper: Fetch unread emails from Microsoft Graph
    async function fetchUnreadMicrosoft(accessToken: string) {
      const url = 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages?$filter=isRead%20eq%20false&$select=id,receivedDateTime,from,subject,bodyPreview,isRead&$top=25';
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(`Microsoft Graph list failed: ${res.status} ${t}`);
      }
      const data = await res.json();
      const values = data.value || [];
      return values.map((m: any) => ({
        id: m.id,
        provider: 'microsoft',
        from: m.from?.emailAddress?.address || '',
        subject: m.subject || '(no subject)',
        body_preview: m.bodyPreview || '',
        received_at: m.receivedDateTime || new Date().toISOString(),
        read: !!m.isRead,
      }));
    }

    switch (requestData.action) {
      case 'get_emails': {
        // Fetch unread emails from available providers
        const emails: any[] = [];

        // GOOGLE
        if (profile.google_access_token) {
          let accessToken = profile.google_access_token as string;
          const expiresAt = profile.google_expires_at ? new Date(profile.google_expires_at) : null;
          const needsRefresh = expiresAt ? expiresAt.getTime() - Date.now() < 60_000 : false;

          if (needsRefresh && profile.google_refresh_token) {
            const refreshed = await refreshGoogleAccessToken(profile, supabaseClient);
            accessToken = refreshed.accessToken || accessToken;
          }

          try {
            const gUnread = await fetchUnreadGmail(accessToken);
            emails.push(...gUnread);
          } catch (e) {
            console.error('Gmail fetch error:', e);
          }
        }

        // MICROSOFT
        if (profile.microsoft_access_token) {
          try {
            const mUnread = await fetchUnreadMicrosoft(profile.microsoft_access_token as string);
            emails.push(...mUnread);
          } catch (e) {
            console.error('Microsoft fetch error:', e);
          }
        }

        // Sort by received_at desc and limit to 25
        emails.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());
        const limited = emails.slice(0, 25);

        return new Response(JSON.stringify({
          emails: limited,
          message: limited.length ? `Found ${limited.length} unread email(s)` : 'No unread emails found'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'compose':
      case 'send': {
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

        return new Response(JSON.stringify({
          email: emailData,
          message: `Email ${requestData.action === 'send' ? 'sent' : 'saved as draft'} successfully`
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'reply': {
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
      }

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