import { supabase } from '@/integrations/supabase/client';

// Service for handling calendar and other API requests via Supabase
export class APIService {
  // Session ID management - now using conversation IDs from database
  private static conversationId: string | null = null;
  
  /**
   * Get the current conversation ID
   */
  static getSessionId(): string | null {
    return this.conversationId;
  }
  
  /**
   * Set conversation ID
   */
  static setConversationId(id: string): void {
    this.conversationId = id;
  }
  
  /**
   * Reset the conversation (starts a new conversation)
   */
  static resetSession(): void {
    this.conversationId = null;
  }

  /**
   * Fetch calendar events via Supabase edge function
   */
  static async fetchCalendarEvents(date?: string, startDate?: string, endDate?: string) {
    try {
      // Ensure we forward the user's JWT explicitly
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const nowIso = new Date().toISOString();
      const defaultEndIso = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      let effectiveTimeMin = startDate || nowIso;
      let effectiveTimeMax = endDate || defaultEndIso;

      console.log('=== Calendar Integration Client Call ===');
      console.log('Session data:', {
        hasSession: !!sessionData?.session,
        hasAccessToken: !!accessToken,
        userId: sessionData?.session?.user?.id
      });
      console.log('Calling calendar-integration with payload:', {
        action: 'get_events',
        date,
        timeMin: effectiveTimeMin,
        timeMax: effectiveTimeMax,
      });

      const invoke = async (body: any) => {
        const result = await supabase.functions.invoke('calendar-integration', {
          body,
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        });
        
        console.log('Raw edge function response:', {
          hasData: !!result.data,
          hasError: !!result.error,
          data: result.data,
          error: result.error
        });
        
        return result;
      };

      // Initial request using provided range
      let { data, error } = await invoke({
        action: 'get_events',
        date,
        timeMin: effectiveTimeMin,
        timeMax: effectiveTimeMax,
      });

      if (error) {
        console.error('Error from calendar function:', error);
        return {
          events: [],
          needsAuth: true,
          error: (error as any).message || 'Calendar integration error',
        };
      }

      // Handle needsAuth responses
      if (data?.needsAuth) {
        return {
          events: [],
          needsAuth: true,
          error: data.error || data.message || 'Authentication required',
        };
      }

      let events = data?.events || [];

      // Retry strategy if no events returned: widen window to 60d (bounded)
      if (Array.isArray(events) && events.length === 0) {
        const sixtyDaysEndIso = new Date(new Date(effectiveTimeMin).getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();

        console.log('No events returned, retrying with wider window (60 days, bounded)');
        ({ data, error } = await invoke({ action: 'get_events', timeMin: effectiveTimeMin, timeMax: sixtyDaysEndIso }));
        console.log('Retry (60d) result:', { hasData: !!data, hasError: !!error, data, error });

        if (!error && !data?.needsAuth) {
          events = data?.events || [];
          effectiveTimeMax = sixtyDaysEndIso;
        }
      }

      // Final safety filter to ensure events are within the requested window
      try {
        const minIso = new Date(effectiveTimeMin).toISOString();
        const maxIso = new Date(effectiveTimeMax).toISOString();
        const beforeCount = Array.isArray(events) ? events.length : 0;
        events = (events || []).filter((e: any) => {
          const start = e?.start?.dateTime || e?.start?.date || e?.start;
          if (!start) return true;
          const startIso = new Date(start).toISOString();
          return startIso >= minIso && startIso <= maxIso;
        });
        console.log('Filtered events within range:', { beforeCount, afterCount: events.length, minIso, maxIso });
      } catch (e) {
        console.warn('Event range filter skipped due to parse error:', e);
      }

      return {
        events,
        needsAuth: false,
        error: null,
      };
    } catch (error: any) {
      console.error('Error fetching calendar events:', error);
      return {
        events: [],
        needsAuth: true,
        error: error?.message || 'Failed to fetch calendar events',
      };
    }
  }

  /**
   * Send email via Supabase edge function
   */
  static async sendEmail(to: string, subject: string, body: string) {
    try {
      const { data, error } = await supabase.functions.invoke('email-integration', {
        body: {
          action: 'send',
          to,
          subject,
          body
        }
      });

      if (error) {
        console.error('Error from email function:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  /**
   * Get emails via Supabase edge function
   */
  static async getEmails(folder = 'inbox') {
    try {
      const { data, error } = await supabase.functions.invoke('email-integration', {
        body: {
          action: 'get_emails',
          folder
        }
      });

      if (error) {
        console.error('Error from email function:', error);
        throw error;
      }

      return data?.emails || [];
    } catch (error) {
      console.error('Error fetching emails:', error);
      throw error;
    }
  }
}

// Export the fetchCalendarEvents function for backward compatibility
export const fetchCalendarEvents = async () => {
  return APIService.fetchCalendarEvents();
};
